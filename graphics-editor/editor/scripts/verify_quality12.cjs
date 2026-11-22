#!/usr/bin/env node
'use strict';
// Reconstruct entirely from declared parameters, then compare to the separately
// produced Python frame. The source photograph is never an input to rendering.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), cp = require('node:child_process');
const { PNG } = require('pngjs');
const C = require('../web/crf-quality12.js');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), values = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--asset', '--python-reference', '--out'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/verify_quality12.cjs [--asset FILE] [--python-reference PNG] [--out DIRECTORY]');
  values[args[i]] = path.resolve(args[i + 1]);
}
const ASSET = values['--asset'] || path.join(ROOT, 'web/assets/quality12/alpine.asset.json');
const REFERENCE = values['--python-reference'] || path.join(ROOT, 'reports/quality12/alpine/reconstruction.png');
const OUT = values['--out'] || path.join(ROOT, 'reports/quality12/kernel');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(ROOT, file).split(path.sep).join('/');
function compareRGBA(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) throw new Error('Compared frame descriptors differ.');
  let changed = 0, max = 0, absolute = 0, square = 0, pixelsChanged = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let altered = false;
    for (let k = 0; k < 4; k++) {
      const d = Math.abs(a.data[i + k] - b.data[i + k]);
      changed += +(d > 0); altered ||= d > 0; max = Math.max(max, d);
      if (k < 3) { absolute += d; square += d * d; }
    }
    pixelsChanged += +altered;
  }
  const channels = a.width * a.height * 3, mse = square / channels;
  return { width: a.width, height: a.height, channels: 'RGBA8', changedChannels: changed, changedPixels: pixelsChanged,
    maxChannelError: max, meanRGBError: absolute / channels, rgbPSNR: mse === 0 ? null : 10 * Math.log10(65025 / mse),
    exact: changed === 0, identicalPSNRConvention: 'null_means_zero_error_infinite_PSNR' };
}
function png(file, frame) {
  const bytes = PNG.sync.write({ width: frame.width, height: frame.height, data: Buffer.from(frame.data) },
    { colorType: 6, inputColorType: 6, bitDepth: 8 });
  fs.writeFileSync(file, bytes);
  return { path: relative(file), sha256: sha(bytes), rgbaSHA256: sha(frame.data), bytes: bytes.length, width: frame.width, height: frame.height };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rawAsset = fs.readFileSync(ASSET), input = JSON.parse(rawAsset);
  const project = C.createProject(input, { title: 'Lautersee full-resolution parameter reconstruction' });
  const native = C.render(project);
  const enlarged = C.render(project, { width: project.asset.width * 2, height: project.asset.height * 2 });
  // Frame reconstruction has finished before any comparison image is opened.
  const pythonBytes = fs.readFileSync(REFERENCE), python = PNG.sync.read(pythonBytes);
  const crossRuntime = compareRGBA(native, python);
  if (!crossRuntime.exact) throw new Error('Native JS reconstruction differs from Python RGBA.');
  const serialized = await C.serializeProject(project);
  const reopened = await C.parseProject(serialized), replay = C.render(reopened);
  const JSONReplay = compareRGBA(native, replay);
  if (!JSONReplay.exact) throw new Error('Hashed JSON replay differs.');
  let isolatedReplay;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-quality12-replay-'));
  try {
    fs.copyFileSync(path.join(ROOT, 'web/crf-quality12.js'), path.join(temporary, 'kernel.cjs'));
    fs.writeFileSync(path.join(temporary, 'project.json'), serialized);
    fs.writeFileSync(path.join(temporary, 'replay.cjs'), `const fs=require('node:fs');const C=require('./kernel.cjs');\n(async()=>{const p=await C.parseProject(fs.readFileSync('project.json','utf8'));const r=C.render(p);fs.writeFileSync('frame.rgba',Buffer.from(r.data));process.stdout.write(JSON.stringify({width:r.width,height:r.height,diagnostics:r.diagnostics}));})().catch(e=>{process.stderr.write(e.message);process.exitCode=1;});\n`);
    const metadata = JSON.parse(cp.execFileSync(process.execPath, ['replay.cjs'], { cwd: temporary, encoding: 'utf8', timeout: 30000 }));
    const data = fs.readFileSync(path.join(temporary, 'frame.rgba'));
    isolatedReplay = { ...compareRGBA(native, { ...metadata, data }), process: 'fresh_Node_process',
      filesSupplied: ['kernel.cjs', 'project.json', 'replay.cjs'], referenceImageSupplied: false,
      sourcePhotographSupplied: false, networkRequired: false, accessSandboxClaim: false };
    if (!isolatedReplay.exact) throw new Error('Isolated parameter-only replay differs.');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  const ablated = C.render({ ...project, asset: { ...project.asset, splats: [] } });
  const ablation = compareRGBA(native, ablated);
  if (ablation.changedPixels === 0) throw new Error('The supplied Gaussian parameters did not affect the output.');
  const regions = [
    { id: 'mountain_forest', roi: [.05, .05, .4, .55] },
    { id: 'water', roi: [.05, .70, .95, .98] },
    { id: 'shore_buildings', roi: [.60, .48, .98, .70] }
  ];
  const crops = regions.map(region => {
    const w = project.asset.width, h = project.asset.height;
    const box = [Math.floor(region.roi[0] * w), Math.floor(region.roi[1] * h), Math.ceil(region.roi[2] * w), Math.ceil(region.roi[3] * h)];
    const view = { width: box[2] - box[0], height: box[3] - box[1], roi: [box[0] / w, box[1] / h, box[2] / w, box[3] / h] };
    const crop = C.render(project, view), expected = new Uint8ClampedArray(crop.data.length);
    for (let y = 0; y < crop.height; y++) {
      const start = ((y + box[1]) * w + box[0]) * 4;
      expected.set(native.data.subarray(start, start + crop.width * 4), y * crop.width * 4);
    }
    const comparison = compareRGBA(crop, { width: crop.width, height: crop.height, data: expected });
    if (!comparison.exact) throw new Error('Native ROI changed existing sample coordinates: ' + region.id);
    return { id: region.id, sourcePixelBounds: box, requestedROI: region.roi, renderedROI: view.roi,
      independentCropReplay: comparison, output: png(path.join(OUT, region.id + '.png'), crop) };
  });
  const report = { schema: 'crf.quality_kernel_verification.v1', version: C.VERSION, generatedAt: new Date().toISOString(),
    status: 'passed', scope: 'numerical_implementation_and_replay_not_a_new_reference_quality_score',
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpuModel: os.cpus()[0]?.model, cpuCount: os.cpus().length },
    asset: { path: relative(ASSET), sha256: sha(rawAsset), bytes: rawAsset.length,
      gaussianCount: project.asset.splats.length, qualityContractHash: project.qualityContractHash },
    renderer: { path: 'web/crf-quality12.js', sha256: sha(fs.readFileSync(path.join(ROOT, 'web/crf-quality12.js'))) },
    verifier: { path: 'scripts/verify_quality12.cjs', sha256: sha(fs.readFileSync(__filename)) },
    independentPythonFrame: { path: relative(REFERENCE), sha256: sha(pythonBytes) },
    outputs: { native: png(path.join(OUT, 'native.png'), native), doubleResolution: png(path.join(OUT, 'double-resolution.png'), enlarged) },
    timings: { scope: 'single_cold_synchronous_render_on_this_machine_not_browser_or_realtime_claim',
      nativeMs: native.diagnostics.elapsedMs, doubleResolutionMs: enlarged.diagnostics.elapsedMs },
    nativeDiagnostics: native.diagnostics, doubleResolutionDiagnostics: enlarged.diagnostics,
    crossRuntime, JSONReplay: { ...JSONReplay, contentHash: reopened.contentHash, serializedBytes: Buffer.byteLength(serialized) },
    isolatedReplay, coefficientAblation: { ...ablation, intervention: 'remove_all_splats_keep_base',
      purpose: 'confirm_declared_function_coefficients_materially_drive_pixels_not_an_external_RGB_image' }, crops,
    limitations: ['The reference-conditioned reconstruction is not a generative model.',
      'Double resolution evaluates the fitted continuous field; it does not establish recovery of unseen source detail.',
      'Tone edits are linear exposure followed by display-space contrast/saturation, not physical relighting.',
      'Browser timing and actual UI export are validated separately.'] };
  fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: relative(path.join(OUT, 'verification.json')),
    nativeMs: report.timings.nativeMs, doubleResolutionMs: report.timings.doubleResolutionMs,
    crossRuntimeChangedChannels: crossRuntime.changedChannels, isolatedReplayChangedChannels: isolatedReplay.changedChannels,
    assetSHA256: report.asset.sha256, projectContentHash: reopened.contentHash }, null, 2));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
