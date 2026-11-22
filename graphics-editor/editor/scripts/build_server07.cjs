#!/usr/bin/env node
'use strict';
// Authored assets live in web/. Build one static copy and a self-contained Worker.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),web=path.join(root,'web');
const MAX_EXPANDED_BYTES=250*1024*1024;
const PACKABLE=new Set(['.json','.js','.html','.css','.md']);
const MIME={'.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.zip':'application/zip','.gz':'application/gzip','.pdf':'application/pdf','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.csv':'text/csv; charset=utf-8'};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function filesIn(directory){
 const files=[];
 function walk(base){for(const ent of fs.readdirSync(base,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const file=path.join(base,ent.name);if(ent.isDirectory())walk(file);else if(ent.isFile())files.push(file);else throw new Error(`Unsupported non-file asset: ${path.relative(directory,file)}`);}}
 walk(directory);return files;
}
function snapshot(directory){return filesIn(directory).map(file=>{const bytes=fs.readFileSync(file);return {path:path.relative(directory,file).split(path.sep).join('/'),bytes:bytes.length,sha256:digest(bytes)};});}
function expandedBytes(directory){return filesIn(directory).reduce((sum,file)=>sum+fs.statSync(file).size,0);}

// Only the disposable client copy is changed. Identical files are aliases, and
// gzip is a transport representation, never a lower-quality content substitute.
function packClientAssets08(source,client){
 const before=snapshot(source),groups=new Map(),manifest={},packedFiles=[];
 for(const item of before){const key=`${item.bytes}:${item.sha256}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 let aliasCount=0,deduplicatedBytes=0,gzipSavedBytes=0;
 for(const group of groups.values()){
  const canonical=group[0],original=fs.readFileSync(path.join(source,canonical.path));
  for(const item of group.slice(1))if(!original.equals(fs.readFileSync(path.join(source,item.path))))throw new Error('Content hash collision; refusing asset alias.');
  let compressed=null;
  // Small authored modules also benefit from lossless packing. Public source
  // bytes and URLs remain unchanged; this makes room for the additive v11 UI.
  if(PACKABLE.has(path.extname(canonical.path).toLowerCase())&&original.length>=4*1024){const candidate=zlib.gzipSync(original,{level:9});if(original.length-candidate.length>1024)compressed=candidate;}
  const storage=compressed?`/_crf-packed/${canonical.sha256}.crfgz`:`/${canonical.path}`;
  if(compressed){
   const file=path.join(client,storage.slice(1));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,compressed);
   if(!zlib.gunzipSync(compressed).equals(original))throw new Error(`Lossless packing check failed: ${canonical.path}`);
   gzipSavedBytes+=original.length-compressed.length;
   packedFiles.push({file:storage,encoding:'gzip',bytes:compressed.length,originalBytes:original.length,sha256:canonical.sha256});
  }
  for(const [index,item] of group.entries()){
   if(index>0){aliasCount++;deduplicatedBytes+=item.bytes;}
   if(!compressed&&index===0)continue;
   fs.rmSync(path.join(client,item.path));
   manifest[`/${item.path}`]={file:storage,encoding:compressed?'gzip':'identity',mime:MIME[path.extname(item.path).toLowerCase()]||'application/octet-stream',bytes:item.bytes,sha256:item.sha256,storedBytes:compressed?compressed.length:original.length};
  }
 }
 const after=snapshot(source);
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Source web assets changed while packing; rebuild after changes are complete.');
 return {manifest,sourceFiles:before,packedFiles,counts:{sourceFiles:before.length,sourceBytes:before.reduce((sum,x)=>sum+x.bytes,0),packedStorageFiles:packedFiles.length,mappedPublicURLs:Object.keys(manifest).length,duplicateAliases:aliasCount,deduplicatedBytes,gzipSavedBytes,clientBytes:expandedBytes(client)},sourcePreserved:true};
}
async function main(){
 const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
 if(hosting.static)throw new Error('Worker source manifest must omit static.');
 if(!fs.statSync(path.join(web,'index.html'),{throwIfNoEntry:false})?.isFile())throw new Error('Authored web/index.html is missing; refusing to replace build output.');
 const client=path.join(dist,'client'),server=path.join(dist,'server');
 fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(server,{recursive:true});
 fs.cpSync(web,client,{recursive:true});
 const packed=packClientAssets08(web,client);
 await esbuild.build({entryPoints:[path.join(root,'server/worker07.mjs')],outfile:path.join(server,'index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,logLevel:'warning',define:{__CRF_PACKED_ASSETS08__:JSON.stringify(packed.manifest)}});
 fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});fs.writeFileSync(path.join(dist,'.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');
 fs.writeFileSync(path.join(server,'wrangler.json'),JSON.stringify({name:'crf-graphics-editor',main:'index.js',compatibility_date:'2026-05-15',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true}} ,null,2)+'\n');
 const source=fs.readFileSync(path.join(server,'index.js'),'utf8');const worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 if(typeof worker.default?.fetch!=='function')throw new Error('Invalid Worker export');
 const status=await worker.default.fetch(new Request('https://example.test/api/crf/status'),{});if(status.status!==200||JSON.parse(await status.text()).configured!==false)throw new Error('Invalid configuration boundary');
 const assetBinding={fetch:async request=>{const filename=path.join(client,decodeURIComponent(new URL(request.url).pathname));if(!fs.statSync(filename,{throwIfNoEntry:false})?.isFile())return new Response('missing',{status:404});return new Response(request.method==='HEAD'?null:fs.readFileSync(filename));}};
 const staticResult=await worker.default.fetch(new Request('https://example.test/'),{ASSETS:assetBinding});
 if(!(Buffer.from(await staticResult.arrayBuffer()).equals(fs.readFileSync(path.join(web,'index.html')))))throw new Error('Root static asset bytes changed');
 for(const [url,entry] of Object.entries(packed.manifest)){
  const response=await worker.default.fetch(new Request(`https://example.test${url}`),{ASSETS:assetBinding});
  const restored=Buffer.from(await response.arrayBuffer());
  if(response.status!==200||restored.length!==entry.bytes||digest(restored)!==entry.sha256)throw new Error(`Public asset byte equality failed: ${url}`);
 }
 const totalBytes=expandedBytes(dist),reports=path.join(root,'reports/v08');fs.mkdirSync(reports,{recursive:true});
 const report={schema:'crf.packed_assets_report.v0.8',builtAt:new Date().toISOString(),sourceRoot:'web',outputRoot:'dist',algorithm:'gzip-9 and exact-byte aliases; original URLs restored by streaming Worker',sourcePreserved:packed.sourcePreserved,...packed.counts,workerBytes:Buffer.byteLength(source),expandedDistBytes:totalBytes,expandedLimitBytes:MAX_EXPANDED_BYTES,headroomBytes:MAX_EXPANDED_BYTES-totalBytes,allMappedURLsByteEqual:true,originalURLCount:packed.sourceFiles.length,runWorkerFirst:true,manifest:'reports/v08/packed_assets_manifest.json',officialDocs:['https://developers.cloudflare.com/workers/runtime-apis/web-standards/#compression-streams','https://developers.cloudflare.com/workers/runtime-apis/response/#set-the-content-length-header','https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first']};
 fs.writeFileSync(path.join(reports,'packed_assets_manifest.json'),JSON.stringify({schema:'crf.packed_assets_manifest.v0.8',entries:packed.manifest,sourceFiles:packed.sourceFiles,storageFiles:packed.packedFiles},null,2)+'\n');
 fs.writeFileSync(path.join(reports,'packed_assets_report.json'),JSON.stringify(report,null,2)+'\n');
 if(totalBytes>=MAX_EXPANDED_BYTES)throw new Error(`Expanded build is ${totalBytes} bytes; must remain below ${MAX_EXPANDED_BYTES}.`);
 console.log(JSON.stringify({workerBytes:Buffer.byteLength(source),staticRoot:'dist/client',expandedDistBytes:totalBytes,headroomBytes:MAX_EXPANDED_BYTES-totalBytes,mappedPublicURLs:packed.counts.mappedPublicURLs,status:'ready'},null,2));
}
module.exports={packClientAssets08,filesIn,snapshot,expandedBytes,MAX_EXPANDED_BYTES};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
