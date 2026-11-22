'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../web/crf-quality12.js');
const clone = value => JSON.parse(JSON.stringify(value));
const round = x => Math.max(0, Math.min(255, Math.floor(x + .5)));
function fixture(overrides = {}) {
  return { schema: C.ASSET_SCHEMA, id: 'analytic.fixture', width: 7, height: 5,
    base: [30, 45, 60], splats: [[3.5, 2.5, 1.1, .65, .37, 70, -25, 30], [1.5, 1.5, .55, .9, -.4, -15, 60, 20]],
    kernel: { type: 'signed_additive_gaussian', colorSpace: 'srgb_encoded_0_255', cutoffSigma: 4, sample: 'pixel_centres' },
    provenance: { kind: 'authored_analytic_fixture', sourceRGBEmbedded: false }, ...overrides };
}
function referenceAt(asset, x, y) {
  // Independent pixel-by-pixel reference, with no bounding-box/splat machinery.
  const channels = asset.base.slice();
  for (const [cx, cy, sx, sy, angle, r, g, b] of asset.splats) {
    const co = Math.cos(angle), si = Math.sin(angle), dx = x - cx, dy = y - cy;
    const squaredRadius = ((co * dx + si * dy) / sx) ** 2 + ((co * dy - si * dx) / sy) ** 2;
    if (squaredRadius <= 16) {
      const amplitude = Math.exp(-squaredRadius / 2);
      channels[0] += r * amplitude; channels[1] += g * amplitude; channels[2] += b * amplitude;
    }
  }
  return channels.map(round);
}
function independentFrame(asset, view) {
  const out = [];
  for (let y = 0; y < view.height; y++) for (let x = 0; x < view.width; x++) {
    const u = asset.width * (view.roi[0] + (x + .5) / view.width * (view.roi[2] - view.roi[0]));
    const v = asset.height * (view.roi[1] + (y + .5) / view.height * (view.roi[3] - view.roi[1]));
    out.push(...referenceAt(asset, u, v), 255);
  }
  return out;
}

test('native full-frame output matches an independent analytic pixel evaluator', () => {
  const project = C.createProject(fixture()), result = C.render(project);
  assert.deepEqual(Array.from(result.data), independentFrame(project.asset, project.view));
  assert.equal(result.diagnostics.sourceRGBAtRender, false);
  assert.equal(result.diagnostics.colourRasterResampling, false);
  assert.equal(result.diagnostics.cachedColourField, false);
  assert.equal(result.diagnostics.gaussianCount, 2);
  assert.equal(result.diagnostics.parameterCount, 19);
});

test('Gaussian peaks, signed coefficients, cutoff and half-up clamp are explicit', () => {
  const peak = fixture({ width: 11, height: 1, base: [10.49, 10.5, 10], splats: [[5.5, .5, 1, 1, 0, 200, -50, 300]] });
  const frame = C.render(C.createProject(peak));
  assert.deepEqual(Array.from(frame.data.slice(5 * 4, 6 * 4)), [210, 0, 255, 255]);
  assert.deepEqual(Array.from(frame.data.slice(0, 4)), [10, 11, 10, 255], 'outside four sigma only base contributes');
  assert.deepEqual(Array.from(frame.data.slice(4, 8)), [11, 10, 10, 255], 'at exactly four sigma the signed function still contributes');
});

test('ROI native crop is exactly the corresponding full-frame samples', () => {
  const asset = fixture({ width: 8, height: 6 });
  const project = C.createProject(asset), full = C.render(project);
  const crop = C.render(C.withView(project, { width: 4, height: 3, roi: [.25, 1 / 6, .75, 4 / 6] }));
  const expected = [];
  for (let y = 1; y < 4; y++) for (let x = 2; x < 6; x++) expected.push(...full.data.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4));
  assert.deepEqual(Array.from(crop.data), expected);
});

test('2x and fractional zoom compute the continuous functions instead of upsampling RGB', () => {
  const project = C.createProject(fixture());
  for (const view of [{ width: 14, height: 10, roi: [0, 0, 1, 1] },
    { width: 11, height: 9, roi: [.13, .21, .68, .94] }]) {
    const result = C.render(C.withView(project, view));
    assert.deepEqual(Array.from(result.data), independentFrame(project.asset, view));
  }
  const asset = fixture({ width: 1, height: 1, base: [0, 0, 0], splats: [[.5, .5, .35, .35, 0, 200, 100, 50]] });
  const native = C.render(C.createProject(asset)), large = C.render(C.createProject(asset), { width: 2, height: 2 });
  assert.equal(native.data[0], 200);
  assert.equal(large.data[0], round(200 * Math.exp(-.5 * ((.25 / .35) ** 2 + (.25 / .35) ** 2))));
  assert.notEqual(large.data[0], native.data[0], 'replication/interpolation of the one original pixel would return 200');
});

test('point coverage is declared and independently sampled from an RLE mask', () => {
  const project = C.createProject(fixture({ width: 2, height: 1, splats: [], alpha: { encoding: 'rle8', runs: [0, 1, 128, 1] } }));
  assert.deepEqual(Array.from(C.render(project).data).filter((_, i) => i % 4 === 3), [0, 128]);
  assert.deepEqual(Array.from(C.render(project, { width: 4, height: 1 }).data).filter((_, i) => i % 4 === 3), [0, 0, 128, 128]);
  assert.equal(C.render(project).diagnostics.coverageSampling, 'declared_rle8_point_coverage');
});

test('view and tone edits are immutable, change real pixels and change the project digest', async () => {
  const project = C.createProject(fixture());
  const modified = C.applyEdits(project, { exposure: 1, saturation: 0 });
  assert.equal(project.edits.exposure, 0);
  assert.equal(project.asset, modified.asset);
  assert.notDeepEqual(C.render(project).data, C.render(modified).data);
  const image = C.render(modified);
  for (let i = 0; i < image.data.length; i += 4) assert.equal(image.data[i], image.data[i + 1]);
  assert.notEqual(await C.contentHash(project), await C.contentHash(modified));
  assert.notEqual(await C.contentHash(project), await C.contentHash(C.withView(project, { roi: [.1, .1, .9, .9] })));
  const zero = C.applyEdits(modified, { exposure: 0, saturation: 1 });
  assert.deepEqual(C.render(zero).data, C.render(project).data, 'undo restores parameters, not inversely clipped pixels');
});

test('wrapped asset provenance, fixed contract and user feedback survive a source-free JSON round trip', async () => {
  const input = { schema: 'crf.quality_asset.v1', version: C.VERSION, gaussian: fixture(),
    provenance: { sourcePath: '/not-present/observation.png', sourceSHA256: 'a'.repeat(64), sourceRGBEmbedded: false },
    fit: { scope: 'per_observation_only', numericalResult: { psnr: 35 } } };
  const project = C.createProject(input, { title: 'Quality study', qualityContractHash: 'b'.repeat(64) });
  project.feedback = [{ at: '2026-11-22T00:00:00Z', decision: 'needs_work', note: 'Inspect trees', view: clone(project.view), edits: clone(project.edits) }];
  input.gaussian.base[0] = 255;
  assert.equal(project.asset.base[0], 30, 'caller-owned inputs are cloned');
  const serialized = await C.serializeProject(project), reopened = await C.parseProject(serialized);
  assert.equal((await C.verifyProject(reopened)).ok, true);
  assert.equal(reopened.assetMetadata.fit.scope, 'per_observation_only');
  assert.equal(reopened.feedback[0].note, 'Inspect trees');
  assert.equal(reopened.qualityContractHash, 'b'.repeat(64));
  assert.deepEqual(C.render(reopened).data, C.render(project).data);
  assert.equal(Object.isFrozen(reopened.asset.splats[0]), true);
});

test('hashes bind coefficients, metadata, frame dimensions and feedback; tampering cannot re-import', async () => {
  const sealed = await C.sealProject(C.createProject(fixture()));
  for (const change of [p => { p.asset.splats[0][5]++; }, p => { p.view.width++; },
    p => { p.asset.provenance.kind = 'changed'; }, p => { p.edits.contrast = 2; }]) {
    const changed = clone(sealed); change(changed);
    assert.equal((await C.verifyProject(changed)).code, 'HASH_MISMATCH');
    await assert.rejects(C.parseProject(JSON.stringify(changed)), error => error.code === 'HASH_MISMATCH');
  }
  const edited = C.applyEdits(sealed, { exposure: .5 });
  assert.equal(edited.contentHash, undefined, 'an authorized edit invalidates the old digest');
  assert.equal((await C.verifyProject(edited)).code, 'MISSING_HASH');
});

test('canonical serialization is ordered and rejects executable, cyclic and nonfinite input', async () => {
  assert.equal(await C.digest({ b: 2, a: [1, 3] }), await C.digest({ a: [1, 3], b: 2 }));
  const cyclic = {}; cyclic.next = cyclic;
  const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { throw new Error('must not execute'); } });
  for (const value of [undefined, Infinity, NaN, () => {}, cyclic, getter,
    JSON.parse('{"__proto__":{"injected":true}}'), Object.create({ hidden: true }), new Array(2)]) assert.throws(() => C.canonical(value));
});

test('invalid kernels, delta-like widths, malformed coverage and unsupported programs are rejected', () => {
  const valid = C.createProject(fixture());
  const changes = [p => { p.asset.splats[0][2] = .349; }, p => { p.asset.splats[0][3] = NaN; },
    p => { p.asset.kernel.cutoffSigma = 5; }, p => { p.asset.kernel.colorSpace = 'linear_srgb'; },
    p => { p.asset.sourceRGB = [1, 2, 3]; }, p => { p.program = 'eval("bad")'; },
    p => { p.asset.alpha = { encoding: 'rle8', runs: [255, 1] }; },
    p => { p.view.roi = [0, 0, 0, 1]; }, p => { p.edits.exposure = 5; },
    p => { p.edits.script = 'fetch(source)'; }];
  for (const change of changes) { const bad = clone(valid); change(bad); assert.equal(C.validateProject(bad).ok, false); assert.throws(() => C.render(bad)); }
});

test('pixel and support-visit budgets fail before rendering without silently reducing resolution', () => {
  const project = C.createProject(fixture());
  assert.throws(() => C.render(project, { width: 4000001, height: 1 }), error => error.code === 'RESOURCE_LIMIT');
  assert.throws(() => C.render(project, { limits: { supportVisits: 1 } }), error => error.code === 'RESOURCE_LIMIT');
  assert.throws(() => C.render(project, { limits: { supportVisits: 200000001 } }), error => error.code === 'RESOURCE_LIMIT');
  const result = C.render(project, { width: 17, height: 13 });
  assert.equal(result.width, 17); assert.equal(result.height, 13);
  assert.equal(result.data.length, 17 * 13 * 4);
});

test('extremely narrow ROIs cannot wrap faraway support bounds into unbudgeted work', () => {
  const asset = fixture({ width: 1, height: 1, splats: [[100000, 100000, .35, .35, 0, 50, 50, 50]] });
  const frame = C.render(C.createProject(asset), { width: 3, height: 2, roi: [0, 0, 1e-20, 1e-20] });
  assert.equal(frame.diagnostics.supportVisits, 0);
  assert.equal(frame.diagnostics.basisEvaluations, 0);
  assert.deepEqual(Array.from(frame.data.slice(0, 4)), [30, 45, 60, 255]);
  assert.throws(() => C.render(C.createProject(asset), { width: 100, height: 1, roi: [0, 0, Number.MIN_VALUE, 1] }), /not representable/);
});

test('async evaluation matches synchronous results and cooperatively cancels', async () => {
  const project = C.createProject(fixture());
  assert.deepEqual((await C.renderAsync(project)).data, C.render(project).data);
  let cancel = false;
  await assert.rejects(C.renderAsync(project, { onProgress: () => { cancel = true; }, shouldCancel: () => cancel }),
    error => error.code === 'CANCELLED');
  assert.throws(() => C.render(project, { shouldCancel: () => true }), error => error.code === 'CANCELLED');
});

function workerHarness() {
  const messages = [], self = { postMessage: message => messages.push(message) };
  const source = fs.readFileSync(path.join(__dirname, '../web/quality-worker12.js'), 'utf8');
  vm.runInNewContext(source, { self, CRFQuality12: C, importScripts: () => {}, setTimeout,
    fetch: () => { throw new Error('The function renderer must not fetch photographs.'); } });
  const send = message => self.onmessage({ data: message });
  async function until(predicate) {
    const start = Date.now();
    while (!predicate(messages)) { if (Date.now() - start > 2000) throw new Error('Worker did not settle.'); await new Promise(resolve => setTimeout(resolve, 2)); }
    return messages;
  }
  return { send, until, messages };
}
test('Worker fences superseded frames and only returns the newest complete result', async () => {
  const worker = workerHarness(), project = C.createProject(fixture());
  worker.send({ type: 'render', requestId: 'old', project });
  worker.send({ type: 'render', requestId: 'new', project: C.applyEdits(project, { exposure: .5 }) });
  worker.send({ type: 'cancel', requestId: 'old' });
  await worker.until(messages => messages.some(x => x.type === 'result' && x.requestId === 'new'));
  assert.equal(worker.messages.some(x => x.type === 'result' && x.requestId === 'old'), false);
  assert.equal(worker.messages.some(x => x.type === 'cancelled' && x.requestId === 'old'), true);
  const result = worker.messages.find(x => x.type === 'result').result;
  assert.deepEqual(result.data, C.render(C.applyEdits(project, { exposure: .5 })).data);
});
test('Worker cancellation produces no frame, and malformed or corrupt jobs produce explicit errors', async () => {
  const worker = workerHarness(), project = C.createProject(fixture());
  worker.send({ type: 'render', requestId: 'cancel-me', project });
  worker.send({ type: 'cancel', requestId: 'cancel-me' });
  await worker.until(messages => messages.some(x => x.type === 'cancelled'));
  assert.equal(worker.messages.some(x => x.type === 'result'), false);
  const sealed = clone(await C.sealProject(project)); sealed.asset.base[0]++;
  worker.send({ type: 'render', requestId: 'corrupt', project: sealed });
  await worker.until(messages => messages.some(x => x.type === 'error' && x.requestId === 'corrupt'));
  assert.equal(worker.messages.find(x => x.type === 'error' && x.requestId === 'corrupt').error.code, 'HASH_MISMATCH');
  worker.send({ type: 'render', requestId: 'large', project, options: { width: 4000001, height: 1 } });
  await worker.until(messages => messages.some(x => x.type === 'error' && x.requestId === 'large'));
  assert.equal(worker.messages.find(x => x.type === 'error' && x.requestId === 'large').error.code, 'RESOURCE_LIMIT');
});

test('displayed code is the actual parameter-rendering path and contains no source-image operations', () => {
  const code = C.renderSourceCode(C.createProject(fixture()));
  assert.match(code, /CRFQuality12\.render\(scene\)/);
  assert.match(code, /putImageData/);
  assert.doesNotMatch(code, /drawImage|fetch\(|data:image|eval\(/);
});
