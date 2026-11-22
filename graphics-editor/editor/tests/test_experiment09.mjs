import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ROOT,PRIVATE_ROOT,createFileStore,verifyProtocol,decodeReference09,renderNative09,sanitized,commitAppearanceUpdate,writeJSON,readJSON,exportTrial,CRF09,PNG} from '../scripts/experiment_runtime09.mjs';

test('frozen protocol preserves ten declared showcase tasks and 180 separate unrun terminal tasks',async()=>{
 const {protocol,hash}=await verifyProtocol();assert.equal(protocol.showcase.length,10);assert.equal(protocol.showcase.filter(s=>s.category==='architecture').length,3);assert.equal(protocol.showcase.filter(s=>s.category==='landscape').length,4);assert.equal(protocol.showcase.filter(s=>s.category==='still_life').length,3);assert.equal(protocol.terminal.prompts.length,60);assert.equal(protocol.terminal.prompts.reduce((n,p)=>n+p.seeds.length,0),180);assert.equal(protocol.terminal.status,'not_run');assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(new Set(protocol.showcase.map(s=>s.id)).size,10);
});

test('file store externalizes image bytes and restores exact task results without embedding raster strings',async()=>{
 const dir=path.join(PRIVATE_ROOT,'adapter-tests',randomBytes(6).toString('hex'));try{const store=await createFileStore(dir),data='data:image/png;base64,'+Buffer.from('test pixel bytes').toString('base64'),value={state:'rendered',png:data,nested:[{image:data}]};await store.set('task:test',value);assert.deepEqual(await store.get('task:test'),value);assert.deepEqual(await store.keys('task:'),['task:test']);const files=await fs.readdir(path.join(dir,'records')),text=await fs.readFile(path.join(dir,'records',files[0]),'utf8');assert.equal(text.includes('data:image/'),false);assert.ok(text.includes('__crfDataURL'));assert.equal((await fs.readdir(path.join(dir,'binaries'))).length,1);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Node adapter executes the native renderer and submits actual decoded image bytes',async()=>{
 const scene=CRF09.createScene({category:'still_life',width:256,height:256,seed:219});const output=await renderNative09(scene,null);const png=Buffer.from(output.png.split(',')[1],'base64'),decoded=PNG.sync.read(png);assert.equal(decoded.width,256);assert.equal(decoded.height,256);assert.equal(output.report.renderer,'CRF09.renderScene');assert.match(output.report.pixelSha256,/^[a-f0-9]{64}$/);const reference=await decodeReference09(output.png,{maxSide:96});assert.equal(reference.width,96);assert.equal(reference.height,96);assert.equal(reference.data.length,96*96*4);assert.match(reference.visionSha256,/^[a-f0-9]{64}$/);assert.ok(reference.vision.startsWith('data:image/jpeg;base64,'));
});

test('public report sanitizer removes image payload and private provider fields',()=>{
 const value={apiKey:'sensitive',reasoning_content:'private',url:'data:image/png;base64,YWJj',sourceUrl:'https://example.org/photo',nested:{authorization:'secret',tokenCount:30}};const clean=sanitized(value);assert.equal(clean.apiKey,undefined);assert.equal(clean.reasoning_content,undefined);assert.equal(clean.url.embeddedImageOmitted,true);assert.equal(clean.sourceUrl,value.sourceUrl);assert.deepEqual(clean.nested,{tokenCount:30});
});

test('online commit merges latest observations and preserves a basis updated after the job started',async()=>{
 const dir=path.join(PRIVATE_ROOT,'adapter-tests',randomBytes(6).toString('hex')),file=path.join(dir,'shared.json');
 const sample=id=>({id,sourceGroup:id,category:'still_life',mean:[.2,.3,.4],std:[.1,.1,.1],bands:[.02,.02,.02,.02],sampleCount:10});
 try{const old=CRF09.learnAppearance([sample('old')]),incoming=CRF09.learnAppearance([sample('online')],{previousModel:old}),latest=CRF09.learnAppearance([sample('parallel')],{previousModel:old});latest.functionFamilies={testFamily:{id:'newer-basis-metadata'}};await writeJSON(file,latest);const committed=await commitAppearanceUpdate(file,incoming);assert.equal(committed.observations.length,3);assert.deepEqual(committed.functionFamilies,latest.functionFamilies);assert.equal(committed.onlineUpdate.generatorBasisRetrained,false);assert.equal((await readJSON(file)).id,committed.id);}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('export preserves paid planning failure when no model snapshot exists and retains prior exporter errors',async()=>{
 const runId='adapter-test-'+randomBytes(5).toString('hex'),spec={id:'failed-plan',title:'test',category:'architecture',prompt:'three windows',seed:42,expectedConstraints:[]};
 const reportDir=path.join(ROOT,'reports/v09/generation',runId),publicDir=path.join(ROOT,'web/assets/v09/generated',runId);
 try{
  await writeJSON(path.join(reportDir,spec.id,'record.json'),{runnerFailure:true,error:{code:'ERR_INVALID_ARG_TYPE',message:'undefined model snapshot',at:'original'},usage:[],candidates:[]});
  const task={id:'test-task',status:'failed',stage:'planning',error:{code:'UNSUPPORTED_REQUIREMENTS',message:'quality mistaken as unknown operator'},candidates:[],selectedCandidate:null,usage:[{providerCalls:1,total_tokens:52,requests:[{requestId:'paid-original',total_tokens:52}]}],apiOperations:[{index:0,phase:'plan',status:'completed'}]};
  const record=await exportTrial({runtime:{runner:{getRender:async()=>{throw new Error('No image exists');}}},task,spec,protocolHash:'test',runId});
  assert.equal(record.error.code,'UNSUPPORTED_REQUIREMENTS');assert.equal(record.model.sha256,null);assert.equal(record.usage[0].total_tokens,52);assert.equal(record.usage[0].requests[0].requestId,'paid-original');assert.equal(record.additionalRunnerFailures[0].code,'ERR_INVALID_ARG_TYPE');assert.equal(record.artifact,null);assert.equal(record.candidates.length,0);
 }finally{await fs.rm(reportDir,{recursive:true,force:true});await fs.rm(publicDir,{recursive:true,force:true});}
});
