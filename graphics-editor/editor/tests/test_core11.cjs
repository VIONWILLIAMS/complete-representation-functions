'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/crf-core11.js');
const L = require('../web/learn11.js');
const clone = x => JSON.parse(JSON.stringify(x));

async function explicit(id = 'solid', appearance = {}, coverage = { kind: 'rect' }) {
  return C.sealFunction({ schema: C.SCHEMAS.function, id, label: id, kind: 'explicit', width: 8, height: 8,
    appearance: { kind: 'explicit', base: [.25, .5, .75], ...appearance }, coverage,
    provenance: { kind: 'independent_test_fixture', sourceRGBAtRender: false } });
}
async function sceneWith(f, width = 8, height = 8, options = {}) {
  let p = C.createProject({ id: 'project.test', width, height }); p = await C.registerFunction(p, f);
  p.scene.background = [0, 0, 0]; p.scene.objects = [C.createInstance(f, { id: 'object.main', width, height, ...options })]; return p;
}
// Deliberately authored analytic network fixture, not a trained model or training
// result: red = sigmoid(2*tanh(tanh(x))), green = blue = 0.5.
function networkFixture(instances = 1, hidden = 8) {
  const input = 14 + instances, weights = { w1: Array(hidden * input).fill(0), b1: Array(hidden).fill(0),
    w2: Array(hidden * hidden).fill(0), b2: Array(hidden).fill(0), w3: Array(3 * hidden).fill(0), b3: [0, 0, 0] };
  weights.w1[0] = 1; weights.w2[0] = 1; weights.w3[0] = 2;
  return { schema: L.SCHEMA, architecture: { features: 'fourier_xy_v1', frequencies: [1, 2, 4], inputSize: input,
    hiddenSize: hidden, hiddenLayers: 2, outputSize: 3, activation: 'tanh', output: 'sigmoid', colorSpace: 'linear_srgb' },
    instances: Array.from({ length: instances }, (_, i) => ({ id: 'fixture.' + i, label: 'Authored analytic fixture ' + i,
      sourceGroup: 'synthetic.group.' + i, width: 8, height: 8, decodedPixelHash: String(i).repeat(64),
      crop: [0, 0, 1, 1], coverageKind: 'rectangle' })), weights };
}

test('canonical hashes bind content, distinguish byte input, and reject executable/nonfinite/prototype data', async () => {
  assert.equal(await C.digest({ b: [2, 1], a: 3 }), await C.digest({ a: 3, b: [2, 1] }));
  assert.notEqual(await C.digest([1, 2]), await C.digest([2, 1]));
  assert.notEqual(await C.digest('abc'), await C.digestBytes(new TextEncoder().encode('abc')));
  for (const value of [NaN, Infinity, undefined, () => 1, JSON.parse('{"__proto__":{"x":1}}')]) assert.throws(() => C.canonical(value));
  const cycle = {}; cycle.next = cycle; assert.throws(() => C.canonical(cycle), /Cyclic/);
  assert.throws(() => C.canonical(Object.create({ inherited: 1 })), /plain JSON/);
});

test('immutable versions reject changed coefficients and preserve caller-owned input', async () => {
  const f = await explicit(); assert.ok(Object.isFrozen(f.appearance.base));
  const p = await sceneWith(f), tampered = clone(p); tampered.functions[f.version].appearance.base[0] = .1;
  assert.equal(C.validateProject(tampered).ok, true, 'structural validity is separate from integrity');
  assert.equal((await C.verifyProject(tampered)).ok, false);
  await assert.rejects(C.createRuntime(tampered), /immutable version/);
  const incoming = clone(f); const registered = await C.registerFunction(C.createProject(), incoming); incoming.appearance.base[0] = .99;
  assert.equal(registered.functions[f.version].appearance.base[0], .25);
  const revised = await C.sealFunction({ ...clone(f), appearance: { ...clone(f.appearance), base: [.1, .5, .75] } });
  assert.notEqual(revised.version, f.version);
});

test('lightweight catalog validates scene references without sending neural weights', async () => {
  const f = await C.createNeuralFunction(networkFixture(), { id: 'neural.fixture', label: 'fixture' });
  const p = await sceneWith(f), catalog = [C.functionSummary(f)];
  assert.equal(C.validateScene(p.scene, catalog).ok, true); assert.equal(JSON.stringify(catalog).includes('w1'), false);
  for (const change of [o => { o.instance = 1; }, o => { o.functionRef = 'f'.repeat(64); }, o => { o.x = NaN; },
    o => { o.id = 'constructor'; }, o => { o.width = 0; }, o => { o.script = 'untrusted()'; }]) {
    const scene = clone(p.scene); change(scene.objects[0]); assert.equal(C.validateScene(scene, catalog).ok, false);
  }
  const extra = clone(p.scene); extra.evaluator = 'replace'; assert.equal(C.validateScene(extra, catalog).ok, false);
});

test('patches are atomic, revision checked, and cannot modify the function registry', async () => {
  const p = await sceneWith(await explicit()), before = await C.digest(p);
  assert.throws(() => C.applyPatch(p, { baseRevision: 0, operations: [
    { op: 'update', id: 'object.main', values: { x: 4 } }, { op: 'remove', id: 'does.not.exist' }
  ] }));
  assert.equal(await C.digest(p), before);
  assert.throws(() => C.applyPatch(p, { baseRevision: 0, operations: [{ op: 'scene', values: { functions: {} } }] }));
  const next = C.applyPatch(p, { baseRevision: 0, operations: [{ op: 'update', id: 'object.main', values: { x: 2 } }] });
  assert.equal(p.scene.objects[0].x, 0); assert.equal(next.scene.revision, 1); assert.equal(next.functions, p.functions);
  assert.throws(() => C.applyPatch(next, { baseRevision: 0, operations: [{ op: 'remove', id: 'object.main' }] }), /stale/);
});

test('coverage and color are integrated jointly against independent analytic ground truth', async () => {
  // In the left half of a one-pixel footprint alpha=1 and red=x; outside alpha=0.
  // Integral_0^0.5 x dx = 0.125; independent averaging would wrongly give 0.25.
  const f = await explicit('joint', { base: [.5, 0, 0], gradientX: [.5, 0, 0] },
    { kind: 'polygon', points: [[-1, -1], [0, -1], [0, 1], [-1, 1]], feather: 0 });
  const p = await sceneWith(f, 1, 1), r = await C.renderScene(p, { samples: 2, backend: 'direct' });
  assert.equal(r.linearData[0], .125); assert.equal(r.data[0], C.linearToByte(.125)); assert.equal(r.data[3], 255);
});

test('source-over respects layer order and uses linear-light premultiplied contributions', async () => {
  const red = await explicit('red', { base: [1, 0, 0] }), blue = await explicit('blue', { base: [0, 0, 1] });
  let p = await sceneWith(red, 1, 1, { opacity: .5 }); p = await C.registerFunction(p, blue);
  p.scene.objects.push(C.createInstance(blue, { id: 'blue', width: 1, height: 1, opacity: .5, zIndex: 1 }));
  const r = await C.renderScene(p, { backend: 'direct' }); assert.deepEqual(Array.from(r.linearData), [.25, 0, .5]);
  const changed = C.applyPatch(p, { baseRevision: 0, operations: [{ op: 'update', id: 'blue', values: { zIndex: -1 } }] });
  assert.deepEqual(Array.from((await C.renderScene(changed)).linearData), [.5, 0, .25]);
});

test('affine motion is evaluated from a frozen scene, and runtime metadata cannot be overwritten', async () => {
  const p = await sceneWith(await explicit(), 16, 12, { x: 1, y: 2, width: 3, height: 3, motion: { vx: 1, vy: 0, rotationSpeed: 3 } });
  const runtime = await C.createRuntime(p), t4 = runtime.render({ time: 4 }), t0 = runtime.render({ time: 0 });
  assert.notDeepEqual(t4.data, t0.data); assert.deepEqual(runtime.render({ time: 4 }).data, t4.data);
  p.scene.objects[0].x = 200; runtime.trace.sceneDigest = 'fake';
  assert.deepEqual(runtime.render({ time: 0 }).data, t0.data); assert.notEqual(runtime.render().descriptor.sceneDigest, 'fake');
  assert.throws(() => runtime.render({ time: NaN })); assert.throws(() => runtime.render({ time: 121 }));
});

test('an authorized local move leaves pixels outside old/new support exactly unchanged', async () => {
  const p = await sceneWith(await explicit(), 16, 12, { x: 1, y: 2, width: 3, height: 3 });
  const changed = C.applyPatch(p, { baseRevision: 0, operations: [{ op: 'update', id: 'object.main', values: { x: 6 } }] });
  const a = await C.renderScene(p, { samples: 2 }), b = await C.renderScene(changed, { samples: 2 }); let changedPixels = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const at = (y * 16 + x) * 4, equal = a.data.slice(at, at + 4).every((v, k) => v === b.data[at + k]);
    if (!equal) changedPixels++;
    if (!(y >= 2 && y < 5 && (x >= 1 && x < 4 || x >= 6 && x < 9))) assert.equal(equal, true);
  }
  assert.equal(changedPixels, 18);
});

test('neural direct evaluation agrees with an independent closed expression and uses no source fetch', async () => {
  const f = await C.createNeuralFunction(networkFixture(), { id: 'neural.exact', label: 'analytic fixture' }), p = await sceneWith(f, 8, 8);
  const originalFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('render must not fetch source images'); };
  try {
    const r = await C.renderScene(p, { backend: 'direct' });
    for (let x = 0; x < 8; x++) {
      const qx = 2 * (x + .5) / 8 - 1, expected = 1 / (1 + Math.exp(-2 * Math.tanh(Math.tanh(qx))));
      assert.ok(Math.abs(r.linearData[x * 3] - expected) < 3e-8);
    }
    assert.equal(r.diagnostics.neuralWeightsUsed, true); assert.equal(r.diagnostics.referenceNetworkReads, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('generated caches have measured error, actual cold/hot work, and preserved lifetime counters', async () => {
  const f = await C.createNeuralFunction(networkFixture(), { id: 'neural.cache', label: 'cache fixture' }), p = await sceneWith(f, 32, 24);
  const runtime = await C.createRuntime(p, { cacheResolution: 32 }), direct = runtime.render({ backend: 'direct' });
  const cold = runtime.render({ backend: 'cached' }), hot = runtime.render({ backend: 'cached' }), report = C.compareFrames(direct, cold);
  assert.equal(cold.diagnostics.cacheBuildEvaluations, 1024); assert.equal(hot.diagnostics.cacheBuildEvaluations, 0);
  assert.equal(cold.diagnostics.generatedFieldCache, true); assert.equal(cold.diagnostics.sourceRGBBlit, false);
  assert.equal(hot.diagnostics.cachedSamples, 768); assert.deepEqual(cold.data, hot.data);
  assert.ok(report.linearRMSE < .001); assert.ok(report.maxError <= 1);
  const firstMAC = runtime.trace.cacheBuildMAC; runtime.clearCache(); runtime.render();
  assert.equal(runtime.trace.cacheBuildMAC, firstMAC * 2);
});

test('multiple neural instances select their own explicitly declared coverage', async () => {
  const model = networkFixture(2), coverage = [{ encoding: 'rle8', width: 8, height: 8, runs: [255, 64], provenance: 'synthetic', sourceId: 'fixture.0' },
    { encoding: 'rle8', width: 8, height: 8, runs: [0, 64], provenance: 'synthetic', sourceId: 'fixture.1' }];
  const f = await C.createNeuralFunction(model, { id: 'neural.multi', label: 'two instances', coverageByInstance: coverage });
  const p = await sceneWith(f), shown = await C.renderScene(p);
  const hidden = C.applyPatch(p, { baseRevision: 0, operations: [{ op: 'update', id: 'object.main', values: { instance: 1 } }] });
  const r = await C.renderScene(hidden); assert.notDeepEqual(shown.data, r.data);
  assert.ok(Array.from(r.data).every((v, i) => v === (i % 4 === 3 ? 255 : 0)));
  await assert.rejects(C.createNeuralFunction(model, { coverageByInstance: coverage.slice(0, 1) }), /instance count/);
});

test('fractional alpha resampling remains in its declared range despite floating rounding', async () => {
  const f = await explicit('rle.resampling', { base: [1, 1, 1] },
    { kind: 'rle8', width: 8, height: 8, runs: [255, 64], provenance: 'synthetic_opaque' });
  const p = await sceneWith(f, 37, 29), r = await C.renderScene(p, { samples: 3 });
  assert.ok(r.linearData.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
  assert.equal(r.data[(14 * 37 + 18) * 4], 255);
});

test('training evidence must be completed and match the precise model content', async () => {
  const model = networkFixture();
  await assert.rejects(C.createNeuralFunction(model, { report: { state: 'canceled' } }), /incomplete training/);
  await assert.rejects(C.createNeuralFunction(model, { report: { state: 'timed_out' } }), /incomplete training/);
  const report = { state: 'completed', modelHashProtocol: 'sha256_canonical_json_sorted_keys_utf8_v1', modelHash: await C.digest(model), scope: 'synthetic_test_only' };
  const f = await C.createNeuralFunction(model, { report }); assert.equal(f.provenance.trainingReport.modelHash, report.modelHash);
  const changed = clone(model); changed.weights.b3[0] = .1;
  await assert.rejects(C.createNeuralFunction(changed, { report }), /does not match/);
});

test('legacy Gaussian adapter evaluates declared coefficients with explicit color conversion', async () => {
  const asset = { schema: 'crf.gaussian_asset.v0.10', id: 'gaussian.test', width: 8, height: 8,
    base: [.1, .2, .3], splats: [[4, 4, 2, 2, 0, .4, 0, -.1]], kernel: { colorSpace: 'linear_srgb' } };
  const f = await C.createGaussianFunction(asset), p = await sceneWith(f), r = await C.renderScene(p, { backend: 'direct' });
  const x = 3, y = 4, weight = Math.exp(-.5 * ((x + .5 - 4) ** 2 + (y + .5 - 4) ** 2) / 4);
  assert.ok(Math.abs(r.linearData[(y * 8 + x) * 3] - (.1 + .4 * weight)) < 3e-8);
  assert.equal(f.provenance.scope, 'new_joint_sample_semantics_not_legacy_byte_identity');
  assert.equal(asset.splats.length, 1); assert.equal(asset.base[0], .1);
});

test('render and generated-cache aggregate budgets are checked before expensive computation', async () => {
  const f = await C.createNeuralFunction(networkFixture(1, 48), { id: 'neural.large', label: 'budget fixture' });
  const p = await sceneWith(f, 512, 512), runtime = await C.createRuntime(p);
  assert.throws(() => runtime.render({ backend: 'direct' }), /computation budget/);
  const hugeCache = await C.createRuntime(p, { cacheResolution: 256 });
  assert.throws(() => hugeCache.render({ width: 8, height: 8, backend: 'cached' }), /Cache precomputation/);
  assert.equal(hugeCache.trace.cacheBuildEvaluations, 0);
  assert.throws(() => runtime.render({ width: 2000, height: 2000 }));
  assert.throws(() => runtime.render({ backend: 'webgpu' }), /Unsupported/);
  assert.throws(() => runtime.render({ samples: 100 }));
});

test('export/import retains exact execution dependencies and yields the same image', async () => {
  const p = await C.createDemoProject(), before = await C.renderScene(p, { width: 80, height: 60, time: 2 });
  const imported = JSON.parse(C.canonical(p)); assert.equal((await C.verifyProject(imported)).ok, true);
  const after = await C.renderScene(imported, { width: 80, height: 60, time: 2 });
  assert.deepEqual(after.data, before.data); assert.equal(after.descriptor.sceneDigest, before.descriptor.sceneDigest);
  assert.equal(Object.keys(p.functions).length, 4); assert.equal(before.diagnostics.photographicQuality, 'not_evaluated');
  assert.equal(C.compareFrames(before, after).psnrStatus, 'infinite_zero_error');
  assert.throws(() => C.compareFrames(before, { ...after, width: 60, height: 80 }), /dimensions differ/);
});
