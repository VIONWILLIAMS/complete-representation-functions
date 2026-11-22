(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CRFCanvas07 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'crf.canvas_program.v0.7';
  const LIMITS = Object.freeze({ sourceBytes: 80000, pixels: 1500000, side: 2048, parameterBytes: 8192, timeoutMs: 60000 });
  const CSP = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const CAPABILITY_RULES = [
    [/\b(?:import\s*(?:\(|[{'"*])|export\s+(?:default|const|function|class|let|var|\{))/, 'module import or export'],
    [/\b(?:require|fetch|importScripts|eval|Function|setTimeout|setInterval|requestAnimationFrame)\s*\(/, 'external or dynamic execution'],
    [/\b(?:XMLHttpRequest|WebSocket|WebTransport|Worker|SharedWorker|Image|ImageBitmap|Audio|VideoFrame|RTCPeerConnection)\s*\(/, 'external resource or secondary worker'],
    [/\b(?:window|document|globalThis|process|Deno|Bun|localStorage|indexedDB|caches)\b/, 'environment access'],
    [/\b(?:loadImage|createImageBitmap)\s*\(/, 'image asset loading'],
    [/\b(?:THREE|WebGLRenderingContext|WebGL2RenderingContext)\b/, '3D graphics API'],
    [/\b(?:async|await)\b/, 'asynchronous scene execution'],
    [/\b(?:https?|data|file):\/\/|data:image\//i, 'external or embedded image URL'],
  ];

  function fail(message, name) {
    const error = new Error(message);
    error.name = name || 'ValidationError';
    throw error;
  }
  function byteLength(text) { return new TextEncoder().encode(text).length; }
  // Remove comments only for the capability heuristic. Preserve quoted strings
  // and whole template literals so URL/dynamic-code markers remain visible.
  // This is not a security parser; CSP and the isolated Worker enforce access.
  function withoutComments(source) {
    let out = '', quote = null, comment = null;
    for (let i = 0; i < source.length; i++) {
      const c = source[i], next = source[i + 1];
      if (comment === 'line') {
        if (c === '\n' || c === '\r') { comment = null; out += c; } else out += ' ';
      } else if (comment === 'block') {
        if (c === '*' && next === '/') { out += '  '; i++; comment = null; }
        else out += c === '\n' || c === '\r' ? c : ' ';
      } else if (quote !== null) {
        out += c;
        if (c === '\\' && next !== undefined) { out += next; i++; }
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') { quote = c; out += c; }
      else if (c === '/' && next === '/') { out += '  '; i++; comment = 'line'; }
      else if (c === '/' && next === '*') { out += '  '; i++; comment = 'block'; }
      else out += c;
    }
    return out;
  }
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Canvas 程序必须是 JSON 对象');
    if (input.schema !== SCHEMA) fail('不支持的 Canvas 程序 schema');
    const allowed = new Set(['schema', 'id', 'title', 'width', 'height', 'seed', 'source', 'parameters', 'provenance']);
    for (const key of Object.keys(input)) if (!allowed.has(key)) fail('未知的 Canvas 程序字段：' + key);
    const width = input.width, height = input.height;
    if (![width, height].every(v => Number.isInteger(v) && v >= 16 && v <= LIMITS.side) || width * height > LIMITS.pixels) fail('Canvas 尺寸超过限制（最多 150 万像素）');
    if (typeof input.source !== 'string' || !input.source.trim()) fail('Canvas 绘制 source 不能为空');
    if (byteLength(input.source) > LIMITS.sourceBytes) fail('Canvas source 超过 80 KB');
    const capabilitySource = withoutComments(input.source);
    for (const [pattern, label] of CAPABILITY_RULES) if (pattern.test(capabilitySource)) fail('Canvas 程序使用了不支持的能力：' + label);
    const seed = input.seed === undefined ? 1139 : input.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail('seed 必须是 0 至 4294967295 的整数');
    const id = input.id === undefined ? 'canvas_program' : input.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) fail('Canvas 程序 id 无效');
    const title = input.title === undefined ? id : input.title;
    if (typeof title !== 'string' || !title.trim() || title.length > 200) fail('Canvas 程序标题无效');
    const parameters = input.parameters === undefined ? {} : input.parameters;
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) fail('parameters 必须是 JSON 对象');
    let parameterJSON;
    try { parameterJSON = JSON.stringify(parameters); } catch (_) { fail('parameters 不是可序列化的 JSON'); }
    if (!parameterJSON || byteLength(parameterJSON) > LIMITS.parameterBytes) fail('parameters 超过 8 KB');
    const normalized = { schema: SCHEMA, id, title, width, height, seed, source: input.source, parameters: JSON.parse(parameterJSON) };
    if (input.provenance !== undefined) {
      if (!input.provenance || typeof input.provenance !== 'object' || Array.isArray(input.provenance)) fail('provenance 必须是 JSON 对象');
      let provenanceJSON;
      try { provenanceJSON = JSON.stringify(input.provenance); } catch (_) { fail('provenance 不是可序列化的 JSON'); }
      if (!provenanceJSON || byteLength(provenanceJSON) > 8192) fail('provenance 超过 8 KB');
      normalized.provenance = JSON.parse(provenanceJSON);
    }
    return normalized;
  }

  // This function is serialized into a dedicated Worker. It is not called on
  // the editor thread. CSP is inherited from its opaque sandbox iframe.
  function workerMain(spec, paint) {
    'use strict';
    const send = self.postMessage.bind(self);
    const NativeCanvas = OffscreenCanvas;
    const started = performance.now();
    const nativeMath = Math;
    let state = spec.seed >>> 0;
    function random() {
      state += 0x6D2B79F5;
      let t = state;
      t = nativeMath.imul(t ^ t >>> 15, t | 1);
      t ^= t + nativeMath.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    const localMath = {};
    for (const key of Object.getOwnPropertyNames(nativeMath)) Object.defineProperty(localMath, key, { value: key === 'random' ? random : nativeMath[key] });
    Object.freeze(localMath);
    // Network is denied independently by CSP. Removing these globals also
    // prevents accidental nested workers and asset use by generated programs.
    for (const name of ['fetch','XMLHttpRequest','WebSocket','WebTransport','Worker','SharedWorker','importScripts','createImageBitmap','OffscreenCanvas','postMessage','setTimeout','setInterval','requestAnimationFrame','queueMicrotask','Blob','URL']) {
      try { Object.defineProperty(self, name, {value:undefined,writable:false,configurable:false}); } catch (_) {}
    }
    let layerCount = 0, layerPixels = 0;
    function createCanvas(w, h) {
      if (![w,h].every(v => Number.isInteger(v) && v > 0 && v <= 2048)) throw new Error('离屏画布尺寸无效');
      if (++layerCount > 64 || (layerPixels += w*h) > spec.width*spec.height*16) throw new Error('离屏画布预算已用尽');
      return new NativeCanvas(w,h);
    }
    function deepFreeze(value) {
      if (value && typeof value === 'object') { Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]); }
      return value;
    }
    try {
      const canvas = new NativeCanvas(spec.width,spec.height);
      const ctx = canvas.getContext('2d', {willReadFrequently:true});
      if (!ctx) throw new Error('浏览器未能建立 OffscreenCanvas 2D 上下文');
      const createImageData = (w,h) => {
        if (![w,h].every(v => Number.isInteger(v) && v > 0 && v <= 2048) || w*h > 1500000) throw new Error('像素数组尺寸超过限制');
        return ctx.createImageData(w,h);
      };
      const result = paint(ctx,spec.width,spec.height,random,random,random,localMath,createCanvas,createImageData,deepFreeze(spec.parameters));
      if (result && typeof result.then === 'function') throw new Error('绘图程序必须同步执行');
      if (canvas.width !== spec.width || canvas.height !== spec.height) throw new Error('绘图程序不得修改主画布尺寸');
      const bitmap = canvas.transferToImageBitmap();
      send({kind:'complete',bitmap,workerElapsedMs:performance.now()-started,layerCount},[bitmap]);
    } catch (error) {
      send({kind:'error',message:String(error && error.message || error).slice(0,1000)});
    }
  }

  function frameMain(token, workerSource) {
    'use strict';
    let worker, url;
    function cleanup() { if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); }
    function error(message) { cleanup(); parent.postMessage({crfCanvasToken:token,kind:'error',message},'*'); }
    try {
      url = URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
      worker = new Worker(url);
      worker.onerror = event => { event.preventDefault(); error(event.message || 'Canvas Worker 无法执行'); };
      worker.onmessage = event => {
        const data = event.data || {};
        if (data.kind === 'complete' && data.bitmap instanceof ImageBitmap) {
          parent.postMessage({crfCanvasToken:token,...data},'*',[data.bitmap]); cleanup();
        } else if (data.kind === 'error') error(String(data.message));
      };
      addEventListener('message', event => { if (event.source === parent && event.data && event.data.crfCanvasToken === token && event.data.kind === 'cancel') cleanup(); });
    } catch (e) { error(String(e && e.message || e)); }
  }

  function serialize(value) { return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
  function workerSource(program) {
    const {source,...spec} = program;
    // A lexical block permits model-authored local const W/H declarations while
    // preserving the original source and its hash byte-for-byte.
    return '(' + workerMain.toString() + ')(' + serialize(spec) + ',function(ctx,W,H,random,rng,rand,Math,createCanvas,createImageData,parameters){"use strict";\n{\n' + source + '\n}\n});';
  }
  function frameSource(token, program) {
    const bridge = '(' + frameMain.toString() + ')(' + serialize(token) + ',' + serialize(workerSource(program)) + ');';
    return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '"><script>' + bridge + '<\/script>';
  }
  async function sha256(value) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) fail('像素校验需要 HTTPS 或 localhost 安全环境','RenderError');
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const result = await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');
  }

  async function renderToCanvas(target, input, options) {
    const program = validate(input);
    options = options || {};
    if (typeof document === 'undefined' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') fail('此浏览器不支持 Worker OffscreenCanvas 二维渲染','RenderError');
    if (!target || typeof target.getContext !== 'function') fail('缺少目标 Canvas','RenderError');
    const timeoutMs = options.timeoutMs === undefined ? 20000 : options.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > LIMITS.timeoutMs) fail('渲染超时设置无效');
    if (options.signal && options.signal.aborted) fail('渲染已取消','AbortError');
    const sourceSHA256 = await sha256(program.source);
    if (options.signal && options.signal.aborted) fail('渲染已取消','AbortError');
    const token = Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16)).join('-');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox','allow-scripts');
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-100px;top:-100px;border:0;pointer-events:none;';
    frame.srcdoc = frameSource(token,program);
    const started = performance.now();
    const data = await new Promise((resolve,reject) => {
      let timer, settled = false;
      const cleanup = () => {
        clearTimeout(timer); removeEventListener('message',receive);
        if (options.signal) options.signal.removeEventListener('abort',abort);
        try { if (frame.contentWindow) frame.contentWindow.postMessage({crfCanvasToken:token,kind:'cancel'},'*'); } catch (_) {}
        frame.remove();
      };
      const end = (error,value) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(value); };
      const failure = (message,name) => { const error = new Error(message); error.name = name; end(error); };
      const abort = () => failure('渲染已取消','AbortError');
      const receive = event => {
        if (event.source !== frame.contentWindow || !event.data || event.data.crfCanvasToken !== token) return;
        const result = event.data;
        if (result.kind === 'error') failure(result.message || '二维绘图失败','RenderError');
        else if (result.kind === 'complete' && result.bitmap instanceof ImageBitmap) end(null,result);
      };
      addEventListener('message',receive);
      if (options.signal) options.signal.addEventListener('abort',abort,{once:true});
      timer = setTimeout(()=>failure('二维绘图超过 ' + Math.round(timeoutMs/1000) + ' 秒，已停止执行','TimeoutError'),timeoutMs);
      document.body.appendChild(frame);
    });
    const bitmap = data.bitmap;
    try {
      if (bitmap.width !== program.width || bitmap.height !== program.height) fail('Worker 输出尺寸不匹配','RenderError');
      target.width = program.width; target.height = program.height;
      const ctx = target.getContext('2d',{willReadFrequently:true});
      ctx.clearRect(0,0,target.width,target.height); ctx.drawImage(bitmap,0,0);
      const pixels = ctx.getImageData(0,0,target.width,target.height).data;
      let opaque = 0;
      for (let i=3;i<pixels.length;i+=4) if (pixels[i] === 255) opaque++;
      const stats = {
        schema:'crf.canvas_render.v0.7', backend:'canvas2d-worker', programId:program.id,
        width:program.width,height:program.height,seed:program.seed,
        elapsedMs:Math.round(performance.now()-started),workerElapsedMs:Math.round(data.workerElapsedMs),
        sourceSHA256,rgbaSHA256:await sha256(pixels),opaquePixelRatio:opaque/(program.width*program.height),
        offscreenLayerCount:data.layerCount,externalAssetsSupplied:false,artworkPostprocessingApplied:false,
      };
      return {canvas:target,stats};
    } finally { bitmap.close(); }
  }

  return Object.freeze({SCHEMA,LIMITS,validate,compile:validate,renderToCanvas});
});
