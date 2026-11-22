/*
 * CRFVideo 0.9 — deterministic WebM export with encoder-declared colour metadata.
 * Encoding runs locally through WebCodecs; no server, library or captureStream.
 * Frame count/timestamps are deterministic; codec bytes can vary across platforms.
 * Specifications:
 * https://www.w3.org/TR/webcodecs/
 * https://www.webmproject.org/docs/container/
 * https://www.matroska.org/technical/elements.html
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.CRFVideo = api; root.CRFVideo09 = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (environment) {
  'use strict';
  const VERSION = '0.9.1';
  const CODEC_PREFERENCE = ['vp09.00.40.08', 'vp09.00.10.08', 'vp8'];
  const MAX_BYTES = 256 * 1024 * 1024;
  const TIMECODE_SCALE_NS = 1000000; // WebM's recommended 1 ms container ticks.
  const textEncoder = new TextEncoder();
  class CRFVideoUnsupportedError extends Error {
    constructor(message) { super(message); this.name = 'CRFVideoUnsupportedError'; }
  }
  function need(value, message) { if (!value) throw new Error('CRFVideo: ' + message); }
  function dimensions(options) {
    const o = options || {}, width = o.width === undefined ? 667 : o.width,
      height = o.height === undefined ? 1000 : o.height, fps = o.fps === undefined ? 24 : o.fps;
    need(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16000000, 'invalid output dimensions');
    need(typeof fps === 'number' && Number.isFinite(fps) && fps >= 1 && fps <= 120, 'fps must be a finite number from 1 to 120');
    return { width, height, fps };
  }
  function timing(options) {
    const size = dimensions(options), duration = options.duration === undefined ? 3 : options.duration;
    need(typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && duration <= 120, 'duration must be finite and within 0..120 seconds');
    const frameCount = Math.round(duration * size.fps);
    need(frameCount > 0 && frameCount <= 14400 && Math.abs(frameCount - duration * size.fps) < 1e-7, 'duration × fps must be an integer frame count');
    return Object.assign(size, { duration, frameCount });
  }
  async function capabilities(options) {
    const { width, height, fps } = dimensions(options);
    const attempts = [];
    if (typeof environment.VideoEncoder !== 'function' || typeof environment.VideoFrame !== 'function' || typeof environment.VideoEncoder.isConfigSupported !== 'function') {
      return { supported: false, codec: null, reason: 'WebCodecs VideoEncoder/VideoFrame is unavailable in this browser context', width, height, fps, attempts };
    }
    const bitrate = Math.round(Math.min(25000000, Math.max(2000000, width * height * fps * .55)));
    // VP9 signals range and matrix in its bitstream. VP8's restricted colour
    // header can cause decoders to replace otherwise correct container tags.
    for (const codec of CODEC_PREFERENCE) {
      const config = { codec, width, height, bitrate, framerate: fps,
        latencyMode: 'quality', hardwareAcceleration: 'no-preference', alpha: 'discard' };
      try {
        const support = await environment.VideoEncoder.isConfigSupported(config);
        attempts.push({ codec, supported: !!support.supported });
        if (support.supported) return { supported: true, codec, config: support.config || config,
          width, height, fps, attempts, scheduling: 'fixed frame timestamps, independent of rendering speed' };
      } catch (error) { attempts.push({ codec, supported: false, reason: error.message || String(error) }); }
    }
    return { supported: false, codec: null, width, height, fps, attempts,
      reason: 'No supported VP8 or VP9 encoder configuration for the requested size and frame rate' };
  }

  // EBML integers and payload sizes are big-endian. Size VINTs reserve the
  // all-ones payload for unknown length; every element here has a known size.
  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    need(Number.isSafeInteger(length) && length <= MAX_BYTES, 'WebM exceeds the 256 MiB in-memory limit');
    const out = new Uint8Array(length); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }
  function idBytes(id) {
    let hex = id.toString(16); if (hex.length % 2) hex = '0' + hex;
    return Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
  }
  function vint(value) {
    need(Number.isSafeInteger(value) && value >= 0, 'invalid EBML size');
    const n = BigInt(value); let length = 1;
    while (length < 8 && n >= (1n << BigInt(7 * length)) - 1n) ++length;
    need(n < (1n << BigInt(7 * length)) - 1n, 'EBML size too large');
    let v = n | (1n << BigInt(7 * length)); const bytes = new Uint8Array(length);
    for (let i = length - 1; i >= 0; --i) { bytes[i] = Number(v & 255n); v >>= 8n; }
    return bytes;
  }
  function uint(value, fixedLength) {
    need(Number.isSafeInteger(value) && value >= 0, 'invalid unsigned EBML integer');
    let v = BigInt(value), length = fixedLength || 1;
    if (!fixedLength) while (v >= (1n << BigInt(8 * length))) ++length;
    need(length >= 1 && length <= 8 && v < (1n << BigInt(8 * length)), 'unsigned EBML integer overflow');
    const out = new Uint8Array(length);
    for (let i = length - 1; i >= 0; --i) { out[i] = Number(v & 255n); v >>= 8n; }
    return out;
  }
  function float64(value) { const out = new Uint8Array(8); new DataView(out.buffer).setFloat64(0, value, false); return out; }
  function element(id, payload) { return concat([idBytes(id), vint(payload.length), payload]); }
  function master(id, children) { return element(id, concat(children)); }
  function unsigned(id, value, length) { return element(id, uint(value, length)); }
  function text(id, value) { return element(id, textEncoder.encode(value)); }
  function codecID(codec) {
    if (codec === 'vp8' || codec === 'vp8.0') return 'V_VP8';
    if (typeof codec === 'string' && (codec.startsWith('vp09.') || codec === 'vp9')) return 'V_VP9';
    throw new Error('CRFVideo: muxer only supports VP8 and VP9');
  }
  // WebCodecs 9.11–9.13 and Matroska Colour use H.273 values. These describe
  // the ENCODED output, not the canvas input. Never infer a YUV range/matrix
  // from the canvas, frame dimensions, codec name or a pixel-error diagnostic.
  const COLOUR_FIELDS = ['primaries', 'transfer', 'matrix', 'fullRange'];
  const COLOUR_ENUMS = Object.freeze({
    primaries: Object.freeze({ bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 }),
    transfer: Object.freeze({ bt709: 1, smpte170m: 6, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18 }),
    matrix: Object.freeze({ rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 })
  });
  function copyColorSpace(value) {
    const out = {};
    for (const field of COLOUR_FIELDS) {
      // Read WebIDL getters directly: object spread may lose these properties.
      const item = value == null ? null : value[field];
      out[field] = item == null ? null : item;
      need(out[field] === null || (field === 'fullRange' ? typeof item === 'boolean' : typeof item === 'string'),
        'encoder returned an invalid colorSpace.' + field);
    }
    return out;
  }
  function describeColour(value) {
    const colorSpace = copyColorSpace(value), unmappedFields = {}, unknownFields = [];
    function mapped(field) {
      const item = colorSpace[field];
      if (item === null) { unknownFields.push(field); return null; }
      if (!Object.prototype.hasOwnProperty.call(COLOUR_ENUMS[field], item)) {
        unmappedFields[field] = item; return null;
      }
      return COLOUR_ENUMS[field][item];
    }
    const matrixCoefficients = mapped('matrix'), transferCharacteristics = mapped('transfer'), primaries = mapped('primaries');
    const range = colorSpace.fullRange === true ? 2 : colorSpace.fullRange === false ? 1 : null;
    if (range === null) unknownFields.push('fullRange');
    const values = { matrixCoefficients, range, transferCharacteristics, primaries };
    const written = Object.values(values).some(item => item !== null), warnings = [];
    if (unknownFields.length) warnings.push('Encoder did not declare ' + unknownFields.join(', ') + '; corresponding WebM Colour fields are unspecified.');
    if (Object.keys(unmappedFields).length) warnings.push('Unmapped encoder colour values are preserved in this report but not guessed in WebM: ' + Object.keys(unmappedFields).join(', ') + '.');
    return { encoderColorSpace: colorSpace, webmColour: Object.assign({ written }, values), unknownFields, unmappedFields, warnings };
  }
  function colourElement(value) {
    const c = describeColour(value).webmColour, fields = [];
    for (const [id, key] of [[0x55B1, 'matrixCoefficients'], [0x55B9, 'range'], [0x55BA, 'transferCharacteristics'], [0x55BB, 'primaries']]) {
      if (c[key] !== null) fields.push(unsigned(id, c[key]));
    }
    // Omitted fields retain Matroska's unspecified defaults (Range=0, the
    // other fields=2). An all-unknown colour space creates no Colour element.
    return fields.length ? master(0x55B0, fields) : null;
  }
  function inspectVP9KeyColour(bytes) {
    // VP9 uncompressed keyframe header, MSB-first. Read only the colour
    // declaration; do not change or reinterpret any encoded samples.
    let bit = 0;
    function read(count) {
      need(bit + count <= bytes.length * 8, 'truncated VP9 colour header');
      let value = 0;
      for (let i = 0; i < count; ++i, ++bit) value = value * 2 + ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
      return value;
    }
    need(read(2) === 2, 'invalid VP9 frame marker');
    const low = read(1), profile = low + 2 * read(1);
    if (profile === 3) need(read(1) === 0, 'invalid VP9 profile reserved bit');
    need(read(1) === 0, 'VP9 key chunk cannot show an existing frame');
    need(read(1) === 0, 'VP9 chunk marked key has an interframe header');
    read(1); read(1); // show_frame, error_resilient_mode
    need(read(24) === 0x498342, 'invalid VP9 keyframe sync code');
    const bitDepth = profile >= 2 ? (read(1) ? 12 : 10) : 8;
    const colorSpaceCode = read(3);
    need(colorSpaceCode !== 6, 'reserved VP9 colour space');
    const fullRange = colorSpaceCode === 7 ? true : read(1) === 1;
    const matrices = [null, 'bt470bg', 'bt709', 'smpte170m', 'smpte240m', 'bt2020-ncl', null, 'rgb'];
    return { profile, bitDepth, colorSpaceCode, matrix: matrices[colorSpaceCode], fullRange };
  }
  function inspectBitstreamColour(codec, bytes, declared) {
    if (codecID(codec) === 'V_VP8') {
      // Do not silently fall back to the exact incompatible VP8 path observed
      // in the browser: metadata said full/709, decoded frames became TV/601.
      const compatibleMatrix = declared.matrix === 'bt470bg' || declared.matrix === 'smpte170m';
      if (declared.fullRange !== false || !compatibleMatrix) {
        throw new CRFVideoUnsupportedError('VP8 colour output is not safely portable for this frame: a VP9-capable encoder is required; no colour compensation was applied');
      }
      return { codec: 'vp8', status: 'limited-bt601-declared; bitstream colour not independently parsed',
        matrix: declared.matrix, fullRange: declared.fullRange };
    }
    const observed = inspectVP9KeyColour(bytes);
    const bt601 = value => value === 'bt470bg' || value === 'smpte170m';
    if (declared.fullRange !== null) need(observed.fullRange === declared.fullRange,
      'VP9 bitstream range conflicts with encoder colour metadata');
    if (declared.matrix !== null && observed.matrix !== null) need(observed.matrix === declared.matrix || (bt601(observed.matrix) && bt601(declared.matrix)),
      'VP9 bitstream matrix conflicts with encoder colour metadata');
    return Object.assign({ codec: 'vp9', status: declared.fullRange !== null && declared.matrix !== null && observed.matrix !== null
      ? 'matched-declared-range-and-matrix' : 'partly-unspecified' }, observed);
  }
  function simpleBlock(chunk, clusterTimeMs) {
    const relative = Math.round(chunk.timestamp / 1000) - clusterTimeMs;
    need(relative >= -32768 && relative <= 32767, 'SimpleBlock time offset exceeds signed 16 bits');
    const header = new Uint8Array(4); header[0] = 0x81; // track number 1, EBML VINT.
    new DataView(header.buffer).setInt16(1, relative, false); header[3] = chunk.type === 'key' ? 0x80 : 0;
    return element(0xA3, concat([header, chunk.data]));
  }
  function makeClusters(chunks) {
    const result = []; let group = [], timestamp = 0;
    function finish() {
      if (!group.length) return;
      result.push({ time: timestamp, key: group[0].type === 'key',
        bytes: master(0x1F43B675, [unsigned(0xE7, timestamp), ...group.map(chunk => simpleBlock(chunk, timestamp))]) });
      group = [];
    }
    for (const chunk of chunks) {
      const time = Math.round(chunk.timestamp / 1000);
      if (group.length && (chunk.type === 'key' || time - timestamp > 30000)) finish();
      if (!group.length) timestamp = time;
      group.push(chunk);
    }
    finish(); return result;
  }
  function makeSeekHead(info, tracks, cues) {
    return master(0x114D9B74, [[0x1549A966, info], [0x1654AE6B, tracks], [0x1C53BB6B, cues]].map(([id, position]) =>
      master(0x4DBB, [element(0x53AB, idBytes(id)), unsigned(0x53AC, position, 8)])));
  }
  function makeCues(clusters, positions) {
    return master(0x1C53BB6B, clusters.flatMap((cluster, index) => cluster.key ? [master(0xBB, [
      unsigned(0xB3, cluster.time), master(0xB7, [unsigned(0xF7, 1), unsigned(0xF1, positions[index] || 0, 8)])
    ])] : []));
  }
  function muxWebM(chunks, options) {
    const o = timing(options), id = codecID(options.codec);
    need(Array.isArray(chunks) && chunks.length === o.frameCount, 'encoded frame count does not match the requested frame count');
    need(chunks[0].type === 'key', 'the first encoded video frame must be a keyframe');
    let previous = -1;
    for (let i = 0; i < chunks.length; ++i) {
      const chunk = chunks[i], expected = Math.round(i * 1000000 / o.fps), next = Math.round((i + 1) * 1000000 / o.fps);
      need(chunk.data instanceof Uint8Array && chunk.data.length > 0, 'empty or invalid encoded frame');
      need(chunk.type === 'key' || chunk.type === 'delta', 'invalid encoded frame type');
      need(Number.isSafeInteger(chunk.timestamp) && chunk.timestamp === expected && chunk.timestamp > previous, 'encoder dropped, reordered or changed a frame timestamp');
      if (chunk.duration != null) need(chunk.duration === next - expected, 'encoder changed a frame duration');
      previous = chunk.timestamp;
    }
    const ebml = master(0x1A45DFA3, [unsigned(0x4286, 1), unsigned(0x42F7, 1), unsigned(0x42F2, 4), unsigned(0x42F3, 8),
      text(0x4282, 'webm'), unsigned(0x4287, 4), unsigned(0x4285, 2)]);
    const info = master(0x1549A966, [unsigned(0x2AD7B1, TIMECODE_SCALE_NS), element(0x4489, float64(o.duration * 1000)),
      text(0x4D80, 'CRFVideo ' + VERSION), text(0x5741, 'CRF deterministic frame export')]);
    const colour = colourElement(options.colorSpace);
    const track = [unsigned(0xD7, 1), unsigned(0x73C5, 1), unsigned(0x83, 1), unsigned(0xB9, 1), unsigned(0x88, 1),
      unsigned(0x9C, 0), text(0x86, id), unsigned(0x23E383, Math.round(1000000000 / o.fps)),
      master(0xE0, [unsigned(0xB0, o.width), unsigned(0xBA, o.height), unsigned(0x54B0, o.width), unsigned(0x54BA, o.height), unsigned(0x54B2, 0), ...(colour ? [colour] : [])])];
    if (id === 'V_VP9' && /^vp09\.[0-3]0?\.\d{2}\.\d{2}/.test(options.codec)) {
      const parts = options.codec.split('.');
      // WebM VP9 CodecPrivate feature TLVs: profile, level, bit depth.
      track.push(element(0x63A2, new Uint8Array([1, 1, Number(parts[1]), 2, 1, Number(parts[2]), 3, 1, Number(parts[3])])));
    }
    const tracks = master(0x1654AE6B, [master(0xAE, track)]), clusters = makeClusters(chunks);
    const provisionalSeek = makeSeekHead(0, 0, 0), provisionalCues = makeCues(clusters, []);
    const infoPosition = provisionalSeek.length, tracksPosition = infoPosition + info.length, cuesPosition = tracksPosition + tracks.length;
    let offset = cuesPosition + provisionalCues.length;
    const positions = clusters.map(cluster => { const position = offset; offset += cluster.bytes.length; return position; });
    const seek = makeSeekHead(infoPosition, tracksPosition, cuesPosition), cues = makeCues(clusters, positions);
    need(seek.length === provisionalSeek.length && cues.length === provisionalCues.length, 'unstable WebM index offsets');
    const segment = master(0x18538067, [seek, info, tracks, cues, ...clusters.map(cluster => cluster.bytes)]);
    return concat([ebml, segment]);
  }

  async function encode(options) {
    const opts = options || {}, o = timing(opts); need(typeof opts.renderFrame === 'function', 'renderFrame(time,index) callback is required');
    need(opts.onProgress === undefined || typeof opts.onProgress === 'function', 'onProgress must be a function');
    const capability = await capabilities(o);
    if (!capability.supported) throw new CRFVideoUnsupportedError(capability.reason);
    const chunks = [], expectedDurations = new Map(), decoderConfigEvents = [], bitstreamColourEvents = [];
    let encoder = null, encoderError = null, totalBytes = 0, trackColorSpace = null;
    const progress = async (stage, completed, time) => {
      if (opts.onProgress) await opts.onProgress({ stage, completed, total: o.frameCount, ratio: completed / o.frameCount,
        time: time === undefined ? completed / o.fps : time, codec: capability.codec });
    };
    const checkError = () => { if (encoderError) throw encoderError; };
    try {
      encoder = new environment.VideoEncoder({
        output(chunk, metadata) {
          try {
            const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes); totalBytes += bytes.length;
            need(totalBytes <= MAX_BYTES / 2, 'encoded video is too large for the in-memory muxer');
            const config = metadata && metadata.decoderConfig;
            if (config) {
              if (config.codec) need(codecID(config.codec) === codecID(capability.codec), 'encoder changed codec family');
              if (config.codedWidth) need(config.codedWidth === o.width, 'encoder changed the requested width');
              if (config.codedHeight) need(config.codedHeight === o.height, 'encoder changed the requested height');
              const declared = copyColorSpace(config.colorSpace);
              decoderConfigEvents.push({ timestamp: chunk.timestamp, codec: config.codec || null,
                codedWidth: config.codedWidth == null ? null : config.codedWidth,
                codedHeight: config.codedHeight == null ? null : config.codedHeight,
                colorSpaceProvided: config.colorSpace != null, colorSpace: declared });
              // A decoderConfig is a complete replacement, not a partial
              // colour patch. No metadata on subsequent chunks means reuse.
              // A single-track WebM cannot describe a midstream change with
              // one global Colour element, including unknown -> known.
              if (chunks.length) need(JSON.stringify(declared) === JSON.stringify(trackColorSpace),
                'encoder changed the declared color space during single-track encoding');
              trackColorSpace = declared;
            }
            if (!chunks.length && trackColorSpace === null) trackColorSpace = copyColorSpace(null);
            if (chunk.type === 'key') bitstreamColourEvents.push(Object.assign({ timestamp: chunk.timestamp },
              inspectBitstreamColour(capability.codec, bytes, trackColorSpace)));
            chunks.push({ data: bytes, type: chunk.type, timestamp: chunk.timestamp,
              duration: chunk.duration == null ? expectedDurations.get(chunk.timestamp) : chunk.duration });
          } catch (error) { encoderError = encoderError || error; }
        },
        error(error) { encoderError = error instanceof Error ? error : new Error(String(error)); }
      });
      encoder.configure(capability.config);
      await progress('render', 0, 0);
      for (let index = 0; index < o.frameCount; ++index) {
        checkError();
        const time = index / o.fps, timestamp = Math.round(index * 1000000 / o.fps),
          duration = Math.round((index + 1) * 1000000 / o.fps) - timestamp;
        const canvas = await opts.renderFrame(time, index);
        need(canvas && typeof canvas.getContext === 'function' && canvas.width === o.width && canvas.height === o.height,
          'renderFrame must return a canvas of exactly ' + o.width + ' × ' + o.height + '; implicit resizing is not allowed');
        expectedDurations.set(timestamp, duration); checkError();
        const frame = new environment.VideoFrame(canvas, { timestamp, duration, alpha: 'discard' });
        try { encoder.encode(frame, { keyFrame: index === 0 || index % Math.max(1, Math.round(o.fps)) === 0 }); }
        finally { frame.close(); }
        if (encoder.encodeQueueSize >= 4) { await encoder.flush(); checkError(); }
        await progress('encode', index + 1, time);
        // Yield to paint/progress and codec callbacks. This never advances the
        // media clock; the next media timestamp is still determined by index.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      await encoder.flush(); checkError();
      need(chunks.length === o.frameCount, 'encoder returned ' + chunks.length + ' frames instead of ' + o.frameCount);
      await progress('mux', o.frameCount, o.duration);
      const bytes = muxWebM(chunks, Object.assign({}, o, { codec: capability.codec, colorSpace: trackColorSpace }));
      const family = codecID(capability.codec) === 'V_VP8' ? 'vp8' : 'vp9';
      const blob = new Blob([bytes], { type: 'video/webm;codecs=' + family });
      await progress('complete', o.frameCount, o.duration);
      return { blob, width: o.width, height: o.height, frameCount: o.frameCount, fps: o.fps, duration: o.duration,
        codec: capability.codec, mimeType: blob.type, timing: 'fixed timestamps; no real-time frame dropping',
        encodedFrames: chunks.length, containerTimecodeScaleNanoseconds: TIMECODE_SCALE_NS,
        exporterVersion: VERSION,
        encoderSelection: { selectedCodec: capability.codec, preference: CODEC_PREFERENCE.slice(), attempts: capability.attempts,
          reason: 'Prefer VP9 bitstream range/matrix signalling; incompatible VP8 fallback is rejected.' },
        colorMetadata: Object.assign({ source: 'VideoEncoder output metadata.decoderConfig.colorSpace',
          decoderConfigEvents,
          bitstreamColourEvents,
          policy: 'Encoder-declared values only; missing values remain unspecified; no pixel-range remapping or guessed colour tags.' }, describeColour(trackColorSpace)) };
    } finally {
      if (encoder && encoder.state !== 'closed') { try { encoder.close(); } catch (_) {} }
    }
  }
  return { VERSION, CRFVideoUnsupportedError, capabilities, encode,
    _internals: { muxWebM, timing, vint, uint, describeColour, inspectVP9KeyColour, inspectBitstreamColour } };
});
