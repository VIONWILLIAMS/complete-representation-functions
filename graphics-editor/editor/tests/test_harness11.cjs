'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../web/crf-core11.js'), H = require('../web/harness11.js');
async function project() {
  const f = (await C.createBuiltinFunctions())[0];
  let p = await C.registerFunction(C.createProject({width: 64, height: 48}), f);
  return C.applyPatch(p, {baseRevision: 0, operations: [
    {op: 'add', object: C.createInstance(f, {id: 'one', width: 30, height: 30})},
    {op: 'add', object: C.createInstance(f, {id: 'two', x: 30, width: 30, height: 30})}]});
}
const usage = {providerCalls: 1, unknownUsageCalls: 0, usageComplete: true, total_tokens: 20, requests: []};
const provider = change => async body => {
  const scene = structuredClone(body.currentScene); change?.(scene);
  return {ok: true, action: 'scene', scene, message: 'Explicit transport fixture.', usage};
};

test('scene proposals render actual pixels and bind descriptor, scene, function versions and costs', async () => {
  const p = await project(), before = C.canonical(p), events = [];
  const result = await H.propose({project: p, prompt: 'Move one.', mode: 'edit', editableObjectIds: ['one'],
    provider: provider(s => s.objects[0].x += 3), onEvent: event => events.push(event.type)});
  assert.equal(result.run.status, 'review_required'); assert.equal(result.project.scene.revision, p.scene.revision + 1);
  assert.equal(result.project.scene.objects[0].x, 3); assert.equal(C.canonical(p), before);
  assert.match(result.run.frame.pixelSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.run.frame.width, 64); assert.equal(result.run.frame.height, 48);
  assert.equal(result.run.frame.diagnostics.sourceRGBAtRender, false);
  assert.equal(result.run.providerCalls, 1); assert.equal(result.run.usage.total_tokens, 20);
  assert.equal(result.run.formalProof, 'not_implemented'); assert.equal(result.run.programRSI, false);
  assert.equal(result.run.independentVisualReview, 'not_evaluated');
  assert.equal(result.run.contractSha256, await C.digest(result.run.contract));
  assert.equal(result.run.baseProjectSha256, await C.digest(p));
  assert.ok(events.includes('rendered')); assert.ok(events.includes('ready_for_review'));
});

test('a successful proposal is the same shared atomic patch a manual editor uses', async () => {
  const p = await project();
  const result = await H.propose({project: p, prompt: 'Move one.', provider: provider(s => s.objects[0].x = 12)});
  const manual = C.applyPatch(p, {baseRevision: p.scene.revision, operations: [{op: 'update', id: 'one', values: {x: 12}}]});
  assert.deepEqual(result.project.scene, manual.scene);
  assert.deepEqual((await C.renderScene(result.project)).data, (await C.renderScene(manual)).data);
});

test('protected object, unknown function and malicious patch failures preserve the original project', async () => {
  const p = await project();
  for (const apply of [provider(s => s.objects[1].x++),
    provider(s => s.objects[0].functionRef = '0'.repeat(64)),
    async () => ({ok: true, action: 'patch', patch: {baseRevision: p.scene.revision,
      operations: [{op: 'update', id: 'one', values: {x: 7}}, {op: 'scene', values: {functions: {}}}]}, usage})]) {
    let rendered = false;
    const out = await H.propose({project: p, prompt: 'Edit one only.', mode: 'edit', editableObjectIds: ['one'],
      provider: apply, render: () => { rendered = true; }});
    assert.equal(out.run.status, 'failed'); assert.deepEqual(out.project, p); assert.equal(rendered, false);
    assert.equal(out.run.usage.total_tokens, 20);
  }
});

test('tampered weights/functions fail before provider invocation and never receive a success check', async () => {
  const p = await project();
  const bad = JSON.parse(C.canonical(p)); const ref = Object.keys(bad.functions)[0]; bad.functions[ref].label = 'Tampered label';
  let calls = 0;
  const result = await H.propose({project: bad, prompt: 'Try it.', provider: async () => { calls++; }});
  assert.equal(result.run.status, 'failed'); assert.equal(calls, 0); assert.equal(result.run.checks.length, 0);
});

test('provider unavailability, unknown request outcome and cancellation preserve useful failure records', async () => {
  const p = await project();
  const absent = await H.propose({project: p, prompt: 'Compose.', provider: async () => ({ok: false,
    error: {code: 'NOT_CONFIGURED', message: 'No credential.'}, usage: {...usage, providerCalls: 0, total_tokens: 0}})});
  assert.equal(absent.run.status, 'blocked'); assert.equal(absent.run.providerCalls, 0); assert.deepEqual(absent.project, p);
  const network = await H.propose({project: p, prompt: 'Compose.', provider: async () => { throw new Error('Network interrupted'); }});
  assert.equal(network.run.providerCalls, null); assert.equal(network.run.usage.usageComplete, false);
  assert.equal(network.run.apiOperations[0].status, 'outcome_unknown');
  const controller = new AbortController();
  const cancelled = await H.propose({project: p, prompt: 'Compose.', signal: controller.signal,
    provider: async body => { controller.abort(); return provider()(body); }});
  assert.equal(cancelled.run.status, 'cancelled'); assert.equal(cancelled.run.providerCalls, 1); assert.deepEqual(cancelled.project, p);
});

test('mutable caller state, bad renderers and observer errors cannot forge acceptance', async () => {
  const p = await project(), originalX = p.scene.objects[0].x;
  const out = await H.propose({project: p, prompt: 'Compose.', provider: async body => {
    p.scene.objects[0].x = 100; return provider(s => s.objects[0].x = 7)(body);
  }, onEvent: () => { throw new Error('Observer failed'); }});
  assert.equal(out.project.scene.objects[0].x, 7);
  assert.equal(out.run.baseRevision, p.scene.revision); assert.notEqual(out.run.baseProjectSha256, await C.digest(p));
  assert.ok(out.run.observerErrors.length); assert.equal(originalX, 0);
  const invalid = await H.propose({project: await project(), prompt: 'Compose.', provider: provider(),
    render: () => ({width: 64, height: 48, data: new Uint8Array(4)})});
  assert.equal(invalid.run.status, 'failed'); assert.equal(invalid.run.error.code, 'INVALID_FRAME');
  assert.equal(invalid.run.frame, undefined);
  const over = await H.propose({project: await project(), prompt: 'Compose.', provider: async body =>
    ({...await provider()(body), usage: {...usage, providerCalls: 3}})});
  assert.equal(over.run.status, 'blocked'); assert.equal(over.run.error.code, 'PROVIDER_BUDGET_EXCEEDED');
});

test('stale or forged renderer descriptors cannot overwrite authoritative evidence bindings', async () => {
  const p = await project();
  for (const change of [d => d.width = 99, d => d.sceneSha256 = 'false', d => d.sceneDigest = '0'.repeat(64),
    d => d.functionVersions = [], d => d.time = 2, d => d.backend = 'direct']) {
    const out = await H.propose({project: p, prompt: 'Compose.', provider: provider(), render: async candidate => {
      const frame = await C.renderScene(candidate); change(frame.descriptor); return frame;
    }});
    assert.equal(out.run.status, 'failed'); assert.equal(out.run.error.code, 'FRAME_BINDING_MISMATCH');
    assert.equal(out.run.frame, undefined); assert.deepEqual(out.project, p);
  }
});

test('abort at each async observer boundary prevents request or candidate commit', async () => {
  for (const phase of ['provider_started', 'candidate_validated', 'rendered', 'ready_for_review']) {
    const p = await project(), controller = new AbortController(); let calls = 0;
    const out = await H.propose({project: p, prompt: 'Compose.', signal: controller.signal,
      onEvent: event => { if (event.type === phase) controller.abort(); },
      provider: async body => { calls++; return provider(s => s.objects[0].x++)(body); }});
    assert.equal(out.run.status, 'cancelled', phase); assert.deepEqual(out.project, p, phase);
    if (phase === 'provider_started') assert.equal(calls, 0);
  }
});

test('task input scope and project are captured before asynchronous integrity or callback work', async () => {
  const p = await project(), original = structuredClone(p);
  const options = {project: p, prompt: 'Original goal.', mode: 'edit', editableObjectIds: ['one'],
    onEvent: event => {
      if (event.type === 'contract_frozen') { options.prompt = 'Changed goal.'; options.editableObjectIds.push('two'); }
    }, provider: async body => {
      assert.equal(body.prompt, 'Original goal.'); assert.deepEqual(body.editableObjectIds, ['one']);
      return provider(s => s.objects[1].x++)(body);
    }};
  const pending = H.propose(options); p.scene.objects[0].x = 77;
  const out = await pending;
  assert.equal(out.run.status, 'failed'); assert.equal(out.run.error.code, 'EDIT_SCOPE_VIOLATION');
  assert.deepEqual(out.project, original);
  assert.equal(out.run.baseProjectSha256, await C.digest(original));
});

test('renderer callbacks cannot mutate an already validated candidate or forge missing provenance', async () => {
  const p = await project();
  const out = await H.propose({project: p, prompt: 'Move one.', mode: 'edit', editableObjectIds: ['one'],
    provider: provider(s => s.objects[0].x++), render: async candidate => {
      candidate.scene.background = [1, 0, 0];
      return C.renderScene(candidate);
    }});
  assert.equal(out.run.status, 'failed'); assert.equal(out.run.error.code, 'FRAME_BINDING_MISMATCH');
  assert.deepEqual(out.project, p); assert.equal(out.run.frame, undefined);
  const missing = await H.propose({project: p, prompt: 'Compose.', provider: provider(),
    render: () => ({width: 64, height: 48, data: new Uint8Array(64 * 48 * 4)})});
  assert.equal(missing.run.status, 'failed'); assert.equal(missing.run.error.code, 'INVALID_FRAME_DESCRIPTOR');
});
