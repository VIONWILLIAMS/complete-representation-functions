'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const VIDEO = require('../web/crf-video09.js');
const source = fs.readFileSync(path.join(__dirname, '../web/crf-video09.js'), 'utf8');

// Independent EBML reader: tests inspect bytes at the actual Video/Colour path,
// not the muxer's own mapping/report. This also checks subsequent Seek/Cue data
// remains readable after adding a variable-length Colour element.
function elements(bytes, start = 0, end = bytes.length) {
  const out = []; let pos = start;
  while (pos < end) {
    let len = 1, mask = 0x80;
    while (!(bytes[pos] & mask)) { len++; mask >>= 1; assert.ok(len <= 4); }
    let id = 0; for (let i = 0; i < len; i++) id = id * 256 + bytes[pos++];
    len = 1; mask = 0x80;
    while (!(bytes[pos] & mask)) { len++; mask >>= 1; assert.ok(len <= 8); }
    let size = bytes[pos++] & (mask - 1);
    for (let i = 1; i < len; i++) size = size * 256 + bytes[pos++];
    assert.ok(Number.isSafeInteger(size) && pos + size <= end);
    out.push({ id, data: bytes.subarray(pos, pos + size) }); pos += size;
  }
  assert.equal(pos, end); return out;
}
function child(bytes, id) { return elements(bytes).find(e => e.id === id)?.data; }
function uint(bytes) { return bytes.reduce((n, value) => n * 256 + value, 0); }
function trackData(bytes) {
  return child(child(child(bytes, 0x18538067), 0x1654AE6B), 0xAE);
}
function readColour(bytes) {
  const colour = child(child(trackData(bytes), 0xE0), 0x55B0);
  return colour ? Object.fromEntries(elements(colour).map(e => [e.id.toString(16), uint(e.data)])) : null;
}
function chunks(n = 2, fps = 24) {
  return Array.from({ length: n }, (_, i) => ({
    data: Uint8Array.of(0x10, 0, 0, i), type: i ? 'delta' : 'key',
    timestamp: Math.round(i * 1e6 / fps),
    duration: Math.round((i + 1) * 1e6 / fps) - Math.round(i * 1e6 / fps)
  }));
}
function mux(colorSpace, values = chunks()) {
  return VIDEO._internals.muxWebM(values, { width: 32, height: 16, fps: 24,
    duration: values.length / 24, codec: 'vp8', colorSpace });
}

// Golden mappings are the literal H.273 values in W3C WebCodecs 9.11–9.13
// and Matroska Colour. In particular rgb=0 is valid and false is limited.
const fixtures = [
  [{ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: true }, { '55b1': 1, '55b9': 2, '55ba': 1, '55bb': 1 }],
  [{ primaries: 'bt470bg', transfer: 'smpte170m', matrix: 'bt470bg', fullRange: false }, { '55b1': 5, '55b9': 1, '55ba': 6, '55bb': 5 }],
  [{ primaries: 'smpte170m', transfer: 'linear', matrix: 'smpte170m', fullRange: false }, { '55b1': 6, '55b9': 1, '55ba': 8, '55bb': 6 }],
  [{ primaries: 'smpte432', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true }, { '55b1': 0, '55b9': 2, '55ba': 13, '55bb': 12 }],
  [{ primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false }, { '55b1': 9, '55b9': 1, '55ba': 16, '55bb': 9 }],
  [{ primaries: 'bt2020', transfer: 'hlg', matrix: 'bt2020-ncl', fullRange: true }, { '55b1': 9, '55b9': 2, '55ba': 18, '55bb': 9 }]
];
test('WebM contains encoder colour values at the proper Track/Video/Colour path', () => {
  for (const [space, expected] of fixtures) assert.deepEqual(readColour(mux(space)), expected);
});
test('unknown metadata stays unspecified and unsupported future values are not guessed', () => {
  assert.equal(readColour(mux(undefined)), null);
  assert.equal(readColour(mux({ fullRange: null })), null);
  assert.deepEqual(readColour(mux({ primaries: 'bt709' })), { '55bb': 1 });
  const desc = VIDEO._internals.describeColour({ matrix: 'future-matrix', fullRange: null });
  assert.deepEqual(desc.unmappedFields, { matrix: 'future-matrix' });
  assert.equal(desc.encoderColorSpace.matrix, 'future-matrix');
  assert.equal(desc.webmColour.matrixCoefficients, null);
  assert.equal(desc.webmColour.range, null);
  assert.equal(readColour(mux({ matrix: 'future-matrix' })), null);
  assert.throws(() => mux({ fullRange: 'false' }), /invalid colorSpace.fullRange/);
});
test('colour tags do not modify encoded blocks and original fixed-time validation remains', () => {
  const input = chunks();
  const noColour = child(child(mux(null, input), 0x18538067), 0x1F43B675);
  const withColour = child(child(mux(fixtures[0][0], input), 0x18538067), 0x1F43B675);
  assert.deepEqual(withColour, noColour);
  const wrongTime = chunks(); wrongTime[1].timestamp++;
  assert.throws(() => mux(fixtures[0][0], wrongTime), /changed a frame timestamp/);
  const wrongDuration = chunks(); wrongDuration[0].duration++;
  assert.throws(() => mux(fixtures[0][0], wrongDuration), /changed a frame duration/);
  const missingKey = chunks(); missingKey[0].type = 'delta';
  assert.throws(() => mux(fixtures[0][0], missingKey), /must be a keyframe/);
});

function mockAPI(metadataForFrame, supportedCodecs = ['vp09.00.40.08']) {
  const frames = [], encoders = [];
  class VideoFrame {
    constructor(canvas, init) { Object.assign(this, init); this.canvas = canvas; this.closed = false; frames.push(this); }
    close() { this.closed = true; }
  }
  class VideoEncoder {
    static async isConfigSupported(config) { return { supported: supportedCodecs.includes(config.codec), config }; }
    constructor(callbacks) { this.callbacks = callbacks; this.state = 'unconfigured'; this.encodeQueueSize = 0; this.index = 0; encoders.push(this); }
    configure(config) { this.config = config; this.state = 'configured'; }
    encode(frame, options) {
      const i = this.index++;
      // Minimal genuine VP9 colour-header syntax; no picture decode is used
      // by the callback mocks. Real packets are exercised by ffprobe below.
      const data = this.config.codec === 'vp8' ? Uint8Array.of(0x10, 0, 0, i) : Uint8Array.of(0x82, 0x49, 0x83, 0x42, 0x50, i);
      const chunk = { byteLength: data.length, timestamp: frame.timestamp, duration: frame.duration,
        type: options.keyFrame ? 'key' : 'delta', copyTo(target) { target.set(data); } };
      this.callbacks.output(chunk, metadataForFrame(i, this.config));
    }
    async flush() {}
    close() { this.state = 'closed'; }
  }
  const context = { module: { exports: {} }, TextEncoder, Uint8Array, DataView, Blob, setTimeout, VideoFrame, VideoEncoder };
  vm.runInNewContext(source, context, { filename: 'crf-video09.js' });
  return { api: context.module.exports, frames, encoders };
}
function decoderConfig(colorSpace, codec = 'vp09.00.40.08') { return { decoderConfig: { codec, codedWidth: 32, codedHeight: 16, colorSpace } }; }
const canvas = { width: 32, height: 16, getContext() {} };
test('encode preserves first encoder metadata through later absent events and reports getters', async () => {
  const space = Object.create(null, Object.fromEntries(Object.entries(fixtures[0][0]).map(([k, v]) => [k, { get() { return v; } }])));
  const { api, frames, encoders } = mockAPI(i => i === 0 ? decoderConfig(space) : {});
  const result = await api.encode({ width: 32, height: 16, fps: 24, duration: 0.25, renderFrame: () => canvas });
  assert.deepEqual(readColour(new Uint8Array(await result.blob.arrayBuffer())), fixtures[0][1]);
  const report = JSON.parse(JSON.stringify(result.colorMetadata));
  assert.deepEqual(report.encoderColorSpace, fixtures[0][0]);
  assert.equal(report.decoderConfigEvents.length, 1);
  assert.equal(report.decoderConfigEvents[0].timestamp, 0);
  assert.deepEqual(frames.map(f => f.timestamp), [0, 41667, 83333, 125000, 166667, 208333]);
  assert.deepEqual(frames.map(f => f.duration), [41667, 41666, 41667, 41667, 41666, 41667]);
  assert.equal(result.encodedFrames, 6);
  assert.equal(result.exporterVersion, '0.9.1');
  assert.equal(result.encoderSelection.selectedCodec, 'vp09.00.40.08');
  assert.deepEqual(JSON.parse(JSON.stringify(result.encoderSelection.attempts)), [{ codec: 'vp09.00.40.08', supported: true }]);
  assert.equal(report.bitstreamColourEvents[0].status, 'matched-declared-range-and-matrix');
  assert.equal(report.bitstreamColourEvents[0].fullRange, true);
  assert.equal(report.bitstreamColourEvents[0].matrix, 'bt709');
  assert.ok(frames.every(f => f.closed)); assert.equal(encoders[0].state, 'closed');
});
test('encode never substitutes canvas metadata when encoder supplies none', async () => {
  const { api } = mockAPI(() => ({}));
  const result = await api.encode({ width: 32, height: 16, fps: 24, duration: 1 / 24,
    renderFrame: () => ({ ...canvas, colorSpace: fixtures[0][0] }) });
  assert.equal(readColour(new Uint8Array(await result.blob.arrayBuffer())), null);
  assert.equal(result.colorMetadata.webmColour.written, false);
  assert.equal(result.colorMetadata.unknownFields.length, 4);
});
test('single-track encoder rejects declared colour changes rather than mislabelling frames', async () => {
  for (const initial of [fixtures[0][0], undefined]) {
    const later = { ...fixtures[0][0], fullRange: false };
    const { api, encoders, frames } = mockAPI(i => i === 0 ? initial && decoderConfig(initial) : decoderConfig(later));
    await assert.rejects(api.encode({ width: 32, height: 16, fps: 24, duration: 2 / 24, renderFrame: () => canvas }), /changed the declared color space/);
    assert.equal(encoders[0].state, 'closed'); assert.ok(frames.every(f => f.closed));
  }
});
test('encode retains codec/dimension validation and refuses implicit canvas resizing', async () => {
  for (const change of [{ codec: 'avc1.42E01E' }, { codedWidth: 33 }, { codedHeight: 17 }]) {
    const { api } = mockAPI(() => ({ decoderConfig: { ...decoderConfig(fixtures[0][0]).decoderConfig, ...change } }));
    await assert.rejects(api.encode({ width: 32, height: 16, fps: 24, duration: 1 / 24, renderFrame: () => canvas }), /only supports|changed the requested/);
  }
  const { api } = mockAPI(() => ({}));
  await assert.rejects(api.encode({ width: 32, height: 16, fps: 24, duration: 1 / 24, renderFrame: () => ({ ...canvas, width: 64 }) }), /implicit resizing is not allowed/);
});

// Genuine 32×16 libvpx packet, generated once from FFmpeg's testsrc (not a
// browser measurement): scale=in_range=full:out_range=full:out_color_matrix=bt709,
// format=yuv420p; libvpx -deadline best -crf 10 -b:v 100000; one IVF keyframe.
// A standard consumer must read our container Colour tags without overrides.
const vp8Packet = Buffer.from('sA4AnQEqIAAQAAAHCIWFiIWEiAICAnW6JMG+A/iB+lfGC8s2UE8A/xD8M/4DvAP8X/DPeAf6NvAPoA9YD+l/ojf2D3Af03/0fsQfyW7BfiX4T/pfZg/ST+IGkB/Bz9gP6Bljn4gfirWM3kgd6T6mX9a/IvYyVBr8zaxUJDzwgP7//0KhPLBXPRXr/XQflsmwnFSzuK//yZfPPCf0Fv/7Qj9qQY77IpD4KmRzZv11/WQdgJjWD//PeCPN91B/PPV/u39ijrDTn0coNNSIbDB9DBLsbGXO4kWL3mIx/PcwR1rUwx7rzfs11bNCf8x/5AjddkRE8max7s9+Hk9r1XWvFS3wjTxJWLOu7e+bdaq1M65D2sXub/RMuGRnWQ8Xp0WdMGpVksRHMkcUvxyQMtUGvXn7HEO/Iq7r9Qsd7Z8ssiP/NuMm9OX/7meRToavNhgUi3BOEccwWSFKx7atPGAVfBQLBN64MPs//wn/zBrYH9p2FvTsvVacT39dZcafbZr1WuTR8v3uBQ/5z1v9XvjMBbBT1C4LIbDNUVtR7TM3/W04UVGhPvewRt8AHBVZVXAt29MjnSu73/opAjQy3n0OeTvqa1stsoivmoaFNsIwjCM7WlEbcQw=', 'base64');
test('ffprobe reads stream tags but VP8 frame metadata can contradict them (regression evidence)', t => {
  if (spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status !== 0) return t.skip('ffprobe unavailable; byte-level EBML and WebCodecs callback tests still run');
  assert.equal(createHash('sha256').update(vp8Packet).digest('hex'), '436935293ee3ed6c3f6aff814e3ad5ee93d52a2764e7b5afa241cf5b54959010');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-colour09-'));
  try {
    const filename = path.join(dir, 'colour.webm');
    fs.writeFileSync(filename, mux(fixtures[0][0], [{ data: vp8Packet, type: 'key', timestamp: 0, duration: 41667 }]));
    const proc = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', filename], { encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
    const stream = JSON.parse(proc.stdout).streams[0];
    assert.equal(stream.codec_name, 'vp8'); assert.equal(stream.width, 32); assert.equal(stream.height, 16);
    assert.equal(stream.color_range, 'pc'); assert.equal(stream.color_space, 'bt709');
    assert.equal(stream.color_transfer, 'bt709'); assert.equal(stream.color_primaries, 'bt709');
    const frame = JSON.parse(proc.stdout).frames[0];
    assert.equal(frame.color_range, 'tv'); assert.equal(frame.color_space, 'bt470bg');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('capability selection records VP9 attempts before VP8 and rejects unsafe VP8 fallback', async () => {
  const { api } = mockAPI(() => decoderConfig(fixtures[0][0], 'vp8'), ['vp8']);
  const cap = await api.capabilities({ width: 32, height: 16, fps: 24 });
  assert.deepEqual(JSON.parse(JSON.stringify(cap.attempts)), [
    { codec: 'vp09.00.40.08', supported: false },
    { codec: 'vp09.00.10.08', supported: false },
    { codec: 'vp8', supported: true }
  ]);
  await assert.rejects(api.encode({ width: 32, height: 16, fps: 24, duration: 1 / 24, renderFrame: () => canvas }), /VP9-capable encoder is required/);
});
test('VP9 bitstream checks detect range/matrix contradictions instead of trusting container tags', () => {
  const header = Uint8Array.of(0x82, 0x49, 0x83, 0x42, 0x50);
  assert.deepEqual(VIDEO._internals.inspectVP9KeyColour(header), { profile: 0, bitDepth: 8, colorSpaceCode: 2, matrix: 'bt709', fullRange: true });
  assert.throws(() => VIDEO._internals.inspectBitstreamColour('vp09.00.40.08', header, { ...fixtures[0][0], fullRange: false }), /bitstream range conflicts/);
  assert.throws(() => VIDEO._internals.inspectBitstreamColour('vp09.00.40.08', header, { ...fixtures[0][0], matrix: 'bt470bg' }), /bitstream matrix conflicts/);
  assert.throws(() => VIDEO._internals.inspectVP9KeyColour(header.subarray(0, 4)), /truncated/);
});
// Generated from the same testsrc and full-range BT.709 conversion as above,
// using libvpx-vp9 -deadline good -cpu-used 0 -crf 10 -b:v 100000, with
// transfer=iec61966-2-1. Its VP9 bitstream carries range/matrix explicitly.
const vp9Packet = Buffer.from('gkmDQlAB8AD2ADgkHBhCAAAgIAB8y6J///8WXf+Htlr2+XEWQjg/iBpnH//9aMX8mA+5lH6Pbn5CixYbgH7LqB6jMgIbP5/GwWdbe/AIb/9MB//9awBT///7qWHq94P//5uGx2vf//LJ0P8f//ygB+SlogwIQf+Ur8+dVuizA4wulz//5Ao+yFD7eZZ61XrPY/0060n8ZxqXjQt0qhNyfzsfz3cSEG9f/0mZYAykECNMEBEgjGAVy3b//6MeeEquHCp59vN+UnCj//82NP//rWBt///7kenq94P//5duqHy///LS5R1/lTDsMtvtGf0j9+6pr9ndv/6JD///yTwD+5crPr2a8xvlA///Pi/y/kUUl2km1S3wMlsv/8nQ/vTEqkg0IHfDJGKo7v//zPh6NQIPJabot3++3JFT1I8LBCyZmr/Aa7On/9M355z3F7Qz//k52PxSFl2/7fdmEOL8Be6jL/67VerEWQ8IL8uGuFzk', 'base64');
test('real VP9 packet yields agreeing bitstream, container and decoded-frame range/matrix', t => {
  if (spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status !== 0) return t.skip('ffprobe unavailable');
  assert.equal(createHash('sha256').update(vp9Packet).digest('hex'), 'efd8c499c1ac1f38b9a3c31a1510be6a9663159c90673f5ebe57bbc09a4dcb31');
  const space = { ...fixtures[0][0], transfer: 'iec61966-2-1' };
  const observed = VIDEO._internals.inspectBitstreamColour('vp09.00.40.08', vp9Packet, space);
  assert.equal(observed.status, 'matched-declared-range-and-matrix');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-vp9-colour09-'));
  try {
    const filename = path.join(dir, 'vp9.webm');
    fs.writeFileSync(filename, VIDEO._internals.muxWebM([{ data: vp9Packet, type: 'key', timestamp: 0, duration: 41667 }],
      { width: 32, height: 16, fps: 24, duration: 1 / 24, codec: 'vp09.00.40.08', colorSpace: space }));
    const proc = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', filename], { encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
    const result = JSON.parse(proc.stdout);
    assert.equal(result.streams[0].codec_name, 'vp9'); assert.equal(result.frames.length, 1);
    for (const section of [result.streams[0], result.frames[0]]) {
      assert.equal(section.color_range, 'pc'); assert.equal(section.color_space, 'bt709');
      assert.equal(section.color_transfer, 'iec61966-2-1'); assert.equal(section.color_primaries, 'bt709');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('legacy exporter bytes remain intact', () => {
  const legacy = fs.readFileSync(path.join(__dirname, '../web/crf-video.js'));
  assert.equal(createHash('sha256').update(legacy).digest('hex'), '6b56aecce1bcb60f233e5573cd8565e25a6c41e5579b2eb150c354056a98dd48');
});
