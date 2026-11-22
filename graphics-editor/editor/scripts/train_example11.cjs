#!/usr/bin/env node
'use strict';
// Real, already-bundled reference crops. No network call or source RGB in models.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const Learn = require('../web/learn11.js');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2), water = args.includes('--water'), conditional = args.includes('--conditional');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function prepareReference(relative, meta, crop = [0, 0, 1, 1], maxSide = 96) {
  const bytes = fs.readFileSync(path.join(root, relative)), source = PNG.sync.read(bytes);
  const x0 = Math.floor(crop[0] * source.width), y0 = Math.floor(crop[1] * source.height), x1 = Math.ceil(crop[2] * source.width), y1 = Math.ceil(crop[3] * source.height);
  const scale = Math.min(1, maxSide / Math.max(x1 - x0, y1 - y0)), width = Math.max(8, Math.round((x1 - x0) * scale)), height = Math.max(8, Math.round((y1 - y0) * scale)), data = new Uint8ClampedArray(width * height * 4);
  // Frozen nearest pixel-centre resampling; explicitly recorded in the report.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const xx = Math.min(x1 - 1, x0 + Math.floor((x + .5) * (x1 - x0) / width)), yy = Math.min(y1 - 1, y0 + Math.floor((y + .5) * (y1 - y0) / height)), p = (yy * source.width + xx) * 4;
    data.set(source.data.subarray(p, p + 4), (y * width + x) * 4);
  }
  return { ...meta, width, height, data, contentHash: sha(bytes), crop, originalWidth: source.width, originalHeight: source.height };
}
function refs({ water = false, conditional = false } = {}) {
  if (water) {
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/source_photos/sources.json'), 'utf8')).alpine;
    return [prepareReference('web/assets/v08/references/landscape.alpine.png', {
      id: 'lake.water', label: 'Lautersee 参考水面外观', sourceGroup: 'source.' + meta.downloadedFileSha256, sourceUri: meta.url,
      originalSourceHash: meta.downloadedFileSha256, licenseStatus: meta.license + ' (inherited source manifest)', attribution: meta.author,
      coverageKind: 'rectangle'
    }, [.05, .70, .95, .98])];
  }
  const library = JSON.parse(fs.readFileSync(path.join(root, 'web/assets/v08/learning.json'), 'utf8'));
  const ids = ['learn.r03.097cfbf071e3.object', ...(conditional ? ['learn.r01.c6657129fc5c.object'] : [])];
  return ids.map(id => {
    const meta = library.fits.find(x => x.assetId === id);
    if (!meta) throw new Error('Missing actual reference provenance: ' + id);
    return prepareReference('web/' + meta.referenceURL, { id, label: meta.label, sourceGroup: 'source.' + meta.sourceSHA256, sourceUri: meta.sourceUrl, originalSourceHash: meta.sourceSHA256, licenseStatus: meta.licenseStatus, attribution: meta.title, coverageKind: 'inferred_mask' });
  });
}
async function main() {
  const dataset = refs({ water, conditional }), name = water ? 'water' : conditional ? 'conditional' : 'ceramic';
  const result = await Learn.train(dataset, {});
  const replay = JSON.parse(JSON.stringify(result.model)), samplePositions = [[-.8, -.8], [-.3, .2], [0, 0], [.7, .4]];
  const replayExact = result.model.instances.every((_, instance) => samplePositions.every(([x, y]) => JSON.stringify(Learn.evaluate(result.model, x, y, instance)) === JSON.stringify(Learn.evaluate(replay, x, y, instance))));
  if (!replayExact) throw new Error('Serialized neural model replay differed.');
  const directory = path.join(root, 'reports/v11'); fs.mkdirSync(directory, { recursive: true });
  const example = { schema: 'crf.training_example/1.1', model: result.model, coverageByInstance: result.coverageByInstance, trainingRun: result.report };
  const report = { ...result.report, command: 'node scripts/train_example11.cjs' + (water ? ' --water' : conditional ? ' --conditional' : ''), inputKind: 'existing_real_reference_photo_crops', preprocessing: 'normalized crop; nearest pixel-centre downsample to longest side 96; alpha preserved; sRGB decoded to linear by trainer', serializedReplayExact: replayExact, trainingImproved: result.report.finalLoss < result.report.initialLoss, sourceRGBAtRender: false, sourceRGBInModel: false, approximateArtifactBytes: Buffer.byteLength(JSON.stringify(example)), limitations: ['Spatial validation was used to choose the checkpoint; it is not an independent source test.', 'Reference-derived lighting and reflections are retained; no unseen object, relighting or dynamic generalization is established.', 'Alpha is an explicitly disclosed independent coverage asset.', 'No claim of photographic-quality improvement or target-device acceleration is made.'] };
  fs.writeFileSync(path.join(directory, 'training-' + name + '.model.json'), JSON.stringify(example, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'training-' + name + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ name, state: report.state, initialLoss: report.initialLoss, finalLoss: report.finalLoss, validationLoss: report.validationLoss, parameterCount: report.parameterCount, elapsedMs: report.elapsedMs, serializedReplayExact: replayExact, paths: ['reports/v11/training-' + name + '.model.json', 'reports/v11/training-' + name + '.json'] }, null, 2));
}
module.exports = { prepareReference, referenceDataset: refs };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
