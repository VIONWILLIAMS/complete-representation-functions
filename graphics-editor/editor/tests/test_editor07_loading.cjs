'use strict';
// Focused UI loader regression tests. This is a DOM/scheduling harness, not a
// browser run or a model-provider test. The iframe API is deliberately ready only
// when its parent has left it in layout, matching hidden-frame rAF suspension.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/editor07.js'), 'utf8');
const functionSource = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const embeddedSource = functionSource('  async function getEmbedded(', '  async function selectCase(');
const selectionSource = functionSource('  async function selectCase(', '  function updateProperties(');
const loadingSource = functionSource('  function sceneLoading(', '  function run(');
const street = {id: 'street', title: '午后街角', engine: 'legacy05'};

function element() { return {hidden: false, dataset: {}, textContent: '', append() {}}; }
function loaderHarness(options = {}) {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const frames = new Map();
  let activeFrame, resolveReady, shownAtReady = false;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const childDocument = {getElementById: () => null, addEventListener() {}, createElement: element, head: {append() {}}};
  const child = {location: {href: 'https://example.test/editor05.html'}, document: childDocument};
  if (!options.missingAPI) child.CRFEditor = {ready};
  if (options.crossOrigin) Object.defineProperty(child, 'location', {get() {throw new Error('Blocked cross-origin iframe access');}});
  const document = {createElement(tag) {
    if (tag !== 'iframe') return element();
    activeFrame = {...element(), contentWindow: child, attributes: {}, removed: false,
      setAttribute(name, value) {this.attributes[name] = value;},
      removeAttribute(name) {delete this.attributes[name];},
      remove() {this.removed = true;}};
    return activeFrame;
  }};
  $('embeddedHost').append = frame => queueMicrotask(() => {
    // A hidden frame does not receive the child initialization animation frame.
    if (!options.manualReady && !frame.hidden) {shownAtReady = true; resolveReady();}
    if (frame.onload) frame.onload();
  });
  const context = vm.createContext({document, $, frames, state: {current: street}, cases: [street],
    selectCase() {}, fail() {}, setTimeout: fn => setTimeout(fn, 60), clearTimeout});
  vm.runInContext(loadingSource + embeddedSource + '\nglobalThis.load = getEmbedded;', context);
  return {context, frames, $, frame: () => activeFrame, shownAtReady: () => shownAtReady,
    resolveReady: () => {shownAtReady = !activeFrame.hidden; resolveReady();}};
}

test('new iframe stays in layout until its animation-dependent API is ready', async () => {
  const h = loaderHarness();
  const frame = await h.context.load(street);
  assert.equal(h.shownAtReady(), true);
  assert.equal(frame.hidden, false);
  assert.equal(frame.src, 'editor05.html');
  assert.equal(frame.attributes['aria-busy'], undefined);
  assert.equal(frame.onload, null);
});

test('returning to a pending cached iframe restores its layout before waiting', async () => {
  const h = loaderHarness({manualReady: true});
  const first = h.context.load(street);
  await new Promise(resolve => setImmediate(resolve));
  h.frame().hidden = true;
  const second = h.context.load(street);
  assert.equal(h.frame().hidden, false);
  h.resolveReady();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
});

test('missing child API gives a page-specific error and removes the failed frame', async () => {
  const h = loaderHarness({missingAPI: true});
  await assert.rejects(h.context.load(street), /editor05\.html.*编辑器模块/);
  assert.equal(h.frames.size, 0);
  assert.equal(h.frame().removed, true);
});

test('readiness timeout reports the phase and releases handlers and cache', async () => {
  const h = loaderHarness({manualReady: true});
  await assert.rejects(h.context.load(street), /载入超时.*初始化场景与像素核验.*editor05\.html/);
  assert.equal(h.frames.size, 0);
  assert.equal(h.frame().removed, true);
  assert.equal(h.frame().onload, null);
  assert.equal(h.frame().onerror, null);
  h.resolveReady();
});

test('cross-origin navigation is caught instead of escaping the onload handler', async () => {
  const h = loaderHarness({crossOrigin: true});
  await assert.rejects(h.context.load(street), /Blocked cross-origin/);
  assert.equal(h.frames.size, 0);
  assert.equal(h.frame().removed, true);
});

test('case failure remains visible with retry, and a successful retry clears it', async () => {
  const elements = new Map();
  const $ = id => {if (!elements.has(id)) elements.set(id, element());return elements.get(id);};
  const state = {current: null, frame: null, selectionSequence: 0, revision: 0};
  const childAPI = {switchCase: async () => {}, setState() {}};
  const frame = {...element(), contentWindow: {CRFEditor: childAPI}};
  let rejectLoad = true;
  const context = vm.createContext({$, state, cases: [street], frames: new Map(), drafts: new Map(),
    assertMutable() {}, saveDraft() {}, setCaseHeading() {}, store() {},
    currentAPI: () => childAPI, currentProgram: () => ({scene: 'street'}), readStored: (_key, fallback) => fallback,
    fail: error => {state.lastError = error.message;return error.message;},
    getEmbedded: async () => {if (rejectLoad) throw new Error('下载场景页面超时');return frame;}});
  vm.runInContext(loadingSource + selectionSource + '\nglobalThis.select = selectCase;', context);
  await assert.rejects(context.select('street'), /下载场景页面超时/);
  assert.equal($('stageLoading').hidden, false);
  assert.equal($('stageLoading').dataset.state, 'error');
  assert.equal($('retrySceneButton').hidden, false);
  assert.equal($('loadingText').textContent, '下载场景页面超时');
  assert.equal(state.frame, null);
  rejectLoad = false;
  await context.select('street');
  assert.equal($('stageLoading').hidden, true);
  assert.equal($('retrySceneButton').hidden, true);
  assert.equal(state.lastError, null);
  assert.equal(state.frame, frame);
});
