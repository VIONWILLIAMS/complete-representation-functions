import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Core from '../web/crf-core11.js';
import {composeFunctions11, referencesFunctions11} from '../server/functions11.mjs';
import worker from '../server/worker07.mjs';

const key = 'test-only-no-network-credential';
async function fixture() {
  const f = (await Core.createBuiltinFunctions())[0];
  let project = await Core.registerFunction(Core.createProject({width: 64, height: 48}), f);
  project = Core.applyPatch(project, {baseRevision: 0, operations: [{op: 'add',
    object: Core.createInstance(f, {id: 'object.first', width: 40, height: 40})},
    {op: 'add', object: Core.createInstance(f, {id: 'object.second', x: 20, width: 40, height: 40})},
    {op: 'add', object: Core.createInstance(f, {id: 'object.third', x: 30, width: 30, height: 30})}]});
  return {project, body: {prompt: 'Move the first object slightly right.', mode: 'edit',
    currentScene: project.scene, catalog: Object.values(project.functions).map(Core.functionSummary)}};
}
const envelope = scene => ({action: 'scene', scene, message: 'Transport fixture; not a live model result.', warnings: [], limitations: []});
const reply = (value, finish = 'stop') => new Response(JSON.stringify({id: 'fixture.call',
  model: 'fixture-model', choices: [{finish_reason: finish, message: {
    content: typeof value === 'string' ? value : JSON.stringify(value), reasoning_content: 'PRIVATE_TEST_REASONING'}}],
  usage: {prompt_tokens: 20, completion_tokens: 40, total_tokens: 60}}), {headers: {'content-type': 'application/json'}});
function transport(values) {
  const calls = [];
  return {calls, fetchImpl: async (url, init) => {
    calls.push({url, body: JSON.parse(init.body)});
    assert.ok(values.length, 'unexpected extra transport call');
    const value = values.shift(); if (value instanceof Error) throw value;
    return value;
  }};
}

test('real transport adapter sends bounded scene/catalog, passes effort, and never forwards weights or reasoning', async () => {
  for (const effort of ['high', 'max']) {
    const {body} = await fixture(), scene = structuredClone(body.currentScene); scene.objects[0].x += 5;
    body.catalog[0].weights = 'MUST_NOT_FORWARD_WEIGHTS'; body.catalog[0].url = 'MUST_NOT_FORWARD_REFERENCE';
    const t = transport([reply(envelope(scene))]);
    const out = await composeFunctions11({...body, reasoningEffort: effort}, {apiKey: key, ...t});
    assert.equal(out.ok, true); assert.equal(t.calls.length, 1);
    assert.equal(t.calls[0].body.reasoning_effort, effort);
    assert.equal(JSON.stringify(t.calls).includes('MUST_NOT_FORWARD'), false);
    assert.equal(JSON.stringify(out).includes('PRIVATE_TEST_REASONING'), false);
    assert.equal(JSON.stringify(out).includes(key), false);
    assert.equal(out.usage.total_tokens, 60); assert.equal(out.usage.usageComplete, true);
    assert.equal(out.modelWeightsTransmitted, false); assert.equal(out.trainingPerformed, false);
  }
});

test('unknown function, executable fields and protected edits cannot reach a successful candidate', async () => {
  const {body} = await fixture();
  for (const alter of [
    s => s.objects[0].functionRef = 'a'.repeat(64),
    s => s.objects[0].script = 'return arbitraryCode()',
    s => s.objects[1].x += 2,
    s => s.background = [1, 0, 0],
    s => s.objects.reverse(),
    s => s.objects.push({...s.objects[0], id: 'object.extra'})
  ]) {
    const scene = structuredClone(body.currentScene); alter(scene);
    const t = transport([reply(envelope(scene))]);
    const out = await composeFunctions11({...body, editableObjectIds: ['object.first']},
      {apiKey: key, schemaRepair: false, ...t});
    assert.equal(out.ok, false); assert.equal(out.scene, undefined);
    assert.equal(out.usage.providerCalls, 1); assert.equal(out.usage.total_tokens, 60);
  }
  const scene = structuredClone(body.currentScene); scene.objects[0].x += 10;
  const good = await composeFunctions11({...body, editableObjectIds: ['object.first']},
    {apiKey: key, ...transport([reply(envelope(scene))])});
  assert.equal(good.ok, true);
});

test('input rejection costs no calls and schema repair is bounded to two actual requests', async () => {
  const {body} = await fixture();
  for (const input of [{...body, mode: 'train'}, {...body, prompt: ''}, {...body, catalog: []},
    {...body, currentScene: {...body.currentScene, arbitraryCode: 'bad'}}, {...body, editableObjectIds: ['missing']}]) {
    const t = transport([]), out = await composeFunctions11(input, {apiKey: key, ...t});
    assert.equal(out.ok, false); assert.equal(t.calls.length, 0); assert.equal(out.usage.providerCalls, 0);
  }
  const t = transport([reply('broken'), reply(envelope(body.currentScene))]);
  const out = await composeFunctions11(body, {apiKey: key, ...t});
  assert.equal(out.ok, true); assert.equal(out.usage.providerCalls, 2); assert.equal(out.usage.total_tokens, 120);
  assert.deepEqual(out.attempts.map(x => x.validation), ['failed', 'passed']);
  const failed = await composeFunctions11(body, {apiKey: key, ...transport([reply('broken'), reply('still broken')])});
  assert.equal(failed.ok, false); assert.equal(failed.usage.providerCalls, 2);
});

test('truncation, unknown transport usage, cancellation and missing credentials remain distinct', async () => {
  const {body} = await fixture();
  const truncated = await composeFunctions11(body, {apiKey: key, ...transport([reply('partial', 'length')])});
  assert.equal(truncated.error.code, 'MODEL_TRUNCATED'); assert.equal(truncated.usage.total_tokens, 60);
  assert.equal(truncated.usage.usageComplete, true);
  const failed = await composeFunctions11(body, {apiKey: key, ...transport([new Error('network unavailable')])});
  assert.equal(failed.usage.unknownUsageCalls, 1); assert.equal(failed.usage.usageComplete, false);
  const withoutUsage = Response.json({choices: [{finish_reason: 'stop', message: {content: JSON.stringify(envelope(body.currentScene))}}]});
  const unknown = await composeFunctions11(body, {apiKey: key, ...transport([withoutUsage])});
  assert.equal(unknown.ok, true); assert.equal(unknown.usage.providerCalls, 1);
  assert.equal(unknown.usage.usageComplete, false); assert.equal(unknown.usage.unknownUsageCalls, 1);
  assert.equal(unknown.usage.requests.length, 0);
  const absent = await composeFunctions11(body, transport([]));
  assert.equal(absent.error.code, 'NOT_CONFIGURED'); assert.equal(absent.usage.providerCalls, 0);
  const controller = new AbortController(); controller.abort();
  const cancelled = await composeFunctions11(body, {apiKey: key, signal: controller.signal, ...transport([])});
  assert.equal(cancelled.error.code, 'CANCELLED'); assert.equal(cancelled.usage.providerCalls, 0);
});

test('unsupported is a capability outcome without an invented scene or quality acceptance', async () => {
  const {body} = await fixture();
  const result = await composeFunctions11(body, {apiKey: key,
    ...transport([reply({action: 'unsupported', message: 'No unseen instance exists.', limitations: ['finite instance model']})])});
  assert.equal(result.ok, true); assert.equal(result.action, 'unsupported');
  assert.equal(result.scene, undefined); assert.equal(result.quality.independentVisualReview, 'not_evaluated');
});

test('public search follows actual source metadata and returns checked bytes without a model call', async () => {
  const png = fs.readFileSync(new URL('../web/assets/v08/references/landscape.alpine.png', import.meta.url));
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url)); assert.equal(init.credentials, 'omit');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    if (String(url).includes('list=search')) return Response.json({query: {search: [{ns: 6, title: 'File:Water.png'}]}});
    if (String(url).includes('/wiki/')) return new Response('<html><meta property="og:image" content="https://upload.wikimedia.org/Water.png"></html>');
    if (String(url).includes('prop=imageinfo')) return Response.json({query: {pages: [{
      title: 'File:Water.png', imageinfo: [{url: 'https://upload.wikimedia.org/Water.png',
        thumburl: 'https://upload.wikimedia.org/Water.png', size: png.length, width: 800, height: 531,
        extmetadata: {LicenseShortName: {value: 'CC0'}, Artist: {value: 'Fixture author'}}}]
    }]}});
    if (String(url).startsWith('https://upload.wikimedia.org/')) return new Response(png);
    throw new Error('Unexpected fixture URL ' + url);
  };
  const result = await referencesFunctions11({query: 'water', maxImages: 1}, {fetchImpl});
  assert.equal(result.ok, true); assert.equal(result.images.length, 1);
  assert.match(result.images[0].url, /^data:image\/png;base64,/);
  assert.equal(result.images[0].width, 800); assert.equal(result.images[0].height, 531);
  assert.match(result.images[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.images[0].license.name, 'CC0'); assert.equal(result.providerCalls, 0);
  assert.ok(calls.some(x => x.includes('srnamespace=6')));
});

test('reference access failures, arbitrary hosts and redirects never become fake download success', async () => {
  let calls = 0;
  const deny = async () => { calls++; return new Response('denied', {status: 403}); };
  const bad = await referencesFunctions11({sourceUrl: 'http://127.0.0.1/private'}, {fetchImpl: deny});
  assert.equal(bad.ok, false); assert.equal(calls, 0);
  const denied = await referencesFunctions11({sourceUrl: 'https://commons.wikimedia.org/wiki/File:Water.png'}, {fetchImpl: deny});
  assert.equal(denied.images.length, 0); assert.equal(denied.attempts[0].error, 'http_403'); assert.equal(calls, 1);
  const redirected = await referencesFunctions11({query: 'water'}, {fetchImpl: async () =>
    new Response(null, {status: 302, headers: {location: 'http://127.0.0.1/private'}})});
  assert.equal(redirected.ok, false); assert.match(redirected.error.message, /redirect/);
  const empty = await referencesFunctions11({query: 'no results'}, {fetchImpl: async () => Response.json({query: {search: []}})});
  assert.equal(empty.ok, true); assert.equal(empty.referenceStatus, 'no_images_available'); assert.equal(empty.images.length, 0);
});

test('new HTTP capabilities keep legacy semantics and enforce JSON/origin/method boundaries', async () => {
  const base = 'https://example.test';
  const old = await (await worker.fetch(new Request(base + '/api/crf/status'), {})).json();
  const status = await (await worker.fetch(new Request(base + '/api/crf/functions11/status'), {})).json();
  assert.equal(old.version, '0.10.0'); assert.equal(old.currentWorkflow.modelTraining, false);
  assert.equal(status.configured, false); assert.equal(status.capabilities.gpu, false);
  assert.equal(status.quality.programRSI, false);
  const {body} = await fixture();
  const response = await worker.fetch(new Request(base + '/api/crf/functions11/compose', {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}), {});
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'NOT_CONFIGURED');
  assert.equal((await worker.fetch(new Request(base + '/api/crf/functions11/references'), {})).status, 405);
  assert.equal((await worker.fetch(new Request(base + '/api/crf/functions11/references', {
    method: 'POST', headers: {origin: 'https://foreign.test', 'content-type': 'application/json'}, body: '{}'}), {})).status, 403);
  assert.equal((await worker.fetch(new Request(base + '/api/crf/functions11/references', {method: 'POST', body: '{}'}), {})).status, 415);
});
