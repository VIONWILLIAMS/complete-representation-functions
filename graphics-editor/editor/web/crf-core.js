/* CRF Street 0.4: dependency-free observed Gaussian fields and editable functions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRFCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.5.0';
  const STRIDE = 6;
  const PROTOTYPES = ['ellipse', 'rectangle', 'triangle', 'diamond', 'ring', 'apple', 'pear'];
  const OBJECT_PATHS = new Set(['transform', 'transform.x', 'transform.y', 'transform.z',
    'transform.scaleX', 'transform.scaleY', 'transform.rotation', 'color', 'color.tint',
    'color.amount', 'visible', 'opacity', 'depth', 'depthSlope', 'normal', 'exposure',
    'signalState', 'label', 'parent', 'generator', 'generator.seed', 'generator.shape', 'generator.roughness']);
  const CAMERA_KEYS = ['yaw', 'pitch', 'panX', 'panY', 'zoom'];
  const LIGHT_KEYS = ['exposure', 'azimuth', 'elevation', 'strength', 'temperature'];
  const cache = new WeakMap();
  const rad = x => x * Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const clone = x => JSON.parse(JSON.stringify(x));
  const finite = (x, a, b) => typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b;
  const idOK = x => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/.test(x);
  function need(ok, message) { if (!ok) throw new Error('CRF: ' + message); }
  function vector(x, length, low, high) { return Array.isArray(x) && x.length === length && x.every(v => finite(v, low, high)); }
  function onlyKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k)); }
  function trackValueValid(id, path, value) {
    if (id === '$camera') {
      const ranges = { yaw: [-180, 180], pitch: [-89, 89], panX: [-20000, 20000], panY: [-20000, 20000], zoom: [.05, 20] };
      return !!ranges[path] && finite(value, ...ranges[path]);
    }
    if (id === '$light') {
      const ranges = { exposure: [-6, 6], azimuth: [-3600, 3600], elevation: [-90, 90], strength: [0, 1], temperature: [-1, 1] };
      return !!ranges[path] && finite(value, ...ranges[path]);
    }
    if(path === 'generator.seed') return Number.isInteger(value) && finite(value,0,2147483647);
    if(path === 'generator.shape') return finite(value,-1,1);
    if(path === 'generator.roughness') return finite(value,.08,1);
    if (path === 'visible') return typeof value === 'boolean';
    if (path === 'signalState') return ['observed', 'stop', 'go'].includes(value);
    if (path === 'color.tint') return vector(value, 3, 0, 255);
    if (path === 'depthSlope') return vector(value, 2, -20, 20);
    if (path === 'normal') return vector(value, 3, -1, 1) && Math.hypot(...value) > 1e-6;
    const ranges = { 'transform.x': [-20000, 20000], 'transform.y': [-20000, 20000], 'transform.z': [-20000, 20000],
      'transform.scaleX': [.025, 20], 'transform.scaleY': [.025, 20], 'transform.rotation': [-3600, 3600],
      'color.amount': [0, 1], opacity: [0, 1], depth: [-20000, 20000], exposure: [-6, 6] };
    return !!ranges[path] && finite(value, ...ranges[path]);
  }
  function setPath(object, path, value) {
    const p = path.split('.');
    if (p.length === 1) object[p[0]] = clone(value);
    else { if(p[0]==='generator' && !object.generator) object.generator={seed:17,shape:0,roughness:.28}; object[p[0]][p[1]] = clone(value); }
  }
  function decodeBase64(encoded) {
    need(typeof encoded === 'string', 'missing base64 field');
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(encoded, 'base64'));
    const text = atob(encoded), result = new Uint8Array(text.length);
    for (let i = 0; i < text.length; ++i) result[i] = text.charCodeAt(i);
    return result;
  }
  function decodeData(data) {
    if (cache.has(data)) return cache.get(data).decoded;
    need(data && ['crf.scene.v0.4','crf.scene.v0.5'].includes(data.schema), 'unsupported scene schema');
    need(Number.isInteger(data.width) && Number.isInteger(data.height) && data.width > 0 && data.height > 0 && data.width * data.height <= 5000000, 'invalid scene dimensions');
    need(Array.isArray(data.objects) && data.objects.length > 0 && data.objects.length <= 256, 'invalid scene objects');
    const count = data.width * data.height;
    const rgb = decodeBase64(data.rgbBase64), labels = decodeBase64(data.labelsBase64);
    need(rgb.length === count * 3 && labels.length === count, 'RGB or label byte count differs from dimensions');
    const byIndex = new Map(), byId = new Map(), counts = new Map();
    for (const object of data.objects) {
      need(idOK(object.id) && !byId.has(object.id), 'duplicate or invalid source object ID');
      need(Number.isInteger(object.index) && object.index >= 0 && object.index <= 255 && !byIndex.has(object.index), 'duplicate or invalid label index');
      byIndex.set(object.index, object); byId.set(object.id, object); counts.set(object.index, 0);
    }
    for (let i = 0; i < count; ++i) {
      need(byIndex.has(labels[i]), 'pixel references an unknown object index');
      counts.set(labels[i], counts.get(labels[i]) + 1);
    }
    const indices = new Map(), offsets = new Map(), means = new Map();
    for (const object of data.objects) { indices.set(object.id, new Uint32Array(counts.get(object.index))); offsets.set(object.id, 0); means.set(object.id, [0, 0, 0]); }
    for (let i = 0; i < count; ++i) {
      const id = byIndex.get(labels[i]).id, offset = offsets.get(id), mean = means.get(id);
      indices.get(id)[offset] = i; offsets.set(id, offset + 1);
      for (let c = 0; c < 3; ++c) mean[c] += rgb[i * 3 + c];
    }
    for (const [id, mean] of means) for (let c = 0; c < 3; ++c) mean[c] /= Math.max(1, offsets.get(id));
    const decoded = { width: data.width, height: data.height, rgb, labels };
    for (const [input, output, channels] of [['backgroundRgbBase64', 'backgroundRgb', 3], ['backgroundLabelsBase64', 'backgroundLabels', 1], ['backgroundInferredMaskBase64', 'inferredMask', 1]]) {
      if (data[input] != null) { decoded[output] = decodeBase64(data[input]); need(decoded[output].length === count * channels, 'invalid ' + input + ' length'); }
    }
    need(!decoded.backgroundRgb || (decoded.backgroundLabels && decoded.inferredMask), 'inferred background requires host labels and explicit inference mask');
    const fillIndices = new Map();
    for (const object of data.objects) fillIndices.set(object.id, []);
    if (decoded.backgroundRgb) for (let i = 0; i < count; ++i) if (decoded.inferredMask[i] && decoded.backgroundLabels[i] !== labels[i]) {
      need(byIndex.has(decoded.backgroundLabels[i]), 'unknown inferred-background host');
      fillIndices.get(byIndex.get(decoded.backgroundLabels[i]).id).push(i);
    }
    if(data.boundaryMixture) {
      const mix=data.boundaryMixture, raw=decodeBase64(mix.indicesBase64);
      need(raw.length===mix.count*4 && byIndex.has(mix.hostIndex),'invalid boundary mixture indices/host');
      const pixelIndices=new Uint32Array(raw.buffer,raw.byteOffset,mix.count), fraction=decodeBase64(mix.backgroundFractionBase64), backgroundRGB=decodeBase64(mix.backgroundRgbBase64);
      need(fraction.length===mix.count && backgroundRGB.length===mix.count*3,'invalid boundary mixture payload');
      const offset=new Int32Array(count).fill(-1);
      for(let j=0;j<mix.count;j++){need(pixelIndices[j]<count && offset[pixelIndices[j]]===-1,'invalid/duplicate boundary pixel'); offset[pixelIndices[j]]=j;}
      decoded.boundaryMixture={pixelIndices,fraction,backgroundRGB,offset,hostIndex:mix.hostIndex,hostId:byIndex.get(mix.hostIndex).id};
    }
    cache.set(data, { decoded, byIndex, byId, indices, means, fillIndices, samples: new Map() });
    return decoded;
  }
  function dataCache(data) { decodeData(data); return cache.get(data); }
  function initialState(data) {
    decodeData(data);
    const relations = new Map((data.relations || []).filter(r => (r.type || r.kind || r.relation) === 'attached_to').map(r => [r.child, r.parent]));
    const state = { schema: 'crf.state.v0.5', width: data.width, height: data.height,
      objects: data.objects.map(o => ({ id: o.id, index: o.index, label: o.label || o.id,
        kind: o.kind || 'observed_surface', group: o.group || null, parent: o.parent || relations.get(o.id) || null,
        sourceId: o.id, bbox: clone(o.bbox), pivot: clone(o.pivot || [(o.bbox[0] + o.bbox[2]) / 2, (o.bbox[1] + o.bbox[3]) / 2]),
        depth: o.depth || 0, restDepth: o.depth || 0, depthSlope: clone(o.depthSlope || [0, 0]), normal: clone(o.normal || [0, 0, 1]),
        transform: { x: 0, y: 0, z: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        color: { tint: [255, 255, 255], amount: 0 }, exposure: 0, opacity: 1,
        visible: true, deleted: false, prototype: null, signalState: 'observed', generator: {seed:17,shape:0,roughness:.28} })),
      camera: { yaw: 0, pitch: 0, panX: 0, panY: 0, zoom: 1 },
      light: { exposure: 0, azimuth: 0, elevation: 45, strength: 0, temperature: 0 },
      timeline: { duration: 5, tracks: [] }, background: { mode: 'inferred', color: [26, 28, 32], highlightInferred: false } };
    assertState(state); return state;
  }
  function validateState(state) {
    const errors = [], check = (ok, message) => { if (!ok) errors.push(message); };
    try {
      check(state && ['crf.state.v0.4','crf.state.v0.5'].includes(state.schema), 'Unsupported state schema');
      if (!state || typeof state !== 'object') return { valid: false, errors };
      check(Number.isInteger(state.width) && Number.isInteger(state.height) && state.width > 0 && state.height > 0 && state.width * state.height <= 5000000, 'Invalid dimensions');
      check(Array.isArray(state.objects) && state.objects.length > 0 && state.objects.length <= 256, 'Objects must contain 1..256 entries');
      if (!Array.isArray(state.objects)) return { valid: false, errors };
      const ids = new Set(), indices = new Set(), byId = new Map();
      for (const o of state.objects) {
        check(o && idOK(o.id) && !ids.has(o.id), 'Invalid or duplicate object ID');
        if (!o || typeof o !== 'object') continue;
        ids.add(o.id); byId.set(o.id, o);
        check(Number.isInteger(o.index) && o.index >= 0 && o.index <= 65534 && !indices.has(o.index), 'Invalid or duplicate object index: ' + o.id); indices.add(o.index);
        check(o.sourceId === null || idOK(o.sourceId), 'Invalid sourceId: ' + o.id);
        check(typeof o.label === 'string' && o.label.length <= 160, 'Invalid object label: ' + o.id);
        check(vector(o.bbox, 4, -20000, 20000) && o.bbox[2] > o.bbox[0] && o.bbox[3] > o.bbox[1], 'Invalid bbox: ' + o.id);
        check(vector(o.pivot, 2, -20000, 20000), 'Invalid pivot: ' + o.id);
        check(finite(o.depth, -20000, 20000) && finite(o.restDepth, -20000, 20000), 'Invalid depth: ' + o.id);
        check(vector(o.depthSlope, 2, -20, 20), 'Invalid surface slope: ' + o.id);
        check(vector(o.normal, 3, -1, 1) && Math.hypot(...o.normal) > 1e-6, 'Invalid normal: ' + o.id);
        const tr = o.transform || {};
        check(onlyKeys(tr, ['x', 'y', 'z', 'scaleX', 'scaleY', 'rotation']) && finite(tr.x, -20000, 20000) && finite(tr.y, -20000, 20000) && finite(tr.z, -20000, 20000) && finite(tr.scaleX, .025, 20) && finite(tr.scaleY, .025, 20) && finite(tr.rotation, -3600, 3600), 'Invalid transform: ' + o.id);
        const color = o.color || {};
        check(onlyKeys(color, ['tint', 'amount']) && vector(color.tint, 3, 0, 255) && finite(color.amount, 0, 1), 'Invalid tint: ' + o.id);
        check(finite(o.exposure, -6, 6) && finite(o.opacity, 0, 1), 'Invalid exposure or opacity: ' + o.id);
        check(typeof o.visible === 'boolean' && typeof o.deleted === 'boolean', 'Invalid visibility: ' + o.id);
        check(o.parent === null || idOK(o.parent), 'Invalid parent: ' + o.id);
        check(o.prototype === null || PROTOTYPES.includes(o.prototype), 'Unregistered shape prototype: ' + o.id);
        if(o.generator !== undefined) check(onlyKeys(o.generator,['seed','shape','roughness']) && Number.isInteger(o.generator.seed) && finite(o.generator.seed,0,2147483647) && finite(o.generator.shape,-1,1) && finite(o.generator.roughness,.08,1), 'Invalid generator: '+o.id);
        check(['observed', 'stop', 'go'].includes(o.signalState), 'Unregistered signal state: ' + o.id);
      }
      for (const o of state.objects) if (o && o.id) {
        check(o.sourceId === null ? o.prototype !== null : (byId.has(o.sourceId) && byId.get(o.sourceId).sourceId === o.sourceId), 'Unknown source object field: ' + o.id);
        const visited = new Set([o.id]); let parent = o.parent;
        while (parent) { if (!byId.has(parent)) { errors.push('Unknown parent: ' + parent); break; } if (visited.has(parent)) { errors.push('Parent cycle: ' + o.id); break; } visited.add(parent); parent = byId.get(parent).parent; }
      }
      const c = state.camera || {};
      check(onlyKeys(c, CAMERA_KEYS) && finite(c.yaw, -180, 180) && finite(c.pitch, -89, 89) && finite(c.panX, -20000, 20000) && finite(c.panY, -20000, 20000) && finite(c.zoom, .05, 20), 'Invalid camera');
      const l = state.light || {};
      check(onlyKeys(l, LIGHT_KEYS) && finite(l.exposure, -6, 6) && finite(l.azimuth, -3600, 3600) && finite(l.elevation, -90, 90) && finite(l.strength, 0, 1) && finite(l.temperature, -1, 1), 'Invalid calibrated light');
      const b = state.background || {};
      check(onlyKeys(b, ['mode', 'color', 'highlightInferred']) && ['inferred', 'solid'].includes(b.mode) && vector(b.color, 3, 0, 255) && typeof b.highlightInferred === 'boolean', 'Invalid background policy');
      const t = state.timeline || {};
      check(finite(t.duration, .05, 120) && Array.isArray(t.tracks) && t.tracks.length <= 128, 'Invalid timeline');
      const trackTargets = new Set();
      if (Array.isArray(t.tracks)) for (const track of t.tracks) {
        const allowed = track.id === '$camera' ? CAMERA_KEYS : track.id === '$light' ? LIGHT_KEYS : (ids.has(track.id) ? [...OBJECT_PATHS].filter(p => !['parent', 'label', 'transform', 'color', 'generator'].includes(p)) : []);
        check(allowed.includes(track.path), 'Invalid animation target: ' + track.id + '/' + track.path);
        const trackTarget = track.id + '/' + track.path;
        check(!trackTargets.has(trackTarget), 'Duplicate animation target: ' + trackTarget); trackTargets.add(trackTarget);
        check(['linear', 'smooth', 'step', undefined].includes(track.interpolation), 'Invalid interpolation');
        check(Array.isArray(track.keyframes) && track.keyframes.length >= 1 && track.keyframes.length <= 256, 'Invalid keyframe count');
        let previous = -Infinity;
        if (Array.isArray(track.keyframes)) for (const key of track.keyframes) {
          check(finite(key.time, 0, t.duration) && key.time > previous, 'Keyframe times must be strictly increasing within duration'); previous = key.time;
          check(trackValueValid(track.id, track.path, key.value), 'Invalid or out-of-range keyframe value: ' + trackTarget);
        }
      }
    } catch (error) { errors.push('Malformed state: ' + error.message); }
    return { valid: errors.length === 0, errors };
  }
  function assertState(state) { const v = validateState(state); need(v.valid, v.errors.join('; ')); }
  function applyOperations(state, operations) {
    assertState(state); need(Array.isArray(operations) && operations.length <= 256, 'operations must be an array of at most 256 entries');
    const next = clone(state), find = id => { const o = next.objects.find(o => o.id === id); need(o, 'unknown object ' + id); return o; };
    for (const op of operations) {
      need(op && typeof op === 'object' && typeof op.op === 'string', 'invalid operation');
      switch (op.op) {
        case 'set': need(OBJECT_PATHS.has(op.path), 'unregistered object path ' + op.path); setPath(find(op.id), op.path, op.value); break;
        case 'setCamera': need(onlyKeys(op.values, CAMERA_KEYS), 'unknown camera field'); Object.assign(next.camera, clone(op.values)); break;
        case 'setLight': need(onlyKeys(op.values, LIGHT_KEYS), 'unknown light field'); Object.assign(next.light, clone(op.values)); break;
        case 'setBackground': need(onlyKeys(op.values, ['mode', 'color', 'highlightInferred']), 'unknown background field'); Object.assign(next.background, clone(op.values)); break;
        case 'setTimeline': next.timeline = clone(op.timeline); break;
        case 'delete': find(op.id).deleted = true; break;
        case 'reparent': find(op.id).parent = op.parent; break;
        case 'replace': { need(PROTOTYPES.includes(op.prototype), 'unregistered shape prototype'); const target=find(op.id); target.prototype = op.prototype; if(!target.generator) target.generator={seed:17,shape:0,roughness:.28}; break; }
        case 'duplicate': {
          const o = clone(find(op.id)); need(idOK(op.newId) && !next.objects.some(x => x.id === op.newId), 'duplicate needs a fresh valid ID');
          const offset = op.offset || [20, 20]; need(vector(offset, 2, -20000, 20000), 'invalid duplicate offset');
          o.id = op.newId; o.index = Math.max(...next.objects.map(x => x.index)) + 1; o.label += ' (copy)'; o.transform.x += offset[0]; o.transform.y += offset[1];
          o.deleted = false; next.objects.push(o); break;
        }
        case 'addPrototype': {
          need(idOK(op.id) && !next.objects.some(o => o.id === op.id), 'new prototype requires a fresh valid ID');
          need(PROTOTYPES.includes(op.prototype) && finite(op.x, -10000, 10000) && finite(op.y, -10000, 10000) && finite(op.width, 1, 4000) && finite(op.height, 1, 4000), 'invalid primitive bounds');
          const fruitPrototype=['apple','pear'].includes(op.prototype); const color = op.color || (op.prototype==='apple' ? [195,38,31] : op.prototype==='pear' ? [172,190,56] : [180,120,80]); need(vector(color, 3, 0, 255), 'invalid primitive color');
          next.objects.push({ id: op.id, index: Math.max(...next.objects.map(o => o.index)) + 1, label: op.label || op.id,
            kind: 'generated_prototype', group: null, parent: op.parent || null, sourceId: null,
            bbox: [op.x - op.width / 2, op.y - op.height / 2, op.x + op.width / 2, op.y + op.height / 2], pivot: [op.x, op.y],
            depth: op.depth === undefined ? 250 : op.depth, restDepth: op.depth === undefined ? 250 : op.depth,
            depthSlope: [0, 0], normal: [0, 0, 1], transform: { x: 0, y: 0, z: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            color: { tint: color, amount: op.color ? 1 : fruitPrototype ? 0 : 1 }, exposure: 0, opacity: 1, visible: true, deleted: false, prototype: op.prototype, signalState: 'observed', generator: {seed:17,shape:0,roughness:.28} }); break;
        }
        default: throw new Error('CRF: unregistered operation ' + op.op);
      }
    }
    assertState(next); return next;
  }
  function evaluateFrame(state, time) {
    assertState(state); need(finite(time === undefined ? 0 : time, 0, 86400), 'invalid frame time');
    const next = clone(state), t = clamp(time || 0, 0, state.timeline.duration);
    for (const track of state.timeline.tracks) {
      const keys = track.keyframes; let a = keys[0], b = keys[keys.length - 1];
      if (t <= a.time) b = a;
      else if (t >= b.time) a = b;
      else for (let i = 1; i < keys.length; ++i) if (t <= keys[i].time) { a = keys[i - 1]; b = keys[i]; break; }
      let f = b.time === a.time ? 0 : (t - a.time) / (b.time - a.time);
      if (track.interpolation === 'smooth') f = f * f * (3 - 2 * f);
      if (track.interpolation === 'step') f = f >= 1 ? 1 : 0;
      const lerp = (x, y) => typeof x === 'number' && typeof y === 'number' ? x + (y - x) * f : (f < 1 ? x : y);
      const value = Array.isArray(a.value) ? a.value.map((v, i) => lerp(v, b.value[i])) : lerp(a.value, b.value);
      const target = track.id === '$camera' ? next.camera : track.id === '$light' ? next.light : next.objects.find(o => o.id === track.id);
      setPath(target, track.path, value);
    }
    assertState(next); return next;
  }
  function project(point, state, dimensions) {
    need(vector(point, 3, -1000000, 1000000), 'invalid point');
    const c = state.camera, cy = Math.cos(rad(c.yaw)), sy = Math.sin(rad(c.yaw)), cp = Math.cos(rad(c.pitch)), sp = Math.sin(rad(c.pitch));
    const x = cy * point[0] + sy * point[2], z = -sy * point[0] + cy * point[2];
    const y = cp * point[1] - sp * z, depth = sp * point[1] + cp * z;
    const width = dimensions && dimensions.width || state.width, height = dimensions && dimensions.height || state.height;
    return { x: (state.width / 2 + x * c.zoom + c.panX) * width / state.width,
      y: (state.height / 2 - y * c.zoom + c.panY) * height / state.height, depth };
  }
  function hierarchy(state) {
    const byId = new Map(state.objects.map(o => [o.id, o])), output = new Map();
    function get(o) {
      if (output.has(o.id)) return output.get(o.id);
      const t = o.transform, c = Math.cos(rad(t.rotation)), s = Math.sin(rad(t.rotation));
      const a = [c * t.scaleX, -s * t.scaleY, s * t.scaleX, c * t.scaleY];
      let b = [o.pivot[0] + t.x - a[0] * o.pivot[0] - a[1] * o.pivot[1], o.pivot[1] + t.y - a[2] * o.pivot[0] - a[3] * o.pivot[1]];
      let depthShift = t.z, hidden = !o.visible || o.deleted;
      if (o.parent) {
        const parent = byId.get(o.parent), p = get(parent), local = a.slice();
        a[0] = p.a[0] * local[0] + p.a[1] * local[2]; a[1] = p.a[0] * local[1] + p.a[1] * local[3];
        a[2] = p.a[2] * local[0] + p.a[3] * local[2]; a[3] = p.a[2] * local[1] + p.a[3] * local[3];
        b = [p.a[0] * b[0] + p.a[1] * b[1] + p.b[0], p.a[2] * b[0] + p.a[3] * b[1] + p.b[1]];
        depthShift += p.depthShift + parent.depth - parent.restDepth; hidden = hidden || p.hidden;
      }
      const result = { a, b, depthShift, hidden }; output.set(o.id, result); return result;
    }
    for (const o of state.objects) get(o); return output;
  }
  function objectProjection(o, h, state, width, height) {
    const world = (u, v) => [h.a[0] * u + h.a[1] * v + h.b[0] - state.width / 2,
      state.height / 2 - h.a[2] * u - h.a[3] * v - h.b[1],
      o.depth + h.depthShift + o.depthSlope[0] * (u - o.pivot[0]) + o.depthSlope[1] * (v - o.pivot[1])];
    const p0 = project(world(0, 0), state, { width, height }), px = project(world(1, 0), state, { width, height }), py = project(world(0, 1), state, { width, height });
    return { m: [px.x - p0.x, py.x - p0.x, px.y - p0.y, py.y - p0.y], b: [p0.x, p0.y], z: [px.depth - p0.depth, py.depth - p0.depth, p0.depth] };
  }
  function lightFactors(object, state, h) {
    const l = state.light, n = object.normal, len = Math.hypot(...n), angle = Math.atan2(h.a[2], h.a[0]);
    const nx = (n[0] * Math.cos(angle) - n[1] * Math.sin(angle)) / len, ny = (n[0] * Math.sin(angle) + n[1] * Math.cos(angle)) / len, nz = n[2] / len;
    const az = rad(l.azimuth), el = rad(l.elevation), cosine = Math.max(0, nx * Math.cos(el) * Math.sin(az) + ny * Math.sin(el) + nz * Math.cos(el) * Math.cos(az));
    const reference = .2 + .8 * Math.max(0, nz * Math.cos(Math.PI / 4) + ny * Math.sin(Math.PI / 4));
    const directional = 1 + l.strength * ((.2 + .8 * cosine) / Math.max(.2, reference) - 1);
    const gain = Math.pow(2, l.exposure + object.exposure) * directional;
    return [gain * (1 + .15 * l.temperature), gain, gain * (1 - .15 * l.temperature)];
  }
  function shade(rgb, object, factors, inferred, highlight) {
    let r = rgb[0], g = rgb[1], b = rgb[2];
    const amount = object.color.amount;
    if (amount) {
      const tint = object.color.tint, luminance = .2126 * r + .7152 * g + .0722 * b;
      const targetLuma = Math.max(1, .2126 * tint[0] + .7152 * tint[1] + .0722 * tint[2]);
      r = r * (1 - amount) + tint[0] * luminance / targetLuma * amount;
      g = g * (1 - amount) + tint[1] * luminance / targetLuma * amount;
      b = b * (1 - amount) + tint[2] * luminance / targetLuma * amount;
    }
    r = clamp(r * factors[0], 0, 255); g = clamp(g * factors[1], 0, 255); b = clamp(b * factors[2], 0, 255);
    if (inferred && highlight) { r = .55 * r + .45 * 255; g *= .55; b = .55 * b + .45 * 210; }
    return [r, g, b];
  }
  function pointSegment(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, f = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(px - ax - f * dx, py - ay - f * dy); }
  function signalColor(rgb, u, v, object, original) {
    if (object.signalState !== 'go') return rgb;
    const box = original.bbox, panels = original.signalPanels;
    const upper = panels && panels.upper || [box[0] + .12 * (box[2] - box[0]), box[1] + .06 * (box[3] - box[1]), box[2] - .12 * (box[2] - box[0]), box[1] + .48 * (box[3] - box[1])];
    const lower = panels && panels.lower || [box[0] + .12 * (box[2] - box[0]), box[1] + .53 * (box[3] - box[1]), box[2] - .12 * (box[2] - box[0]), box[3] - .04 * (box[3] - box[1])];
    if (u >= upper[0] && u < upper[2] && v >= upper[1] && v < upper[3]) {
      const ux = (u - upper[0]) / (upper[2] - upper[0]), uy = (v - upper[1]) / (upper[3] - upper[1]);
      const redEmission = rgb[0] > 50 && rgb[0] > rgb[1] * 1.35 && rgb[0] > rgb[2] * 1.2;
      const brightGlyph = ux > .15 && ux < .85 && uy > .08 && uy < .92 && (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) > 75;
      if (redEmission || brightGlyph) return [Math.min(18, rgb[0] * .07), Math.min(18, rgb[1] * .1), Math.min(18, rgb[2] * .1)];
    }
    if (u >= lower[0] && u < lower[2] && v >= lower[1] && v < lower[3]) {
      const x = (u - lower[0]) / (lower[2] - lower[0]), y = (v - lower[1]) / (lower[3] - lower[1]);
      const head = Math.hypot(x - .54, y - .2) < .085;
      const lines = [[.52,.33,.45,.57],[.49,.38,.29,.49],[.5,.38,.69,.47],[.45,.57,.27,.83],[.45,.57,.66,.82]];
      if (head || lines.some(p => pointSegment(x, y, ...p) < .052)) return [28, 240, 122];
    }
    return rgb;
  }
  function primitiveInside(kind, x, y) {
    if (kind === 'rectangle') return Math.abs(x) <= 1 && Math.abs(y) <= 1;
    if (kind === 'ellipse') return x * x + y * y <= 1;
    if (kind === 'ring') return x * x + y * y <= 1 && x * x + y * y >= .48;
    if (kind === 'diamond') return Math.abs(x) + Math.abs(y) <= 1;
    return y >= -1 && y <= 1 && Math.abs(x) <= (y + 1) / 2;
  }
  function getSamples(data, object, step, includeInferred) {
    const c = dataCache(data), d = c.decoded;
    const key = JSON.stringify([object.sourceId, object.prototype, object.prototype ? object.bbox : null, object.signalState, step, includeInferred]);
    if (c.samples.has(key)) return c.samples.get(key);
    const array = [];
    const push = (u, v, rgb, inferred) => array.push(u, v, rgb[0], rgb[1], rgb[2], inferred);
    if (object.prototype) {
      const box = object.bbox, cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, rx = (box[2] - box[0]) / 2, ry = (box[3] - box[1]) / 2;
      const base = object.sourceId ? (c.means.get(object.sourceId) || [150, 150, 150]) : [150, 150, 150];
      for (let y = Math.floor(box[1]); y < box[3]; y += step) for (let x = Math.floor(box[0]); x < box[2]; x += step) {
        const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry;
        if (primitiveInside(object.prototype, nx, ny)) { const gain = .83 - .12 * nx - .1 * ny + .05 * Math.max(0, 1 - nx * nx - ny * ny); push(x + .5, y + .5, base.map(v => clamp(v * gain, 0, 255)), 0); }
      }
    } else {
      need(object.sourceId && c.byId.has(object.sourceId), 'object refers to unknown source field ' + object.sourceId);
      const original = c.byId.get(object.sourceId);
      for (const i of c.indices.get(object.sourceId)) {
        const x = i % d.width, y = Math.floor(i / d.width);
        if (x % step || y % step) continue;
        let rgb = [d.rgb[i * 3], d.rgb[i * 3 + 1], d.rgb[i * 3 + 2]];
        if (object.signalState !== 'observed' && object.sourceId.startsWith('signal.')) rgb = signalColor(rgb, x + .5, y + .5, object, original);
        push(x + .5, y + .5, rgb, 0);
      }
      if (includeInferred && d.backgroundRgb) for (const i of c.fillIndices.get(object.sourceId)) {
        const x = i % d.width, y = Math.floor(i / d.width);
        if (x % step || y % step) continue;
        push(x + .5, y + .5, [d.backgroundRgb[i * 3], d.backgroundRgb[i * 3 + 1], d.backgroundRgb[i * 3 + 2]], 1);
      }
    }
    const result = { key, values: new Float32Array(array), count: array.length / STRIDE };
    c.samples.set(key, result); return result;
  }
  function applyBoundaryMaterials(data,object,samples,state,factors,transforms) {
    const d=decodeData(data), mix=d.boundaryMixture;
    if(!mix || object.prototype || object.sourceId===mix.hostId) return {samples,alreadyShaded:false,boundaryCount:0};
    const host=state.objects.find(o=>o.id===mix.hostId); if(!host) return {samples,alreadyShaded:false,boundaryCount:0};
    const hf=lightFactors(host,state,transforms.get(host.id));
    if(object.color.amount===host.color.amount && object.color.tint.every((v,i)=>v===host.color.tint[i]) && factors.every((v,i)=>Math.abs(v-hf[i])<1e-12)) return {samples,alreadyShaded:false,boundaryCount:0};
    let count=0; const original=samples.values;
    for(let j=0;j<original.length;j+=STRIDE) if(!original[j+5]) {const p=Math.floor(original[j+1])*d.width+Math.floor(original[j]);if(mix.offset[p]>=0)count++;}
    if(!count) return {samples,alreadyShaded:false,boundaryCount:0};
    const values=new Float32Array(original);
    for(let j=0;j<values.length;j+=STRIDE) {
      const output=shade([original[j+2],original[j+3],original[j+4]],object,factors,original[j+5],state.background.highlightInferred);
      const p=Math.floor(original[j+1])*d.width+Math.floor(original[j]), k=original[j+5] ? -1 : mix.offset[p];
      if(k>=0) {
        const B=[mix.backgroundRGB[k*3],mix.backgroundRGB[k*3+1],mix.backgroundRGB[k*3+2]], beta=mix.fraction[k]/255;
        const old=shade(B,object,factors,false,false), replacement=shade(B,host,hf,false,false);
        for(let c=0;c<3;c++) output[c]=clamp(output[c]+beta*(replacement[c]-old[c]),0,255);
      }
      values[j+2]=output[0];values[j+3]=output[1];values[j+4]=output[2];
    }
    return {samples:{...samples,key:'boundary-dynamic:'+object.id+':'+samples.key,values,dynamic:true},alreadyShaded:true,boundaryCount:count};
  }
  function getFruitModule() {
    const fruit=typeof module==='object' && module.exports ? require('./crf-fruit.js') : globalThis.CRFFruit;
    need(fruit && typeof fruit.prepareLayer==='function','load crf-fruit.js for fruit prototypes'); return fruit;
  }
  function gaussianCovariance(matrix, sigma, cutoff, minimumVariance) {
    const m = matrix, variance = sigma * sigma;
    const xx = variance * (m[0] * m[0] + m[1] * m[1]) + minimumVariance;
    const xy = variance * (m[0] * m[2] + m[1] * m[3]);
    const yy = variance * (m[2] * m[2] + m[3] * m[3]) + minimumVariance;
    const determinant = Math.max(1e-16, xx * yy - xy * xy);
    return { xx, xy, yy, inverse: [yy / determinant, -xy / determinant, xx / determinant], radius: [cutoff * Math.sqrt(xx), cutoff * Math.sqrt(yy)], cutoff };
  }
  function prepareFrame(data, state, options) {
    const opt = options || {}, decoded = decodeData(data); assertState(state);
    need(state.width === decoded.width && state.height === decoded.height, 'state and source dimensions differ');
    const evaluated = opt.time === null ? clone(state) : evaluateFrame(state, opt.time === undefined ? 0 : opt.time);
    const width = opt.width || decoded.width, height = opt.height || decoded.height;
    need(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height <= 16000000, 'invalid output dimensions');
    const quality = opt.quality || 'exact'; need(['exact', 'interactive'].includes(quality), 'unknown rendering quality');
    const step = quality === 'exact' ? 1 : (opt.lod || 2); need(Number.isInteger(step) && step >= 1 && step <= 8, 'LOD must be an integer from 1 to 8');
    const isNative = width === state.width && height === state.height;
    const sigma = quality === 'exact' && isNative ? .18 : Math.max(.18, step * .62, .45 * Math.max(state.width / width, state.height / height));
    const cutoff = quality === 'exact' && isNative ? .49 / .18 : 2.6;
    const h = hierarchy(evaluated), layers = []; let minDepth = Infinity, maxDepth = -Infinity, splatCount = 0, inferredCount = 0, boundaryMaterialCount=0, proceduralCount=0;
    for (const object of evaluated.objects) {
      const transform = h.get(object.id); if (transform.hidden || object.opacity === 0) continue;
      if(['apple','pear'].includes(object.prototype)) {
        const generated=getFruitModule().prepareLayer(object,transform,evaluated,{width,height,step});
        const addLayer=(samples,underlay)=>{
          if(!samples || !samples.count)return;
          let lo=Infinity,hi=-Infinity;for(const z of samples.depths){lo=Math.min(lo,z);hi=Math.max(hi,z);}
          minDepth=Math.min(minDepth,lo);maxDepth=Math.max(maxDepth,hi);
          const generatedObject=underlay ? {...object,opacity:1} : object;
          const projection={m:[1,0,0,1],b:[0,0],z:[0,0,0]};
          layers.push({object:generatedObject,samples,projection,covariance:gaussianCovariance([1,0,0,1],samples.sigmaPx||.8,2.6,.02),factors:[1,1,1],depth:samples.sortDepth===undefined?(lo+hi)/2:samples.sortDepth,alreadyShaded:true,coverageAlpha:true,procedural:true});
          splatCount+=samples.count;proceduralCount+=samples.count;
        };
        if(data.metadata && data.metadata.proceduralStudio)addLayer(generated.underlay,true);
        addLayer(generated,false);continue;
      }
      let samples = getSamples(data, object, step, evaluated.background.mode === 'inferred');
      if (!samples.count) continue;
      const projection = objectProjection(object, transform, evaluated, width, height);
      const covariance = gaussianCovariance(projection.m, sigma, cutoff, quality === 'interactive' ? .02 : 1e-12);
      const b = object.bbox, corners = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]];
      for (const [u, v] of corners) { const z = projection.z[0] * u + projection.z[1] * v + projection.z[2]; minDepth = Math.min(minDepth, z); maxDepth = Math.max(maxDepth, z); }
      const depth = projection.z[0] * object.pivot[0] + projection.z[1] * object.pivot[1] + projection.z[2];
      const factors=lightFactors(object,evaluated,transform), material=applyBoundaryMaterials(data,object,samples,evaluated,factors,h);
      samples=material.samples;boundaryMaterialCount+=material.boundaryCount;
      layers.push({ object, samples, projection, covariance, factors, depth, alreadyShaded:material.alreadyShaded });
      splatCount += samples.count;
      for (let i = 5; i < samples.values.length; i += STRIDE) if (samples.values[i]) ++inferredCount;
    }
    layers.sort((a, b) => a.depth - b.depth || a.object.index - b.object.index);
    return { state: evaluated, width, height, quality, step, sigma, cutoff, layers, minDepth: Number.isFinite(minDepth) ? minDepth - 100 : -1000,
      maxDepth: Number.isFinite(maxDepth) ? maxDepth + 100 : 1000, stats: { backend: 'cpu-gaussian', quality, width, height, lod: step, sigmaReferencePx: sigma,
        gaussianCount: splatCount, inferredGaussianCount: inferredCount, observedPixelCount: decoded.width * decoded.height, layerCount: layers.length,
        representation: 'dense-observation-gaussians-with-inferred-layer-depths', physicalRelighting: false, sourceImageBlit: false, boundaryMaterialSampleCount:boundaryMaterialCount, proceduralSampleCount:proceduralCount } };
  }
  function CPUrender(data, state, options) {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now(), frame = prepareFrame(data, state, options);
    const { width, height } = frame, size = width * height;
    const rgba = new Uint8ClampedArray(size * 4), ids = new Int32Array(size).fill(-1), zbuffer = new Float64Array(size).fill(-Infinity), inferred = new Uint8Array(size);
    const background = frame.state.background.color;
    for (let i = 0; i < size; ++i) { rgba[i * 4] = background[0]; rgba[i * 4 + 1] = background[1]; rgba[i * 4 + 2] = background[2]; rgba[i * 4 + 3] = 255; }
    let contributions = 0;
    for (const layer of frame.layers) {
      const { object, samples, projection, covariance, factors } = layer, values = samples.values, m = projection.m, b = projection.b, zv = projection.z;
      const [radiusX, radiusY] = covariance.radius, inverse = covariance.inverse, cutoffSquared = covariance.cutoff * covariance.cutoff;
      let left = width, top = height, right = -1, bottom = -1;
      for (let i = 0; i < values.length; i += STRIDE) { const x = m[0] * values[i] + m[1] * values[i + 1] + b[0], y = m[2] * values[i] + m[3] * values[i + 1] + b[1]; left = Math.min(left, Math.ceil(x - radiusX - .5)); right = Math.max(right, Math.floor(x + radiusX - .5)); top = Math.min(top, Math.ceil(y - radiusY - .5)); bottom = Math.max(bottom, Math.floor(y + radiusY - .5)); }
      left = Math.max(0, left); top = Math.max(0, top); right = Math.min(width - 1, right); bottom = Math.min(height - 1, bottom);
      if (left > right || top > bottom) continue;
      const rowWidth = right - left + 1, area = rowWidth * (bottom - top + 1);
      const sums = new Float64Array(area * 6);
      for (let i = 0; i < values.length; i += STRIDE) {
        const u = values[i], v = values[i + 1], x = m[0] * u + m[1] * v + b[0], y = m[2] * u + m[3] * v + b[1], z = samples.depths ? samples.depths[i/STRIDE] : zv[0] * u + zv[1] * v + zv[2];
        const x0 = Math.max(left, Math.ceil(x - radiusX - .5)), x1 = Math.min(right, Math.floor(x + radiusX - .5)), y0 = Math.max(top, Math.ceil(y - radiusY - .5)), y1 = Math.min(bottom, Math.floor(y + radiusY - .5));
        if (x0 > x1 || y0 > y1) continue;
        const color = layer.alreadyShaded ? [values[i+2],values[i+3],values[i+4]] : shade([values[i + 2], values[i + 3], values[i + 4]], object, factors, values[i + 5], frame.state.background.highlightInferred);
        for (let py = y0; py <= y1; ++py) for (let px = x0; px <= x1; ++px) {
          const dx = px + .5 - x, dy = py + .5 - y, distance = inverse[0] * dx * dx + 2 * inverse[1] * dx * dy + inverse[2] * dy * dy;
          if (distance > cutoffSquared) continue;
          const weight = Math.exp(-.5 * distance), p = ((py - top) * rowWidth + px - left) * 6;
          sums[p] += weight; sums[p + 1] += color[0] * weight; sums[p + 2] += color[1] * weight; sums[p + 3] += color[2] * weight; sums[p + 4] += z * weight; sums[p + 5] += values[i + 5] * weight; ++contributions;
        }
      }
      for (let py = top; py <= bottom; ++py) for (let px = left; px <= right; ++px) {
        const p = ((py - top) * rowWidth + px - left) * 6, weight = sums[p]; if (weight < 1e-10) continue;
        const output = py * width + px, depth = sums[p + 4] / weight; if (depth < zbuffer[output] - 1e-7) continue;
        const alpha = object.opacity * (frame.quality === 'exact' && !layer.coverageAlpha ? 1 : Math.min(1, weight * 2));
        if(samples.blendMode==='multiply') {
          for(let c=0;c<3;c++)rgba[output*4+c]=Math.round(rgba[output*4+c]*(1-alpha+alpha*clamp(sums[p+1+c]/weight/255,0,1)));
          continue;
        }
        for (let c = 0; c < 3; ++c) rgba[output * 4 + c] = Math.round((sums[p + 1 + c] / weight) * alpha + rgba[output * 4 + c] * (1 - alpha));
        zbuffer[output] = depth; ids[output] = object.index; inferred[output] = sums[p + 5] > weight * .5 ? 1 : 0;
      }
    }
    frame.stats.contributions = contributions; frame.stats.visibleInferredPixels = inferred.reduce((a, b) => a + b, 0);
    frame.stats.elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    return { width, height, rgba, ids, inferred, stats: frame.stats };
  }
  return { VERSION, PROTOTYPES: PROTOTYPES.slice(), initialState, decodeData, validateState, applyOperations, project, evaluateFrame, CPUrender,
    _internals: { STRIDE, prepareFrame, shade, gaussianCovariance, objectProjection, getSamples } };
});
