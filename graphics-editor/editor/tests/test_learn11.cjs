'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../web/learn11.js');
const fast = { steps: 200, hidden: 16, batchSize: 32 };
const hooks = { yieldControl: () => Promise.resolve() };
const linear = x => x / 255 <= .04045 ? x / 255 / 12.92 : ((x / 255 + .055) / 1.055) ** 2.4;
function image(id = 'test', rgb = [190, 70, 30], width = 16, height = 16) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { id, label: 'Analytic constant-color diagnostic', sourceGroup: 'synthetic.' + id, width, height, data, coverageKind: 'rectangle' };
}
// Independently implement the documented uint32 split protocol using BigInt.
function isValidation(row, index, seed = 11) {
  const mask = 0xffffffffn;
  let h = 2166136261n;
  for (const c of row.id + '|' + row.sourceGroup) h = ((h ^ BigInt(c.charCodeAt(0))) * 16777619n) & mask;
  let v = h ^ BigInt(index) ^ BigInt(seed);
  v = ((v ^ (v >> 16n)) * 0x45d9f3bn) & mask;
  v = ((v ^ (v >> 16n)) * 0x45d9f3bn) & mask;
  return Number((v ^ (v >> 16n)) % 5n) === 0;
}

test('actual Adam learns an independently known linear-color target and records honest scope', async () => {
  const row = image(), before = row.data.slice(), progress = [];
  const r = await L.train([row], fast, { ...hooks, onProgress: p => progress.push(p) });
  assert.equal(r.report.state, 'completed'); assert.equal(r.report.stepsCompleted, 200);
  assert.ok(r.report.finalLoss < r.report.initialLoss * .01);
  assert.ok(r.report.validationLoss < .0003);
  const color = L.evaluate(r.model, 0, 0);
  [190, 70, 30].forEach((c, i) => assert.ok(Math.abs(color[i] - linear(c)) < .025));
  assert.deepEqual(row.data, before); assert.equal(L.validateModel(r.model).ok, true);
  assert.equal(r.report.evidenceScope, 'spatial_reconstruction_holdout');
  assert.equal(r.report.independentSourceGeneralization, 'not_evaluated');
  assert.equal(r.report.semanticControlsLearned, false); assert.equal(r.report.programRSI, false);
  assert.equal(r.report.splitProtocol.independentTestSet, false);
  assert.equal(r.report.splitProtocol.validationUsedForCheckpointSelection, true);
  assert.ok(progress.length > 2); assert.equal(progress.at(-1).step, 200);
  assert.equal(r.report.weightBytes, L.parameterCount(r.model) * 8);
  assert.equal(r.model.weights.w1.length, 16 * 15);
  assert.equal(JSON.stringify(r.model).includes('"data"'), false);
  assert.equal(r.coverageByInstance[0].runs.reduce((n, v, i) => n + (i % 2 ? v : 0), 0), 256);
});

test('changed validation targets cannot enter the optimizer or its random sampling', async () => {
  const a = image('isolation'), b = structuredClone(a);
  let changed = 0;
  for (let p = 0; p < a.width * a.height; p++) if (isValidation(a, p)) { b.data.set([5, 230, 240], p * 4); changed++; }
  const config = { steps: 100, hidden: 8, batchSize: 16, reportEvery: 20 };
  const one = await L.train([a], config, hooks), two = await L.train([b], config, hooks);
  assert.equal(one.report.splitProtocol.validationPixels, changed); assert.ok(changed > 0);
  assert.deepEqual(one.report.history.map(x => x.trainLoss), two.report.history.map(x => x.trainLoss));
  assert.equal(one.report.lastStepTrainLoss, two.report.lastStepTrainLoss);
  assert.notEqual(one.report.lastStepValidationLoss, two.report.lastStepValidationLoss);
  assert.notEqual(one.model.instances[0].decodedPixelHash, two.model.instances[0].decodedPixelHash);
});

test('shared decoder uses observed instance identity and never invents an unobserved code', async () => {
  const r = await L.train([image('red', [230, 40, 30]), image('blue', [30, 80, 220])], { steps: 240, hidden: 16, batchSize: 32 }, hooks);
  const red = L.evaluate(r.model, .1, -.2, 0), blue = L.evaluate(r.model, .1, -.2, 1);
  assert.ok(red[0] - blue[0] > .5); assert.ok(blue[2] - red[2] > .5);
  assert.equal(r.model.architecture.inputSize, 16); assert.equal(r.report.sourceGroupCount, 2);
  assert.equal(r.coverageByInstance.length, 2);
  assert.throws(() => L.evaluate(r.model, 0, 0, 2), /instance/);
});

test('serialized models replay exactly; compiled evaluators hold their immutable numeric snapshot', async () => {
  const r = await L.train([image()], { steps: 60, hidden: 8, batchSize: 16 }, hooks);
  const restored = JSON.parse(JSON.stringify(r.model));
  const reordered = Object.fromEntries(Object.entries(restored).reverse());
  assert.equal(await L.modelDigest(reordered), r.report.modelHash);
  const tampered = structuredClone(restored); tampered.weights.w1[0] += .001;
  assert.notEqual(await L.modelDigest(tampered), r.report.modelHash);
  const compiled = L.compile(restored), out = new Float64Array(3), expected = compiled.evaluate(.125, -.5).slice();
  assert.equal(compiled.evaluate(.125, -.5, out), out);
  assert.deepEqual(Array.from(out), expected);
  assert.deepEqual(L.evaluate(r.model, .125, -.5), expected);
  restored.weights.w1.fill(100); restored.instances.push({ id: 'tamper' });
  assert.deepEqual(compiled.evaluate(.125, -.5), expected);
  assert.throws(() => compiled.evaluate(NaN, 0), /coordinates/);
  assert.throws(() => compiled.evaluate(1.01, 0), /coordinates/);
});

test('seeded learning is reproducible and tensor digests bind dimensions as well as pixels', async () => {
  const row = image('same'), config = { steps: 40, hidden: 8, batchSize: 16 };
  const a = await L.train([row], config, hooks), b = await L.train([row], config, hooks);
  assert.deepEqual(a.model, b.model); assert.equal(a.report.modelHash, b.report.modelHash);
  const resized = { ...row, width: 8, height: 32 };
  const c = await L.train([resized], config, hooks);
  assert.notEqual(a.model.instances[0].decodedPixelHash, c.model.instances[0].decodedPixelHash);
});

test('coverage is separate, transparent RGB is excluded, and duplicate sources cannot forge independent groups', async () => {
  const a = image('masked'), b = structuredClone(a);
  for (let p = 0; p < 64; p++) { a.data[p * 4 + 3] = b.data[p * 4 + 3] = 0; b.data.set([1, 250, 180], p * 4); }
  const c = { steps: 40, hidden: 8, batchSize: 16 };
  const one = await L.train([a], c, hooks), two = await L.train([b], c, hooks);
  assert.deepEqual(one.model.weights, two.model.weights);
  assert.equal(one.report.splitProtocol.trainPixels + one.report.splitProtocol.validationPixels, 192);
  assert.deepEqual(one.coverageByInstance[0].runs, [0, 64, 255, 192]);
  const row = image('a'); row.contentHash = 'a'.repeat(64);
  const row2 = { ...image('b'), contentHash: row.contentHash };
  await assert.rejects(L.train([row, row2], c, hooks), /different source groups/);
});

test('bad shapes, non-finite models, raw image payloads, and unbounded work are rejected', async () => {
  for (const config of [{ steps: 0 }, { hidden: 100 }, { learningRate: NaN }, { seed: -1 }, { steps: 2000, hidden: 48, batchSize: 128 }, { arbitrary: true }]) await assert.rejects(L.train([image()], config, hooks));
  const transparent = image(); transparent.data.fill(0); await assert.rejects(L.train([transparent], {}, hooks), /visible pixels/);
  const wrong = image(); wrong.data = wrong.data.subarray(1); await assert.rejects(L.train([wrong], {}, hooks), /dimensions/);
  const r = await L.train([image()], { steps: 20, hidden: 8, batchSize: 16 }, hooks);
  for (const mutate of [m => m.weights.w1.pop(), m => m.weights.b3[0] = Infinity, m => m.architecture.hiddenSize = 100000, m => m.instances[0].sourceUri = 'data:image/png;base64,AAAA', m => m.image = [0, 1, 2]]) {
    const bad = structuredClone(r.model); mutate(bad); assert.equal(L.validateModel(bad).ok, false); assert.throws(() => L.compile(bad));
  }
});

test('cancellation and wall-clock exhaustion preserve partial truthful reports without usable artifacts', async () => {
  let step = 0;
  await assert.rejects(L.train([image()], { steps: 100, hidden: 8, batchSize: 16, reportEvery: 4 }, { ...hooks, onProgress: p => step = p.step, shouldCancel: () => step >= 12 }), e => {
    assert.equal(e.code, 'CANCELLED'); assert.equal(e.report.state, 'canceled'); assert.ok(e.report.stepsCompleted < 100); assert.equal(e.model, undefined); return true;
  });
  await assert.rejects(L.train([image()], { steps: 20, hidden: 8, batchSize: 16, maxMilliseconds: 1000 }, { yieldControl: () => new Promise(resolve => setTimeout(resolve, 1050)) }), e => { assert.equal(e.code, 'TIMEOUT'); assert.equal(e.report.state, 'timed_out'); assert.ok(e.report.stepsCompleted < 20); return true; });
});

test('worker cancellation reaches its active training job and cannot emit a completed model', async () => {
  const messages = []; let finish;
  const done = new Promise(resolve => finish = resolve);
  const self = { postMessage(m) { messages.push(m); if (m.type === 'progress' && m.progress.step >= 4) self.onmessage({ data: { id: 'job', operation: 'cancel' } }); if (['result', 'canceled', 'error'].includes(m.type)) finish(); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/learn-worker11.js'), 'utf8'), { self, importScripts() {}, CRFLearn11: L, setTimeout });
  self.onmessage({ data: { id: 'job', operation: 'train', dataset: [image()], config: { steps: 100, hidden: 8, batchSize: 16, reportEvery: 4 } } });
  await done; assert.equal(messages.at(-1).type, 'canceled'); assert.equal(messages.some(x => x.type === 'result'), false);
});
