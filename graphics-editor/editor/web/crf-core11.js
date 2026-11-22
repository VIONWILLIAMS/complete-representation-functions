/* CRF 1.1 learnable-functions branch. Bounded JSON programs, immutable function
 * versions, shared linear-light CPU evaluation. No source RGB or network reads.
 * Cached fields are generated from programs/weights and are explicitly approximate.
 * This module provides runtime checks and measurements, not formal proofs or RSI.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRF11 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const VERSION = '1.1.0-learnable-functions.1';
  const SCHEMAS = Object.freeze({ project: 'crf.project.v1.1', scene: 'crf.scene.v1.1', function: 'crf.function.v1.1' });
  const LIMITS = Object.freeze({ pixels: 1048576, objects: 32, functions: 64, gaussians: 256,
    legacyGaussians: 32768, waves: 16, polygonPoints: 128, patchOperations: 128,
    cacheMin: 16, cacheMax: 256, cacheBytes: 64 * 1024 * 1024,
    directMAC: 100e6, cacheMAC: 100e6, sampleVisits: 64e6, projectBytes: 32 * 1024 * 1024,
    maxTime: 120, coordinate: 100000, dimension: 100000 });
  const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const HASH = /^[0-9a-f]{64}$/;
  const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
  const OBJECT_KEYS = ['id', 'label', 'functionRef', 'instance', 'x', 'y', 'width', 'height',
    'rotation', 'opacity', 'tint', 'zIndex', 'visible', 'motion'];
  const EDIT_KEYS = OBJECT_KEYS.filter(k => k !== 'id');
  const SCENE_KEYS = ['schema', 'revision', 'width', 'height', 'background', 'seed', 'objects'];
  const PROJECT_KEYS = ['schema', 'id', 'title', 'functions', 'scene', 'references', 'datasets', 'learningRuns', 'feedback', 'history'];
  const FUNCTION_KEYS = ['schema', 'id', 'label', 'kind', 'width', 'height', 'appearance', 'coverage', 'provenance', 'version'];
  let generatedId = 0;
  const clock = () => root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const finite = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  const integer = (n, lo, hi) => Number.isInteger(n) && finite(n, lo, hi);
  const vector = (v, n, lo, hi) => Array.isArray(v) && v.length === n && v.every(x => finite(x, lo, hi));
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
  function fail(code, message) { const e = new Error('CRF11: ' + message); e.code = code; throw e; }
  function need(ok, message, code = 'INVALID_INPUT') { if (!ok) fail(code, message); }
  function keys(value, allowed, name) {
    need(plain(value), name + ' must be a plain object.');
    for (const k of Object.keys(value)) need(!BAD_KEYS.has(k) && allowed.includes(k), name + ': unsupported key ' + k);
  }
  function identifier(value, name) { need(typeof value === 'string' && ID.test(value) && !BAD_KEYS.has(value), 'Invalid ' + name); }
  function label(value, name) { need(typeof value === 'string' && value.length <= 512, 'Invalid ' + name); }
  function size(width, height, name) {
    need(integer(width, 1, LIMITS.pixels) && integer(height, 1, LIMITS.pixels) && width * height <= LIMITS.pixels,
      'Invalid or excessive ' + name + ' dimensions.', 'RESOURCE_LIMIT');
  }
  function checked(fn) { try { fn(); return { ok: true, errors: [] }; } catch (e) { return { ok: false, errors: [e.message], code: e.code || 'INVALID_INPUT' }; } }
  function requireValid(result) { if (!result.ok) fail(result.code || 'INVALID_INPUT', result.errors.join(' ')); }
  function canonical(value) {
    const active = new Set(); let nodes = 0;
    function visit(v, depth) {
      need(++nodes <= 2000000 && depth <= 64, 'JSON structure exceeds its budget.', 'RESOURCE_LIMIT');
      if (v === null || typeof v === 'boolean') return JSON.stringify(v);
      if (typeof v === 'number') { need(Number.isFinite(v), 'JSON numbers must be finite.'); return JSON.stringify(v); }
      if (typeof v === 'string') return JSON.stringify(v);
      need(Array.isArray(v) || plain(v), 'Only plain JSON values are supported.');
      need(!active.has(v), 'Cyclic JSON is not supported.'); active.add(v);
      let result;
      if (Array.isArray(v)) {
        need(v.length <= 2000000, 'Array exceeds its budget.', 'RESOURCE_LIMIT');
        const parts = [];
        for (let i = 0; i < v.length; i++) { need(own(v, i), 'Sparse arrays are unsupported.'); parts.push(visit(v[i], depth + 1)); }
        need(Object.keys(v).length === v.length, 'Array properties are unsupported.'); result = '[' + parts.join(',') + ']';
      } else {
        result = '{' + Object.keys(v).sort().map(k => {
          need(!BAD_KEYS.has(k), 'Forbidden JSON property ' + k);
          const d = Object.getOwnPropertyDescriptor(v, k); need(d && !d.get && !d.set, 'JSON accessors are unsupported.');
          return JSON.stringify(k) + ':' + visit(d.value, depth + 1);
        }).join(',') + '}';
      }
      active.delete(v); return result;
    }
    const result = visit(value, 0);
    need(result.length <= LIMITS.projectBytes, 'JSON exceeds its size budget.', 'RESOURCE_LIMIT');
    return result;
  }
  const copy = value => JSON.parse(canonical(value));
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; }
  async function digestBytes(bytes) {
    need(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes), 'digestBytes requires raw bytes.');
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    need(data.byteLength <= LIMITS.projectBytes * 4, 'Digest input exceeds its budget.', 'RESOURCE_LIMIT');
    need(root.crypto && root.crypto.subtle, 'WebCrypto SHA-256 is unavailable.', 'CRYPTO_UNAVAILABLE');
    const hash = await root.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  }
  async function digest(value) { return digestBytes(new TextEncoder().encode(canonical(value))); }
  function learner() {
    if (root.CRFLearn11) return root.CRFLearn11;
    if (typeof require === 'function') return require('./learn11.js');
    fail('LEARN_RUNTIME_UNAVAILABLE', 'Load learn11.js to validate or evaluate a neural function.');
  }
  const srgbToLinear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  const linearToByte = x => Math.round(255 * clamp(x <= .0031308 ? 12.92 * x : 1.055 * Math.max(0, x) ** (1 / 2.4) - .055, 0, 1));

  function checkCoverage(c, instances, nested = false) {
    need(plain(c), 'Missing coverage function.');
    if (c.kind === 'per_instance') {
      keys(c, ['kind', 'items'], 'per_instance coverage');
      need(!nested && Array.isArray(c.items) && c.items.length === instances, 'Coverage instance count differs.');
      c.items.forEach(item => checkCoverage(item, 1, true)); return;
    }
    if (c.kind === 'rect') { keys(c, ['kind'], 'rect coverage'); return; }
    if (c.kind === 'ellipse' || c.kind === 'polygon') {
      keys(c, c.kind === 'ellipse' ? ['kind', 'feather'] : ['kind', 'points', 'feather'], c.kind + ' coverage');
      need(finite(c.feather ?? 0, 0, .5), 'Coverage feather must be 0..0.5 local coordinate units.');
      if (c.kind === 'polygon') {
        need(Array.isArray(c.points) && c.points.length >= 3 && c.points.length <= LIMITS.polygonPoints &&
          c.points.every(p => vector(p, 2, -1, 1)), 'Invalid polygon coverage.');
        let area = 0; for (let i = 0; i < c.points.length; i++) { const a = c.points[i], b = c.points[(i + 1) % c.points.length]; area += a[0] * b[1] - a[1] * b[0]; }
        need(Math.abs(area) > 1e-8, 'Polygon coverage has zero area.');
      } return;
    }
    need(c.kind === 'rle8', 'Unsupported coverage kind.');
    keys(c, ['kind', 'encoding', 'width', 'height', 'runs', 'provenance', 'sourceId'], 'rle8 coverage');
    need(c.encoding === undefined || c.encoding === 'rle8', 'Invalid coverage encoding.'); size(c.width, c.height, 'coverage');
    need(Array.isArray(c.runs) && c.runs.length > 0 && c.runs.length % 2 === 0 && c.runs.length <= c.width * c.height * 2, 'Invalid coverage runs.');
    let count = 0; for (let i = 0; i < c.runs.length; i += 2) { need(integer(c.runs[i], 0, 255) && integer(c.runs[i + 1], 1, LIMITS.pixels), 'Invalid coverage run.'); count += c.runs[i + 1]; }
    need(count === c.width * c.height, 'Coverage run dimensions differ.');
    if (c.sourceId !== undefined) label(c.sourceId, 'coverage sourceId');
    if (c.provenance !== undefined) canonical(c.provenance);
  }
  function checkGaussianAsset(a) {
    need(plain(a) && a.schema === 'crf.gaussian_asset.v0.10', 'Expected a v0.10 Gaussian asset.');
    size(a.width, a.height, 'Gaussian asset'); need(vector(a.base, 3, -16, 16), 'Invalid Gaussian base.');
    need(Array.isArray(a.splats) && a.splats.length <= LIMITS.legacyGaussians, 'Gaussian asset budget exceeded.', 'RESOURCE_LIMIT');
    for (const g of a.splats) need(vector(g, 8, -100000, 100000) && finite(g[2], .05, 10000) && finite(g[3], .05, 10000) && g.slice(5).every(v => Math.abs(v) <= 256), 'Invalid Gaussian coefficients.');
    need(!a.kernel || ['linear_srgb', 'srgb_encoded_0_1'].includes(a.kernel.colorSpace || 'linear_srgb'), 'Unsupported Gaussian colour space.');
    if (a.alpha) checkCoverage({ kind: 'rle8', width: a.width, height: a.height, ...a.alpha }, 1);
    canonical(a);
  }
  function checkFunction(f, unsealed = false) {
    keys(f, FUNCTION_KEYS, 'function'); need(f.schema === SCHEMAS.function, 'Unsupported function schema.');
    identifier(f.id, 'function id'); label(f.label, 'function label'); size(f.width, f.height, 'function');
    need(['explicit', 'neural', 'gaussian'].includes(f.kind), 'Unsupported function kind.');
    if (!unsealed) need(typeof f.version === 'string' && HASH.test(f.version), 'Function version must be a SHA-256 digest.');
    need(plain(f.provenance), 'Function provenance must be declared.'); canonical(f.provenance);
    const a = f.appearance; need(plain(a) && a.kind === f.kind, 'Function appearance kind differs.'); let instances = 1;
    if (f.kind === 'explicit') {
      keys(a, ['kind', 'base', 'gradientX', 'gradientY', 'gaussians', 'waves'], 'explicit appearance');
      need(vector(a.base, 3, 0, 1), 'Explicit base must be linear RGB.');
      for (const k of ['gradientX', 'gradientY']) if (a[k] !== undefined) need(vector(a[k], 3, -4, 4), 'Invalid ' + k);
      need(a.gaussians === undefined || Array.isArray(a.gaussians) && a.gaussians.length <= LIMITS.gaussians, 'Explicit Gaussian budget exceeded.');
      for (const g of a.gaussians || []) need(vector(g, 8, -16, 16) && finite(g[0], -2, 2) && finite(g[1], -2, 2) && finite(g[2], .005, 4) && finite(g[3], .005, 4), 'Invalid explicit Gaussian.');
      need(a.waves === undefined || Array.isArray(a.waves) && a.waves.length <= LIMITS.waves, 'Wave budget exceeded.');
      for (const w of a.waves || []) { keys(w, ['frequency', 'phase', 'amplitude'], 'wave'); need(vector(w.frequency, 2, -256, 256) && finite(w.phase, -1000, 1000) && vector(w.amplitude, 3, -4, 4), 'Invalid wave.'); }
    } else if (f.kind === 'neural') {
      keys(a, ['kind', 'model'], 'neural appearance'); requireValid(learner().validateModel(a.model)); instances = a.model.instances.length;
    } else {
      keys(a, ['kind', 'asset', 'cutoffSquared'], 'Gaussian appearance'); checkGaussianAsset(a.asset);
      need(a.asset.width === f.width && a.asset.height === f.height, 'Gaussian function dimensions differ.');
      need(finite(a.cutoffSquared ?? 16, 1, 64), 'Invalid Gaussian cutoff.');
    }
    checkCoverage(f.coverage, instances); canonical(f);
  }
  const validateFunction = f => checked(() => checkFunction(f));
  async function sealFunction(spec) {
    const f = copy(spec); delete f.version; checkFunction(f, true);
    f.version = await digest(f); return freeze(f);
  }
  async function verifyFunction(f) {
    checkFunction(f); const payload = { ...f }; delete payload.version;
    need(await digest(payload) === f.version, 'Function content does not match its immutable version.', 'HASH_MISMATCH');
  }
  function functionSummary(f) {
    const instances = f.kind === 'neural' ? f.appearance.model.instances : [];
    return { id: f.id, version: f.version, label: f.label, kind: f.kind, width: f.width, height: f.height,
      instanceCount: instances.length || 1, instanceLabels: instances.map(x => x.label || x.id),
      instances: instances.map(x => ({ id: x.id, label: x.label || x.id, sourceGroup: x.sourceGroup })),
      controls: ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'tint', 'zIndex', 'visible', 'motion'],
      scope: f.provenance.scope || f.provenance.evidenceScope || (f.kind === 'neural' ? 'finite_instance_reconstruction' : 'authored_or_fitted_explicit'),
      semanticControlsLearned: false };
  }
  function catalogMap(catalog) {
    need(Array.isArray(catalog) || plain(catalog), 'Function catalog must be an array or version map.');
    const map = new Map();
    for (const [key, f] of Array.isArray(catalog) ? catalog.map(x => [x && x.version, x]) : Object.entries(catalog)) {
      need(plain(f) && HASH.test(f.version || '') && key === f.version, 'Invalid catalog version key.');
      need(!map.has(f.version), 'Duplicate catalog version.');
      const summary = f.schema === SCHEMAS.function ? functionSummary(f) : f;
      need(integer(summary.instanceCount, 1, 8), 'Invalid catalog instance count.');
      size(summary.width, summary.height, 'catalog function'); map.set(f.version, summary);
    }
    need(map.size <= LIMITS.functions, 'Too many registered functions.', 'RESOURCE_LIMIT'); return map;
  }
  function checkScene(s, catalog) {
    keys(s, SCENE_KEYS, 'scene'); need(s.schema === SCHEMAS.scene, 'Unsupported scene schema.'); size(s.width, s.height, 'scene');
    need(integer(s.revision, 0, Number.MAX_SAFE_INTEGER - 1), 'Invalid scene revision.');
    need(vector(s.background, 3, 0, 1), 'Background is sRGB in 0..1.'); need(integer(s.seed, 0, 4294967295), 'Invalid scene seed.');
    need(Array.isArray(s.objects) && s.objects.length <= LIMITS.objects, 'Object budget exceeded.', 'RESOURCE_LIMIT');
    const registry = catalogMap(catalog), seen = new Set();
    for (const o of s.objects) {
      keys(o, OBJECT_KEYS, 'scene object'); identifier(o.id, 'object id'); need(!seen.has(o.id), 'Duplicate object id.'); seen.add(o.id);
      label(o.label, 'object label'); const f = registry.get(o.functionRef); need(f, 'Missing function version ' + o.functionRef, 'MISSING_FUNCTION');
      need(integer(o.instance, 0, f.instanceCount - 1), 'Invalid function instance.');
      for (const k of ['x', 'y']) need(finite(o[k], -LIMITS.coordinate, LIMITS.coordinate), 'Invalid object ' + k);
      for (const k of ['width', 'height']) need(finite(o[k], .01, LIMITS.dimension), 'Invalid object ' + k);
      need(finite(o.rotation, -36000, 36000) && finite(o.opacity, 0, 1) && vector(o.tint, 3, 0, 4), 'Invalid rotation/opacity/tint.');
      need(integer(o.zIndex, -10000, 10000) && typeof o.visible === 'boolean', 'Invalid layer/visibility.');
      keys(o.motion, ['vx', 'vy', 'rotationSpeed'], 'motion');
      need(finite(o.motion.vx, -10000, 10000) && finite(o.motion.vy, -10000, 10000) && finite(o.motion.rotationSpeed, -3600, 3600), 'Invalid motion.');
    }
  }
  const validateScene = (scene, catalog) => checked(() => checkScene(scene, catalog));
  function checkProject(p) {
    keys(p, PROJECT_KEYS, 'project'); need(p.schema === SCHEMAS.project, 'Unsupported project schema.'); identifier(p.id, 'project id'); label(p.title, 'project title');
    need(plain(p.functions) && Object.keys(p.functions).length <= LIMITS.functions, 'Invalid function registry.');
    for (const [version, f] of Object.entries(p.functions)) { need(version === f.version && HASH.test(version), 'Function registry key differs.'); checkFunction(f); }
    checkScene(p.scene, p.functions);
    for (const k of ['references', 'datasets', 'learningRuns', 'feedback', 'history']) need(Array.isArray(p[k]) && p[k].length <= 4096, 'Invalid or excessive ' + k);
    canonical(p);
  }
  const validateProject = p => checked(() => checkProject(p));
  async function verifyProject(project) {
    try { checkProject(project); for (const f of Object.values(project.functions)) await verifyFunction(f);
      return { ok: true, errors: [], functionCount: Object.keys(project.functions).length, sceneDigest: await digest(project.scene), projectDigest: await digest(project) };
    } catch (e) { return { ok: false, errors: [e.message], code: e.code || 'INVALID_INPUT' }; }
  }
  function createScene(options = {}) {
    keys(options, ['revision', 'width', 'height', 'background', 'seed', 'objects'], 'scene options');
    return { schema: SCHEMAS.scene, revision: options.revision ?? 0, width: options.width ?? 640, height: options.height ?? 480,
      background: copy(options.background ?? [.05, .08, .12]), seed: options.seed ?? 11, objects: copy(options.objects ?? []) };
  }
  function createProject(options = {}) {
    keys(options, ['id', 'title', 'width', 'height'], 'project options');
    const p = { schema: SCHEMAS.project, id: options.id ?? 'project.' + Date.now().toString(36) + '.' + (++generatedId), title: options.title ?? 'CRF 对象函数工程', functions: {},
      scene: createScene({ width: options.width ?? 640, height: options.height ?? 480 }), references: [], datasets: [], learningRuns: [], feedback: [], history: [] };
    checkProject(p); return p;
  }
  function createInstance(f, options = {}) {
    keys(options, OBJECT_KEYS.filter(k => k !== 'functionRef'), 'instance options');
    const object = { id: options.id ?? 'object.' + (++generatedId), label: options.label ?? f.label, functionRef: f.version,
      instance: options.instance ?? 0, x: options.x ?? 0, y: options.y ?? 0, width: options.width ?? f.width, height: options.height ?? f.height,
      rotation: options.rotation ?? 0, opacity: options.opacity ?? 1, tint: copy(options.tint ?? [1, 1, 1]), zIndex: options.zIndex ?? 0,
      visible: options.visible ?? true, motion: { vx: 0, vy: 0, rotationSpeed: 0, ...(options.motion || {}) } };
    checkScene(createScene({ objects: [object] }), { [f.version]: f }); return object;
  }
  async function registerFunction(project, version) {
    checkProject(project); const frozen = copy(version); await verifyFunction(frozen);
    const functions = { ...project.functions, [frozen.version]: freeze(frozen) };
    need(Object.keys(functions).length <= LIMITS.functions, 'Function registry is full.', 'RESOURCE_LIMIT');
    const next = { ...project, functions }; checkProject(next); return next;
  }
  async function createNeuralFunction(model, options = {}) {
    keys(options, ['id', 'label', 'width', 'height', 'coverage', 'coverageByInstance', 'provenance', 'report'], 'neural function options');
    requireValid(learner().validateModel(model));
    if (options.report) {
      need(options.report.state === 'completed' && (options.report.status === undefined || options.report.status === 'completed'),
        'An incomplete training run cannot be registered as completed.', 'TRAINING_INCOMPLETE');
      need(options.report.modelHashProtocol === 'sha256_canonical_json_sorted_keys_utf8_v1' &&
        options.report.modelHash === await digest(model), 'Training evidence does not match these model weights.', 'TRAINING_MODEL_MISMATCH');
    }
    const normalizeCoverage = c => c && c.kind ? copy(c) : { kind: 'rle8', ...copy(c) };
    const coverage = options.coverage || (options.coverageByInstance ? { kind: 'per_instance', items: options.coverageByInstance.map(normalizeCoverage) } : { kind: 'rect' });
    const first = model.instances[0];
    return sealFunction({ schema: SCHEMAS.function, id: options.id ?? 'neural.function', label: options.label ?? '学习外观函数', kind: 'neural',
      width: options.width ?? first.width ?? 128, height: options.height ?? first.height ?? 128,
      appearance: { kind: 'neural', model: copy(model) }, coverage: copy(coverage),
      provenance: { kind: options.report ? 'trained_neural' : 'imported_neural', scope: 'finite_instance_reconstruction',
        sourceRGBAtRender: false, semanticControlsLearned: false, independentSourceGeneralization: 'not_evaluated',
        ...(options.provenance || {}), ...(options.report ? { trainingReport: copy(options.report) } : {}) } });
  }
  async function createGaussianFunction(asset, options = {}) {
    keys(options, ['id', 'label', 'provenance', 'cutoffSquared'], 'Gaussian function options'); checkGaussianAsset(asset);
    return sealFunction({ schema: SCHEMAS.function, id: options.id ?? asset.id ?? 'gaussian.function', label: options.label ?? '高斯外观函数', kind: 'gaussian', width: asset.width, height: asset.height,
      appearance: { kind: 'gaussian', asset: copy(asset), cutoffSquared: options.cutoffSquared ?? 16 },
      coverage: asset.alpha ? { kind: 'rle8', width: asset.width, height: asset.height, ...copy(asset.alpha), provenance: 'declared_legacy_alpha' } : { kind: 'rect' },
      provenance: { kind: 'legacy_gaussian_adapter', sourceSchema: asset.schema, sourceRGBAtRender: false, scope: 'new_joint_sample_semantics_not_legacy_byte_identity', ...(options.provenance || {}) } });
  }
  function applyPatch(project, patch) {
    checkProject(project); keys(patch, ['baseRevision', 'operations'], 'patch');
    need(patch.baseRevision === project.scene.revision, 'Scene revision changed; this patch is stale.', 'STALE_REVISION');
    need(Array.isArray(patch.operations) && patch.operations.length > 0 && patch.operations.length <= LIMITS.patchOperations, 'Invalid patch operation count.');
    let scene = copy(project.scene);
    for (const op of patch.operations) {
      need(plain(op), 'Patch operation must be an object.');
      if (op.op === 'add') { keys(op, ['op', 'object'], 'add'); scene.objects.push(copy(op.object)); }
      else if (op.op === 'update') {
        keys(op, ['op', 'id', 'values'], 'update'); keys(op.values, EDIT_KEYS, 'object update');
        const o = scene.objects.find(x => x.id === op.id); need(o, 'Unknown object ' + op.id); Object.assign(o, copy(op.values));
      } else if (op.op === 'remove') {
        keys(op, ['op', 'id'], 'remove'); const index = scene.objects.findIndex(x => x.id === op.id); need(index >= 0, 'Unknown object ' + op.id); scene.objects.splice(index, 1);
      } else if (op.op === 'scene') {
        keys(op, ['op', 'values'], 'scene update'); keys(op.values, ['width', 'height', 'background', 'seed'], 'scene values'); Object.assign(scene, copy(op.values));
      } else if (op.op === 'replaceScene') {
        keys(op, ['op', 'scene'], 'replaceScene'); checkScene(op.scene, project.functions); scene = copy(op.scene);
      } else fail('INVALID_PATCH', 'Unsupported patch operation.');
    }
    scene.revision = project.scene.revision + 1; checkScene(scene, project.functions);
    return { ...project, scene };
  }

  function coverageEvaluator(coverage, instance) {
    const c = coverage.kind === 'per_instance' ? coverage.items[instance] : coverage;
    if (c.kind === 'rect') return () => 1;
    if (c.kind === 'ellipse') return (x, y) => { const d = 1 - Math.hypot(x, y); return c.feather ? clamp(d / c.feather, 0, 1) : +(d >= 0); };
    if (c.kind === 'polygon') return (x, y) => {
      let inside = false, distance = Infinity;
      for (let i = 0, j = c.points.length - 1; i < c.points.length; j = i++) {
        const a = c.points[j], b = c.points[i];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        if (c.feather) { const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy; const t = den ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / den, 0, 1) : 0; distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)); }
      }
      return inside ? c.feather ? clamp(distance / c.feather, 0, 1) : 1 : 0;
    };
    const alpha = new Uint8Array(c.width * c.height); let at = 0;
    for (let i = 0; i < c.runs.length; i += 2) { alpha.fill(c.runs[i], at, at + c.runs[i + 1]); at += c.runs[i + 1]; }
    return (x, y) => {
      const u = (x + 1) * .5 * c.width - .5, v = (y + 1) * .5 * c.height - .5;
      const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy; let sum = 0;
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) {
        const px = ix + xx, py = iy + yy;
        if (px >= 0 && py >= 0 && px < c.width && py < c.height) sum += alpha[py * c.width + px] * (xx ? fx : 1 - fx) * (yy ? fy : 1 - fy);
      } return clamp(sum / 255, 0, 1);
    };
  }
  function appearanceEvaluator(f, instance) {
    if (f.kind === 'neural') {
      const compiled = learner().compile(f.appearance.model, instance);
      return { evaluate: compiled.evaluate, operations: compiled.operationsPerSample, parameters: compiled.parameterCount, cacheable: true };
    }
    const a = f.appearance;
    if (f.kind === 'explicit') {
      const terms = (a.gaussians || []).map(g => ({ g, co: Math.cos(g[4]), si: Math.sin(g[4]) }));
      return { operations: 3 + terms.length * 16 + (a.waves || []).length * 8, parameters: 3 + terms.length * 8, cacheable: false,
        evaluate(x, y, out) {
          for (let k = 0; k < 3; k++) out[k] = a.base[k] + (a.gradientX?.[k] || 0) * x + (a.gradientY?.[k] || 0) * y;
          for (const { g, co, si } of terms) { const dx = x - g[0], dy = y - g[1], qx = (co * dx + si * dy) / g[2], qy = (-si * dx + co * dy) / g[3], w = Math.exp(-.5 * (qx * qx + qy * qy)); for (let k = 0; k < 3; k++) out[k] += g[k + 5] * w; }
          for (const w of a.waves || []) { const s = Math.sin(w.frequency[0] * x + w.frequency[1] * y + w.phase); for (let k = 0; k < 3; k++) out[k] += w.amplitude[k] * s; }
          for (let k = 0; k < 3; k++) out[k] = clamp(out[k], 0, 1); return out;
        } };
    }
    const asset = a.asset, terms = asset.splats.map(g => ({ g, co: Math.cos(g[4]), si: Math.sin(g[4]) }));
    const encoded = asset.kernel?.colorSpace === 'srgb_encoded_0_1';
    return { operations: 3 + terms.length * 16, parameters: 3 + terms.length * 8, cacheable: true,
      evaluate(x, y, out) {
        const u = (x + 1) * .5 * asset.width, v = (y + 1) * .5 * asset.height;
        for (let k = 0; k < 3; k++) out[k] = asset.base[k];
        for (const { g, co, si } of terms) { const dx = u - g[0], dy = v - g[1], qx = (co * dx + si * dy) / g[2], qy = (-si * dx + co * dy) / g[3], q = qx * qx + qy * qy; if (q > (a.cutoffSquared ?? 16)) continue; const w = Math.exp(-.5 * q); for (let k = 0; k < 3; k++) out[k] += g[k + 5] * w; }
        for (let k = 0; k < 3; k++) { out[k] = clamp(out[k], 0, 1); if (encoded) out[k] = srgbToLinear(out[k]); } return out;
      } };
  }
  function objectAtTime(object, time, width, height, scene) {
    const sx = width / scene.width, sy = height / scene.height;
    const r = (object.rotation + object.motion.rotationSpeed * time) * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    const cx = object.x + object.motion.vx * time + object.width / 2, cy = object.y + object.motion.vy * time + object.height / 2;
    const hx = (Math.abs(co) * object.width + Math.abs(si) * object.height) / 2, hy = (Math.abs(si) * object.width + Math.abs(co) * object.height) / 2;
    const box = [clamp(Math.floor((cx - hx) * sx), 0, width), clamp(Math.floor((cy - hy) * sy), 0, height),
      clamp(Math.ceil((cx + hx) * sx), 0, width), clamp(Math.ceil((cy + hy) * sy), 0, height)];
    return { object, co, si, cx, cy, invX: 1 / sx, invY: 1 / sy, box, area: Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]) };
  }
  async function createRuntime(project, options = {}) {
    keys(options, ['cacheResolution'], 'runtime options'); const started = clock(), snapshot = freeze(copy(project));
    const verification = await verifyProject(snapshot); requireValid(verification);
    const resolution = options.cacheResolution ?? 64; need(integer(resolution, LIMITS.cacheMin, LIMITS.cacheMax), 'Invalid cache resolution.', 'RESOURCE_LIMIT');
    let cacheBudgetMAC = 0;
    const fields = new Map(), caches = new Map(), objects = snapshot.scene.objects.map((object, index) => ({ object, index }))
      .sort((a, b) => a.object.zIndex - b.object.zIndex || a.index - b.index);
    for (const { object } of objects) {
      const key = object.functionRef + ':' + object.instance;
      if (!fields.has(key)) { const f = snapshot.functions[object.functionRef]; fields.set(key, { key, function: f, instance: object.instance,
        appearance: appearanceEvaluator(f, object.instance), coverage: coverageEvaluator(f.coverage, object.instance) }); }
    }
    const trace = { engine: 'CRF11', rendererBuild: VERSION, rendererSourceSha256: null, sourceRGBAtRender: false,
      referenceNetworkReads: 0, sceneDigest: verification.sceneDigest, projectDigest: verification.projectDigest,
      functionVersions: [...new Set(objects.map(x => x.object.functionRef))].sort(), cacheResolution: resolution,
      compileMs: clock() - started, cacheBuildMs: 0, cacheBuildEvaluations: 0, cacheBuildMAC: 0, cacheBytes: 0,
      cacheEntries: 0, renderedFrames: 0, formalProofStatus: 'not_implemented' };
    function buildCache(field) {
      if (caches.has(field.key)) return caches.get(field.key);
      const operations = resolution * resolution * field.appearance.operations, bytes = resolution * resolution * 3 * 4;
      need(operations <= LIMITS.cacheMAC && cacheBudgetMAC + operations <= LIMITS.cacheMAC,
        'Generated field cache would exceed its computation budget; reduce cache resolution.', 'RESOURCE_LIMIT');
      need(trace.cacheBytes + bytes <= LIMITS.cacheBytes, 'Generated field cache exceeds its memory budget.', 'RESOURCE_LIMIT');
      const started = clock(), data = new Float32Array(resolution * resolution * 3), scratch = new Float64Array(3);
      for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
        field.appearance.evaluate(2 * x / (resolution - 1) - 1, 2 * y / (resolution - 1) - 1, scratch);
        for (let k = 0; k < 3; k++) { need(finite(scratch[k], 0, 1), 'Function produced invalid RGB.', 'INVALID_OUTPUT'); data[(y * resolution + x) * 3 + k] = scratch[k]; }
      }
      caches.set(field.key, data); trace.cacheBuildMs += clock() - started; trace.cacheBuildEvaluations += resolution * resolution;
      trace.cacheBuildMAC += operations; cacheBudgetMAC += operations; trace.cacheBytes += bytes; trace.cacheEntries = caches.size; return data;
    }
    function sampleCache(data, x, y, out) {
      const u = (x + 1) * .5 * (resolution - 1), v = (y + 1) * .5 * (resolution - 1), ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
      const ix1 = Math.min(resolution - 1, ix + 1), iy1 = Math.min(resolution - 1, iy + 1);
      for (let k = 0; k < 3; k++) { const a = data[(iy * resolution + ix) * 3 + k], b = data[(iy * resolution + ix1) * 3 + k], c = data[(iy1 * resolution + ix) * 3 + k], d = data[(iy1 * resolution + ix1) * 3 + k]; out[k] = ((1 - fx) * a + fx * b) * (1 - fy) + ((1 - fx) * c + fx * d) * fy; }
      return out;
    }
    function render(input = {}) {
      keys(input, ['time', 'width', 'height', 'samples', 'backend'], 'render options');
      const started = clock(), scene = snapshot.scene, width = input.width ?? scene.width, height = input.height ?? scene.height,
        time = input.time ?? 0, samples = input.samples ?? 1, backend = input.backend ?? 'cached';
      size(width, height, 'output'); need(finite(time, 0, LIMITS.maxTime), 'Invalid time.'); need(integer(samples, 1, 4), 'samples must be 1..4 per axis.');
      need(backend === 'direct' || backend === 'cached', 'Unsupported rendering backend.');
      const frameObjects = objects.filter(({ object }) => object.visible && object.opacity > 0).map(({ object }) => {
        const state = objectAtTime(object, time, width, height, scene); state.field = fields.get(object.functionRef + ':' + object.instance); return state;
      }).filter(o => o.area > 0);
      const visits = frameObjects.reduce((sum, o) => sum + o.area * samples * samples, 0);
      const boundingBoxTests = width * height * samples * samples * frameObjects.length;
      const operations = frameObjects.reduce((sum, o) => sum + o.area * samples * samples *
        (backend === 'cached' && o.field.appearance.cacheable ? 16 : o.field.appearance.operations), 0);
      need(visits <= LIMITS.sampleVisits && boundingBoxTests <= LIMITS.sampleVisits && operations <= LIMITS.directMAC,
        'Frame exceeds its computation budget; reduce resolution/samples or use cached evaluation.', 'RESOURCE_LIMIT');
      // Preflight all cache work before building any entry. The cumulative budget
      // includes every generated field, not only the field last encountered.
      const missing = new Map(); if (backend === 'cached') for (const o of frameObjects) if (o.field.appearance.cacheable && !caches.has(o.field.key)) missing.set(o.field.key, o.field);
      const cacheMAC = [...missing.values()].reduce((sum, f) => sum + resolution * resolution * f.appearance.operations, 0);
      need(cacheBudgetMAC + cacheMAC <= LIMITS.cacheMAC && trace.cacheBytes + missing.size * resolution * resolution * 12 <= LIMITS.cacheBytes,
        'Cache precomputation exceeds its aggregate budget.', 'RESOURCE_LIMIT');
      const beforeCacheEvaluations = trace.cacheBuildEvaluations, beforeCacheMAC = trace.cacheBuildMAC, beforeCacheMs = trace.cacheBuildMs;
      for (const f of missing.values()) buildCache(f);
      const data = new Uint8ClampedArray(width * height * 4), linearData = new Float32Array(width * height * 3);
      const background = scene.background.map(srgbToLinear), scratch = new Float64Array(3); let fieldEvaluations = 0, cachedSamples = 0, coveredSamples = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let totalR = 0, totalG = 0, totalB = 0;
        for (let yy = 0; yy < samples; yy++) for (let xx = 0; xx < samples; xx++) {
          const px = x + (xx + .5) / samples, py = y + (yy + .5) / samples; let r = background[0], g = background[1], b = background[2];
          for (const state of frameObjects) {
            const box = state.box; if (x < box[0] || y < box[1] || x >= box[2] || y >= box[3]) continue;
            const o = state.object, dx = px * state.invX - state.cx, dy = py * state.invY - state.cy;
            const qx = (state.co * dx + state.si * dy) * 2 / o.width, qy = (-state.si * dx + state.co * dy) * 2 / o.height;
            if (qx < -1 || qx > 1 || qy < -1 || qy > 1) continue;
            const alpha = state.field.coverage(qx, qy) * o.opacity; if (alpha <= 0) continue;
            const cache = backend === 'cached' && state.field.appearance.cacheable ? caches.get(state.field.key) : null;
            if (cache) { sampleCache(cache, qx, qy, scratch); cachedSamples++; }
            else { state.field.appearance.evaluate(qx, qy, scratch); fieldEvaluations++; }
            need(finite(alpha, 0, 1) && finite(scratch[0], 0, 1) && finite(scratch[1], 0, 1) && finite(scratch[2], 0, 1),
              'Function produced invalid color/alpha.', 'INVALID_OUTPUT');
            r = scratch[0] * o.tint[0] * alpha + r * (1 - alpha);
            g = scratch[1] * o.tint[1] * alpha + g * (1 - alpha);
            b = scratch[2] * o.tint[2] * alpha + b * (1 - alpha); coveredSamples++;
          }
          totalR += r; totalG += g; totalB += b;
        }
        const at = y * width + x, divisor = samples * samples;
        linearData[at * 3] = totalR / divisor; linearData[at * 3 + 1] = totalG / divisor; linearData[at * 3 + 2] = totalB / divisor;
        data[at * 4] = linearToByte(totalR / divisor); data[at * 4 + 1] = linearToByte(totalG / divisor); data[at * 4 + 2] = linearToByte(totalB / divisor); data[at * 4 + 3] = 255;
      }
      trace.renderedFrames++;
      const descriptor = { schema: 'crf.frame_descriptor.v1.1', width, height, channels: 'RGBA8', colorSpace: 'srgb', alpha: 'straight_opaque_background',
        sampling: { type: 'joint_regular_subpixel', samplesPerAxis: samples }, time, backend,
        cacheResolution: backend === 'cached' ? resolution : null, sceneDigest: trace.sceneDigest,
        functionVersions: [...trace.functionVersions], rendererBuild: VERSION, rendererSourceSha256: null };
      const diagnostics = { engine: 'CRF11', backend, elapsedMs: clock() - started, compileMs: trace.compileMs, time,
        visibleObjects: frameObjects.length, fieldEvaluations, cachedSamples, coveredSamples, estimatedSampleVisits: visits,
        estimatedBoundingBoxTests: boundingBoxTests, estimatedFrameMAC: operations,
        cacheBuildEvaluations: trace.cacheBuildEvaluations - beforeCacheEvaluations, cacheBuildMAC: trace.cacheBuildMAC - beforeCacheMAC,
        cacheBuildMs: trace.cacheBuildMs - beforeCacheMs, cacheBytes: trace.cacheBytes, cacheEntries: trace.cacheEntries,
        generatedFieldCache: cachedSamples > 0, generatedFieldCacheApproximation: cachedSamples > 0 ? 'bilinear_canonical_grid' : 'none',
        sourceRGBBlit: false, sourceRGBAtRender: false, referenceNetworkReads: 0, neuralWeightsUsed: frameObjects.some(o => o.field.function.kind === 'neural'),
        colorSpace: 'linear_srgb_joint_premultiplied_then_srgb8', geometry: 'explicit_2d_affine_motion', learnedDynamics: false,
        physicalRelighting: false, formalProofStatus: 'not_implemented', photographicQuality: 'not_evaluated' };
      return { width, height, data, linearData, descriptor, diagnostics };
    }
    return { render, get trace() { return copy(trace); }, clearCache() { caches.clear(); trace.cacheBytes = 0; trace.cacheEntries = 0; cacheBudgetMAC = 0; } };
  }
  async function renderScene(project, options = {}) {
    const { cacheResolution, ...renderOptions } = options;
    const runtime = await createRuntime(project, cacheResolution === undefined ? {} : { cacheResolution }); return runtime.render(renderOptions);
  }
  function compareFrames(a, b) {
    size(a.width, a.height, 'comparison'); need(a.width === b.width && a.height === b.height, 'Comparison dimensions differ.');
    const count = a.width * a.height; need(a.data && b.data && a.data.length === count * 4 && b.data.length === count * 4, 'Comparison requires complete RGBA frames.');
    let abs = 0, sq = 0, max = 0, exact = 0, linearSq = 0;
    const linearAvailable = a.linearData?.length === count * 3 && b.linearData?.length === count * 3;
    for (let i = 0; i < count; i++) { let equal = true; for (let k = 0; k < 4; k++) {
      const av = a.data[i * 4 + k], bv = b.data[i * 4 + k]; need(finite(av, 0, 255) && finite(bv, 0, 255), 'Invalid comparison pixels.');
      const delta = Math.abs(av - bv); equal = equal && delta === 0; if (k < 3) { abs += delta; sq += delta * delta; max = Math.max(max, delta); }
    } exact += +equal;
      if (linearAvailable) for (let k = 0; k < 3; k++) { const av = a.linearData[i * 3 + k], bv = b.linearData[i * 3 + k]; need(Number.isFinite(av) && Number.isFinite(bv), 'Invalid linear comparison pixels.'); linearSq += (av - bv) ** 2; }
    }
    const mse = sq / (count * 3);
    return { status: 'measured', evaluatedPixels: count, mae: abs / (count * 3), rmse: Math.sqrt(mse), maxError: max,
      psnr: mse === 0 ? null : 10 * Math.log10(65025 / mse), psnrStatus: mse === 0 ? 'infinite_zero_error' : 'finite',
      exactRGBAFraction: exact / count, linearRMSE: linearAvailable ? Math.sqrt(linearSq / (count * 3)) : null,
      scope: 'finite_frame_numeric_measurement_not_formal_proof_or_visual_quality' };
  }

  async function createBuiltinFunctions() {
    const base = (id, name, width, height, appearance, coverage) => ({ schema: SCHEMAS.function, id, label: name, kind: 'explicit', width, height,
      appearance: { kind: 'explicit', ...appearance }, coverage,
      provenance: { kind: 'authored_explicit', scope: 'hand_authored_2d_landscape_basis', sourceRGBAtRender: false, modelTraining: false, photographicQuality: 'not_evaluated' } });
    return Promise.all([
      sealFunction(base('explicit.sky', '天空 · 显式渐变', 640, 480,
        { base: [.26, .43, .64], gradientY: [.17, .16, .13], gaussians: [[-.6, -.55, .7, .35, 0, .12, .11, .07]] }, { kind: 'rect' })),
      sealFunction(base('explicit.mountain', '山脊 · 显式颜色场', 640, 220,
        { base: [.15, .22, .26], gradientX: [.05, .05, .04], gradientY: [-.05, -.07, -.07], waves: [{ frequency: [15, 7], phase: .2, amplitude: [.025, .03, .025] }] },
        { kind: 'polygon', points: [[-1, 1], [-1, .28], [-.78, -.12], [-.58, -.85], [-.4, -.38], [-.18, -.68], [.08, -.18], [.35, -.92], [.55, -.37], [.78, -.15], [1, .28], [1, 1]], feather: .015 })),
      sealFunction(base('explicit.water', '湖面 · 显式波纹', 640, 220,
        { base: [.095, .24, .31], gradientY: [-.04, -.1, -.12], waves: [{ frequency: [2, 65], phase: .4, amplitude: [.018, .026, .03] }, { frequency: [7, 23], phase: 1.4, amplitude: [.014, .021, .027] }],
          gaussians: [[-.3, -.45, .35, .7, 0, .09, .1, .09]] }, { kind: 'rect' })),
      sealFunction(base('explicit.cloud', '云层 · 显式高斯外观', 240, 75,
        { base: [.65, .7, .76], gradientY: [-.18, -.18, -.18], gaussians: [[-.3, -.2, .5, .6, 0, .3, .28, .23], [.4, 0, .4, .65, 0, .2, .2, .19]] }, { kind: 'ellipse', feather: .35 }))
    ]);
  }
  async function createDemoProject() {
    let project = createProject({ id: 'project.mountain_lake', title: '山湖 · 可学习对象函数', width: 640, height: 480 });
    const functions = await createBuiltinFunctions(); for (const f of functions) project = await registerFunction(project, f);
    const byId = Object.fromEntries(functions.map(f => [f.id, f]));
    project.scene.objects = [
      createInstance(byId['explicit.sky'], { id: 'sky', width: 640, height: 480 }),
      createInstance(byId['explicit.cloud'], { id: 'cloud.far', x: 340, y: 65, width: 235, height: 65, opacity: .7, zIndex: 1, motion: { vx: 2 } }),
      createInstance(byId['explicit.mountain'], { id: 'mountain.far', x: -30, y: 120, width: 720, height: 210, tint: [1.4, 1.4, 1.45], zIndex: 2 }),
      createInstance(byId['explicit.mountain'], { id: 'mountain.near', x: -40, y: 175, width: 710, height: 185, tint: [.75, .8, .8], zIndex: 3 }),
      createInstance(byId['explicit.water'], { id: 'water', x: 0, y: 290, width: 640, height: 190, zIndex: 4 })
    ]; checkProject(project); return project;
  }
  return { VERSION, SCHEMAS, LIMITS, canonical, digest, digestBytes, createProject, createScene, createInstance,
    sealFunction, createNeuralFunction, createGaussianFunction, createBuiltinFunctions, createDemoProject, registerFunction,
    functionSummary, validateFunction, validateScene, validateProject, verifyProject, applyPatch, createRuntime, renderScene, compareFrames,
    srgbToLinear, linearToByte };
});
