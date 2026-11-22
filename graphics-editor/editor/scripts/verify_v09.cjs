#!/usr/bin/env node
'use strict';
// Independent local release audit. This does not grant any research/visual gate,
// call a provider, mutate a legacy file, or overwrite the final acceptance report.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),reports=path.join(root,'reports/v09');
const BASELINE='26f9b85a2b25a84ef7afd9ace98a2930e5ab5851';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const readJSON=(p,fallback=null)=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));}catch{return fallback;}};
const exists=p=>fs.statSync(path.join(root,p),{throwIfNoEntry:false})?.isFile()||false;
const write=(name,value)=>fs.writeFileSync(path.join(reports,name),JSON.stringify(value,null,2)+'\n');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);

function retainedFiles(){
 const listing=cp.execFileSync('git',['ls-tree','-r','-z',BASELINE,'--','web'],{cwd:root}).toString();
 const rows=[];
 for(const record of listing.split('\0').filter(Boolean)){
  const match=record.match(/^(\d+) blob ([a-f0-9]+)\t(.+)$/);if(!match)throw new Error('Unexpected baseline tree record');
  const [,mode,expected,rel]=match,filename=path.join(root,rel);
  const present=fs.statSync(filename,{throwIfNoEntry:false})?.isFile();
  const bytes=present?fs.readFileSync(filename):null;
  const actual=bytes?crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'):null;
  rows.push({path:rel,mode,baselineGitBlob:expected,currentGitBlob:actual,bytes:bytes?.length||0,sha256:bytes?sha(bytes):null,present:Boolean(present),byteExact:actual===expected,authorizedRootReplacement:rel==='web/index.html'});
 }
 const failed=rows.filter(r=>!r.authorizedRootReplacement&&!r.byteExact);
 return{baseline:BASELINE,trackedWebFiles:rows.length,requiredUnchanged:rows.filter(r=>!r.authorizedRootReplacement).length,byteExactUnchanged:rows.filter(r=>!r.authorizedRootReplacement&&r.byteExact).length,missing:rows.filter(r=>!r.present).map(r=>r.path),unauthorizedChanges:failed.map(r=>r.path),allRetained:failed.length===0,files:rows};
}

function dependencies(){
 const checks=[];
 for(const filename of ['web/index.html','web/studio09.html']){
  if(!exists(filename)){checks.push({from:filename,url:filename,exists:false});continue;}
  const html=fs.readFileSync(path.join(root,filename),'utf8');
  for(const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)){
   const url=match[1];if(/^(?:https?:|data:|mailto:|#)/.test(url))continue;
   const cleaned=url.split(/[?#]/)[0]||'.',resolved=path.resolve(path.dirname(path.join(root,filename)),cleaned);
   const file=fs.statSync(resolved,{throwIfNoEntry:false})?.isDirectory()?path.join(resolved,'index.html'):resolved;
   checks.push({from:filename,url,path:path.relative(root,file),exists:fs.statSync(file,{throwIfNoEntry:false})?.isFile()||false});
  }
 }
 const context=readJSON('web/assets/v09/street/context.json');
 for(const url of ['crf-gaussian08.js','crf-generative09.js','crf-boundary09.js','render-worker09.js','task-runner09.js','crf-video.js','assets/v09/street/context.json',context?.baselineAssetUrl,context?.detailAssetUrl,'assets/v09/shared-appearance.json','assets/v09/generated/index.json'].filter(Boolean))checks.push({from:'runtime_contract',url,path:'web/'+url,exists:exists('web/'+url)});
 const gallery=readJSON('web/assets/v09/generated/index.json',{});
 for(const e of gallery.examples||gallery.results||[])for(const key of ['sceneUrl','thumbnailUrl','imageUrl','videoUrl'])if(e[key])checks.push({from:'generated:'+e.id,url:e[key],path:'web/'+e[key],exists:exists('web/'+e[key])});
 const ids=[...fs.readFileSync(path.join(web,'studio09.html'),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const source=fs.readFileSync(path.join(web,'editor09.js'),'utf8'),boundIds=[...source.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
 const missingBoundIds=[...new Set(boundIds.filter(id=>!ids.includes(id)))];
 return{allPresent:checks.every(c=>c.exists)&&!missingBoundIds.length,missingBoundIds,checks};
}

function evidenceConsistency(){
 const report=readJSON('reports/v09/generative_core_verification.json',{}),checks=[],sourceEvolution=[];
 // H1/H2/H3 reports freeze historical experiments. The currently published
 // model may legitimately include subsequent online learning. Do not rewrite
 // old evidence or compare a historical input SHA as if it named current bytes.
 for(const [file,recorded]of [['web/crf-generative09.js',report.sourceSHA256],['web/assets/v09/shared-appearance.json',report.modelSHA256]])if(recorded){const actual=sha(fs.readFileSync(path.join(root,file)));sourceEvolution.push({path:file,historicalInputSHA256:recorded,currentSHA256:actual,changedSinceHistoricalExperiment:actual!==recorded,meaning:'Historical input identity retained. Current code/model evolution is disclosed separately; old output files and H3 embedded-model rerenders are checked below.'});}
 for(const experiment of report.experiments||[])for(const output of experiment.outputs||[]){const file=output.file,expected=output.fileSHA256||output.sha256;if(file&&expected)checks.push({experiment:experiment.id,path:file,expected,actual:exists(file)?sha(fs.readFileSync(path.join(root,file))):null});}
 for(const row of checks)row.matches=row.expected===row.actual;
 const renderer=require('../web/crf-generative09.js'),historicalRenders=[];
 for(const experiment of report.experiments||[])for(const output of experiment.outputs||[]){
  if(!output.program||!output.pixelSHA256)continue;
  const scene=readJSON(output.program),embedded=scene&&Object.hasOwn(scene,'appearanceModel');
  const row={experiment:experiment.id,scene:output.program,sceneSHA256:exists(output.program)?sha(fs.readFileSync(path.join(root,output.program))):null,embeddedModelPresent:Boolean(embedded),embeddedModelId:scene?.appearanceModel?.id||null,expectedHistoricalModelId:report.modelId,expectedPixelSHA256:output.pixelSHA256};
  try{if(!scene||!renderer.validateScene(scene).ok||!embedded)throw new Error('Historical scene or embedded appearance snapshot is missing or invalid.');if(scene.appearanceModel?.id!==report.modelId)throw new Error('Historical embedded model identity differs from the experiment.');const image=renderer.renderScene(scene,{model:scene.appearanceModel});row.rerenderedPixelSHA256=sha(image.data);row.exact=image.width===output.width&&image.height===output.height&&row.rerenderedPixelSHA256===output.pixelSHA256;row.embeddedModelObjectSHA256=sha(JSON.stringify(scene.appearanceModel));}
  catch(e){row.exact=false;row.error=String(e.message).slice(0,250);}
  historicalRenders.push(row);
 }
 const protocol=readJSON('benchmarks/v09/protocol.json'),terminal=readJSON('reports/v09/terminal_status.json');
 const protocolActual=protocol?sha(fs.readFileSync(path.join(root,'benchmarks/v09/protocol.json'))):null;
 return{checks,sourceEvolution,historicalRenders,allMatched:checks.length>0&&checks.every(c=>c.matches)&&historicalRenders.length>0&&historicalRenders.every(c=>c.exact),protocolSha256:protocolActual,terminalProtocolMatches:terminal?.protocolSha256===protocolActual,historicalSourceCaveat:(report.experiments||[]).filter(e=>e.earlierSourceSnapshotAvailable===false).map(e=>e.id),historicalInputCaveat:'H1/H2 prior source snapshots are unavailable. H3 is pixel-verified using its embedded historical model and the current evaluator. An embedded JSON object does not preserve the byte formatting of the earlier standalone model file, so its original raw-file SHA is retained as historical metadata, not claimed reverified.'};
}

function publicPrivacy(){
 const files=walk(web).filter(p=>/\.(?:js|mjs|html|json|md|txt)$/.test(p));
 const findings=[];
 for(const file of files){const text=fs.readFileSync(file,'utf8');if(/\bsk-[A-Za-z0-9_-]{24,}\b/.test(text))findings.push({path:path.relative(root,file),issue:'credential-shaped string; value intentionally not printed'});}
 const hosting=readJSON('.openai/hosting.json',{});
 return{publicTextFilesScanned:files.length,credentialValuesPrinted:false,credentialFindings:findings,hostingStatic:hosting.static??false,note:'Source-level privacy check and local Worker boundary checks only; hosting authentication is verified separately in production.'};
}

async function builtRoutes(requireBuild){
 const report=readJSON('reports/v09/build_verification.json'),compiled=path.join(root,'dist/server/index.js');
 if(!report||!fs.existsSync(compiled))return{status:'pending',required:requireBuild,reason:'No completed 0.9 build is available.'};
 const source=fs.readFileSync(compiled,'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const status=await worker.fetch(new Request('https://local.test/api/crf/status'),{}),data=await status.json();
 if(data.version!=='0.9.0')return{status:'pending',required:requireBuild,reason:'dist contains an older Worker.',actualVersion:data.version};
 const client=path.join(root,'dist/client');let fetches=0;
 const env={ASSETS:{fetch:async request=>{
  fetches++;const pathname=decodeURIComponent(new URL(request.url).pathname);let file=path.resolve(client,'.'+pathname);
  if(!file.startsWith(client+path.sep)&&file!==client)return new Response('invalid',{status:400});
  if(pathname.endsWith('/'))file=path.join(file,'index.html');
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()&&fs.statSync(file+'.html',{throwIfNoEntry:false})?.isFile())file+='.html';
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return new Response('missing',{status:404});
  const content=fs.readFileSync(file);return new Response(request.method==='HEAD'?null:content,{headers:{'Content-Length':String(content.length)}});
 }}};
 const published=readJSON('reports/v09/published_files.json',{}).files||[];
 const publishedNames=new Set(published.map(p=>p.path)),currentNames=walk(web).map(p=>path.relative(web,p)).sort();
 const currentNameSet=new Set(currentNames),unpublishedCurrentSources=currentNames.filter(p=>!publishedNames.has(p)),staleManifestSources=[...publishedNames].filter(p=>!currentNameSet.has(p));
 const checks=[];
 for(const item of published){
  const response=await worker.fetch(new Request('https://local.test/'+item.path),env),actual=Buffer.from(await response.arrayBuffer());
  const current=exists('web/'+item.path)?fs.readFileSync(path.join(web,item.path)):null;
  const currentSHA=current?sha(current):null;
  checks.push({url:'/'+item.path,status:response.status,bytes:actual.length,sha256:sha(actual),expectedSHA256:item.sha256,currentSourceSHA256:currentSHA,exact:response.status===200&&actual.length===item.bytes&&sha(actual)===item.sha256&&currentSHA===item.sha256});
 }
 const aliases=[];
 for(const [url,file]of [['/','index.html'],['/index.html','index.html'],['/studio09','studio09.html'],['/studio09.html','studio09.html'],['/gaussian08','gaussian08.html'],['/gaussian08.html','gaussian08.html'],['/studio07','studio07.html'],['/studio07.html','studio07.html'],['/canvas07.html','canvas07.html'],['/editor06.html','editor06.html'],['/editor05.html','editor05.html']]){
  const response=await worker.fetch(new Request('https://local.test'+url),env),content=Buffer.from(await response.arrayBuffer()),expected=fs.readFileSync(path.join(web,file));
  aliases.push({url,expectedFile:'web/'+file,status:response.status,sha256:sha(content),byteExact:response.status===200&&content.equals(expected)});
 }
 const sentinel='contract-private-server-key-value',configured=await worker.fetch(new Request('https://local.test/api/crf/status'),{DEEPSEEK_API_KEY:sentinel}),configuredText=await configured.text();
 const noKey=await worker.fetch(new Request('https://local.test/api/crf/native/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"prompt":"do not call a provider"}'}),{});
 const origin=await worker.fetch(new Request('https://local.test/api/crf/native/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.test'},body:'{}'}),{DEEPSEEK_API_KEY:sentinel});
 const privacy={statusDoesNotReturnKey:!configuredText.includes(sentinel),noCredentialStatus:noKey.status,crossOriginStatus:origin.status};
 const actualExpandedBytes=walk(path.join(root,'dist')).reduce((n,p)=>n+fs.statSync(p).size,0),belowLimit=actualExpandedBytes<250*1024*1024;
 const allPassed=checks.length>0&&checks.every(c=>c.exact)&&!unpublishedCurrentSources.length&&!staleManifestSources.length&&aliases.every(c=>c.byteExact)&&belowLimit&&actualExpandedBytes===report.expandedDistBytes&&privacy.statusDoesNotReturnKey&&privacy.noCredentialStatus===503&&privacy.crossOriginStatus===403;
 return{status:allPassed?'passed':'failed',allPublishedRoutes:checks.length,currentSourceFiles:currentNames.length,unpublishedCurrentSources,staleManifestSources,staticFetches:fetches,expandedDistBytes:actualExpandedBytes,buildReportedExpandedBytes:report.expandedDistBytes,headroomBytes:250*1024*1024-actualExpandedBytes,belowLimit,privacy,aliases,checks};
}

function mediaInventory(){
 const files=walk(path.join(web,'assets/v09')).filter(p=>/\.(mp4|webm)$/.test(p)),movies=[];
 for(const file of files){
  try{const info=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate,nb_frames:format=duration','-of','json',file],{encoding:'utf8'}));movies.push({path:path.relative(root,file),sha256:sha(fs.readFileSync(file)),...info});}
  catch(e){movies.push({path:path.relative(root,file),error:String(e.message).slice(0,150)});}
 }
 return{files:movies,actualMovieFiles:movies.length,requiredCategories:3,visualTemporalReview:'not_performed_by_this_local_audit',newViewGeometry:'Declared image-plane depth/parallax; not recovered multiview ground truth'};
}

function editorContracts(run){
 const files=['tests/test_editor09_contract.cjs','web/editor09.js','web/studio09.html','web/render-worker09.js','web/crf-gaussian08.js','web/crf-generative09.js','web/crf-boundary09.js'];
 const inventory=()=>Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
 if(!run){const previous=readJSON('reports/v09/integration_contracts.json');return previous?{...previous,currentSourcesMatch:JSON.stringify(previous.sourceSHA256)===JSON.stringify(inventory())}:{status:'pending',reason:'Run with --contracts to record actual editor contract execution.'};}
 const before=inventory(),started=new Date().toISOString();
 const result=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','tests/test_editor09_contract.cjs'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 const output=String(result.stdout||'')+'\n'+String(result.stderr||'');
 const number=name=>Number(output.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]??0);
 const unchanged=JSON.stringify(before)===JSON.stringify(inventory());
 const record={schema:'crf.editor_contract_execution.v0.9',startedAt:started,completedAt:new Date().toISOString(),status:result.status===0&&unchanged?'passed':'failed',command:'node --test --test-reporter=tap tests/test_editor09_contract.cjs',exitCode:result.status,tests:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped'),sourceSHA256:before,sourcesUnchangedDuringRun:unchanged,networkProviderCalls:0,scope:'Shipped editor functions and actual Worker source in a local transport/DOM harness; browser layout and browser video codec are not emulated.',output};
 write('integration_contracts.json',record);return{...record,currentSourcesMatch:unchanged};
}

function gates(retention,built,media){
 const fidelity=readJSON('reports/v09/boundary/fidelity.json',{}),boundary=readJSON('reports/v09/boundary/controlled_metrics.json',{}),core=readJSON('reports/v09/generative_core_verification.json',{}),learning=readJSON('reports/v09/shared_learning.json',{}),terminal=readJSON('reports/v09/terminal_status.json',{}),currentModel=readJSON('web/assets/v09/shared-appearance.json',{});
 return{
  G1:{status:'partial',completedOriginalPhotoCases:fidelity.jointTargetPassed?1:0,requiredCases:12,streetMetrics:fidelity.candidate||null,jointStreetPass:fidelity.jointTargetPassed||false,exact100:fidelity.exact100||false,observedResidualGaussians:fidelity.usedDetailGaussians||0,summary:'One original street meets the joint fidelity target with a disclosed larger Gaussian budget. The full twelve-image set and exact reproduction are not established.'},
  G2:{status:'not_passed',hypotheses:(core.experiments||[]).map(e=>({id:e.id,actualOutputCount:e.outputs?.length||0})),historicalTrainingSources:learning.counts?.train||0,historicalSourceGroups:learning.groupCounts||null,currentPublishedModel:{id:currentModel.id||null,observationCount:currentModel.sourceCount||0,sha256:exists('web/assets/v09/shared-appearance.json')?sha(fs.readFileSync(path.join(web,'assets/v09/shared-appearance.json'))):null},fullP3Passed:learning.fullP3Passed===true,terminalStatus:terminal.status||'not_run',terminalTasks:terminal.taskCount||0,independentVisualEvidence:'reports/v09/integration_visual_review.json',humanRatings:null,summary:'The shared generative family is executable and produces new pixels, but inspected outputs remain procedural in appearance. No independent photorealism pass or terminal benchmark is asserted.'},
  G3:{status:'partial',controlledPassed:boundary.hiddenWallJointGatePassed||false,naturalHiddenWallGroundTruth:null,developmentFixtures:true,summary:'Independent analytic mixed-edge and controlled masked-surface tests pass. The fixtures informed development; unseen natural hidden-wall accuracy and natural alpha truth remain unknown.'},
  G4:{status:'partial',actualMovieFiles:media.actualMovieFiles,requiredCategories:3,temporalReview:media.visualTemporalReview,summary:'State continuity and code rendering are testable locally; three production media examples, temporal visual review, and true geometry evidence are not certified by this audit.'},
  G5:{status:'partial',legacyFilesByteExact:retention.allRetained,localBuiltRoutes:built.status,productionVerification:'pending_separate_owner_review',summary:'Old source bytes and local compiled delivery can be checked. Actual browser behavior, deployed privacy, downloads and production task execution require the production review.'}
 };
}

async function main(){
 fs.mkdirSync(reports,{recursive:true});const requireBuild=process.argv.includes('--require-build');
 const contractsRequired=process.argv.includes('--contracts');
 const retention=retainedFiles(),deps=dependencies(),evidence=evidenceConsistency(),privacy=publicPrivacy(),built=await builtRoutes(requireBuild),media=mediaInventory(),contracts=editorContracts(contractsRequired);
 const failures=[];
 if(!retention.allRetained)failures.push('Legacy assets missing or changed outside the authorized root entry.');
 if(!deps.allPresent)failures.push('One or more linked UI resources, runtime dependencies, or bound DOM IDs are missing.');
 if(!evidence.allMatched||!evidence.terminalProtocolMatches)failures.push('Evidence hash mismatch or changed frozen protocol; regenerate stale evidence before release.');
 if(privacy.credentialFindings.length)failures.push('Credential-shaped strings detected in publicly shipped text; inspect redacted findings.');
 if(built.status==='failed'||requireBuild&&built.status!=='passed')failures.push('Current built delivery failed or was required but is not available.');
 if(contractsRequired&&(contracts.status!=='passed'||!contracts.currentSourcesMatch))failures.push('Editor contracts failed or source changed during their run.');
 write('integration_retention.json',retention);write('integration_routes.json',built);
 const report={schema:'crf.integration_review.v0.9',checkedAt:new Date().toISOString(),scope:'Independent local read-only engineering review; no provider requests or production certification',baseline:BASELINE,engineeringPassed:failures.length===0,failures,retention:{baseline:BASELINE,total:retention.trackedWebFiles,requiredUnchanged:retention.requiredUnchanged,byteExact:retention.byteExactUnchanged,allRetained:retention.allRetained},dependencies:deps,evidence,privacy,built:{...built,checks:undefined},media,contracts:{...contracts,output:undefined},gates:gates(retention,built,media),finalAcceptanceOverwritten:false};
 write('integration_review.json',report);
 console.log(JSON.stringify({engineeringPassed:report.engineeringPassed,failures,retention:report.retention,built:built.status,gates:Object.fromEntries(Object.entries(report.gates).map(([k,v])=>[k,v.status])),report:'reports/v09/integration_review.json'},null,2));
 if(failures.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={retainedFiles,dependencies,evidenceConsistency,publicPrivacy,builtRoutes,mediaInventory,editorContracts,gates};
