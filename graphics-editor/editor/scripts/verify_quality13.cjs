#!/usr/bin/env node
'use strict';
// Render numerical assets first; only then open the independently produced PNG.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const {PNG} = require('pngjs');
const C = require('../web/crf-quality12.js');
const ROOT = path.resolve(__dirname, '..');
const contractBytes = fs.readFileSync(path.join(ROOT, 'contracts/quality13.json'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const CONTRACT_HASH = 'f262a18ad60ae4f77bed9608b28aecac2c1201d109a7709b82668a1d0a1b193b';
assert.equal(sha(contractBytes), CONTRACT_HASH, 'Frozen quality13 contract changed');
const contract = JSON.parse(contractBytes);
const OUT = path.join(ROOT, 'reports/quality13/runtime');
function compare(a, b) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height); assert.equal(a.data.length, b.data.length);
  let changed = 0, maximum = 0;
  for (let i = 0; i < a.data.length; i++) {
    const error = Math.abs(a.data[i] - b.data[i]); changed += +(error !== 0); maximum = Math.max(maximum, error);
  }
  return {changedChannels: changed, maxChannelError: maximum, exact: changed === 0};
}
function savePNG(name, frame) {
  const bytes = PNG.sync.write({width: frame.width, height: frame.height, data: Buffer.from(frame.data)});
  fs.writeFileSync(path.join(OUT, name), bytes);
  return {path: 'reports/quality13/runtime/' + name, width: frame.width, height: frame.height,
    fileSHA256: sha(bytes), rgbaSHA256: sha(frame.data), bytes: bytes.length};
}
(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const rows = [];
  for (const scene of contract.scenes) {
    const filename = path.join(ROOT, 'quality-packs', scene.id + '.asset.json');
    const bytes = fs.readFileSync(filename), asset = JSON.parse(bytes);
    const p = C.createProject(asset, {title: scene.title, qualityContractHash: CONTRACT_HASH});
    assert.equal(p.asset.width, scene.width); assert.equal(p.asset.height, scene.height);
    assert.ok(p.asset.splats.length <= scene.basisBudget);
    const native = C.render(p);
    const serial = await C.serializeProject(p);
    const parsed = await C.parseProject(serial);
    const replay = C.render(parsed), projectReplay = compare(native, replay);
    assert.ok(projectReplay.exact, scene.id + ' project replay differs');
    fs.writeFileSync(path.join(ROOT, 'quality-packs', scene.id + '.crf.json'), serial);
    const independentFile = path.join(ROOT, 'reports/quality13/fitting', scene.id, scene.id + '.png');
    const independent = PNG.sync.read(fs.readFileSync(independentFile));
    const crossRuntime = compare(native, independent);
    assert.ok(crossRuntime.maxChannelError <= 1, scene.id + ' JS/Python mismatch');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-detail-replay-'));
    let isolated;
    try {
      fs.copyFileSync(path.join(ROOT, 'web/crf-quality12.js'), path.join(temporary, 'kernel.cjs'));
      fs.writeFileSync(path.join(temporary, 'project.json'), serial);
      fs.writeFileSync(path.join(temporary, 'replay.cjs'),
        "const fs=require('node:fs'),C=require('./kernel.cjs');(async()=>{const p=await C.parseProject(fs.readFileSync('project.json','utf8'));const r=C.render(p);fs.writeFileSync('frame.rgba',r.data);})().catch(e=>{console.error(e);process.exitCode=1;});");
      cp.execFileSync(process.execPath, ['replay.cjs'], {cwd: temporary, timeout: 60000});
      isolated = compare(native, {width: scene.width, height: scene.height, data: fs.readFileSync(path.join(temporary, 'frame.rgba'))});
      assert.ok(isolated.exact, scene.id + ' fresh-process replay differs');
    } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
    const modified = C.render(C.applyEdits(p, {exposure: .25}));
    const editing = compare(native, modified); assert.ok(editing.changedChannels > 0);
    const regions = [];
    for (const roi of scene.rois) {
      const [x0, y0, x1, y1] = roi.bounds.map((v, i) => i < 2 ? Math.floor(v * (i % 2 ? scene.height : scene.width)) : Math.ceil(v * (i % 2 ? scene.height : scene.width)));
      const w = x1 - x0, h = y1 - y0;
      const region = C.render(p, {width: w, height: h, roi: [x0 / scene.width, y0 / scene.height, x1 / scene.width, y1 / scene.height]});
      const expected = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) expected.set(native.data.subarray(((y+y0)*scene.width+x0)*4, ((y+y0)*scene.width+x1)*4), y*w*4);
      const exact = compare(region, {width: w, height: h, data: expected});
      assert.ok(exact.exact, scene.id + '/' + roi.id + ' pixel-aligned crop differs');
      regions.push({id: roi.id, pixelBounds: [x0,y0,x1,y1], comparison: exact});
    }
    const outputs = {native: savePNG(scene.id + '.png', native), edited: savePNG(scene.id + '.edited.png', modified)};
    let budgetGuard;
    if (scene.width * scene.height * 4 > C.LIMITS.pixels) {
      assert.throws(() => C.render(p, {width: scene.width * 2, height: scene.height * 2}), {code: 'RESOURCE_LIMIT'});
      budgetGuard = {requestedWidth: scene.width * 2, requestedHeight: scene.height * 2, status: 'correctly_rejected'};
      const enlarged = C.render(p, {width: scene.width * 1.5, height: scene.height * 1.5});
      outputs.resampled = savePNG(scene.id + '.1_5x.png', enlarged);
    }
    rows.push({id: scene.id, status: 'passed', assetSHA256: sha(bytes), projectContentHash: parsed.contentHash,
      serializedProjectBytes: Buffer.byteLength(serial), outputs, crossRuntime, projectReplay,
      isolatedReplay: {...isolated, filesSupplied: ['kernel.cjs', 'project.json', 'replay.cjs'], sourceImageSupplied: false, accessSandboxClaim: false},
      editing, regions, budgetGuard, diagnostics: native.diagnostics});
    console.log(JSON.stringify({id: scene.id, crossRuntime, isolated, elapsedMs: native.diagnostics.elapsedMs}));
  }
  const report = {schema: 'crf.detail_runtime_verification.v1', generatedAt: new Date().toISOString(), status: 'passed',
    contractSHA256: CONTRACT_HASH, rendererSHA256: sha(fs.readFileSync(path.join(ROOT,'web/crf-quality12.js'))),
    verifierSHA256: sha(fs.readFileSync(__filename)), environment: {node: process.version, cpu: os.cpus()[0]?.model},
    scope: 'Function evaluation, cross-runtime, serialization and pixel-aligned crops; photo quality evaluated separately.', scenes: rows};
  fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
})().catch(error => {console.error(error); process.exitCode = 1;});
