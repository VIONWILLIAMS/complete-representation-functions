#!/usr/bin/env node
'use strict';

/* Build an offline viewer of actual function parameters. The output image is
 * intentionally not an input: only the comparison pane receives a photograph. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Core = require('../web/crf-quality12.js');
const ROOT = path.resolve(__dirname, '..');
const CONTRACT_HASH = 'f262a18ad60ae4f77bed9608b28aecac2c1201d109a7709b82668a1d0a1b193b';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonForHTML = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function loadScene(root, scene, contractHash, fixture = false) {
  const assetPath = fixture ? path.join(root, 'web/assets/quality12/alpine.asset.json') : path.join(root, 'quality-packs', scene.id + '.asset.json');
  const reportPath = fixture ? path.join(root, 'web/assets/quality12/alpine.quality.json') : path.join(root, 'reports/quality13/fitting', scene.id, scene.id + '.quality.json');
  const assetBytes = fs.readFileSync(assetPath), report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const asset = JSON.parse(assetBytes), g = asset.gaussian;
  if (!g || g.width !== scene.width || g.height !== scene.height) throw new Error('Scene dimensions do not match the frozen reference: ' + scene.id);
  const validity = Core.validateAsset(g);
  if (!validity.ok) throw new Error('Invalid function asset: ' + validity.errors.join(' '));
  if (Number.isInteger(scene.basisBudget) && g.splats.length > scene.basisBudget)
    throw new Error('Function count exceeds the frozen scene budget: ' + scene.id);
  if (sha(assetBytes) !== (report.assetSHA256 || report.asset?.sha256)) throw new Error('Report does not match saved asset bytes: ' + scene.id);
  if (report.qualityContractHash !== contractHash || asset.qualityContractHash !== contractHash) throw new Error('Quality contract binding differs: ' + scene.id);
  if (report.source?.sha256 !== scene.fileSHA256) throw new Error('Report belongs to another reference: ' + scene.id);
  const referencePath = path.join(root, scene.referencePath), reference = fs.readFileSync(referencePath);
  if (sha(reference) !== scene.fileSHA256) throw new Error('Reference bytes differ from the frozen contract: ' + scene.id);
  if (!/^[a-f0-9]{64}$/.test(report.replayRGBASHA256 || '')) throw new Error('Quality report must bind decoded RGBA output: ' + scene.id);
  const mime = /\.jpe?g$/i.test(referencePath) ? 'image/jpeg' : 'image/png';
  return {
    id: scene.id, title: scene.title, width: scene.width, height: scene.height,
    rois: scene.rois, referenceScope: scene.referenceScope, asset,
    assetSHA256: sha(assetBytes), gaussianSHA256: sha(Core.canonical(g)),
    qualityContractHash: contractHash, expectedRGBASHA256: report.replayRGBASHA256,
    report: {
      schema: report.schema, passed: report.passed, metrics: report.metrics,
      tailMetrics: report.tailMetrics || {p99ChannelError: report.metrics?.p99ChannelError,
        fractionPixelsAnyChannelAbove32: report.metrics?.fractionPixelsAnyChannelAbove32},
      rois: report.rois, source: report.source, qualityContractHash: report.qualityContractHash,
      assetSHA256: report.assetSHA256 || report.asset?.sha256,
      replayRGBASHA256: report.replayRGBASHA256,
      fitSeconds: report.fit?.seconds ?? null, representation: report.representation,
      claimScope: report.claimScope || 'One observation-conditioned reconstruction; not novel-scene generation.'
    },
    comparisonOnly: {mime, referenceSHA256: scene.fileSHA256, imageDataURL: 'data:' + mime + ';base64,' + reference.toString('base64')}
  };
}

function build(options = {}) {
  const root = options.root || ROOT;
  if (!options.output) throw new Error('An explicit --output path is required.');
  const output = path.resolve(options.output);
  const web = path.join(root, 'web') + path.sep;
  if (output.startsWith(web)) throw new Error('Large portable reviews must remain outside the hosted web bundle.');
  let contractBytes, contract, definitions;
  if (options.fixture) {
    contractBytes = fs.readFileSync(path.join(root, 'contracts/quality12.json'));
    contract = JSON.parse(contractBytes);
    definitions = [{id: 'alpine_legacy', title: '山林湖泊 · 开发基线', width: 800, height: 531,
      referencePath: 'web/assets/v08/references/landscape.alpine.png',
      fileSHA256: 'b689d5ebe330549b6aa6489c3addffef029e7b803aeb63d61666843642a75222',
      referenceScope: 'Existing 800×531 development fixture; not the new high-resolution delivery.',
      rois: contract.rois.map(r => ({id: r.id, bounds: r.bounds}))}];
  } else {
    contractBytes = fs.readFileSync(path.join(root, 'contracts/quality13.json'));
    if (sha(contractBytes) !== CONTRACT_HASH) throw new Error('Detail-quality contract differs from the pre-fit frozen version.');
    contract = JSON.parse(contractBytes);
    const ids = options.scenes || contract.scenes.map(s => s.id);
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Select one or more distinct scene IDs.');
    definitions = ids.map(id => {
      const scene = contract.scenes.find(s => s.id === id);
      if (!scene) throw new Error('Unknown scene: ' + id);
      return scene;
    });
  }
  const contractHash = sha(contractBytes);
  const kernel = fs.readFileSync(path.join(root, 'web/crf-quality12.js'), 'utf8');
  if (/<\/script/i.test(kernel)) throw new Error('The exact embedded kernel contains an HTML script terminator.');
  const scenes = definitions.map(scene => loadScene(root, scene, contractHash, options.fixture));
  const payload = {schema: 'crf.portable_quality_review.v1', createdAt: new Date().toISOString(),
    product: 'CRF 1.1 · 细节质量实验', developmentFixture: !!options.fixture,
    kernelSHA256: sha(kernel), contractHash, scenes,
    renderingContract: {referencePixelsPassedToKernel: false, outputPreviewsEmbedded: false,
      source: 'explicit_function_coefficients_only', engine: 'CRFQuality12',
      maxOutputPixels: Core.LIMITS.pixels, maxSupportVisits: Core.LIMITS.supportVisits}};
  const template = fs.readFileSync(path.join(root, 'templates/quality-review13.html'), 'utf8');
  for (const marker of ['/*__CRF_KERNEL__*/', '/*__CRF_PAYLOAD__*/'])
    if (template.split(marker).length !== 2) throw new Error('Expected exactly one template marker: ' + marker);
  const html = template.replace('/*__CRF_KERNEL__*/', () => kernel).replace('/*__CRF_PAYLOAD__*/', () => jsonForHTML(payload));
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, html);
  return {schema: 'crf.portable_review_build.v1', output, bytes: Buffer.byteLength(html), sha256: sha(html),
    kernelSHA256: payload.kernelSHA256, contractHash, fixture: !!options.fixture,
    scenes: scenes.map(s => ({id: s.id, width: s.width, height: s.height,
      gaussians: s.asset.gaussian.splats.length, assetSHA256: s.assetSHA256,
      expectedRGBASHA256: s.expectedRGBASHA256, qualityPassed: s.report.passed})),
    embeddedOutputPreviews: 0, referenceImagesComparisonOnly: scenes.length};
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output') options.output = args[++i];
    else if (arg === '--scenes') options.scenes = (args[++i] || '').split(',').filter(Boolean);
    else if (arg === '--legacy-fixture') options.fixture = true;
    else if (arg === '--help') return {help: true};
    else throw new Error('Unknown argument: ' + arg);
  }
  return options;
}
module.exports = {build, loadScene, jsonForHTML, parseArgs, CONTRACT_HASH};
if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log('node scripts/build_quality_review13.cjs --output /absolute/path/CRF_Detail_Review.html [--scenes alpine_hd,street,orchard]\nDeveloper-only: --legacy-fixture');
    else console.log(JSON.stringify(build(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
