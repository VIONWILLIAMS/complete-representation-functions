#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const cp = require('node:child_process'), esbuild = require('esbuild');
const {packClientAssets08, snapshot, expandedBytes, MAX_EXPANDED_BYTES} = require('./build_server07.cjs');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'web'), dist = path.join(root, 'dist');
const client = path.join(dist, 'client'), server = path.join(dist, 'server'), reports = path.join(root, 'reports/quality12');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function build() {
  const hosting = JSON.parse(fs.readFileSync(path.join(root, '.openai/hosting.json'), 'utf8'));
  if (hosting.static) throw new Error('The server-backed manifest must omit static.');
  // The historical v10 list is an immutable compatibility baseline, not a
  // regenerated list that could accidentally bless deleted old resources.
  const legacy = JSON.parse(fs.readFileSync(path.join(root, 'reports/v10/published_files.json'), 'utf8')).files;
  for (const entry of legacy) {
    const file = path.join(web, entry.path);
    if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== entry.sha256)
      throw new Error('Historical public asset changed or disappeared: ' + entry.path);
  }
  fs.rmSync(dist, {recursive: true, force: true});
  fs.mkdirSync(server, {recursive: true}); fs.mkdirSync(reports, {recursive: true});
  fs.cpSync(web, client, {recursive: true});
  const packed = packClientAssets08(web, client);
  const transportInput = path.join(root, 'build/quality12-packing-input.json');
  fs.mkdirSync(path.dirname(transportInput), {recursive: true});
  fs.writeFileSync(transportInput, JSON.stringify(packed));
  const transportReport = path.join(reports, 'lossless_transport.json');
  cp.execFileSync('python3', [path.join(root, 'scripts/optimize_gzip12.py'),
    '--client', client, '--manifest', transportInput,
    '--cache', path.join(root, 'build/quality12-gzip-cache'), '--report', transportReport],
    {stdio: ['ignore', 'pipe', 'inherit']});
  const transport = JSON.parse(fs.readFileSync(transportReport, 'utf8'));
  const stored = new Map(transport.files.map(item => [item.file, item.storedBytes]));
  for (const entry of Object.values(packed.manifest))
    if (stored.has(entry.file)) entry.storedBytes = stored.get(entry.file);
  for (const entry of packed.packedFiles)
    if (stored.has(entry.file)) entry.bytes = stored.get(entry.file);
  packed.counts.gzipSavedBytes += transport.savedBytes;
  packed.counts.clientBytes -= transport.savedBytes;
  const archiveReport = path.join(reports, 'archive_packing.json');
  cp.execFileSync('python3', [path.join(root, 'scripts/pack_archives09.py'), '--source', web,
    '--client', client, '--report', archiveReport], {stdio: ['ignore', 'pipe', 'inherit']});
  const archives = JSON.parse(fs.readFileSync(archiveReport, 'utf8'));
  await esbuild.build({entryPoints: [path.join(root, 'server/worker07.mjs')],
    outfile: path.join(server, 'index.js'), bundle: true, format: 'esm', platform: 'browser',
    target: 'es2022', minify: true, logLevel: 'warning', define: {
      __CRF_PACKED_ASSETS08__: JSON.stringify(packed.manifest), __CRF_ARCHIVES09__: JSON.stringify(archives.manifest)}});
  fs.mkdirSync(path.join(dist, '.openai'), {recursive: true});
  fs.writeFileSync(path.join(dist, '.openai/hosting.json'), JSON.stringify(hosting, null, 2) + '\n');
  fs.writeFileSync(path.join(server, 'wrangler.json'), JSON.stringify({name: 'crf-graphics-editor',
    main: 'index.js', compatibility_date: '2026-05-15',
    assets: {directory: '../client', binding: 'ASSETS', run_worker_first: true}}, null, 2) + '\n');
  const source = fs.readFileSync(path.join(server, 'index.js'), 'utf8');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const old = await (await worker.fetch(new Request('https://example.test/api/crf/status'), {})).json();
  const current = await (await worker.fetch(new Request('https://example.test/api/crf/functions11/status'), {})).json();
  if (old.version !== '0.10.0' || old.currentWorkflow.modelTraining !== false ||
      current.version !== '1.1.0-experimental.1' || current.configured !== false)
    throw new Error('Build changed a version or credential boundary.');
  const binding = {fetch: async request => {
    const filename = path.join(client, decodeURIComponent(new URL(request.url).pathname).slice(1) || 'index.html');
    if (!fs.statSync(filename, {throwIfNoEntry: false})?.isFile()) return new Response('missing', {status: 404});
    return new Response(request.method === 'HEAD' ? null : fs.readFileSync(filename));
  }};
  const verification = [];
  for (const entry of packed.sourceFiles) {
    const response = await worker.fetch(new Request('https://example.test/' + entry.path), {ASSETS: binding});
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200 || bytes.length !== entry.bytes || sha(bytes) !== entry.sha256)
      throw new Error('Published asset byte verification failed: ' + entry.path);
    verification.push({...entry, verified: true});
  }
  if (JSON.stringify(snapshot(web)) !== JSON.stringify(packed.sourceFiles))
    throw new Error('Source changed during build; wait for ongoing edits and rebuild.');
  const size = expandedBytes(dist);
  const report = {schema: 'crf.build.v1.1', builtAt: new Date().toISOString(),
    releaseStatus: 'reference_quality_experimental', version: '1.1.0-experimental.2', sourceFiles: packed.sourceFiles.length,
    legacyAssetsChecked: legacy.length, legacyAssetsByteExact: true, allPublishedURLsByteExact: true,
    sourcePreserved: true, originalBytes: packed.counts.sourceBytes, expandedDistBytes: size,
    expandedLimitBytes: MAX_EXPANDED_BYTES, headroomBytes: MAX_EXPANDED_BYTES - size,
    workerBytes: Buffer.byteLength(source), workerSha256: sha(source),
    textPacking: packed.counts, losslessTransport: {savedBytes: transport.savedBytes, allByteExact: transport.allByteExact},
    archives: archives.stats, configuredSecretsInBuild: false,
    verifiedStatusPaths: ['/api/crf/status', '/api/crf/functions11/status']};
  fs.writeFileSync(path.join(reports, 'build_verification.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(reports, 'published_files.json'), JSON.stringify({schema: 'crf.published_files.v1.1', files: verification}, null, 2) + '\n');
  fs.writeFileSync(path.join(reports, 'packed_assets_manifest.json'), JSON.stringify({entries: packed.manifest, sourceFiles: packed.sourceFiles}, null, 2) + '\n');
  if (size >= MAX_EXPANDED_BYTES) throw new Error('Expanded deployment exceeds 250 MiB: ' + size);
  console.log(JSON.stringify(report, null, 2));
}
module.exports = {build};
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
