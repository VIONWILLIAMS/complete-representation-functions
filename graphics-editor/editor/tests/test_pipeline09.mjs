import test from 'node:test';
import assert from 'node:assert/strict';
import CRF09 from '../web/crf-generative09.js';
import Tasks from '../web/task-runner09.js';
import {generateNative09,validateNativeScene09,validatePlan09} from '../server/generative09.mjs';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII=';
const apiKey='test-only-not-a-real-credential';
const scene=()=>CRF09.createScene({category:'still_life',seed:42,width:512,height:384});
const plan=()=>({category:'still_life',requiredTypes:['apple','pear','orange'],learningTopic:'Different fruit materials in natural light',requestedChanges:[],unknownRequirements:[],constraints:[{type:'count',subject:'apple',value:1}]});
const usage=()=>({providerCalls:1,total_tokens:50,requests:[{requestId:'req-'+Math.random().toString(36).slice(2),total_tokens:50}]});
const envelope=(s=scene())=>({action:'scene',scene:s,message:'候选需要渲染检查',qualityNotes:[],warnings:[]});
const reply=v=>({id:'native-test',model:'deepseek-flash',choices:[{message:{content:typeof v==='string'?v:JSON.stringify(v),reasoning_content:'PRIVATE_REASONING_SHOULD_NOT_LEAK'},finish_reason:'stop'}],usage:{prompt_tokens:50,completion_tokens:100,total_tokens:150}});
function mock(values){const calls=[];return{calls,fetchImpl:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});assert.ok(values.length,'unexpected request');const value=values.shift();return value instanceof Response?value:new Response(JSON.stringify(value));}};}
const options=(m,extra={})=>({apiKey,fetchImpl:m.fetchImpl,schemaRepair:false,...extra});
const pixels={width:2,height:2,data:new Uint8ClampedArray([100,110,120,255,130,140,150,255,80,90,100,255,150,160,170,255]),vision:PNG};
const sample=(id)=>CRF09.extractAppearance(pixels,{id,category:'still_life',sourceGroup:id});
const model=()=>CRF09.learnAppearance([sample('one'),sample('two')]);
const render=async s=>({width:s.width,height:s.height,image:PNG,png:PNG,report:{testRenderer:true}});

test('native compiler uses shared grammar, thinking and actual visual feedback without reasoning disclosure',async()=>{
 const m=mock([reply(envelope())]);const result=await generateNative09({prompt:'一只苹果和一只梨',seed:42,category:'still_life'},options(m));
 assert.equal(result.ok,true);assert.equal(result.scene.schema,'crf.generative_scene.v0.9');assert.equal(result.scene.provenance.observedImageReplay,false);
 assert.equal(result.rendered,false);assert.equal(result.quality.status,'candidate_requires_render_and_independent_review');
 assert.deepEqual(m.calls[0].body.thinking,{type:'enabled'});assert.equal(m.calls[0].body.reasoning_effort,'high');
 assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING'),false);assert.equal(JSON.stringify(result).includes(apiKey),false);
});

test('schema validation rejects unbounded or executable scene content and attachment cycles',()=>{
 for(const mutate of [s=>s.objects[0].type='eval',s=>s.objects[0].url='https://example.com/pixels',s=>s.objects[0].width=99,s=>s.light.intensity=NaN,s=>s.code='alert(1)',s=>s.objects[1].id=s.objects[0].id,s=>{s.objects[0].attachment={parentId:s.objects[1].id,anchor:[0,0]};s.objects[1].attachment={parentId:s.objects[0].id,anchor:[0,0]};}]){const s=scene();mutate(s);assert.throws(()=>validateNativeScene09(s));}
 assert.throws(()=>validatePlan09({...plan(),requiredTypes:['human']}));
});

test('invalid current input and critique without actual raster never call provider',async()=>{
 for(const input of [{mode:'critique',currentScene:scene()},{mode:'edit'},{mode:'generate',image:'https://example.com/not-actual-bytes'}]){const m=mock([]);const r=await generateNative09({prompt:'检查',...input},options(m));assert.equal(r.ok,false);assert.equal(m.calls.length,0);}
});

test('targeted edit prevents unrelated lighting/object changes and permits requested object shape/color',async()=>{
 for(const mutate of [s=>s.light.azimuth=90,s=>s.objects[1].color=[0,0,0],s=>s.objects.push({...s.objects[0],id:'new'})]){const after=scene();mutate(after);const m=mock([reply(envelope(after))]);const r=await generateNative09({mode:'edit',prompt:'修改苹果',seed:42,currentScene:scene(),editableObjectIds:['fruit.apple']},options(m));assert.equal(r.ok,false);assert.equal(r.error.code,'EDIT_SCOPE_VIOLATION');}
 const after=scene();after.objects[0].color=[80,170,90];const m=mock([reply(envelope(after))]);const r=await generateNative09({mode:'edit',prompt:'苹果改绿',currentScene:scene(),editableObjectIds:['fruit.apple']},options(m));assert.equal(r.ok,true);assert.deepEqual(r.scene.objects[0].color,[80,170,90]);
});

test('a structural repair is bounded and failed attempts remain reported',async()=>{
 const bad=scene();bad.objects[0].type='person';const m=mock([reply(envelope(bad)),reply(envelope())]);const r=await generateNative09({prompt:'水果',seed:42},options(m,{schemaRepair:true}));assert.equal(r.ok,true);assert.equal(r.attempts.length,2);assert.equal(r.usage.providerCalls,2);assert.ok(r.attempts[0].validationError);
 const m2=mock([new Response('credential reflected',{status:401})]);const r2=await generateNative09({prompt:'水果'},options(m2));assert.equal(r2.ok,false);assert.equal(r2.attempts.length,1);assert.equal(r2.attempts[0].status,'failed');assert.equal(r2.scene,undefined);
});

test('runtime reuses learned model, renders every candidate and limits critique/revision',async()=>{
 const calls=[],store=Tasks.createMemoryStore();let renders=0;
 const api=async(path,body)=>{calls.push({path,body});if(body.mode==='plan')return{ok:true,action:'plan',plan:plan(),usage:usage()};if(body.mode==='critique'){assert.equal(body.image,PNG);return{ok:true,action:'critique',message:'调整接触',issues:[{code:'contact',severity:'minor',objectIds:['fruit.apple'],description:'检查桌面接触'}],qualityNotes:[],scores:{realism:2,semantic:4,coherence:3},usage:usage()};}return{ok:true,...envelope(),usage:usage()};};
 const runner=Tasks.create({store,api,getModel:async()=>model(),renderer:CRF09,render:async s=>{renders++;return render(s);}});
 const result=await runner.start({prompt:'一个苹果一只梨和一个橙子',category:'still_life',seed:42});
 assert.equal(result.status,'review_required');assert.equal(result.candidates.length,3);assert.equal(result.feedbackCount,2);assert.equal(renders,3);assert.equal(calls.filter(x=>x.body.mode==='critique').length,2);assert.equal(calls.some(x=>x.path.includes('research')),false);assert.equal(result.quality.independentHumanReview,false);assert.equal(result.quality.releaseGate,'not_evaluated');assert.ok(await runner.getRender(result.id,2));
});

test('missing appearance connects exactly ten real search/vision stages, Gaussian fits and shared parameter update',async()=>{
 let searches=0,visions=0,fits=0,updated=null;const store=Tasks.createMemoryStore();
 const api=async(path,body)=>{
  if(body.mode==='plan')return{ok:true,action:'plan',plan:plan(),usage:usage()};
  if(path.endsWith('/research')){searches++;const id='r'+body.round;return{ok:true,research:{searched:true,summary:'Observed source list'},checkpoint:{status:'searched'},sources:[{url:'https://example.org/'+id}],images:[{url:PNG,sourceUrl:'https://example.org/'+id,sha256:body.round.toString(16).padStart(64,'0'),bytes:200}],usage:usage()};}
  if(path.endsWith('/describe')){visions++;assert.equal(body.images[0].url,PNG);return{ok:true,images:body.images.map(x=>({id:x.id,submittedToVision:true})),items:body.images.map(x=>({id:x.id,label:'果物',role:'object'})),usage:usage()};}
  return{ok:true,...envelope(),usage:usage()};
 };
 const runner=Tasks.create({store,api,renderer:CRF09,getModel:async()=>null,setModel:async m=>{updated=m;},decodeImage:async()=>pixels,fitReference:async()=>{fits++;return{asset:{splats:[[1,1,1,1,0,1,1,1]]},metrics:{psnr:21},qualityTier:'preview',compositionEligible:false,representationScope:'observed_image_plane'};},render});
 const result=await runner.start({prompt:'水果静物',seed:42,budget:{maxCandidates:1,maxQualityFeedback:0}});
 assert.equal(result.status,'review_required');assert.equal(searches,10);assert.equal(visions,10);assert.equal(fits,10);assert.equal(updated.categories.still_life.count,10);assert.equal(result.learning.sharedUpdate.languageModelWeightsUpdated,false);assert.equal(result.learning.sharedUpdate.independentSourceGroups,10);assert.equal(result.learning.rounds[0].fitResults[0].compositionEligible,false);assert.equal(result.learning.rounds[0].fitResults[0].qualityTier,'preview');
});

test('resume retains completed render and does not repeat successful paid operations',async()=>{
 let planCalls=0,generationCalls=0,critiqueCalls=0;const store=Tasks.createMemoryStore();
 const api=async(path,body)=>{if(body.mode==='plan'){planCalls++;return{ok:true,action:'plan',plan:plan(),usage:usage()};}if(body.mode==='critique'){critiqueCalls++;if(critiqueCalls===1){const e=new Error('temporary network');e.code='NETWORK';throw e;}return{ok:true,action:'critique',issues:[],message:'没有可执行修改',usage:usage()};}generationCalls++;return{ok:true,...envelope(),usage:usage()};};
 const runner=Tasks.create({store,api,renderer:CRF09,getModel:async()=>model(),render});
 const failed=await runner.start({prompt:'水果静物'});assert.equal(failed.status,'failed');assert.equal(failed.candidates.length,1);assert.ok(await runner.getRender(failed.id,0));
 const resumed=await runner.resume(failed.id);assert.equal(resumed.status,'review_required');assert.equal(planCalls,1);assert.equal(generationCalls,1);assert.equal(critiqueCalls,2);assert.equal(resumed.apiOperations.filter(x=>x.status==='failed').length,1);
});

test('unknown semantic capability stops before searching or inventing unsupported objects',async()=>{
 const calls=[];const runner=Tasks.create({store:Tasks.createMemoryStore(),renderer:CRF09,api:async(path,body)=>{calls.push(path);return{ok:true,action:'plan',plan:{...plan(),unknownRequirements:['人物面部与手部']},usage:usage()};},getModel:async()=>model(),render});
 const result=await runner.start({prompt:'一位行人在吃苹果'});assert.equal(result.status,'failed');assert.equal(result.error.code,'UNSUPPORTED_REQUIREMENTS');assert.equal(calls.length,1);assert.equal(result.candidates.length,0);
});

test('budget exhaustion cannot be hidden as successful generation',async()=>{
 const runner=Tasks.create({store:Tasks.createMemoryStore(),renderer:CRF09,getModel:async()=>model(),render,api:async()=>({ok:true,action:'plan',plan:plan(),usage:usage()})});
 const result=await runner.start({prompt:'水果',budget:{maxApiOperations:1}});assert.equal(result.status,'failed');assert.equal(result.error.code,'BUDGET_EXHAUSTED');assert.equal(result.apiOperations.length,1);
});

test('declared semantic checks report failures instead of inflating realism',()=>{
 const s=scene();const result=Tasks.assessConstraints(s,{constraints:[{type:'count',subject:'apple',value:2},{type:'left_of',subject:'apple',target:'pear'}]});assert.equal(result.evaluated,2);assert.equal(result.passed,1);assert.equal(result.allPassed,false);assert.ok(result.scope.includes('not visual recognition'));
});

test('semantic conditions use inherited visibility and full attachment plus camera coordinates',()=>{
 const s={camera:{panX:.1,panY:-.05,zoom:1.2},objects:[
  {id:'grandparent',type:'pole',x:.8,y:.5,depth:1,visible:true},
  {id:'parent',type:'signal',x:.05,y:.05,depth:.5,visible:true,attachment:{parentId:'grandparent',anchor:[-.1,-.1]}},
  {id:'child',type:'window',x:.01,y:.01,depth:0,visible:true,attachment:{parentId:'parent',anchor:[-.1,-.1]}},
  {id:'reference',type:'apple',x:.3,y:.7,depth:0,visible:true}
 ]};
 const original=structuredClone(s),effective=Tasks.resolveConstraintObjects(s),child=effective.find(o=>o.id==='child');
 assert.ok(Math.abs(child.x-(.5+(.6-.5)*1.2-.025))<1e-12);assert.ok(Math.abs(child.y-(.5+(.3-.5)*1.2+.0125))<1e-12);assert.deepEqual(s,original);
 const relation=Tasks.assessConstraints(s,{constraints:[{type:'right_of',subject:'window',target:'apple'}]});assert.equal(relation.allPassed,true);
 s.objects[0].visible=false;
 const hidden=Tasks.assessConstraints(s,{constraints:[{type:'count',subject:'signal',value:0},{type:'count',subject:'window',value:0}]});assert.equal(hidden.passed,2);assert.equal(s.objects[1].visible,true);assert.equal(s.objects[2].visible,true);
});

test('concurrent starts are blocked and cancellation preserves an explicit task outcome',async()=>{
 let entered;const enteredPromise=new Promise(resolve=>{entered=resolve;});
 const runner=Tasks.create({store:Tasks.createMemoryStore(),renderer:CRF09,getModel:async()=>model(),render,api:async(path,body,{signal})=>new Promise((resolve,reject)=>{entered();signal.addEventListener('abort',()=>{const e=new Error('aborted');e.code='CANCELLED';reject(e);},{once:true});})});
 const pending=runner.start({prompt:'水果'});await assert.rejects(runner.start({prompt:'第二个任务'}),e=>e.code==='BUSY');await enteredPromise;assert.equal(runner.cancel(),true);const result=await pending;assert.equal(result.status,'cancelled');assert.equal(result.apiOperations[0].status,'cancelled');assert.equal(runner.isRunning(),false);assert.equal((await runner.getTask(result.id)).status,'cancelled');
});

test('presentation callback errors cannot erase a completed rendering task',async()=>{
 const runner=Tasks.create({store:Tasks.createMemoryStore(),renderer:CRF09,getModel:async()=>model(),render,onEvent:()=>{throw new Error('UI detached');},onCandidate:()=>{throw new Error('preview closed');},api:async(path,body)=>body.mode==='plan'?{ok:true,action:'plan',plan:plan(),usage:usage()}:{ok:true,...envelope(),usage:usage()}});
 const result=await runner.start({prompt:'水果',budget:{maxCandidates:1,maxQualityFeedback:0}});assert.equal(result.status,'review_required');assert.equal(result.candidates.length,1);assert.ok(result.observerErrors.length);assert.ok(await runner.getRender(result.id,0));
});

test('one explicit replan preserves the failed plan, paid usage, prompt, seed and budgets',async()=>{
 let plans=0;const store=Tasks.createMemoryStore(),calls=[];
 const runner=Tasks.create({store,renderer:CRF09,getModel:async()=>model(),render,api:async(path,body)=>{
  calls.push(body);if(body.mode==='plan'){plans++;return{ok:true,action:'plan',plan:{...plan(),unknownRequirements:plans===1?['照片级纹理不足']:[]},qualityNotes:['照片级质量仍待独立验收'],warnings:[],usage:usage()};}
  return{ok:true,...envelope(),usage:usage()};
 }});
 const failed=await runner.start({prompt:'真实苹果与梨',seed:42,budget:{maxCandidates:1,maxQualityFeedback:0}});
 assert.equal(failed.error.code,'UNSUPPORTED_REQUIREMENTS');assert.equal(failed.stage,'planning');
 const priorRequest=failed.usage[0].requests[0].requestId;
 const resumed=await runner.replan(failed.id,{reason:'已实现对象的质量限制与缺失形态分离'});
 assert.equal(resumed.status,'review_required');assert.equal(resumed.id,failed.id);assert.equal(resumed.prompt,failed.prompt);assert.equal(resumed.seed,failed.seed);assert.deepEqual(resumed.budget,failed.budget);
 assert.equal(resumed.replanCount,1);assert.equal(resumed.planningHistory[0].error.code,'UNSUPPORTED_REQUIREMENTS');assert.equal(resumed.planningHistory[0].providerRequestIds[0],priorRequest);
 assert.equal(resumed.usage[0].requests[0].requestId,priorRequest);assert.deepEqual(resumed.apiOperations.map(o=>o.phase),['plan','plan_replan_1','generate']);
 assert.equal(calls.filter(c=>c.mode==='plan').length,2);assert.equal(resumed.planEvidence.qualityNotes.length,1);assert.equal(resumed.quality.releaseGate,'not_evaluated');
 await assert.rejects(runner.replan(failed.id,{reason:'another attempt'}),e=>e.code==='REPLAN_INELIGIBLE');
});

test('replan cannot silently support humans or repeat planning beyond its one-attempt bound',async()=>{
 let calls=0;const runner=Tasks.create({store:Tasks.createMemoryStore(),renderer:CRF09,getModel:async()=>model(),render,api:async()=>{calls++;return{ok:true,action:'plan',plan:{...plan(),unknownRequirements:['人物面部与手部']},usage:usage()};}});
 const first=await runner.start({prompt:'一位行人在吃苹果'}),second=await runner.replan(first.id,{reason:'核对现有类型'});
 assert.equal(second.status,'failed');assert.equal(second.error.code,'UNSUPPORTED_REQUIREMENTS');assert.equal(second.candidates.length,0);assert.equal(calls,2);assert.equal(second.planningHistory.length,1);
 await assert.rejects(runner.replan(first.id,{reason:'再来一次'}),e=>e.code==='REPLAN_LIMIT');assert.equal(calls,2);
});
