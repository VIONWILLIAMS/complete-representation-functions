'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual shipped controller closure without booting its network
// assets. Only the startup call is exchanged for access to the existing methods.
// This catches cached/late reference images crossing an imported asset boundary.
function controllerHarness(ImageClass = class { async decode() {} }) {
  const file = path.join(__dirname, '../web/quality-editor12.js');
  let source = fs.readFileSync(file, 'utf8');
  const start = source.lastIndexOf('  init().catch(');
  const end = source.lastIndexOf('\n})();');
  assert.ok(start > 0 && end > start, 'controller startup hook must exist');
  source = source.slice(0, start) +
    '  globalThis.controller = {state, loadReference, toggleReference};' + source.slice(end);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', classList: {toggle() {}}, setAttribute() {},
      getContext: () => ({drawImage() {}})
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {getElementById: element}, Image: ImageClass, CRFQuality12: {},
    setTimeout, clearTimeout, DOMException, console
  });
  vm.runInContext(source, context, {filename: file});
  const api = context.controller;
  Object.assign(api.state, {
    qualityVerified: true, baseAssetHash: 'baseline-asset', assetHash: 'baseline-asset',
    project: {view: {width: 8, height: 5, roi: [0, 0, 1, 1]}}
  });
  return {...api, elements, element};
}

test('cached comparison photo cannot be shown after importing a different function asset', async () => {
  const h = controllerHarness();
  const cached = {naturalWidth: 8, naturalHeight: 5};
  h.state.reference = cached;
  assert.equal(await h.loadReference(), cached, 'matching asset can reuse its reference');
  // openProject hides the comparison when its asset hash changes. The cache
  // deliberately remains populated to reproduce the user clicking Show again.
  h.state.assetHash = 'different-imported-asset';
  h.state.showReference = false;
  await assert.rejects(h.toggleReference(), /没有可核对的参考来源/);
  assert.equal(h.state.showReference, false);
  assert.equal(h.element('referenceFigure').hidden, true);
  assert.equal(h.state.referenceLoads, 0);
});

test('reference decoding completion cannot attach an old photo to a newly imported asset', async () => {
  let finishDecode;
  const h = controllerHarness(class {
    decode() { return new Promise(resolve => { finishDecode = resolve; }); }
  });
  const pending = h.loadReference();
  assert.equal(typeof finishDecode, 'function');
  h.state.assetHash = 'different-imported-asset';
  finishDecode();
  await assert.rejects(pending, /工程已经改变/);
  assert.equal(h.state.reference, null);
  assert.equal(h.state.referenceLoads, 0);
});

test('a verified unchanged asset can finish and reuse its decoded comparison reference', async () => {
  let decodes = 0;
  const h = controllerHarness(class { async decode() { decodes++; } });
  const first = await h.loadReference();
  assert.equal(await h.loadReference(), first);
  assert.equal(decodes, 1);
  assert.equal(h.state.referenceLoads, 1);
  assert.equal(h.element('referenceState').textContent, '参考像素仅用于对照');
  h.state.qualityVerified = false;
  await assert.rejects(h.loadReference(), /没有可核对的参考来源/);
});
