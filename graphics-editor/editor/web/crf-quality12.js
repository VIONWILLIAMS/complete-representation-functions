/* CRF 1.1 quality iteration: direct evaluation of explicit 2D Gaussian fields.
 * Internal filename 12 is a module identifier, not a CRF 1.2 release claim.
 * No source photograph, RGB texture, raster residual or upsampled colour cache
 * is read by this module. The fitted coefficients remain observation-dependent.
 * Every requested pixel is evaluated at a declared source-plane coordinate.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CRFQuality12 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const VERSION = '1.1.0-experimental.2';
  const SCHEMA = 'crf.quality_project.v1', ASSET_SCHEMA = 'crf.gaussian_asset.v0.8';
  const LIMITS = Object.freeze({ pixels: 4000000, splats: 262144, minSigma: .35,
    supportVisits: 200000000, jsonBytes: 64 * 1024 * 1024, jsonNodes: 3000000 });
  const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
  const plain = x => x !== null && typeof x === 'object' &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
  const finite = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const byte = x => Math.max(0, Math.min(255, Math.floor(x + .5)));
  const clock = () => root.performance?.now ? root.performance.now() : Date.now();
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function need(ok, message, code = 'INVALID_INPUT') { if (!ok) fail(code, message); }
  function allowed(value, keys, label) {
    need(plain(value), label + ' must be a plain object.');
    for (const key of Object.keys(value)) need(keys.includes(key) && !BAD_KEYS.has(key), 'Unknown ' + label + ' field: ' + key);
  }
  function dimensions(w, h) {
    need(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w * h <= LIMITS.pixels,
      'Output dimensions exceed the 4,000,000-pixel budget.', 'RESOURCE_LIMIT');
  }
  function checkROI(roi) {
    need(Array.isArray(roi) && roi.length === 4 && roi.every(x => finite(x, 0, 1)) &&
      roi[0] < roi[2] && roi[1] < roi[3], 'ROI must be a nonempty normalized [x0,y0,x1,y1] rectangle.');
  }
  function checkView(view) {
    allowed(view, ['width', 'height', 'roi'], 'view'); dimensions(view.width, view.height); checkROI(view.roi);
  }
  function checkEdits(edits) {
    allowed(edits, ['exposure', 'contrast', 'saturation'], 'edits');
    need(finite(edits.exposure, -4, 4), 'Exposure must be in [-4,4] EV.');
    need(finite(edits.contrast, 0, 3), 'Contrast must be in [0,3].');
    need(finite(edits.saturation, 0, 3), 'Saturation must be in [0,3].');
  }
  function checkAsset(asset) {
    allowed(asset, ['schema', 'id', 'width', 'height', 'base', 'splats', 'kernel', 'provenance', 'fit', 'alpha'], 'asset');
    need(asset.schema === ASSET_SCHEMA, 'Expected explicit v0.8 Gaussian coefficients.');
    dimensions(asset.width, asset.height);
    need(Array.isArray(asset.base) && asset.base.length === 3 && asset.base.every(x => finite(x, 0, 255)),
      'Base must contain three finite sRGB values in [0,255].');
    need(Array.isArray(asset.splats) && asset.splats.length <= LIMITS.splats,
      'Gaussian count exceeds 262,144.', 'RESOURCE_LIMIT');
    for (let i = 0; i < asset.splats.length; i++) {
      const g = asset.splats[i];
      need(Array.isArray(g) && g.length === 8 && g.every(x => typeof x === 'number' && Number.isFinite(x)) &&
        Math.abs(g[0]) <= 100000 && Math.abs(g[1]) <= 100000 &&
        g[2] >= LIMITS.minSigma && g[3] >= LIMITS.minSigma && g[2] <= 10000 && g[3] <= 10000 &&
        Math.abs(g[4]) <= 100000 && Math.abs(g[5]) <= 100000 && Math.abs(g[6]) <= 100000 && Math.abs(g[7]) <= 100000,
      'Invalid Gaussian at index ' + i + '; minimum sigma is 0.35 source pixels.');
    }
    if (asset.kernel !== undefined) {
      need(plain(asset.kernel), 'Kernel declaration must be an object.');
      need(asset.kernel.cutoffSigma === undefined || asset.kernel.cutoffSigma === 4, 'Kernel cutoff must be four sigma.');
      need(asset.kernel.sample === undefined || asset.kernel.sample === 'pixel_centres', 'Only pixel-centre observations are supported.');
      need(asset.kernel.colorSpace === undefined || asset.kernel.colorSpace === 'srgb_encoded_0_255', 'Unsupported coefficient colour space.');
    }
    if (asset.alpha !== undefined) {
      const a = asset.alpha; allowed(a, ['encoding', 'runs'], 'coverage');
      need(a.encoding === 'rle8' && Array.isArray(a.runs) && a.runs.length % 2 === 0 && a.runs.length <= 2 * LIMITS.pixels,
        'Coverage must be an RLE8 mask.');
      let count = 0;
      for (let i = 0; i < a.runs.length; i += 2) {
        need(Number.isInteger(a.runs[i]) && finite(a.runs[i], 0, 255) &&
          Number.isInteger(a.runs[i + 1]) && finite(a.runs[i + 1], 1, LIMITS.pixels), 'Invalid coverage run.');
        count += a.runs[i + 1];
      }
      need(count === asset.width * asset.height, 'Coverage dimensions differ from the function.');
    }
  }
  function checkProject(project) {
    allowed(project, ['schema', 'version', 'title', 'asset', 'assetMetadata', 'view', 'edits', 'provenance', 'feedback',
      'qualityContractHash', 'contentHash', 'hashProtocol'], 'project');
    need(project.schema === SCHEMA && project.version === VERSION, 'Unsupported quality project version.');
    checkAsset(project.asset); checkView(project.view); checkEdits(project.edits);
    if (project.qualityContractHash !== undefined) need(typeof project.qualityContractHash === 'string' && /^[a-f0-9]{64}$/.test(project.qualityContractHash), 'Invalid quality contract hash.');
    if (project.contentHash !== undefined) need(typeof project.contentHash === 'string' && /^[a-f0-9]{64}$/.test(project.contentHash) &&
      project.hashProtocol === 'sha256_canonical_json_sorted_keys_utf8_v1', 'Invalid content hash declaration.');
    if (project.assetMetadata !== undefined) need(plain(project.assetMetadata), 'Asset metadata must be an object.');
    if (project.provenance !== undefined) need(plain(project.provenance), 'Project provenance must be an object.');
    if (project.title !== undefined) need(typeof project.title === 'string' && project.title.length <= 200, 'Project title exceeds 200 characters.');
    if (project.feedback !== undefined) {
      need(Array.isArray(project.feedback) && project.feedback.length <= 100, 'Feedback is limited to 100 entries.');
      for (const feedback of project.feedback) {
        allowed(feedback, ['at', 'decision', 'note', 'view', 'edits'], 'feedback');
        need(typeof feedback.at === 'string' && feedback.at.length <= 60 && Number.isFinite(Date.parse(feedback.at)), 'Invalid feedback timestamp.');
        need(typeof feedback.decision === 'string' && feedback.decision.length > 0 && feedback.decision.length <= 80, 'Invalid feedback decision.');
        need(typeof feedback.note === 'string' && feedback.note.length <= 2000, 'Feedback note exceeds 2,000 characters.');
        checkView(feedback.view); checkEdits(feedback.edits);
      }
    }
  }
  function checked(check, value) {
    try { check(value); return { ok: true, errors: [] }; }
    catch (error) { return { ok: false, errors: [error.message], code: error.code || 'INVALID_INPUT' }; }
  }
  const validateAsset = asset => checked(checkAsset, asset);
  const validateProject = project => checked(checkProject, project);

  // Strict canonical JSON: no executable properties, inherited values, sparse
  // arrays, cyclic data or non-finite coefficients can acquire an integrity hash.
  function canonical(value) {
    const active = new Set(); let nodes = 0;
    function walk(v, depth) {
      need(++nodes <= LIMITS.jsonNodes && depth <= 40, 'JSON structure exceeds its budget.', 'RESOURCE_LIMIT');
      if (v === null || typeof v === 'boolean') return JSON.stringify(v);
      if (typeof v === 'number') { need(Number.isFinite(v), 'JSON numbers must be finite.'); return JSON.stringify(v); }
      if (typeof v === 'string') return JSON.stringify(v);
      need(Array.isArray(v) || plain(v), 'Only plain JSON values are supported.');
      need(!active.has(v), 'Cyclic JSON is unsupported.'); active.add(v);
      let result;
      if (Array.isArray(v)) {
        need(v.length <= LIMITS.jsonNodes && Object.keys(v).length === v.length, 'Sparse or decorated arrays are unsupported.');
        const parts = new Array(v.length);
        for (let i = 0; i < v.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
          need(descriptor && !descriptor.get && !descriptor.set, 'JSON accessors are unsupported.');
          parts[i] = walk(descriptor.value, depth + 1);
        }
        result = '[' + parts.join(',') + ']';
      } else {
        result = '{' + Object.keys(v).sort().map(key => {
          need(!BAD_KEYS.has(key), 'Forbidden JSON property: ' + key);
          const descriptor = Object.getOwnPropertyDescriptor(v, key);
          need(descriptor && !descriptor.get && !descriptor.set, 'JSON accessors are unsupported.');
          return JSON.stringify(key) + ':' + walk(descriptor.value, depth + 1);
        }).join(',') + '}';
      }
      active.delete(v); return result;
    }
    const result = walk(value, 0);
    need(result.length <= LIMITS.jsonBytes, 'JSON exceeds 64 MiB.', 'RESOURCE_LIMIT');
    return result;
  }
  const copy = value => JSON.parse(canonical(value));
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const item of Object.values(value)) freeze(item);
      Object.freeze(value);
    }
    return value;
  }
  function createProject(input, options = {}) {
    allowed(options, ['view', 'edits', 'provenance', 'qualityContractHash', 'title'], 'project options');
    const incoming = copy(input), wrapped = incoming.schema === 'crf.quality_asset.v1';
    const asset = wrapped ? incoming.gaussian : incoming;
    checkAsset(asset);
    const project = { schema: SCHEMA, version: VERSION, asset,
      view: { width: asset.width, height: asset.height, roi: [0, 0, 1, 1], ...copy(options.view || {}) },
      edits: { exposure: 0, contrast: 1, saturation: 1, ...copy(options.edits || {}) } };
    if (wrapped) { delete incoming.gaussian; project.assetMetadata = incoming; }
    if (options.provenance) project.provenance = copy(options.provenance);
    if (options.title !== undefined) project.title = options.title;
    const contractHash = options.qualityContractHash || incoming.qualityContractHash;
    if (contractHash) project.qualityContractHash = contractHash;
    checkProject(project); freeze(project.asset); if (wrapped) freeze(project.assetMetadata);
    return project;
  }
  function withoutHash(project) {
    const { contentHash: ignored, hashProtocol: protocol, ...rest } = project;
    return rest;
  }
  async function digest(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    need(bytes.byteLength <= LIMITS.jsonBytes, 'Encoded JSON exceeds 64 MiB.', 'RESOURCE_LIMIT');
    const subtle = root.crypto?.subtle || (typeof require === 'function' ? require('node:crypto').webcrypto.subtle : null);
    need(subtle, 'SHA-256 requires WebCrypto.', 'CRYPTO_UNAVAILABLE');
    const hash = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
  }
  async function contentHash(project) { checkProject(project); return digest(withoutHash(project)); }
  async function sealProject(project) {
    checkProject(project);
    const sealed = copy(withoutHash(project));
    sealed.contentHash = await digest(sealed);
    sealed.hashProtocol = 'sha256_canonical_json_sorted_keys_utf8_v1';
    return freeze(sealed);
  }
  async function verifyProject(project) {
    const validity = validateProject(project); if (!validity.ok) return validity;
    if (!project.contentHash) return { ok: false, errors: ['Project has no integrity hash.'], code: 'MISSING_HASH' };
    if (await contentHash(project) !== project.contentHash) return { ok: false, errors: ['Project content hash does not match.'], code: 'HASH_MISMATCH' };
    return { ok: true, errors: [] };
  }
  async function serializeProject(project) { return JSON.stringify(await sealProject(project)); }
  async function parseProject(text) {
    need(typeof text === 'string' && text.length <= LIMITS.jsonBytes, 'Project JSON exceeds its budget.', 'RESOURCE_LIMIT');
    let project; try { project = JSON.parse(text); } catch (error) { fail('INVALID_JSON', 'Could not parse project JSON: ' + error.message); }
    checkProject(project); canonical(project);
    if (project.contentHash) {
      const verified = await verifyProject(project);
      need(verified.ok, verified.errors.join(' '), verified.code);
      return freeze(project);
    }
    return sealProject(project);
  }
  function applyEdits(project, patch) {
    checkProject(project); allowed(patch, ['exposure', 'contrast', 'saturation'], 'edit patch');
    const next = { ...withoutHash(project), edits: { ...project.edits, ...copy(patch) } };
    checkProject(next); return next;
  }
  function withView(project, patch) {
    checkProject(project); allowed(patch, ['width', 'height', 'roi'], 'view patch');
    const next = { ...withoutHash(project), view: { ...project.view, ...copy(patch) } };
    checkProject(next); return next;
  }

  function prepare(project, options) {
    checkProject(project);
    const view = { ...project.view, ...options.view };
    for (const key of ['width', 'height', 'roi']) if (options[key] !== undefined) view[key] = options[key];
    checkView(view);
    const { width: w, height: h, roi } = view, a = project.asset;
    const left = roi[0] * a.width, top = roi[1] * a.height;
    const dx = (roi[2] - roi[0]) * a.width / w, dy = (roi[3] - roi[1]) * a.height / h;
    need(Number.isFinite(dx) && Number.isFinite(dy) && dx > 0 && dy > 0, 'ROI sampling step is not representable.');
    const limit = options.limits?.supportVisits ?? LIMITS.supportVisits;
    need(Number.isSafeInteger(limit) && limit > 0 && limit <= LIMITS.supportVisits,
      'A caller may lower but cannot raise the support-visit budget.', 'RESOURCE_LIMIT');
    const bounds = new Int32Array(a.splats.length * 4), trigs = new Float64Array(a.splats.length * 2);
    let visits = 0;
    for (let i = 0; i < a.splats.length; i++) {
      if ((i & 1023) === 0 && options.shouldCancel?.()) fail('CANCELLED', 'Rendering cancelled.');
      const g = a.splats[i], c = Math.cos(g[4]), s = Math.sin(g[4]);
      const rx = 4 * Math.sqrt(g[2] * g[2] * c * c + g[3] * g[3] * s * s);
      const ry = 4 * Math.sqrt(g[2] * g[2] * s * s + g[3] * g[3] * c * c);
      // Clip both ends before Int32 storage. A tiny ROI must not wrap a faraway
      // Gaussian's bounds into a huge unintended loop after the budget check.
      const x0 = Math.min(w, Math.max(0, Math.ceil((g[0] - rx - left) / dx - .5)));
      const x1 = Math.max(-1, Math.min(w - 1, Math.floor((g[0] + rx - left) / dx - .5)));
      const y0 = Math.min(h, Math.max(0, Math.ceil((g[1] - ry - top) / dy - .5)));
      const y1 = Math.max(-1, Math.min(h - 1, Math.floor((g[1] + ry - top) / dy - .5)));
      visits += Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1);
      need(visits <= limit, 'Frame exceeds the support-visit budget; narrow the ROI or reduce output size.', 'RESOURCE_LIMIT');
      bounds.set([x0, x1, y0, y1], i * 4); trigs[i * 2] = c; trigs[i * 2 + 1] = s;
    }
    return { w, h, roi: roi.slice(), left, top, dx, dy, bounds, trigs, visits };
  }
  function coverageArray(asset) {
    if (!asset.alpha) return null;
    const out = new Uint8Array(asset.width * asset.height); let at = 0;
    for (let i = 0; i < asset.alpha.runs.length; i += 2) {
      out.fill(asset.alpha.runs[i], at, at + asset.alpha.runs[i + 1]); at += asset.alpha.runs[i + 1];
    }
    return out;
  }
  const linear = value => { const x = Math.max(0, Math.min(255, value)) / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; };
  const encoded = value => 255 * (value <= .0031308 ? 12.92 * value : 1.055 * Math.max(0, value) ** (1 / 2.4) - .055);

  function* renderSteps(project, options = {}) {
    const start = clock(), p = prepare(project, options), a = project.asset, n = p.w * p.h;
    const field = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { field[3 * i] = a.base[0]; field[3 * i + 1] = a.base[1]; field[3 * i + 2] = a.base[2]; }
    let evaluations = 0;
    yield { phase: 'prepared', fraction: 0, supportVisits: p.visits };
    for (let i = 0; i < a.splats.length; i++) {
      if (options.shouldCancel?.()) fail('CANCELLED', 'Rendering cancelled.');
      const g = a.splats[i], b = i * 4, c = p.trigs[i * 2], s = p.trigs[i * 2 + 1];
      for (let y = p.bounds[b + 2]; y <= p.bounds[b + 3]; y++) {
        const yy = p.top + (y + .5) * p.dy - g[1];
        for (let x = p.bounds[b]; x <= p.bounds[b + 1]; x++) {
          const xx = p.left + (x + .5) * p.dx - g[0];
          const u = (c * xx + s * yy) / g[2], v = (-s * xx + c * yy) / g[3], q = u * u + v * v;
          if (q > 16) continue;
          const weight = Math.exp(-.5 * q), at = (y * p.w + x) * 3;
          field[at] += g[5] * weight; field[at + 1] += g[6] * weight; field[at + 2] += g[7] * weight;
          evaluations++;
        }
      }
      if ((i & 255) === 255) yield { phase: 'functions', fraction: .9 * (i + 1) / a.splats.length,
        completedGaussians: i + 1, totalGaussians: a.splats.length };
    }
    const data = new Uint8ClampedArray(n * 4), alpha = coverageArray(a), edits = project.edits;
    const identity = edits.exposure === 0 && edits.contrast === 1 && edits.saturation === 1;
    const gain = 2 ** edits.exposure;
    for (let y = 0; y < p.h; y++) {
      if (options.shouldCancel?.()) fail('CANCELLED', 'Rendering cancelled.');
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x; let r = field[3 * i], g = field[3 * i + 1], b = field[3 * i + 2];
        if (!identity) {
          r = encoded(linear(r) * gain); g = encoded(linear(g) * gain); b = encoded(linear(b) * gain);
          r = (r - 127.5) * edits.contrast + 127.5; g = (g - 127.5) * edits.contrast + 127.5; b = (b - 127.5) * edits.contrast + 127.5;
          const luminance = .2126 * r + .7152 * g + .0722 * b;
          r = luminance + (r - luminance) * edits.saturation;
          g = luminance + (g - luminance) * edits.saturation;
          b = luminance + (b - luminance) * edits.saturation;
        }
        data[4 * i] = byte(r); data[4 * i + 1] = byte(g); data[4 * i + 2] = byte(b);
        if (alpha) {
          const ax = Math.min(a.width - 1, Math.floor(p.left + (x + .5) * p.dx));
          const ay = Math.min(a.height - 1, Math.floor(p.top + (y + .5) * p.dy));
          data[4 * i + 3] = alpha[ay * a.width + ax];
        } else data[4 * i + 3] = 255;
      }
      if ((y & 63) === 63) yield { phase: 'encoding', fraction: .9 + .1 * (y + 1) / p.h };
    }
    if (options.shouldCancel?.()) fail('CANCELLED', 'Rendering cancelled.');
    return { width: p.w, height: p.h, data, diagnostics: {
      engine: 'CRFQuality12', version: VERSION, renderer: 'direct_signed_anisotropic_gaussian_support_splat',
      elapsedMs: clock() - start, gaussianCount: a.splats.length, parameterCount: 3 + 8 * a.splats.length,
      supportVisits: p.visits, basisEvaluations: evaluations, supportVisitLimit: options.limits?.supportVisits ?? LIMITS.supportVisits,
      sourceWidth: a.width, sourceHeight: a.height, roi: p.roi, outputWidth: p.w, outputHeight: p.h,
      sampling: 'pixel_centres_in_source_plane', accumulation: 'float64_asset_order', cutoffSigma: 4,
      colorSpace: 'srgb_encoded_0_255', quantization: 'clamp_floor_value_plus_half',
      sourceRGBAtRender: false, sourceRGBBlit: false, colourRasterResampling: false, cachedColourField: false,
      referenceConditioned: true, novelSceneGeneration: false, superResolutionClaim: false,
      coverageSampling: alpha ? 'declared_rle8_point_coverage' : 'opaque_rectangle',
      editingModel: 'linear_exposure_then_display_contrast_and_saturation',
      contrastPivotSRGB8: 127.5, saturationLumaWeights: [.2126, .7152, .0722],
      physicalRelighting: false, qualityClaim: 'requires_separate_reference_evaluation'
    } };
  }
  function render(project, options = {}) {
    const iterator = renderSteps(project, options); let item = iterator.next();
    while (!item.done) { options.onProgress?.(item.value); item = iterator.next(); }
    return item.value;
  }
  async function renderAsync(project, options = {}) {
    const iterator = renderSteps(project, options); let item = iterator.next(), lastYield = clock();
    while (!item.done) {
      options.onProgress?.(item.value);
      if (clock() - lastYield >= 8 || item.value.phase === 'prepared') {
        await new Promise(resolve => setTimeout(resolve, 0)); lastYield = clock();
      }
      item = iterator.next();
    }
    return item.value;
  }
  function renderSourceCode(project) {
    checkProject(project);
    return '// The loaded project contains explicit Gaussian coefficients.\n' +
      '// No reference photograph is read by CRFQuality12.render.\n' +
      'const view = ' + JSON.stringify(project.view, null, 2) + ';\n' +
      'const edits = ' + JSON.stringify(project.edits, null, 2) + ';\n' +
      'const scene = CRFQuality12.applyEdits(CRFQuality12.withView(project, view), edits);\n' +
      'const frame = CRFQuality12.render(scene);\n' +
      'canvas.width = frame.width; canvas.height = frame.height;\n' +
      'canvas.getContext("2d").putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);';
  }
  return { VERSION, SCHEMA, ASSET_SCHEMA, LIMITS, canonical, digest, createProject, validateAsset, validateProject,
    contentHash, sealProject, verifyProject, serializeProject, parseProject, applyEdits, withView,
    render, renderAsync, renderSourceCode };
});
