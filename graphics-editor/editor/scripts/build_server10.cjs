#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),esbuild=require('esbuild');
const {packClientAssets08,snapshot,expandedBytes,MAX_EXPANDED_BYTES}=require('./build_server07.cjs');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),dist=path.join(root,'dist'),client=path.join(dist,'client'),server=path.join(dist,'server'),reports=path.join(root,'reports/v10');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const hosting=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
 if(hosting.static)throw new Error('Server-backed source manifest must omit static.');
 fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(server,{recursive:true});fs.mkdirSync(reports,{recursive:true});fs.cpSync(web,client,{recursive:true});
 const text=packClientAssets08(web,client),archivePath=path.join(reports,'archive_packing.json');
 cp.execFileSync('python3',[path.join(root,'scripts/pack_archives09.py'),'--source',web,'--client',client,'--report',archivePath],{stdio:['ignore','pipe','inherit']});
 const archives=JSON.parse(fs.readFileSync(archivePath,'utf8'));
 await esbuild.build({entryPoints:[path.join(root,'server/worker07.mjs')],outfile:path.join(server,'index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,logLevel:'warning',define:{__CRF_PACKED_ASSETS08__:JSON.stringify(text.manifest),__CRF_ARCHIVES09__:JSON.stringify(archives.manifest)}});
 fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});fs.writeFileSync(path.join(dist,'.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');
 fs.writeFileSync(path.join(server,'wrangler.json'),JSON.stringify({name:'crf-graphics-editor',main:'index.js',compatibility_date:'2026-05-15',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true}},null,2)+'\n');
 const source=fs.readFileSync(path.join(server,'index.js'),'utf8'),worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const status=await worker.default.fetch(new Request('https://example.test/api/crf/status'),{}),connection=await status.json();
 if(status.status!==200||connection.version!=='0.10.0'||connection.configured!==false)throw new Error('Invalid Worker configuration boundary');
 let reads=0;
 const binding={fetch:async request=>{reads++;const pathname=decodeURIComponent(new URL(request.url).pathname),file=path.join(client,pathname==='/'?'index.html':pathname);if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return new Response('missing',{status:404});return new Response(request.method==='HEAD'?null:fs.readFileSync(file));}};
 const verification=[];
 for(const entry of text.sourceFiles){
  const response=await worker.default.fetch(new Request('https://example.test/'+entry.path),{ASSETS:binding}),bytes=Buffer.from(await response.arrayBuffer());
  if(response.status!==200||bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw new Error('Public byte integrity failed: '+entry.path);
  verification.push({path:entry.path,bytes:entry.bytes,sha256:entry.sha256,verified:true});
 }
 if(JSON.stringify(snapshot(web))!==JSON.stringify(text.sourceFiles))throw new Error('Source changed during build; rebuild after concurrent edits finish.');
 const size=expandedBytes(dist),report={schema:'crf.build.v0.10',builtAt:new Date().toISOString(),sourceFiles:text.sourceFiles.length,originalBytes:text.counts.sourceBytes,expandedDistBytes:size,expandedLimitBytes:MAX_EXPANDED_BYTES,headroomBytes:MAX_EXPANDED_BYTES-size,textPacking:text.counts,archives:archives.stats,allPublishedURLsByteExact:true,sourcePreserved:true,staticReadsDuringFullVerification:reads,workerBytes:Buffer.byteLength(source),releaseStatus:'frozen_model_research_release'};
 fs.writeFileSync(path.join(reports,'build_verification.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(reports,'published_files.json'),JSON.stringify({schema:'crf.published_files.v0.10',files:verification},null,2)+'\n');fs.writeFileSync(path.join(reports,'packed_assets_manifest.json'),JSON.stringify({entries:text.manifest,sourceFiles:text.sourceFiles},null,2)+'\n');
 if(size>=MAX_EXPANDED_BYTES)throw new Error('Expanded deployment exceeds250MiB: '+size);
 console.log(JSON.stringify(report,null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
