/* CRF 0.5: deterministic parametric fruit surfaces. No photographs, textures,
 * meshes, trained model, canvas blits, or Blender are used by this module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRFFruit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '0.5.0', TAU = Math.PI * 2, STUDIO_DEPTH = -100;
  const cache = new Map();
  let cacheBytes = 0;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, f) => a + (b - a) * f;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const norm = (x, y, z) => { const n = Math.hypot(x, y, z) || 1; return [x / n, y / n, z / n]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rad = x => x * Math.PI / 180;
  function hash(x, y, z, seed) {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  }
  function noise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const a = mix(hash(ix, iy, iz, seed), hash(ix + 1, iy, iz, seed), fx);
    const b = mix(hash(ix, iy + 1, iz, seed), hash(ix + 1, iy + 1, iz, seed), fx);
    const c = mix(hash(ix, iy, iz + 1, seed), hash(ix + 1, iy, iz + 1, seed), fx);
    const d = mix(hash(ix, iy + 1, iz + 1, seed), hash(ix + 1, iy + 1, iz + 1, seed), fx);
    return mix(mix(a, b, fy), mix(c, d, fy), fz);
  }
  function parameters(object) {
    const g = object.generator || {};
    return { seed: Number.isInteger(g.seed) ? g.seed : 17,
      shape: clamp(Number(g.shape) || 0, -1, 1),
      roughness: clamp(g.roughness == null ? .28 : Number(g.roughness), .08, 1) };
  }
  function surface(kind, theta, phi, shape) {
    const y = Math.cos(theta), s = Math.sin(theta);
    let r, vertical;
    if (kind === 'pear') {
      const neck = 1 - (.43 + shape * .05) * Math.exp(-Math.pow((y - .58) / .29, 2));
      r = s * (.75 - .43 * y + shape * .08 * (1 - y)) * neck;
      r *= 1.12 * (1 + .015 * Math.cos(5 * phi + .6) * s);
      vertical = y + .035 * Math.sin(theta * 2);
    } else {
      r = s * (1.0 + .065 * y + .025 * Math.cos(theta * 2));
      r *= 1 + (.024 + shape * .018) * Math.cos(5 * phi + .4) * (.25 + .75 * Math.abs(y));
      r *= 1 + shape * .075 * Math.sin(theta);
      vertical = y - .105 * Math.exp(-Math.pow(s / .25, 2)) * (y > 0 ? 1 : -.28);
    }
    return [r * Math.cos(phi), vertical, r * Math.sin(phi)];
  }
  function material(kind, p, theta, phi, seed) {
    const x = p[0], y = p[1], z = p[2];
    const broad = noise(x * 3.4 + 3, y * 4.1, z * 3.4, seed);
    const mottled = noise(x * 15, y * 15, z * 15, seed + 7);
    const fine = noise(x * 85, y * 85, z * 85, seed + 83);
    const pores = hash(Math.floor(x * 135), Math.floor(y * 135), Math.floor(z * 135), seed + 31);
    if (kind === 'pear') {
      const warm = smooth((broad - .24) * 1.45);
      let c = [mix(112, 190, warm), mix(138, 178, warm), mix(32, 59, warm)];
      const blush = Math.pow(Math.max(0, x * .65 + z * .4), 2) * .2;
      c = c.map((v, i) => mix(v, [184, 99, 39][i], blush));
      const d = (mottled - .5) * 18 + (fine - .5) * 5;
      if (pores > .985) c = c.map(v => v * .55);
      return c.map(v => clamp(v + d, 0, 255));
    }
    const stripe = .5 + .5 * Math.sin(phi * 43 + y * 5.1 + noise(x * 8, y * 9, z * 8, seed + 9) * 11);
    const broken = smooth((noise(x * 19, y * 27, z * 19, seed + 64) - .24) * 2.2);
    const fleck = Math.pow(stripe, 5 + broad * 13) * broken * (.065 + broad * .09);
    const rosy = smooth((broad - .25) * 1.9);
    let c = [mix(133, 202, rosy), mix(18, 40, rosy), mix(24, 38, rosy)];
    c = c.map((v, i) => mix(v, [235, 115, 53][i], fleck));
    const d = (mottled - .5) * 12 + (fine - .5) * 4;
    if (pores > .988 && Math.abs(y) < .88) c = c.map((v, i) => mix(v, [229, 170, 113][i], .48));
    return c.map(v => clamp(v + d, 0, 255));
  }
  /* Local samples hold x/right, y/up, z/front. Normals are derived from the
   * actual deformed surface rather than a painted lighting approximation. */
  function geometry(object, step) {
    const p = parameters(object), box = object.bbox;
    const w = box[2] - box[0], h = box[3] - box[1], kind = object.prototype;
    const key = JSON.stringify([kind, w, h, p.seed, p.shape, step]);
    if (cache.has(key)) return cache.get(key);
    const rx = w * .47, ry = h * .385, rz = rx * .91;
    const cy = h * .585, arr = [];
    const append = (pos, normal, color, part) => arr.push(...pos, ...normal, ...color, part);
    // A bounded procedural sample budget keeps large edits usable. Projection
    // scales the Gaussian footprint with the chosen sampling distance.
    const spacing = Math.max(.6, step * .86, Math.sqrt(4 * Math.PI * rx * Math.max(ry, rz) / 400000));
    const latitudes = Math.max(30, Math.ceil(ry * Math.PI / spacing));
    for (let row = 0; row <= latitudes; ++row) {
      const t = (row + .25) / (latitudes + .5) * Math.PI;
      const radial = Math.hypot(...surface(kind, t, 0, p.shape).filter((_, i) => i !== 1));
      const longitudes = Math.max(10, Math.ceil(TAU * rx * radial / spacing));
      for (let col = 0; col < longitudes; ++col) {
        const phi = TAU * (col + (row % 2) * .5) / longitudes;
        const s = surface(kind, t, phi, p.shape), a = surface(kind, t + .0004, phi, p.shape), b = surface(kind, t, phi + .0004, p.shape);
        const da = [(a[0] - s[0]) * rx, (a[1] - s[1]) * ry, (a[2] - s[2]) * rz];
        const db = [(b[0] - s[0]) * rx, (b[1] - s[1]) * ry, (b[2] - s[2]) * rz];
        let n = norm(da[1] * db[2] - da[2] * db[1], da[2] * db[0] - da[0] * db[2], da[0] * db[1] - da[1] * db[0]);
        if (dot(n, s) < 0) n = n.map(v => -v);
        append([s[0] * rx, -cy + s[1] * ry, s[2] * rz], n, material(kind, s, t, phi, p.seed), 0);
      }
    }
    const top = -cy + surface(kind, .001, 0, p.shape)[1] * ry;
    const stemLength = h * (kind === 'pear' ? .145 : .105), stemRadius = Math.max(1.5, w * .014);
    const stemRows = Math.max(12, Math.ceil(stemLength / spacing));
    const stemCols = Math.max(12, Math.ceil(TAU * stemRadius / spacing));
    for (let i = 0; i <= stemRows; ++i) {
      const t = i / stemRows, radius = stemRadius * (1 - .2 * t);
      for (let j = 0; j < stemCols; ++j) {
        const angle = TAU * j / stemCols, striation = .7 + .3 * Math.sin(angle * 8 + t * 1.7);
        append([w * .026 * t + radius * Math.cos(angle), top + t * stemLength, w * .015 + radius * Math.sin(angle)],
          norm(Math.cos(angle), -.05, Math.sin(angle)), [76 + 27 * striation, 43 + 22 * striation, 23 + 12 * striation], 1);
      }
    }
    // A softly folded lanceolate leaf with a central vein and oblique ribs.
    const leafLength = w * (kind === 'pear' ? .28 : .33), leafWidth = w * .095;
    const leafRows = Math.max(15, Math.ceil(leafLength / spacing));
    for (let i = 0; i <= leafRows; ++i) {
      const t = (i + .15) / (leafRows + .3), half = Math.pow(Math.sin(Math.PI * t), .82) * leafWidth;
      const cross = Math.max(3, Math.ceil(2 * half / spacing));
      for (let j = 0; j <= cross; ++j) {
        const s = (j / cross - .5) * 2, rib = Math.abs(Math.sin((t * 8 - Math.abs(s) * .6) * Math.PI));
        const vein = Math.abs(s) < .055 || rib < .09;
        const green = vein ? [83, 118, 37] : [35, 83, 30];
        const shade = .93 + .12 * noise(t * 19, s * 8, 2, p.seed);
        append([w * .012 + t * leafLength, top + stemLength * .62 + t * leafLength * .17 + s * half * .88,
          w * .02 + Math.sin(t * Math.PI) * leafLength * .17 - Math.abs(s) * half * .23],
          norm(-.1, .2 * s, 1), green.map(v => v * shade), 2);
      }
    }
    const result = { key, values: new Float32Array(arr), count: arr.length / 10, spacing, bottom: -cy - ry * (kind === 'apple' ? .97 : 1), rx, ry, rz };
    while (cache.size && (cache.size >= 16 || cacheBytes + result.values.byteLength > 48 * 1024 * 1024)) {
      const oldest = cache.keys().next().value; cacheBytes -= cache.get(oldest).values.byteLength; cache.delete(oldest);
    }
    cache.set(key, result); cacheBytes += result.values.byteLength; return result;
  }
  function studioBackdrop(x, y, width, height) {
    const u = x / width, v = y / height;
    const glow = Math.exp(-((u - .33) ** 2 / .35 + (v - .30) ** 2 / .24));
    const floor = smooth((v - .5) * 2.7);
    const vignette = Math.pow(Math.abs(u - .5) * 1.7, 2) * 10;
    const level = 196 + glow * 27 + floor * 18 - vignette;
    return [level * .965, level * .985, level];
  }
  function encodeBytes(value) {
    if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('base64');
    let text = ''; const chunk = 8192;
    for (let i = 0; i < value.length; i += chunk) text += String.fromCharCode.apply(null, value.subarray(i, i + chunk));
    return btoa(text);
  }
  function studioOps(options) {
    const w = options && options.width || 800, h = options && options.height || 600, sx = w / 800, sy = h / 600;
    return [
      { op: 'addPrototype', id: 'apple.main', label: '程序生成苹果', prototype: 'apple', x: 277 * sx, y: 332 * sy, width: 278 * sx, height: 340 * sy, depth: 115 * sx },
      { op: 'set', id: 'apple.main', path: 'color.amount', value: 0 },
      { op: 'set', id: 'apple.main', path: 'generator', value: { seed: 17, shape: -.05, roughness: .26 } },
      { op: 'addPrototype', id: 'pear.main', label: '程序生成梨子', prototype: 'pear', x: 534 * sx, y: 300 * sy, width: 235 * sx, height: 404 * sy, depth: 70 * sx },
      { op: 'set', id: 'pear.main', path: 'color.amount', value: 0 },
      { op: 'set', id: 'pear.main', path: 'generator', value: { seed: 43, shape: .15, roughness: .43 } }
    ];
  }
  function createStudioData(options) {
    const o = options || {}, width = o.width || 800, height = o.height || 600;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width * height > 5000000) throw new Error('Invalid studio dimensions');
    const rgb = new Uint8Array(width * height * 3), zero = new Uint8Array(width * height);
    for (let y = 0; y < height; ++y) for (let x = 0; x < width; ++x) {
      const c = studioBackdrop(x + .5, y + .5, width, height);
      for (let k = 0; k < 3; ++k) rgb[(y * width + x) * 3 + k] = Math.round(c[k]);
    }
    return { schema: 'crf.scene.v0.5', width, height, rgbBase64: encodeBytes(rgb), labelsBase64: encodeBytes(zero),
      objects: [{ id: 'studio.backdrop', index: 0, label: '程序生成摄影背景', kind: 'procedural_studio_background', group: '摄影棚', parent: null,
        bbox: [0, 0, width, height], pivot: [width / 2, height / 2], depth: STUDIO_DEPTH, depthSlope: [0, 0], normal: [0, 0, 1] }],
      relations: [], source: { type: 'procedural_code', generator: 'CRFFruit.createStudioData', version: VERSION, seed: o.seed || 17 },
      metadata: { proceduralStudio: true, observedPhoto: false, generator: 'parametric_3d_surfaces_plus_gaussian_splatting', noExternalTexture: true },
      initialOps: studioOps({ width, height }) };
  }
  function prepareLayer(object, transform, state, options) {
    if (!['apple', 'pear'].includes(object.prototype)) throw new Error('Unknown fruit prototype');
    const opt = options || {}, width = opt.width || state.width, height = opt.height || state.height, step = opt.step || 1;
    const shape = geometry(object, step), p = parameters(object), values = shape.values;
    const camera = state.camera, cy = Math.cos(rad(camera.yaw)), sy = Math.sin(rad(camera.yaw)), cp = Math.cos(rad(camera.pitch)), sp = Math.sin(rad(camera.pitch));
    const h = transform || { a: [1, 0, 0, 1], b: [0, 0], depthShift: 0 };
    const a = h.a, b = h.b, worldScaleZ = Math.sqrt(Math.abs(a[0] * a[3] - a[1] * a[2]));
    const box = object.bbox, centerX = (box[0] + box[2]) / 2, topY = box[1];
    const sx = width / state.width, syScreen = height / state.height;
    const view = [-sy * cp, sp, cy * cp];
    const l = state.light, lightMix = l.strength || 0;
    const az = rad(l.azimuth), el = rad(l.elevation);
    const defaultLight = norm(-.60, .73, .57), selectedLight = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const light = norm(...defaultLight.map((v, i) => mix(v, selectedLight[i], lightMix)));
    const half = norm(light[0] + view[0], light[1] + view[1], light[2] + view[2]);
    const exposure = Math.pow(2, (l.exposure || 0) + (object.exposure || 0)), temperature = l.temperature || 0;
    const out = [], depths = [];
    const projectLocal = (u, v, z) => {
      const x0 = a[0] * u + a[1] * v + b[0] - state.width / 2;
      const y0 = state.height / 2 - a[2] * u - a[3] * v - b[1];
      const z0 = object.depth + h.depthShift + z * worldScaleZ;
      const x1 = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0;
      return [(state.width / 2 + x1 * camera.zoom + camera.panX) * sx,
        (state.height / 2 - (cp * y0 - sp * z1) * camera.zoom + camera.panY) * syScreen,
        sp * y0 + cp * z1];
    };
    for (let i = 0; i < values.length; i += 10) {
      const part = values[i + 9];
      // Inverse transpose of the in-plane object transform; z has its own scale.
      const det = a[0] * a[3] - a[1] * a[2];
      const n = norm((a[3] * values[i + 3] + a[2] * values[i + 4]) / det,
        (a[1] * values[i + 3] + a[0] * values[i + 4]) / det, values[i + 5] / Math.max(.001, worldScaleZ));
      if (dot(n, view) < .003) continue;
      const q = projectLocal(centerX + values[i], topY - values[i + 1], values[i + 2]);
      if (q[0] < -5 || q[1] < -5 || q[0] > width + 5 || q[1] > height + 5) continue;
      const diffuse = Math.max(0, dot(n, light));
      const fill = Math.max(0, dot(n, norm(.65, .1, .5)));
      const ambient = .18 + .16 * (n[1] + 1) / 2;
      const illumination = ambient + .69 * diffuse + .12 * fill;
      const rough = part === 0 ? p.roughness : .65;
      const specular = Math.pow(Math.max(0, dot(n, half)), mix(150, 12, rough)) * (part === 0 ? mix(.55, .12, rough) : .08);
      const wideHighlight = Math.pow(Math.max(0, dot(n, half)), 6) * (part === 0 ? .045 : 0);
      const fresnel = Math.pow(1 - Math.max(0, dot(n, view)), 4) * .055;
      let base = [values[i + 6], values[i + 7], values[i + 8]];
      if (part === 0 && object.color && object.color.amount) {
        const amount = object.color.amount, tint = object.color.tint;
        const luminance = .2126 * base[0] + .7152 * base[1] + .0722 * base[2];
        const native = object.prototype === 'apple' ? 60 : 146;
        base = base.map((v, k) => mix(v, tint[k] * luminance / native, amount));
      }
      const shaded = base.map((v, k) => clamp((v * illumination + 255 * (specular + wideHighlight + fresnel)) * exposure * (k === 0 ? 1 + .15 * temperature : k === 2 ? 1 - .15 * temperature : 1), 0, 255));
      out.push(q[0], q[1], shaded[0], shaded[1], shaded[2], 0); depths.push(q[2]);
    }
    const sigmaPx = Math.max(.58, shape.spacing * .64 * camera.zoom * Math.max(sx, syScreen) * Math.sqrt(Math.max(.001, worldScaleZ)));
    const result = { key: shape.key + ':' + JSON.stringify([camera, l, object.transform, object.color, width, height]),
      values: new Float32Array(out), depths: new Float32Array(depths), count: out.length / 6,
      screenSpace: true, alreadyShaded: true, sigmaPx,
      provenance: { geometry: 'closed_parametric_3d_fruit_surface', material: 'seeded_procedural_color_normal_and_specular', noPhotoTexture: true } };
    // A separate inferred studio-floor field, recomputed after every edit. The
    // core only enables it on our analytic studio backdrop, never on a photo.
    const shadow = [], shadowDepths = [], baseV = topY - shape.bottom;
    const rx = shape.rx * 1.18, ry = Math.max(9, shape.rx * .18), shadowStep = Math.max(1, step, shape.spacing);
    for (let dv = -ry * 2.25; dv <= ry * 2.25; dv += shadowStep) for (let du = -rx * 1.8; du <= rx * 1.8; du += shadowStep) {
      const d = (du + rx * .12) ** 2 / (rx * rx) + dv * dv / (ry * ry);
      if (d > 4.5) continue;
      const q = projectLocal(centerX + du, baseV + dv, -shape.rz * .28 + dv * 1.25);
      const occlusion = .23 * Math.exp(-d * 1.7) + .20 * Math.exp(-du * du / (rx * rx * .36) - dv * dv / (ry * ry * .13));
      const transmission = 255 * (1 - occlusion);
      shadow.push(q[0], q[1], transmission, transmission, transmission, 0);
      // Place compositing depth just above the analytic studio image plane at
      // this screen location. The shadow itself is projected with the fruit.
      const screenX = (q[0] / sx - state.width / 2 - camera.panX) / camera.zoom;
      const screenY = -(q[1] / syScreen - state.height / 2 - camera.panY) / camera.zoom;
      const bx = (screenX - sy * STUDIO_DEPTH) / (Math.abs(cy) < .001 ? .001 : cy);
      const bz = -sy * bx + cy * STUDIO_DEPTH;
      const by = (screenY + sp * bz) / (Math.abs(cp) < .001 ? .001 : cp);
      shadowDepths.push(sp * by + cp * bz + 1);
    }
    result.underlay = { key: result.key + ':contact', values: new Float32Array(shadow), depths: new Float32Array(shadowDepths), count: shadow.length / 6,
      screenSpace: true, alreadyShaded: true, blendMode: 'multiply', sortDepth: STUDIO_DEPTH * cy * cp + 1,
      sigmaPx: Math.max(.6, shadowStep * .66 * camera.zoom * Math.max(sx, syScreen)) };
    return result;
  }
  return { VERSION, prepareLayer, createStudioData, studioOps, studioBackdrop,
    _internals: { surface, material, geometry, parameters } };
});
