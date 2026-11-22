/* WebGL 2 weighted Gaussian accumulation, with the shared CPU renderer fallback. */
(function (root, factory) {
  const Core = typeof module === 'object' && module.exports ? require('./crf-core.js') : root.CRFCore;
  const Renderer = factory(Core);
  if (typeof module === 'object' && module.exports) module.exports = Renderer;
  if (root) root.CRFRenderer = Renderer;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  if (!Core) throw new Error('Load crf-core.js before crf-renderer.js');
  const FULL_VERTEX = `#version 300 es
    precision highp float;
    out vec2 vUV;
    void main(){
      vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0);
      vUV=(p+1.0)*0.5; gl_Position=vec4(p,0.0,1.0);
    }`;
  const PRESENT_FRAGMENT = `#version 300 es
    precision highp float;
    uniform sampler2D uImage; uniform bool uFlip;
    in vec2 vUV; out vec4 outColor;
    void main(){outColor=texture(uImage,vec2(vUV.x,uFlip?1.0-vUV.y:vUV.y));}`;
  const GAUSSIAN_VERTEX = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aCorner;
    layout(location=1) in vec2 aSource;
    layout(location=2) in vec3 aRGB;
    layout(location=3) in float aInferred;
    uniform mat2 uMatrix; uniform vec2 uOffset,uRadius,uSize;
    uniform vec3 uDepth,uTint,uFactors;
    uniform float uTintAmount; uniform bool uHighlight;
    out vec2 vDelta;
    flat out vec3 vColor;
    flat out float vDepth,vInferred;
    void main(){
      vec2 center=uMatrix*aSource+uOffset;
      vDelta=aCorner*uRadius;
      vec2 p=center+vDelta;
      gl_Position=vec4(p/uSize*vec2(2.0,-2.0)+vec2(-1.0,1.0),0.0,1.0);
      vec3 color=aRGB;
      if(uTintAmount>0.0){
        float lum=dot(color,vec3(.2126,.7152,.0722));
        float tintLum=max(1.0,dot(uTint,vec3(.2126,.7152,.0722)));
        color=mix(color,uTint*(lum/tintLum),uTintAmount);
      }
      color=clamp(color*uFactors,0.0,255.0);
      if(uHighlight&&aInferred>.5) color=mix(color,vec3(255.0,0.0,210.0),.45);
      vColor=color/255.0;
      vDepth=dot(uDepth,vec3(aSource,1.0)); vInferred=aInferred;
    }`;
  const GAUSSIAN_FRAGMENT = `#version 300 es
    precision highp float;
    uniform vec3 uInverse; uniform float uCutoffSquared;
    in vec2 vDelta; flat in vec3 vColor; flat in float vDepth,vInferred;
    layout(location=0) out vec4 outWeighted;
    layout(location=1) out vec2 outAuxiliary;
    void main(){
      float d=uInverse.x*vDelta.x*vDelta.x+2.0*uInverse.y*vDelta.x*vDelta.y+uInverse.z*vDelta.y*vDelta.y;
      if(d>uCutoffSquared) discard;
      float weight=exp(-.5*d);
      outWeighted=vec4(vColor*weight,weight);
      outAuxiliary=vec2(vDepth,vInferred)*weight;
    }`;
  const COMPOSITE_FRAGMENT = `#version 300 es
    precision highp float; precision highp int;
    uniform sampler2D uWeighted,uAuxiliary;
    uniform float uOpacity,uMinDepth,uMaxDepth;
    uniform bool uExact; uniform uint uObjectIndex;
    layout(location=0) out vec4 outColor;
    layout(location=1) out highp uint outId;
    void main(){
      ivec2 p=ivec2(gl_FragCoord.xy);
      vec4 weighted=texelFetch(uWeighted,p,0);
      if(weighted.a<1e-10) discard;
      vec2 aux=texelFetch(uAuxiliary,p,0).rg/weighted.a;
      float alpha=uOpacity*(uExact?1.0:min(1.0,weighted.a*2.0));
      outColor=vec4(clamp(weighted.rgb/weighted.a,0.0,1.0),alpha);
      outId=(uObjectIndex+1u)|(aux.y>.5?65536u:0u);
      gl_FragDepth=clamp((uMaxDepth-aux.x)/(uMaxDepth-uMinDepth),0.0,1.0);
    }`;
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  function shader(gl, type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('Gaussian shader compile: ' + error); }
    return s;
  }
  function program(gl, vertex, fragment) {
    const p = gl.createProgram(), vs = shader(gl, gl.VERTEX_SHADER, vertex), fs = shader(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const error = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error('Gaussian shader link: ' + error); }
    return p;
  }
  function uniforms(gl, p, names) { return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(p, name)])); }
  class CRFRenderer {
    constructor(canvas, data) {
      if (!canvas || typeof canvas.getContext !== 'function') throw new Error('CRFRenderer needs a canvas');
      Core.decodeData(data);
      this.canvas = canvas; this.data = data; this.width = data.width; this.height = data.height;
      this.buffers = new Map(); this.textures = []; this.framebuffers = []; this.programs = []; this.renderbuffers = [];
      this.backend = 'cpu-gaussian'; this.fallbackReason = null; this.cpuResult = null; this.frame = null; this.lastStats = null;
      this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, depth: true, stencil: false });
      if (this.gl) {
        const gl = this.gl; gl.disable(gl.DITHER); gl.disable(gl.CULL_FACE);
        this.emptyVAO = gl.createVertexArray(); gl.bindVertexArray(this.emptyVAO);
        try {
          this.presentProgram = program(gl, FULL_VERTEX, PRESENT_FRAGMENT); this.programs.push(this.presentProgram);
          this.presentUniforms = uniforms(gl, this.presentProgram, ['uImage', 'uFlip']);
          this.uploadTexture = gl.createTexture(); this.textures.push(this.uploadTexture);
          gl.bindTexture(gl.TEXTURE_2D, this.uploadTexture); this.textureParameters();
          if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is unavailable');
          if (!gl.getExtension('EXT_float_blend')) throw new Error('EXT_float_blend is unavailable');
          this.gaussianProgram = program(gl, GAUSSIAN_VERTEX, GAUSSIAN_FRAGMENT); this.programs.push(this.gaussianProgram);
          this.gaussianUniforms = uniforms(gl, this.gaussianProgram, ['uMatrix', 'uOffset', 'uRadius', 'uSize', 'uDepth', 'uTint', 'uFactors', 'uTintAmount', 'uHighlight', 'uInverse', 'uCutoffSquared']);
          this.compositeProgram = program(gl, FULL_VERTEX, COMPOSITE_FRAGMENT); this.programs.push(this.compositeProgram);
          this.compositeUniforms = uniforms(gl, this.compositeProgram, ['uWeighted', 'uAuxiliary', 'uOpacity', 'uMinDepth', 'uMaxDepth', 'uExact', 'uObjectIndex']);
          this.quadBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
          this.gaussianVAO = gl.createVertexArray(); gl.bindVertexArray(this.gaussianVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
          for (let i = 1; i <= 3; ++i) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 1); }
          gl.bindVertexArray(this.emptyVAO);
          this.backend = 'webgl2-gaussian';
        } catch (error) { this.fallbackReason = error.message; this.backend = 'cpu-gaussian'; }
      } else {
        this.context2d = canvas.getContext('2d', { alpha: false });
        if (!this.context2d) throw new Error('Neither WebGL 2 nor Canvas 2D is available');
        this.fallbackReason = 'WebGL 2 is unavailable';
      }
      this.resize(data.width, data.height);
    }
    textureParameters() {
      const gl = this.gl; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    makeTexture(internal, format, type) {
      const gl = this.gl, t = gl.createTexture(); this.textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t); this.textureParameters();
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, this.width, this.height, 0, format, type, null); return t;
    }
    deleteTargets() {
      if (!this.targets) return;
      const gl = this.gl;
      for (const key of ['weighted', 'auxiliary', 'color', 'ids']) { gl.deleteTexture(this.targets[key]); this.textures = this.textures.filter(t => t !== this.targets[key]); }
      for (const key of ['accumulation', 'main']) { gl.deleteFramebuffer(this.targets[key]); this.framebuffers = this.framebuffers.filter(t => t !== this.targets[key]); }
      gl.deleteRenderbuffer(this.targets.depth); this.renderbuffers = this.renderbuffers.filter(t => t !== this.targets.depth); this.targets = null;
    }
    createTargets() {
      const gl = this.gl; this.deleteTargets();
      const weighted = this.makeTexture(gl.RGBA32F, gl.RGBA, gl.FLOAT), auxiliary = this.makeTexture(gl.RG32F, gl.RG, gl.FLOAT);
      const color = this.makeTexture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE), ids = this.makeTexture(gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT);
      const accumulation = gl.createFramebuffer(); this.framebuffers.push(accumulation); gl.bindFramebuffer(gl.FRAMEBUFFER, accumulation);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, weighted, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, auxiliary, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Float Gaussian accumulation framebuffer is incomplete');
      const main = gl.createFramebuffer(); this.framebuffers.push(main); gl.bindFramebuffer(gl.FRAMEBUFFER, main);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, ids, 0);
      const depth = gl.createRenderbuffer(); this.renderbuffers.push(depth); gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Gaussian color/depth/ID framebuffer is incomplete');
      this.targets = { weighted, auxiliary, color, ids, accumulation, main, depth }; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    resize(width, height) {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 16000000) throw new Error('Invalid renderer dimensions');
      this.width = width; this.height = height; this.canvas.width = width; this.canvas.height = height; this.cpuResult = null;
      if (this.gl) {
        this.gl.viewport(0, 0, width, height);
        if (this.backend === 'webgl2-gaussian') try { this.createTargets(); } catch (error) { this.backend = 'cpu-gaussian'; this.fallbackReason = error.message; }
      }
    }
    sampleBuffer(samples) {
      if (this.buffers.has(samples.key)) { const buffer=this.buffers.get(samples.key); if(samples.dynamic){this.gl.bindBuffer(this.gl.ARRAY_BUFFER,buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,samples.values,this.gl.DYNAMIC_DRAW);} return buffer; }
      const gl = this.gl, buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, samples.values, gl.STATIC_DRAW);
      this.buffers.set(samples.key, buffer); return buffer;
    }
    present(texture, flip) {
      const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]);
      gl.viewport(0, 0, this.width, this.height); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.bindVertexArray(this.emptyVAO); gl.useProgram(this.presentProgram); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.presentUniforms.uImage, 0); gl.uniform1i(this.presentUniforms.uFlip, flip ? 1 : 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    render(state, options) {
      const opt = Object.assign({}, options || {}, { width: this.width, height: this.height });
      const procedural=state.objects.some(o=>['apple','pear'].includes(o.prototype)&&o.visible&&!o.deleted);
      if (this.backend === 'webgl2-gaussian' && !procedural) {
        try { return this.renderGPU(state, opt); }
        catch (error) { this.backend = 'cpu-gaussian'; this.fallbackReason = error.message; }
      }
      const result = Core.CPUrender(this.data, state, opt); this.cpuResult = result;
      this.frame = { state: opt.time === null ? state : Core.evaluateFrame(state, opt.time === undefined ? 0 : opt.time) };
      if (this.gl) {
        const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.uploadTexture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, result.width, result.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, result.rgba); this.present(this.uploadTexture, true);
      } else this.context2d.putImageData(new ImageData(result.rgba, result.width, result.height), 0, 0);
      this.lastStats = Object.assign({}, result.stats, { fallbackReason: procedural && this.backend==='webgl2-gaussian' ? 'Procedural variable-depth surfaces use the verified CPU renderer' : this.fallbackReason }); return this.lastStats;
    }
    renderGPU(state, options) {
      const started = now(), gl = this.gl, frame = Core._internals.prepareFrame(this.data, state, options); this.frame = frame; this.cpuResult = null;
      gl.disable(gl.DITHER); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, this.width, this.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.main); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.disable(gl.BLEND); gl.depthMask(true);
      gl.clearBufferfv(gl.COLOR, 0, new Float32Array([...frame.state.background.color.map(x => x / 255), 1])); gl.clearBufferuiv(gl.COLOR, 1, new Uint32Array([0, 0, 0, 0])); gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));
      for (const layer of frame.layers) {
        const { object, projection, covariance, samples } = layer, m = projection.m, gu = this.gaussianUniforms, cu = this.compositeUniforms;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.accumulation); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.clearBufferfv(gl.COLOR, 0, new Float32Array(4)); gl.clearBufferfv(gl.COLOR, 1, new Float32Array(4));
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.gaussianProgram); gl.bindVertexArray(this.gaussianVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.sampleBuffer(samples));
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 8); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
        gl.uniformMatrix2fv(gu.uMatrix, false, new Float32Array([m[0], m[2], m[1], m[3]])); gl.uniform2fv(gu.uOffset, projection.b);
        gl.uniform2fv(gu.uRadius, covariance.radius); gl.uniform2f(gu.uSize, this.width, this.height); gl.uniform3fv(gu.uDepth, projection.z);
        gl.uniform3fv(gu.uTint, object.color.tint); gl.uniform3fv(gu.uFactors, layer.alreadyShaded ? [1,1,1] : layer.factors); gl.uniform1f(gu.uTintAmount, layer.alreadyShaded ? 0 : object.color.amount); gl.uniform1i(gu.uHighlight, !layer.alreadyShaded && frame.state.background.highlightInferred ? 1 : 0);
        gl.uniform3fv(gu.uInverse, covariance.inverse); gl.uniform1f(gu.uCutoffSquared, covariance.cutoff * covariance.cutoff);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, samples.count);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.main); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
        // Color uses source-over; keep the opaque output alpha at one, as in CPUrender.
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(this.emptyVAO); gl.useProgram(this.compositeProgram);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.targets.weighted); gl.uniform1i(cu.uWeighted, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.targets.auxiliary); gl.uniform1i(cu.uAuxiliary, 1);
        gl.uniform1f(cu.uOpacity, object.opacity); gl.uniform1f(cu.uMinDepth, frame.minDepth); gl.uniform1f(cu.uMaxDepth, frame.maxDepth); gl.uniform1i(cu.uExact, frame.quality === 'exact' ? 1 : 0); gl.uniform1ui(cu.uObjectIndex, object.index);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.present(this.targets.color, false);
      if (frame.quality === 'exact') gl.finish();
      const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error('WebGL Gaussian rendering error 0x' + error.toString(16));
      this.lastStats = Object.assign({}, frame.stats, { backend: 'webgl2-gaussian', elapsedMs: now() - started,
        timing: frame.quality === 'exact' ? 'synchronous GPU completion' : 'CPU submission, GPU may still be running',
        floatAccumulation: 'RGBA32F plus RG32F, additive weighted Gaussian kernels', fallbackReason: null });
      return this.lastStats;
    }
    readPixels() {
      if (this.cpuResult) return { width: this.width, height: this.height, rgba: new Uint8ClampedArray(this.cpuResult.rgba) };
      if (!this.gl || !this.targets || !this.frame) throw new Error('Render a frame before readPixels');
      const gl = this.gl, raw = new Uint8Array(this.width * this.height * 4), rgba = new Uint8ClampedArray(raw.length);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.main); gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const stride = this.width * 4;
      for (let y = 0; y < this.height; ++y) rgba.set(raw.subarray((this.height - y - 1) * stride, (this.height - y) * stride), y * stride);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { width: this.width, height: this.height, rgba };
    }
    pick(x, y) {
      x = Math.floor(x); y = Math.floor(y); if (!this.frame || x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
      let index = -1;
      if (this.cpuResult) index = this.cpuResult.ids[y * this.width + x];
      else {
        const gl = this.gl, result = new Uint32Array(1); gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.main); gl.readBuffer(gl.COLOR_ATTACHMENT1);
        gl.readPixels(x, this.height - 1 - y, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, result); gl.bindFramebuffer(gl.FRAMEBUFFER, null); index = (result[0] & 65535) - 1;
      }
      const object = this.frame.state.objects.find(o => o.index === index); return object ? object.id : null;
    }
    dispose() {
      if (this.gl) {
        const gl = this.gl; for (const buffer of this.buffers.values()) gl.deleteBuffer(buffer);
        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer); for (const texture of this.textures) gl.deleteTexture(texture);
        for (const fbo of this.framebuffers) gl.deleteFramebuffer(fbo); for (const rb of this.renderbuffers) gl.deleteRenderbuffer(rb); for (const p of this.programs) gl.deleteProgram(p);
        if (this.gaussianVAO) gl.deleteVertexArray(this.gaussianVAO); if (this.emptyVAO) gl.deleteVertexArray(this.emptyVAO);
      }
      this.buffers.clear(); this.cpuResult = null; this.frame = null;
    }
  }
  return CRFRenderer;
});
