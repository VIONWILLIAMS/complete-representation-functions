/* CRF 1.1 candidate: bounded local coordinate-network learning.
 * The same forward evaluator runs in Node, the browser and the rendering worker.
 * Reference RGB is training input only. Models contain numeric weights and source
 * metadata; alpha is an explicitly separate dependency. This is instance
 * reconstruction, not evidence of unseen-object or semantic generalization.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CRFLearn11 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'crf.neural_field/1.1';
  const BUILD = 'crf.learn11.cpu-adam-v1';
  const FREQUENCIES = [1, 2, 4];
  const LIMITS = Object.freeze({ instances: 8, side: 256, pixels: 131072, parameters: 4000, trainingMAC: 200000000 });
  const DEFAULTS = Object.freeze({ steps: 600, hidden: 24, batchSize: 64, learningRate: 0.01, seed: 11, maxMilliseconds: 30000, reportEvery: 25 });
  const WEIGHT_KEYS = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3'];
  const INSTANCE_KEYS = ['id', 'label', 'sourceGroup', 'width', 'height', 'sourceUri', 'declaredSourceHash', 'decodedPixelHash', 'crop', 'coverageKind', 'originalWidth', 'originalHeight', 'originalSourceHash', 'licenseStatus', 'attribution'];
  const COVERAGE_KINDS = ['source_alpha', 'ellipse', 'rectangle', 'inferred_mask'];
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const finite = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const integer = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const safeId = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x) && !['__proto__', 'prototype', 'constructor'].includes(x);
  const exactKeys = (x, allowed) => object(x) && Object.keys(x).every(k => allowed.includes(k));
  const text = (x, n = 1000) => typeof x === 'string' && x.length <= n && !x.includes('\u0000');
  const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
  const colorLUT = Float64Array.from({ length: 256 }, (_, i) => i / 255 <= 0.04045 ? i / 255 / 12.92 : ((i / 255 + 0.055) / 1.055) ** 2.4);
  function need(condition, message) { if (!condition) { const e = new Error(message); e.code = 'INVALID_TRAINING_INPUT'; throw e; } }
  function shapes(input, hidden) { return { w1: hidden * input, b1: hidden, w2: hidden * hidden, b2: hidden, w3: 3 * hidden, b3: 3 }; }
  function parameterCount(model) { const a = model?.architecture; return a ? a.hiddenSize * a.inputSize + a.hiddenSize ** 2 + 5 * a.hiddenSize + 3 : 0; }
  function configFor(raw = {}, count = 1) {
    need(exactKeys(raw, Object.keys(DEFAULTS)), 'Unknown training configuration field.');
    const c = { ...DEFAULTS, ...raw };
    for (const [key, lo, hi] of [['steps', 20, 2000], ['hidden', 8, 48], ['batchSize', 16, 128], ['seed', 0, 4294967295], ['maxMilliseconds', 1000, 60000], ['reportEvery', 1, 100]]) need(integer(c[key], lo, hi), 'Invalid ' + key + '.');
    need(finite(c.learningRate, 0.0001, 0.05), 'Invalid learningRate.');
    const estimatedMAC = 4 * c.steps * c.batchSize * (c.hidden * (14 + count) + c.hidden ** 2 + 3 * c.hidden);
    need(estimatedMAC <= LIMITS.trainingMAC, 'Training compute budget exceeded; reduce steps, hidden or batchSize.');
    return { ...c, estimatedMAC };
  }
  function validateModel(model) {
    const errors = [];
    if (!exactKeys(model, ['schema', 'architecture', 'instances', 'weights']) || model.schema !== SCHEMA) return { ok: false, errors: ['Unsupported or malformed neural-field model.'] };
    const a = model.architecture, instances = model.instances;
    if (!Array.isArray(instances) || !integer(instances.length, 1, LIMITS.instances)) errors.push('Invalid instance count.');
    const count = Array.isArray(instances) ? instances.length : 0;
    if (!exactKeys(a, ['features', 'frequencies', 'inputSize', 'hiddenSize', 'hiddenLayers', 'outputSize', 'activation', 'output', 'colorSpace']) || a.features !== 'fourier_xy_v1' || JSON.stringify(a.frequencies) !== '[1,2,4]' || a.inputSize !== 14 + count || !integer(a.hiddenSize, 8, 48) || a.hiddenLayers !== 2 || a.outputSize !== 3 || a.activation !== 'tanh' || a.output !== 'sigmoid' || a.colorSpace !== 'linear_srgb') errors.push('Unsupported neural architecture.');
    const seen = new Set(); let pixels = 0;
    for (const row of Array.isArray(instances) ? instances : []) {
      if (!exactKeys(row, INSTANCE_KEYS) || !safeId(row.id) || seen.has(row.id) || !text(row.label, 200) || !text(row.sourceGroup, 200) || !row.sourceGroup || !integer(row.width, 8, 256) || !integer(row.height, 8, 256) || !hex(row.decodedPixelHash)) { errors.push('Invalid model instance metadata.'); continue; }
      seen.add(row.id); pixels += row.width * row.height;
      if (row.sourceUri !== undefined && (!text(row.sourceUri, 2000) || /^data:/i.test(row.sourceUri))) errors.push('Invalid reference source URI.');
      for (const k of ['declaredSourceHash', 'originalSourceHash']) if (row[k] !== undefined && !hex(row[k])) errors.push('Invalid source digest.');
      for (const k of ['originalWidth', 'originalHeight']) if (row[k] !== undefined && !integer(row[k], 1, 100000)) errors.push('Invalid original dimensions.');
      for (const k of ['licenseStatus', 'attribution']) if (row[k] !== undefined && !text(row[k], 1000)) errors.push('Invalid source attribution.');
      if (!COVERAGE_KINDS.includes(row.coverageKind) || !validCrop(row.crop)) errors.push('Invalid crop or coverage provenance.');
    }
    if (pixels > LIMITS.pixels) errors.push('Model tensor dimensions exceed limits.');
    if (exactKeys(a, ['features', 'frequencies', 'inputSize', 'hiddenSize', 'hiddenLayers', 'outputSize', 'activation', 'output', 'colorSpace']) && integer(a.hiddenSize, 8, 48) && integer(a.inputSize, 15, 22)) {
      if (parameterCount(model) > LIMITS.parameters || !exactKeys(model.weights, WEIGHT_KEYS)) errors.push('Invalid model weights.');
      else for (const [key, size] of Object.entries(shapes(a.inputSize, a.hiddenSize))) if (!Array.isArray(model.weights[key]) || model.weights[key].length !== size || !model.weights[key].every(x => finite(x, -1000, 1000))) errors.push('Invalid finite weight shape: ' + key + '.');
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)] };
  }
  function validCrop(c) { return Array.isArray(c) && c.length === 4 && c.every(x => finite(x, 0, 1)) && c[0] < c[2] && c[1] < c[3]; }
  function featureVector(x, y, instance, count, out) {
    out[0] = x; out[1] = y; let j = 2;
    for (const f of FREQUENCIES) { const k = Math.PI * f; out[j++] = Math.sin(k * x); out[j++] = Math.cos(k * x); out[j++] = Math.sin(k * y); out[j++] = Math.cos(k * y); }
    for (let i = 0; i < count; i++) out[j++] = i === instance ? 1 : 0;
    return out;
  }
  function forward(weights, input, hidden, features, h1, h2, output) {
    for (let i = 0; i < hidden; i++) { let s = weights.b1[i], offset = i * input; for (let j = 0; j < input; j++) s += weights.w1[offset + j] * features[j]; h1[i] = Math.tanh(s); }
    for (let i = 0; i < hidden; i++) { let s = weights.b2[i], offset = i * hidden; for (let j = 0; j < hidden; j++) s += weights.w2[offset + j] * h1[j]; h2[i] = Math.tanh(s); }
    for (let i = 0; i < 3; i++) { let s = weights.b3[i], offset = i * hidden; for (let j = 0; j < hidden; j++) s += weights.w3[offset + j] * h2[j]; output[i] = sigmoid(s); }
    return output;
  }
  function compile(model, instance = 0) {
    const checked = validateModel(model); need(checked.ok, checked.errors.join(' '));
    need(integer(instance, 0, model.instances.length - 1), 'Unknown model instance.');
    const { inputSize: input, hiddenSize: hidden } = model.architecture, count = model.instances.length;
    const weights = Object.fromEntries(WEIGHT_KEYS.map(k => [k, Float64Array.from(model.weights[k])]));
    const features = new Float64Array(input), h1 = new Float64Array(hidden), h2 = new Float64Array(hidden);
    return {
      parameterCount: parameterCount(model), operationsPerSample: hidden * input + hidden ** 2 + hidden * 3,
      evaluate(x, y, out = [0, 0, 0]) {
        need(finite(x, -1, 1) && finite(y, -1, 1), 'Neural coordinates must be finite and within [-1,1].');
        featureVector(x, y, instance, count, features);
        return forward(weights, input, hidden, features, h1, h2, out);
      }
    };
  }
  function evaluate(model, x, y, instance = 0) { return compile(model, instance).evaluate(x, y); }
  function random(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function stringSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function validationPixel(id, group, index, seed) { let v = (stringSeed(id + '|' + group) ^ index ^ seed) >>> 0; v = Math.imul(v ^ (v >>> 16), 0x45d9f3b); v = Math.imul(v ^ (v >>> 16), 0x45d9f3b); return ((v ^ (v >>> 16)) >>> 0) % 5 === 0; }
  async function sha(bytes) {
    need(typeof globalThis.crypto?.subtle?.digest === 'function', 'SHA-256 requires WebCrypto (secure context or Node 20+).');
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  }
  const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value));
  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
    return value;
  }
  async function modelDigest(model) {
    const checked = validateModel(model); need(checked.ok, checked.errors.join(' '));
    return sha(jsonBytes(canonicalValue(model)));
  }
  function alphaRuns(row) {
    const runs = []; let value = row.data[3], count = 0;
    for (let i = 3; i < row.data.length; i += 4) { if (row.data[i] === value) count++; else { runs.push(value, count); value = row.data[i]; count = 1; } }
    runs.push(value, count); return { encoding: 'rle8', width: row.width, height: row.height, runs, provenance: row.coverageKind || 'source_alpha', sourceId: row.id };
  }
  async function prepare(dataset, config) {
    need(Array.isArray(dataset) && integer(dataset.length, 1, LIMITS.instances), 'Training requires 1–8 decoded references.');
    let totalPixels = 0; const ids = new Set(), sources = new Map(), instances = [], rows = [], coverage = [];
    for (let instance = 0; instance < dataset.length; instance++) {
      const row = dataset[instance];
      need(object(row) && safeId(row.id) && !ids.has(row.id), 'Invalid or duplicate reference ID.'); ids.add(row.id);
      need(text(row.sourceGroup, 200) && row.sourceGroup.length > 0, 'Each reference needs a sourceGroup.');
      need(integer(row.width, 8, LIMITS.side) && integer(row.height, 8, LIMITS.side), 'Training image dimensions must be 8–256.');
      totalPixels += row.width * row.height; need(totalPixels <= LIMITS.pixels, 'Training tensor pixel budget exceeded.');
      need((row.data instanceof Uint8Array || row.data instanceof Uint8ClampedArray || Array.isArray(row.data)) && row.data.length === row.width * row.height * 4, 'RGBA byte array dimensions differ.');
      if (Array.isArray(row.data)) need(row.data.every(x => integer(x, 0, 255)), 'RGBA data must contain bytes.');
      const crop = row.crop || [0, 0, 1, 1]; need(validCrop(crop), 'Invalid normalized reference crop.');
      const meta = { id: row.id, label: row.label || row.id, sourceGroup: row.sourceGroup, width: row.width, height: row.height, crop: crop.slice(), coverageKind: row.coverageKind || 'source_alpha' };
      for (const k of ['sourceUri', 'originalWidth', 'originalHeight', 'originalSourceHash', 'licenseStatus', 'attribution']) if (row[k] !== undefined) meta[k] = row[k];
      if (row.contentHash !== undefined) { need(hex(row.contentHash), 'Invalid declared source hash.'); meta.declaredSourceHash = row.contentHash; }
      const bytes = new Uint8Array(8 + row.data.length), view = new DataView(bytes.buffer); view.setUint32(0, row.width, true); view.setUint32(4, row.height, true); bytes.set(row.data, 8); meta.decodedPixelHash = await sha(bytes);
      const sourceKey = row.originalSourceHash || row.contentHash || meta.decodedPixelHash;
      need(!sources.has(sourceKey) || sources.get(sourceKey) === row.sourceGroup, 'Identical source content cannot be assigned to different source groups.'); sources.set(sourceKey, row.sourceGroup);
      const train = [], validation = [], count = dataset.length, input = 14 + count;
      for (let p = 0; p < row.width * row.height; p++) {
        const alpha = row.data[p * 4 + 3] / 255; if (alpha === 0) continue;
        const x = ((p % row.width) + 0.5) / row.width * 2 - 1, y = (Math.floor(p / row.width) + 0.5) / row.height * 2 - 1;
        const sample = { pixel: p, instance, alpha, features: featureVector(x, y, instance, count, new Float64Array(input)), target: [colorLUT[row.data[p * 4]], colorLUT[row.data[p * 4 + 1]], colorLUT[row.data[p * 4 + 2]]] };
        (validationPixel(row.id, row.sourceGroup, p, config.seed) ? validation : train).push(sample);
      }
      need(train.length + validation.length >= 16 && train.length >= 8 && validation.length >= 1, 'Each reference needs at least 16 visible pixels, including train and validation pixels.');
      instances.push(meta); rows.push({ train, validation }); coverage.push(alphaRuns(row));
    }
    return { instances, rows, coverage };
  }
  function subselect(values, cap) { if (values.length <= cap) return values; return Array.from({ length: cap }, (_, i) => values[Math.floor(i * values.length / cap)]); }
  async function train(dataset, rawConfig = {}, hooks = {}) {
    need(Array.isArray(dataset), 'Dataset must be an array.');
    const config = configFor(rawConfig, dataset.length), started = now(), startedAt = new Date().toISOString();
    const report = { schema: 'crf.training_run/1.1', trainerBuild: BUILD, state: 'running', startedAt, config, stepsCompleted: 0, history: [], evidenceScope: 'spatial_reconstruction_holdout', independentSourceGeneralization: 'not_evaluated', semanticControlsLearned: false, learnedDynamics: false, programRSI: false, precision: 'float64', sourceRGBEmbedded: false, coverageGroundTruth: false };
    const stopped = code => { report.state = code === 'CANCELLED' ? 'canceled' : 'timed_out'; report.elapsedMs = now() - started; const e = new Error(code === 'CANCELLED' ? 'Local training canceled.' : 'Local training wall-clock budget exhausted.'); e.name = code === 'CANCELLED' ? 'AbortError' : 'TimeoutError'; e.code = code; e.report = clone(report); throw e; };
    const check = () => { if (hooks.shouldCancel?.()) stopped('CANCELLED'); if (now() - started > config.maxMilliseconds) stopped('TIMEOUT'); };
    const yieldControl = hooks.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    try {
      check(); const prepared = await prepare(dataset, config); check();
      const { instances, rows, coverage } = prepared, input = 14 + instances.length, hidden = config.hidden, rng = random(config.seed);
      const weights = {}, gradient = {}, m = {}, v = {};
      for (const [key, size] of Object.entries(shapes(input, hidden))) { weights[key] = new Float64Array(size); gradient[key] = new Float64Array(size); m[key] = new Float64Array(size); v[key] = new Float64Array(size); }
      for (const [key, fanIn, fanOut] of [['w1', input, hidden], ['w2', hidden, hidden], ['w3', hidden, 3]]) { const scale = Math.sqrt(6 / (fanIn + fanOut)); for (let i = 0; i < weights[key].length; i++) weights[key][i] = (2 * rng() - 1) * scale; }
      const h1 = new Float64Array(hidden), h2 = new Float64Array(hidden), output = new Float64Array(3), d1 = new Float64Array(hidden), d2 = new Float64Array(hidden), d3 = new Float64Array(3);
      const measure = samples => { let loss = 0, mass = 0; for (const s of samples) { forward(weights, input, hidden, s.features, h1, h2, output); mass += s.alpha; for (let c = 0; c < 3; c++) loss += s.alpha * (output[c] - s.target[c]) ** 2; } return mass ? loss / (3 * mass) : null; };
      const trainMeasured = rows.flatMap(r => subselect(r.train, Math.max(32, Math.floor(1024 / rows.length))));
      const validationMeasured = rows.flatMap(r => subselect(r.validation, Math.max(32, Math.floor(1024 / rows.length))));
      report.instances = clone(instances);
      report.sourceGroupCount = new Set(instances.map(x => x.sourceGroup)).size;
      report.sourceGroupStatus = 'declared_groups_with_identical_content_consistency_check';
      report.splitProtocol = { method: 'deterministic_pixel_hash_mod5', validationModulo: 5, seed: config.seed, validationUsedForCheckpointSelection: true, independentTestSet: false, trainPixels: rows.reduce((n, r) => n + r.train.length, 0), validationPixels: rows.reduce((n, r) => n + r.validation.length, 0), measuredTrainPixels: trainMeasured.length, measuredValidationPixels: validationMeasured.length, measurementSelection: 'fixed_even_stride_up_to_1024_per_partition', sourceGroups: instances.map(x => x.sourceGroup) };
      report.datasetHash = await sha(jsonBytes({ instances, splitProtocol: report.splitProtocol }));
      const architecture = { features: 'fourier_xy_v1', frequencies: FREQUENCIES.slice(), inputSize: input, hiddenSize: hidden, hiddenLayers: 2, outputSize: 3, activation: 'tanh', output: 'sigmoid', colorSpace: 'linear_srgb' };
      const makeModel = () => ({ schema: SCHEMA, architecture: clone(architecture), instances: clone(instances), weights: Object.fromEntries(WEIGHT_KEYS.map(k => [k, Array.from(weights[k])])) });
      const initial = makeModel(), valid = validateModel(initial); need(valid.ok, valid.errors.join(' '));
      report.parameterCount = parameterCount(initial); report.weightBytes = report.parameterCount * 8;
      report.initialLoss = measure(trainMeasured); report.initialValidationLoss = measure(validationMeasured);
      let bestValidation = report.initialValidationLoss, bestStep = 0, bestWeights = clone(initial.weights);
      async function progress(step) {
        check(); const row = { step, trainLoss: measure(trainMeasured), validationLoss: measure(validationMeasured), elapsedMs: now() - started };
        need(Number.isFinite(row.trainLoss) && Number.isFinite(row.validationLoss), 'Non-finite training loss.');
        if (row.validationLoss < bestValidation) { bestValidation = row.validationLoss; bestStep = step; bestWeights = Object.fromEntries(WEIGHT_KEYS.map(k => [k, Array.from(weights[k])])); }
        report.history.push(row); report.stepsCompleted = step; report.lastStepTrainLoss = row.trainLoss; report.lastStepValidationLoss = row.validationLoss;
        if (hooks.onProgress) await hooks.onProgress({ ...row, totalSteps: config.steps, bestStep, bestValidationLoss: bestValidation, state: report.state });
      }
      await progress(0);
      for (let step = 1; step <= config.steps; step++) {
        check(); for (const key of WEIGHT_KEYS) gradient[key].fill(0);
        const batch = []; let alphaMass = 0;
        for (let b = 0; b < config.batchSize; b++) { const row = rows[Math.floor(rng() * rows.length)], s = row.train[Math.floor(rng() * row.train.length)]; batch.push(s); alphaMass += s.alpha; }
        for (const s of batch) {
          forward(weights, input, hidden, s.features, h1, h2, output);
          for (let c = 0; c < 3; c++) d3[c] = 2 * (output[c] - s.target[c]) * output[c] * (1 - output[c]) * s.alpha / (3 * alphaMass);
          for (let j = 0; j < hidden; j++) { let d = 0; for (let c = 0; c < 3; c++) d += weights.w3[c * hidden + j] * d3[c]; d2[j] = d * (1 - h2[j] ** 2); }
          for (let j = 0; j < hidden; j++) { let d = 0; for (let i = 0; i < hidden; i++) d += weights.w2[i * hidden + j] * d2[i]; d1[j] = d * (1 - h1[j] ** 2); }
          for (let c = 0; c < 3; c++) { gradient.b3[c] += d3[c]; for (let j = 0; j < hidden; j++) gradient.w3[c * hidden + j] += d3[c] * h2[j]; }
          for (let i = 0; i < hidden; i++) { gradient.b2[i] += d2[i]; gradient.b1[i] += d1[i]; for (let j = 0; j < hidden; j++) gradient.w2[i * hidden + j] += d2[i] * h1[j]; for (let j = 0; j < input; j++) gradient.w1[i * input + j] += d1[i] * s.features[j]; }
        }
        const b1Correction = 1 - 0.9 ** step, b2Correction = 1 - 0.999 ** step;
        for (const key of WEIGHT_KEYS) for (let i = 0; i < weights[key].length; i++) { const g = Math.max(-1, Math.min(1, gradient[key][i])); m[key][i] = 0.9 * m[key][i] + 0.1 * g; v[key][i] = 0.999 * v[key][i] + 0.001 * g * g; weights[key][i] -= config.learningRate * (m[key][i] / b1Correction) / (Math.sqrt(v[key][i] / b2Correction) + 1e-8); }
        report.stepsCompleted = step;
        if (step % config.reportEvery === 0 || step === config.steps) await progress(step);
        if (step % 4 === 0) { await yieldControl(); check(); }
      }
      for (const key of WEIGHT_KEYS) weights[key].set(bestWeights[key]);
      const model = makeModel(), checked = validateModel(model); need(checked.ok, checked.errors.join(' '));
      report.finalLoss = measure(trainMeasured); report.validationLoss = measure(validationMeasured); report.bestStep = bestStep;
      report.checkpointRule = 'lowest measured spatial validation MSE, including initialization; never an independent test claim';
      report.instanceMetrics = rows.map((r, i) => ({ id: instances[i].id, trainPixels: r.train.length, validationPixels: r.validation.length, measuredTrainPixels: subselect(r.train, 512).length, measuredValidationPixels: subselect(r.validation, 512).length, trainLoss: measure(subselect(r.train, 512)), validationLoss: measure(subselect(r.validation, 512)) }));
      report.modelHash = await modelDigest(model); report.modelHashProtocol = 'sha256_canonical_json_sorted_keys_utf8_v1'; report.modelJSONBytes = jsonBytes(model).byteLength; report.coverageJSONBytes = jsonBytes(coverage).byteLength;
      report.coverageRawBytes = instances.reduce((n, r) => n + r.width * r.height, 0); check(); report.state = 'completed'; report.endedAt = new Date().toISOString(); report.elapsedMs = now() - started;
      return { model, report, coverageByInstance: coverage };
    } catch (error) {
      if (!error.report) { report.state = 'failed'; report.elapsedMs = now() - started; report.error = String(error.message).slice(0, 800); error.report = clone(report); }
      throw error;
    }
  }
  return Object.freeze({ SCHEMA, BUILD, LIMITS, DEFAULTS, validateModel, parameterCount, modelDigest, compile, evaluate, train });
});
