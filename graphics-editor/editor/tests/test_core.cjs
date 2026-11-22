'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../web/crf-core.js');

function fixture() {
  const width = 16, height = 12, rgb = Buffer.alloc(width * height * 3), labels = Buffer.alloc(width * height), background = Buffer.alloc(rgb.length), hosts = Buffer.alloc(labels.length), mask = Buffer.alloc(labels.length);
  for (let y = 0; y < height; ++y) for (let x = 0; x < width; ++x) {
    const i = y * width + x, foreground = x >= 3 && x < 7 && y >= 3 && y < 7;
    const ground = [40 + x * 3, 80 + y * 4, 100 + (x + y) * 2]; background.set(ground, i * 3);
    rgb.set(foreground ? [180 + y, 50 + x, 30] : ground, i * 3); labels[i] = foreground ? 1 : 0; mask[i] = foreground ? 1 : 0;
  }
  return { schema: 'crf.scene.v0.4', width, height, rgbBase64: rgb.toString('base64'), labelsBase64: labels.toString('base64'),
    backgroundRgbBase64: background.toString('base64'), backgroundLabelsBase64: hosts.toString('base64'), backgroundInferredMaskBase64: mask.toString('base64'),
    objects: [{ id: 'wall.main', index: 0, label: 'Wall', bbox: [0, 0, 16, 12], pivot: [8, 6], depth: 0 },
      { id: 'panel.main', index: 1, label: 'Panel', bbox: [3, 3, 7, 7], pivot: [5, 5], depth: 8 }], relations: [] };
}
function pixel(r, x, y) { return [...r.rgba.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 3)]; }
function differences(a, b) { let n = 0; for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) ++n; return n; }
function identityCheck(data) {
  const state = C.initialState(data), r = C.CPUrender(data, state, { quality: 'exact', time: null }), rgb = C.decodeData(data).rgb;
  let differentPixels = 0, differentChannels = 0, maxAbs = 0;
  for (let i = 0; i < data.width * data.height; ++i) { let different = false;
    for (let c = 0; c < 3; ++c) { const error = Math.abs(rgb[i * 3 + c] - r.rgba[i * 4 + c]); if (error) { different = true; ++differentChannels; maxAbs = Math.max(maxAbs, error); } }
    if (different) ++differentPixels;
  }
  assert.equal(differentPixels, 0, JSON.stringify({ differentPixels, differentChannels, maxAbs, stats: r.stats }));
  assert.equal(r.stats.sourceImageBlit, false); assert.equal(r.stats.visibleInferredPixels, 0);
  assert.ok(r.stats.contributions >= data.width * data.height);
  return { state, r };
}

test('every arbitrary RGB byte is recovered through Gaussian accumulation at its reference center', () => { identityCheck(fixture()); });
test('Gaussian kernel uses exp and normalized sums at an actual subpixel translation', () => {
  const intensities = [0, 200, 0, 100];
  const data = { schema: 'crf.scene.v0.4', width: 4, height: 1,
    rgbBase64: Buffer.from(intensities.flatMap(v => [v, v, v])).toString('base64'), labelsBase64: Buffer.alloc(4).toString('base64'),
    objects: [{ id: 'plane', index: 0, bbox: [0, 0, 4, 1], pivot: [2, .5], depth: 0 }] };
  const s = C.initialState(data), moved = C.applyOperations(s, [{ op: 'set', id: 'plane', path: 'transform.x', value: .3 }]);
  const r = C.CPUrender(data, moved, { quality: 'interactive', lod: 1, time: null });
  const variance = .62 ** 2 + .02;
  let weightSum = 0, weightedValue = 0;
  intensities.forEach((v, i) => { const distance = (1.5 - (i + .5 + .3)) ** 2 / variance;
    if (distance <= 2.6 ** 2) { const w = Math.exp(-.5 * distance); weightSum += w; weightedValue += v * w; } });
  const expected = Math.round(weightedValue / weightSum);
  assert.ok(r.stats.contributions > r.stats.gaussianCount);
  assert.deepEqual(pixel(r, 1, 0), [expected, expected, expected]); assert.notEqual(expected, 200);
});
test('a local color function leaves all other original object pixels unchanged', () => {
  const data = fixture(), { state, r: baseline } = identityCheck(data), labels = C.decodeData(data).labels;
  const edited = C.applyOperations(state, [{ op: 'set', id: 'panel.main', path: 'color.tint', value: [20, 240, 60] }, { op: 'set', id: 'panel.main', path: 'color.amount', value: 1 }]);
  const r = C.CPUrender(data, edited, { time: null }); let changedInside = 0;
  for (let i = 0; i < labels.length; ++i) { const d = differences(r.rgba.slice(i * 4, i * 4 + 3), baseline.rgba.slice(i * 4, i * 4 + 3)); if (labels[i] === 0) assert.equal(d, 0); else if (d) ++changedInside; }
  assert.equal(changedInside, 16);
});
test('moving an observed object reveals marked inferred host samples and performs depth occlusion', () => {
  const data = fixture(), state = C.initialState(data), edited = C.applyOperations(state, [{ op: 'set', id: 'panel.main', path: 'transform.x', value: 5 }]);
  const r = C.CPUrender(data, edited, { time: null });
  assert.deepEqual(pixel(r, 4, 4), [52, 96, 116]); assert.equal(r.inferred[4 * data.width + 4], 1);
  assert.equal(r.ids[4 * data.width + 9], 1); assert.equal(r.ids[4 * data.width + 4], 0);
});
test('inferred samples move with their host and do not become a fixed image background', () => {
  const data = fixture(), state = C.applyOperations(C.initialState(data), [
    { op: 'set', id: 'panel.main', path: 'visible', value: false }, { op: 'set', id: 'wall.main', path: 'transform.x', value: 2 }]);
  const r = C.CPUrender(data, state, { time: null });
  assert.equal(r.ids[4 * data.width], -1); assert.deepEqual(pixel(r, 6, 4), [52, 96, 116]);
});
test('hierarchical transforms carry attached child Gaussians', () => {
  const data = fixture(), s = C.applyOperations(C.initialState(data), [{ op: 'reparent', id: 'panel.main', parent: 'wall.main' }, { op: 'set', id: 'wall.main', path: 'transform.x', value: 2 }]);
  const r = C.CPUrender(data, s, { time: null }); assert.equal(r.ids[4 * data.width + 8], 1); assert.equal(r.ids[4 * data.width + 3], 0);
});
test('camera yaw produces depth parallax and transforms the actual Gaussian covariance', () => {
  const data = fixture(), s = C.applyOperations(C.initialState(data), [{ op: 'setCamera', values: { yaw: 10, pitch: 4 } }]);
  const front = C.project([0, 0, 8], s), back = C.project([0, 0, 0], s);
  assert.ok(Math.abs(front.x - back.x - 8 * Math.sin(10 * Math.PI / 180)) < 1e-10);
  const frame = C._internals.prepareFrame(data, s, { quality: 'interactive', time: null });
  const cov = frame.layers.find(l => l.object.id === 'panel.main').covariance;
  assert.notEqual(cov.xx, cov.yy); assert.ok(Math.abs(cov.xy) > 0);
});
test('operations are atomic and reject unknown fields, NaN, bad IDs and attachment cycles', () => {
  const data = fixture(), state = C.initialState(data), snapshot = JSON.stringify(state);
  for (const ops of [
    [{ op: 'set', id: 'panel.main', path: 'transform.x', value: 4 }, { op: 'set', id: 'missing', path: 'opacity', value: 0 }],
    [{ op: 'set', id: 'panel.main', path: 'transform.x', value: NaN }],
    [{ op: 'set', id: 'panel.main', path: '__proto__.polluted', value: true }],
    [{ op: 'reparent', id: 'panel.main', parent: 'wall.main' }, { op: 'reparent', id: 'wall.main', parent: 'panel.main' }],
    [{ op: 'setCamera', values: { yaw: 181 } }], [{ op: 'execute', source: 'anything' }]
  ]) assert.throws(() => C.applyOperations(state, ops));
  assert.equal(JSON.stringify(state), snapshot); assert.equal({}.polluted, undefined);
});
test('duplicate and delete create independent editable identities', () => {
  const data = fixture(), s = C.applyOperations(C.initialState(data), [{ op: 'duplicate', id: 'panel.main', newId: 'panel.copy', offset: [6, 0] }, { op: 'delete', id: 'panel.main' }]);
  const r = C.CPUrender(data, s, { time: null }), copy = s.objects.find(o => o.id === 'panel.copy');
  assert.equal(r.ids[4 * data.width + 10], copy.index); assert.equal(r.ids[4 * data.width + 4], 0);
});
test('new primitives generate their own samples without a source object', () => {
  const data = fixture(), s = C.applyOperations(C.initialState(data), [{ op: 'addPrototype', id: 'shape.new', prototype: 'ellipse', x: 12, y: 8, width: 6, height: 6, depth: 100, color: [20, 180, 240] }]);
  const o = s.objects.find(o => o.id === 'shape.new'), r = C.CPUrender(data, s, { time: null });
  assert.equal(o.sourceId, null); assert.equal(r.ids[8 * data.width + 12], o.index); assert.ok(pixel(r, 12, 8)[2] > pixel(r, 12, 8)[0]);
  const replaced = C.applyOperations(s, [{ op: 'replace', id: 'shape.new', prototype: 'triangle' }]), r2 = C.CPUrender(data, replaced, { time: null });
  assert.notEqual(r.ids.filter(v => v === o.index).length, r2.ids.filter(v => v === o.index).length);
});
test('identity light is exact and exposure is a separate monotonic calibrated function', () => {
  const data = fixture(), { state, r: baseline } = identityCheck(data), edited = C.applyOperations(state, [{ op: 'setLight', values: { exposure: 1 } }]);
  const r = C.CPUrender(data, edited, { time: null });
  assert.deepEqual(pixel(r, 0, 0), pixel(baseline, 0, 0).map(v => Math.min(255, v * 2))); assert.equal(r.stats.physicalRelighting, false);
});
test('timeline interpolation is deterministic, immutable, and time:null bypasses it', () => {
  const data = fixture(), baseline = C.initialState(data), state = C.applyOperations(baseline, [{ op: 'setTimeline', timeline: { duration: 3, tracks: [{ id: 'panel.main', path: 'transform.x', interpolation: 'smooth', keyframes: [{ time: 0, value: 2 }, { time: 3, value: 8 }] }] } }]);
  assert.equal(C.evaluateFrame(state, 1.5).objects[1].transform.x, 5); assert.equal(state.objects[1].transform.x, 0);
  assert.deepEqual(C.CPUrender(data, state, { time: 1.5 }).rgba, C.CPUrender(data, state, { time: 1.5 }).rgba);
  assert.deepEqual(C.CPUrender(data, state, { time: null }).rgba, C.CPUrender(data, baseline, { time: null }).rgba);
  assert.throws(() => C.applyOperations(state, [{ op: 'setTimeline', timeline: { duration: 3, tracks: [{ id: '$camera', path: 'yaw', keyframes: [{ time: 0, value: 1000 }] }] } }]));
});
test('inferred highlights expose assumptions rather than altering the observed source data', () => {
  const data = fixture(), before = new Uint8Array(C.decodeData(data).rgb), state = C.applyOperations(C.initialState(data), [{ op: 'set', id: 'panel.main', path: 'visible', value: false }, { op: 'setBackground', values: { highlightInferred: true } }]);
  const r = C.CPUrender(data, state, { time: null }); assert.equal(r.inferred[4 * data.width + 4], 1); assert.ok(pixel(r, 4, 4)[0] > 52); assert.deepEqual(C.decodeData(data).rgb, before);
});

test('step trajectories select the new value exactly at the keyframe timestamp', () => {
  const state = C.applyOperations(C.initialState(fixture()), [{ op: 'setTimeline', timeline: { duration: 3, tracks: [
    { id: 'panel.main', path: 'signalState', interpolation: 'step', keyframes: [
      { time: 0, value: 'observed' }, { time: 1.5, value: 'go' }, { time: 3, value: 'stop' }] }
  ] } }]);
  const value = time => C.evaluateFrame(state, time).objects.find(o => o.id === 'panel.main').signalState;
  assert.equal(value(35 / 24), 'observed'); assert.equal(value(36 / 24), 'go'); assert.equal(value(37 / 24), 'go');
  assert.equal(value(3), 'stop');
});

test('full 667x1000 street observation passes independent RGB8 comparison through the CPU kernel', { timeout: 20000 }, () => {
  const dataPath = path.join(__dirname, '../web/assets/scene-data.js');
  assert.ok(fs.existsSync(dataPath), 'the fixed scene data must be present');
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), context, { timeout: 10000 });
  const data = context.CRF_SCENE_DATA || context.window.CRF_SCENE_DATA; const { r } = identityCheck(data);
  console.log(JSON.stringify({ test: 'full_observation', exact100: true, width: r.width, height: r.height, stats: r.stats }));
});
