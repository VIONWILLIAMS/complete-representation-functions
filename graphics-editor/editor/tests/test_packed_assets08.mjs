import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {findPackedAsset08,servePackedAsset08,PACKED_ASSET_MANIFEST08} from '../server/packed_assets08.mjs';

const require=createRequire(import.meta.url);
const {packClientAssets08,MAX_EXPANDED_BYTES}=require('../scripts/build_server07.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const original=Buffer.from('CRF 高斯原始字节 / exact pixels\n'.repeat(3000));
const compressed=gzipSync(original,{level:9});
const entry={file:'/_crf-packed/test.crfgz',encoding:'gzip',mime:'text/html; charset=utf-8',bytes:original.length,sha256:sha(original),storedBytes:compressed.length};
const manifest={'/index.html':entry,'/editor.html':entry,'/nested/index.html':entry};
const request=(url='/',options={})=>new Request(`https://example.test${url}`,options);

function memoryBinding(bytes=compressed){
 const calls=[];
 return {calls,ASSETS:{fetch:async input=>{
  calls.push(input);
  return new Response(input.method==='HEAD'?null:bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.length),'ETag':'"backing-object"','Cache-Control':'public, max-age=60'}});
 }}};
}

test('unbundled preview and unmapped URLs leave ordinary assets unchanged',async()=>{
 assert.deepEqual(PACKED_ASSET_MANIFEST08,{});
 const env=memoryBinding();
 assert.equal(await servePackedAsset08(request(),env),null);
 assert.equal(await servePackedAsset08(request('/unmapped'),env,manifest),null);
 assert.equal(await servePackedAsset08(request('/',{method:'POST'}),env,manifest),null);
 assert.equal(env.calls.length,0);
 assert.equal(findPackedAsset08('/%notvalid',manifest),null);
});

test('root, exact .html, extensionless and directory-index requests restore the same bytes',async()=>{
 for(const url of ['/','/index.html','/editor','/editor.html','/nested/']){
  const env=memoryBinding(),res=await servePackedAsset08(request(url),env,manifest);
  assert.equal(res.status,200,url);
  assert.equal(res.headers.get('Content-Type'),entry.mime,url);
  assert.equal(res.headers.get('Content-Length'),String(original.length),url);
  assert.equal(res.headers.get('Content-Encoding'),null,url);
  assert.equal(res.headers.get('ETag'),`"sha256-${sha(original)}"`,url);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()),original,url);
  assert.equal(new URL(env.calls[0].url).pathname,entry.file);
 }
});

test('HEAD preserves original metadata and performs only a backing HEAD',async()=>{
 const env=memoryBinding(),res=await servePackedAsset08(request('/',{method:'HEAD'}),env,manifest);
 assert.equal(res.status,200);assert.equal(res.headers.get('Content-Length'),String(original.length));
 assert.equal(res.headers.get('Content-Type'),entry.mime);assert.equal(res.body,null);
 assert.equal(env.calls.length,1);assert.equal(env.calls[0].method,'HEAD');
});

test('conditional cache response uses decoded representation ETag without fetching packed bytes',async()=>{
 const env=memoryBinding();
 const res=await servePackedAsset08(request('/',{headers:{'If-None-Match':`W/"sha256-${sha(original)}"`}}),env,manifest);
 assert.equal(res.status,304);assert.equal(res.body,null);assert.equal(res.headers.get('Content-Length'),null);assert.equal(env.calls.length,0);
});

test('gzip text range requests return a valid full representation and no client credentials are forwarded',async()=>{
 const env=memoryBinding(),res=await servePackedAsset08(request('/',{headers:{Range:'bytes=0-4',Authorization:'Bearer private-test',Cookie:'private=test','If-Modified-Since':'yesterday'}}),env,manifest);
 assert.equal(res.status,200);assert.deepEqual(Buffer.from(await res.arrayBuffer()),original);
 assert.equal(res.headers.get('Accept-Ranges'),'none');
 for(const name of ['Range','Authorization','Cookie','If-Modified-Since'])assert.equal(env.calls[0].headers.get(name),null);
});

test('identity aliases preserve MIME, exact bytes and delegated byte ranges',async()=>{
 const bytes=Buffer.from([0,9,127,255,20]);
 const alias={'/downloads/old.png':{file:'/assets/original.png',encoding:'identity',mime:'image/png',bytes:bytes.length,sha256:sha(bytes)}};
 const env=memoryBinding(bytes),res=await servePackedAsset08(request('/downloads/old.png'),env,alias);
 assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes);
 const headEnv=memoryBinding(bytes),head=await servePackedAsset08(request('/downloads/old.png',{method:'HEAD',headers:{Range:'bytes=1-2'}}),headEnv,alias);
 assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(head.headers.get('Content-Length'),String(bytes.length));assert.equal(headEnv.calls[0].headers.get('Range'),null);
 const ranged={ASSETS:{fetch:async input=>{
  assert.equal(input.headers.get('Range'),'bytes=1-2');
  return new Response(bytes.subarray(1,3),{status:206,headers:{'Content-Range':'bytes 1-2/5','Content-Length':'2'}});
 }}};
 const partial=await servePackedAsset08(request('/downloads/old.png',{headers:{Range:'bytes=1-2'}}),ranged,alias);
 assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Length'),'2');assert.equal(partial.headers.get('Content-Range'),'bytes 1-2/5');assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(1,3));
 const multiEnv=memoryBinding(bytes),full=await servePackedAsset08(request('/downloads/old.png',{headers:{Range:'bytes=0-1,3-4'}}),multiEnv,alias);
 assert.equal(multiEnv.calls[0].headers.get('Range'),null);assert.equal(full.status,200);assert.equal(full.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
});

test('Workers fixed-length branch enforces the decoded byte count without buffering',async()=>{
 const previous=globalThis.FixedLengthStream;
 let used=0;
 globalThis.FixedLengthStream=class extends TransformStream{
  constructor(expected){let count=0;used++;super({transform(chunk,controller){count+=chunk.byteLength;assert.ok(count<=expected);controller.enqueue(chunk);},flush(){assert.equal(count,expected);}});}
 };
 try{const res=await servePackedAsset08(request(),memoryBinding(),manifest);assert.deepEqual(Buffer.from(await res.arrayBuffer()),original);assert.equal(used,1);}finally{if(previous===undefined)delete globalThis.FixedLengthStream;else globalThis.FixedLengthStream=previous;}
});

test('unavailable packed storage fails explicitly instead of returning a false successful HTML asset',async()=>{
 const res=await servePackedAsset08(request(),{ASSETS:{fetch:async()=>new Response('missing',{status:404})}},manifest);
 assert.equal(res.status,502);assert.equal(res.headers.get('Cache-Control'),'no-store');
});

test('build packing retains source assets, compresses only eligible text and aliases exact duplicates',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crf-packed08-'));
 try{
  const source=path.join(temp,'web'),client=path.join(temp,'client');fs.mkdirSync(source);
  const media=Buffer.alloc(40000,7);fs.writeFileSync(path.join(source,'first.json'),original);fs.writeFileSync(path.join(source,'second.json'),original);fs.writeFileSync(path.join(source,'movie.mp4'),media);fs.writeFileSync(path.join(source,'archive.zip'),media);fs.writeFileSync(path.join(source,'small.json'),'{}');fs.cpSync(source,client,{recursive:true});
  const packed=packClientAssets08(source,client);
  assert.equal(packed.sourcePreserved,true);assert.equal(packed.counts.packedStorageFiles,1);assert.equal(packed.counts.duplicateAliases,2);
  assert.equal(packed.manifest['/first.json'].encoding,'gzip');assert.equal(packed.manifest['/second.json'].file,packed.manifest['/first.json'].file);
  assert.equal(packed.manifest['/movie.mp4'].encoding,'identity');assert.ok(!packed.manifest['/archive.zip']);assert.ok(!packed.manifest['/small.json']);
  assert.deepEqual(fs.readFileSync(path.join(source,'first.json')),original);assert.deepEqual(fs.readFileSync(path.join(source,'second.json')),original);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

const builtManifest08=path.join(root,'reports/v08/packed_assets_manifest.json');
const builtReport08=path.join(root,'reports/v08/packed_assets_report.json');
const builtManifest09=path.join(root,'reports/v09/packed_assets_manifest.json');
const builtReport09=path.join(root,'reports/v09/build_verification.json');
const compiledWorker=path.join(root,'dist/server/index.js');
const hasBuild=((fs.existsSync(builtManifest08)&&fs.existsSync(builtReport08))||(fs.existsSync(builtManifest09)&&fs.existsSync(builtReport09)))&&fs.existsSync(path.join(root,'dist/client'))&&fs.existsSync(compiledWorker);
test('actual built tree: every mapped GET/HEAD and every retained source is byte-exact below 250 MiB',{skip:hasBuild?false:'Run npm run build to verify its actual mapped files.'},async()=>{
 // Test the deployed routing chain. In 0.9 an original ZIP URL may be restored
 // by archive segments before the older text/identity pack handler runs.
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(compiledWorker,'utf8')).toString('base64'))).default;
 const statusResponse=await worker.fetch(request('/api/crf/status'),{}),status=await statusResponse.json();
 assert.equal(statusResponse.status,200);
 const is09=status.version==='0.9.0';
 assert.ok(is09||status.version==='0.8.0','Unexpected compiled build version: '+status.version);
 const builtManifest=is09?builtManifest09:builtManifest08,builtReport=is09?builtReport09:builtReport08;
 assert.ok(fs.existsSync(builtManifest)&&fs.existsSync(builtReport),'Build manifest must match the actual compiled Worker version');
 const {entries,sourceFiles}=JSON.parse(fs.readFileSync(builtManifest,'utf8'));
 const report=JSON.parse(fs.readFileSync(builtReport,'utf8'));
 assert.ok(report.expandedDistBytes<MAX_EXPANDED_BYTES);
 assert.equal(report.sourcePreserved,true);
 assert.equal(is09?report.allPublishedURLsByteExact:report.allMappedURLsByteEqual,true);
 const archiveFiles=is09?JSON.parse(fs.readFileSync(path.join(root,'reports/v09/archive_packing.json'),'utf8')).manifest.files:{};
 const env={ASSETS:{fetch:async req=>{
  const pathname=decodeURIComponent(new URL(req.url).pathname);let file=path.join(root,'dist/client',pathname==='/'?'index.html':pathname);
  // Native Workers asset lookup serves /page from page.html. Compressed HTML
  // goes through packed_assets08, but small unpacked HTML reaches ASSETS.
  // https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
  // This fixture checks resolved bytes; production canonical redirects are a
  // separate deployment check, not emulated by this local file binding.
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()&&fs.statSync(file+'.html',{throwIfNoEntry:false})?.isFile())file+='.html';
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return new Response('missing',{status:404});
  const content=fs.readFileSync(file);
  return new Response(req.method==='HEAD'?null:content,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(content.length)}});
 }}};
 for(const [url,item] of Object.entries(entries)){
  const res=await worker.fetch(request(url),env);assert.equal(res.status,200,url);
  const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,item.bytes,url);assert.equal(sha(bytes),item.sha256,url);
  assert.deepEqual(bytes,fs.readFileSync(path.join(root,'web',url)),url);
  const head=await worker.fetch(request(url,{method:'HEAD'}),env);
  assert.equal(head.status,200,url);assert.equal(head.body,null,url);assert.equal(head.headers.get('Content-Length'),String(item.bytes),url);assert.equal(head.headers.get('Content-Type'),item.mime,url);
 }
 for(const item of sourceFiles){
  const source=fs.readFileSync(path.join(root,'web',item.path));assert.equal(sha(source),item.sha256,item.path);
  // Every published source remains available at its original URL, including
  // originals that are intentionally not stored as loose files in dist/client.
  const res=await worker.fetch(request('/'+item.path),env);assert.equal(res.status,200,item.path);
  const bytes=Buffer.from(await res.arrayBuffer());assert.equal(bytes.length,item.bytes,item.path);assert.equal(sha(bytes),item.sha256,item.path);assert.deepEqual(bytes,source,item.path);
  if(!Object.hasOwn(entries,`/${item.path}`)){
   if(Object.hasOwn(archiveFiles,`/${item.path}`))assert.equal(archiveFiles[`/${item.path}`].sha256,item.sha256,item.path);
   else assert.deepEqual(fs.readFileSync(path.join(root,'dist/client',item.path)),source,item.path);
  }
 }
 for(const [route,file]of [['/','index.html'],['/index.html','index.html'],['/gaussian08','gaussian08.html'],['/gaussian08.html','gaussian08.html'],...(is09?[['/studio09','studio09.html'],['/studio09.html','studio09.html']]:[])]){
  const res=await worker.fetch(request(route),env);assert.equal(res.status,200,route);assert.deepEqual(Buffer.from(await res.arrayBuffer()),fs.readFileSync(path.join(root,'web',file)),route);
 }
});
