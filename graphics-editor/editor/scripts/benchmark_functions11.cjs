#!/usr/bin/env node
'use strict';
/* Fixed-protocol CPU benchmark. It records failed quality gates without moving
 * thresholds, and separates fresh-runtime/cache cost from warm frame timings. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const Core = require('../web/crf-core11.js');
const Learn = require('../web/learn11.js');
const { referenceDataset } = require('./train_example11.cjs');
const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'reports/v11/compute_benchmark.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const byteSize = value => Buffer.byteLength(JSON.stringify(value));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const immutable = value => { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object') immutable(child); return value; };
const CONTRACT = immutable({
  schema: 'crf.compute_benchmark_contract/1.1',
  cases: [{ name: 'water', file: 'training-water.model.json', instance: 0 }, { name: 'ceramic', file: 'training-ceramic.model.json', instance: 0 }, { name: 'conditional.ceramic', file: 'training-conditional.model.json', instance: 0 }, { name: 'conditional.orange', file: 'training-conditional.model.json', instance: 1 }],
  width: 256, height: 160, background: [.12, .14, .18],
  object: { x: 28, y: 20, width: 200, height: 120, opacity: 1, rotation: 0, tint: [1, 1, 1] },
  time: 0, samples: 1, cacheResolution: 64, repeats: 5,
  quality: { domain: 'RGB8 full-frame channels; all output alpha bytes', meanAbsoluteErrorMax: 1, maxChannelErrorMax: 12, alphaExact: true },
  seeds: [11, 29, 47], training: { steps: 600, hidden: 24, batchSize: 64, learningRate: .01 },
  qualityGateFrozenBeforeMeasurement: true,
  timingDefinitions: { compile: 'createRuntime including immutable snapshot/hash checks', cold: 'first frame of a fresh runtime, not a fresh operating-system process', warm: 'next same-profile frame on that runtime', cacheBuild: 'reported inside cold cached render; not added twice', endToEndCold: 'compile wall time plus first-frame wall time' },
  exclusions: ['No target Mac M4 performance claim.', 'No GPU path.', 'No photographic realism or unseen-source generalization claim.', 'All means are explicitly compared to direct evaluation, not source-photo truth.']
});
function difference(a, b, roi) {
  let count = 0, sum = 0, square = 0, max = 0, alphaDifferent = 0;
  for (let y = roi?.y ?? 0; y < (roi ? roi.y + roi.height : a.height); y++) for (let x = roi?.x ?? 0; x < (roi ? roi.x + roi.width : a.width); x++) {
    const p = (y * a.width + x) * 4; count++;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[p + c] - b.data[p + c]); sum += d; square += d * d; max = Math.max(max, d); }
    if (a.data[p + 3] !== b.data[p + 3]) alphaDifferent++;
  }
  return { pixels: count, meanAbsoluteError: sum / (count * 3), rootMeanSquaredError: Math.sqrt(square / (count * 3)), maxChannelError: max, alphaDifferentPixels: alphaDifferent, alphaExact: alphaDifferent === 0 };
}
async function projectFor(item, example) {
  let project = Core.createProject({ id: 'benchmark.' + item.name, title: 'CRF local CPU differential benchmark', width: CONTRACT.width, height: CONTRACT.height });
  project.scene.background = CONTRACT.background.slice();
  const fn = await Core.createNeuralFunction(example.model, { id: 'learned.' + item.name, label: example.model.instances[item.instance].label, coverageByInstance: example.coverageByInstance, report: example.trainingRun });
  project = await Core.registerFunction(project, fn);
  project = Core.applyPatch(project, { baseRevision: project.scene.revision, operations: [{ op: 'add', object: Core.createInstance(fn, { id: 'sample', instance: item.instance, ...CONTRACT.object }) }] });
  return project;
}
async function measureBackend(project, backend) {
  const times = [], coldFrames = [], warmFrames = []; let frame;
  for (let i = 0; i < CONTRACT.repeats; i++) {
    let t = performance.now(); const runtime = await Core.createRuntime(project, { cacheResolution: CONTRACT.cacheResolution }); const compileMs = performance.now() - t;
    t = performance.now(); const cold = runtime.render({ backend, time: CONTRACT.time, samples: CONTRACT.samples }); const coldMs = performance.now() - t;
    t = performance.now(); frame = runtime.render({ backend, time: CONTRACT.time, samples: CONTRACT.samples }); const warmMs = performance.now() - t;
    times.push({ compileMs, coldMs, warmMs, endToEndColdMs: compileMs + coldMs, cacheBuildMs: cold.diagnostics.cacheBuildMs, cacheBuildMAC: cold.diagnostics.cacheBuildMAC, cacheBytes: runtime.trace.cacheBytes, warmCacheBuildEvaluations: frame.diagnostics.cacheBuildEvaluations, estimatedFrameMAC: frame.diagnostics.estimatedFrameMAC, frameBuffersBytes: frame.data.byteLength + frame.linearData.byteLength });
    coldFrames.push(hash(cold.data)); warmFrames.push(hash(frame.data));
  }
  const summary = Object.fromEntries(['compileMs', 'coldMs', 'warmMs', 'endToEndColdMs', 'cacheBuildMs'].map(key => [key, median(times.map(x => x[key]))]));
  return { frame, report: { backend, repetitions: times, median: summary, framesDeterministicAcrossRepeats: new Set([...coldFrames, ...warmFrames]).size === 1, pixelSha256: warmFrames[0], lastDiagnostics: frame.diagnostics } };
}
async function main() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const modelFiles = Object.fromEntries([...new Set(CONTRACT.cases.map(c => c.file))].map(file => [file, hash(fs.readFileSync(path.join(root, 'reports/v11', file)))]));
  const sourceHashes = Object.fromEntries(['web/crf-core11.js', 'web/learn11.js', 'scripts/benchmark_functions11.cjs'].map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
  const report = { schema: 'crf.compute_benchmark/1.1', state: 'registered', registeredAt: new Date().toISOString(), contract: CONTRACT, contractSha256: await Core.digest(CONTRACT), inputFileHashes: modelFiles, sourceHashes, environment: { platform: process.platform, architecture: process.arch, node: process.version, cpuModel: os.cpus()[0]?.model || 'unknown', logicalCPUs: os.cpus().length, targetMacM4Measured: false, timingScope: 'this shared Linux executor; wall-clock observations may include scheduling noise' }, cases: [], trainingSeeds: [], failures: [] };
  // Persist the immutable thresholds and case list before the first measurement.
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  const savedFetch = globalThis.fetch; let blockedNetworkAttempts = 0;
  globalThis.fetch = async () => { blockedNetworkAttempts++; throw new Error('Reference/network fetch is forbidden during this runtime benchmark.'); };
  try {
    report.state = 'running';
    for (const item of CONTRACT.cases) {
      try {
        const example = JSON.parse(fs.readFileSync(path.join(root, 'reports/v11', item.file), 'utf8'));
        const project = await projectFor(item, example), direct = await measureBackend(project, 'direct'), cached = await measureBackend(project, 'cached');
        const comparison = difference(direct.frame, cached.frame), roiComparison = difference(direct.frame, cached.frame, CONTRACT.object);
        const cachedPasses = comparison.meanAbsoluteError <= CONTRACT.quality.meanAbsoluteErrorMax && comparison.maxChannelError <= CONTRACT.quality.maxChannelErrorMax && comparison.alphaExact;
        const restored = JSON.parse(JSON.stringify(project));
        const integrity = await Core.verifyProject(restored), replay = await Core.renderScene(restored, { backend: 'direct', time: CONTRACT.time, samples: CONTRACT.samples });
        const exactReplay = Buffer.from(replay.data).equals(Buffer.from(direct.frame.data));
        const payload = { projectJSONBytes: byteSize(project), functionLibraryJSONBytes: byteSize(project.functions), catalogJSONBytes: byteSize(Object.values(project.functions).map(Core.functionSummary)), modelJSONBytes: byteSize(example.model), modelWeightBytesFloat64: Learn.parameterCount(example.model) * 8, coverageJSONBytes: byteSize(example.coverageByInstance), preparedReferenceRGBABytes: example.model.instances.reduce((n, x) => n + x.width * x.height * 4, 0), sizeMeaning: 'bytes, not tokens; trained model may be larger than its small downsampled training image' };
        payload.libraryToCatalogByteRatio = payload.functionLibraryJSONBytes / payload.catalogJSONBytes;
        const row = { name: item.name, instance: item.instance, modelHash: example.trainingRun.modelHash, projectDigest: await Core.digest(project), direct: direct.report, cached: cached.report, comparison, objectRectangleComparison: roiComparison, qualityGate: { status: cachedPasses ? 'passed' : 'failed', thresholds: CONTRACT.quality }, payload, independentProjectImport: { integrity: integrity.ok, exactDirectRGBAReplay: exactReplay, referencesAvailableToRuntime: false }, speedRatios: { directOverCachedWarm: direct.report.median.warmMs / cached.report.median.warmMs, directOverCachedColdIncludingCompile: direct.report.median.endToEndColdMs / cached.report.median.endToEndColdMs } };
        report.cases.push(row);
        if (!cachedPasses || !integrity.ok || !exactReplay || !direct.report.framesDeterministicAcrossRepeats || !cached.report.framesDeterministicAcrossRepeats) report.failures.push({ case: item.name, code: 'COMPARISON_OR_REPLAY_FAILED' });
        console.log(JSON.stringify({ case: item.name, qualityGate: row.qualityGate.status, mae: comparison.meanAbsoluteError, max: comparison.maxChannelError, cachedWarmMedianMs: cached.report.median.warmMs, directWarmMedianMs: direct.report.median.warmMs, replay: exactReplay }));
      } catch (error) { report.failures.push({ case: item.name, code: error.code || 'BENCHMARK_FAILED', message: error.message }); }
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
  } finally { globalThis.fetch = savedFetch; }
  report.networkReadsDuringRuntime = blockedNetworkAttempts;
  if (blockedNetworkAttempts) report.failures.push({ code: 'RUNTIME_REQUESTED_NETWORK', count: blockedNetworkAttempts });
  const water = referenceDataset({ water: true });
  for (const seed of CONTRACT.seeds) {
    try {
      const result = await Learn.train(water, { ...CONTRACT.training, seed });
      const row = { seed, modelHash: result.report.modelHash, state: result.report.state, initialLoss: result.report.initialLoss, finalLoss: result.report.finalLoss, initialValidationLoss: result.report.initialValidationLoss, validationLoss: result.report.validationLoss, bestStep: result.report.bestStep, stepsCompleted: result.report.stepsCompleted, elapsedMs: result.report.elapsedMs, parameterCount: result.report.parameterCount, modelJSONBytes: result.report.modelJSONBytes, trainImproved: result.report.finalLoss < result.report.initialLoss, validationImproved: result.report.validationLoss < result.report.initialValidationLoss, evidenceScope: result.report.evidenceScope, independentSourceGeneralization: 'not_evaluated' };
      report.trainingSeeds.push(row); if (row.state !== 'completed') report.failures.push({ code: 'TRAINING_INCOMPLETE', seed });
      console.log(JSON.stringify({ seed, initialLoss: row.initialLoss, finalLoss: row.finalLoss, validationLoss: row.validationLoss, state: row.state }));
    } catch (error) { report.failures.push({ code: error.code || 'TRAINING_FAILED', seed, message: error.message, report: error.report || null }); }
  }
  report.trainingSeedSummary = { count: report.trainingSeeds.length, allTrainImproved: report.trainingSeeds.length === CONTRACT.seeds.length && report.trainingSeeds.every(x => x.trainImproved), allValidationImproved: report.trainingSeeds.length === CONTRACT.seeds.length && report.trainingSeeds.every(x => x.validationImproved), evidenceScope: 'same real water crop, three initialization/sampling seeds; not three independent sources' };
  report.thresholdsUnchanged = (await Core.digest(CONTRACT)) === report.contractSha256;
  report.finishedAt = new Date().toISOString(); report.state = report.failures.length ? 'completed_with_failures' : 'completed';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ state: report.state, cases: report.cases.length, failures: report.failures, report: 'reports/v11/compute_benchmark.json' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
