const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../web/task-runner10.js');
const V=require('../web/crf-verifier10.js');
const pixel=(r=10)=>({width:2,height:1,data:Uint8ClampedArray.from([r,20,30,255,40,50,60,255]),image:'data:image/png;base64,AAAA',png:'data:image/png;base64,AAAA',report:{renderer:'test-explicit-rgba'}});
const scene=i=>({schema:'crf.generative_scene.v0.9',category:'still_life',seed:42,width:2,height:1,revision:i,objects:[{id:'apple',type:'apple',x:.2,y:.5,color:[150,20,20],visible:true}]});
const plan={category:'still_life',constraints:[{type:'count',subject:'apple',value:1}],unknownRequirements:[]};
const opinion=(score=3,issues=[{code:'texture',severity:'major',description:'Refine surface.'}])=>({action:'critique',issues,scores:{realism:score,semantic:4,coherence:score},usage:{providerCalls:1,total_tokens:10,requests:[{requestId:'fixture-only'}]}});
function harness({scores=[3,3,3,3,3,3],issues,failEvaluation=-1,capabilities,render}={}){
 const calls=[];let generated=0,evaluated=0;
 const runner=T.create({store:T.createMemoryStore(),capabilities,render:render||(async s=>pixel(10+s.revision)),api:async(path,body)=>{calls.push({path,body});if(body.mode==='plan')return{action:'plan',plan};if(body.mode==='critique'){const i=evaluated++;if(i===failEvaluation){const error=new Error('offline');error.code='NETWORK_ERROR';throw error;}return opinion(scores[i]??3,issues);}return{action:'scene',scene:scene(generated++),usage:{providerCalls:1,total_tokens:10,requests:[{requestId:'fixture-only'}]}};}});
 return{runner,calls};
}

test('all six candidates, including the last, get actual-frame evaluation',async()=>{
 const {runner,calls}=harness({scores:[2,2.2,2.4,2.6,2.8,3]});
 const result=await runner.start({prompt:'One apple',plan,budget:{maxStagnantCandidates:6}});
 assert.equal(result.candidates.length,6);assert.equal(result.feedbackCount,5);assert.equal(calls.filter(x=>x.body.mode==='critique').length,6);
 assert.ok(result.candidates.every(x=>x.critique?.sourceFrameSha256));assert.equal(result.quality.allCandidatesEvaluated,true);assert.equal(result.quality.releaseGate,'not_passed');
 assert.equal(result.stopReason,'CANDIDATE_BUDGET_EXHAUSTED');assert.equal(result.selectedCandidate,5);
 assert.ok(result.taskGraph.nodes.find(x=>x.id==='verify.5'));
});

test('more recent worse candidate cannot replace best verified candidate',async()=>{
 const {runner}=harness({scores:[3,2,2,2]});const r=await runner.start({prompt:'One apple',plan,budget:{maxCandidates:4,maxQualityFeedback:3,maxStagnantCandidates:3}});
 assert.equal(r.selectedCandidate,0);assert.equal(r.stopReason,'QUALITY_PLATEAU');assert.equal(r.candidates.length,4);
 assert.ok(r.candidates.slice(1).every(x=>x.parentIndex===0));
});

test('early completion selects the candidate that passed instead of an older higher-scored failed frame',async()=>{
 let generated=0,reviewed=0;const runner=T.create({store:T.createMemoryStore(),render:async s=>pixel(10+s.revision),api:async(path,body)=>{
  if(body.mode==='critique')return reviewed++===0?opinion(4.8,[{code:'lighting',severity:'major',description:'Lighting remains visibly inconsistent.'}]):opinion(4,[]);
  return{action:'scene',scene:scene(generated++)};
 }});
 const result=await runner.start({prompt:'One coherent apple photograph',plan,budget:{maxCandidates:2,maxQualityFeedback:1}});
 assert.equal(result.candidates[0].verification.allRequiredPassed,false);assert.equal(result.candidates[1].verification.allRequiredPassed,true);assert.equal(result.selectedCandidate,1);assert.equal(result.stopReason,'CHECKS_PASSED_INDEPENDENT_REVIEW_REQUIRED');assert.equal(result.quality.releaseGate,'not_passed');
});

test('one-candidate budget still reserves and performs a final critique',async()=>{
 const {runner,calls}=harness();const r=await runner.start({prompt:'One apple',plan,budget:{maxCandidates:1,maxQualityFeedback:0}});
 assert.equal(r.candidates.length,1);assert.equal(calls.filter(x=>x.body.mode==='critique').length,1);assert.equal(r.quality.selectedCandidateEvaluated,true);
});

test('API budget exhaustion cannot label an unevaluated final picture accepted',async()=>{
 const {runner}=harness();const r=await runner.start({prompt:'One apple',plan,budget:{maxCandidates:1,maxQualityFeedback:0,maxApiOperations:1}});
 assert.equal(r.status,'blocked');assert.equal(r.stopReason,'FINAL_EVALUATION_BUDGET_EXHAUSTED');assert.equal(r.quality.allCandidatesEvaluated,false);assert.equal(r.quality.releaseGate,'not_passed');
 assert.ok(r.candidates[0].verification.unknowns.includes('visual.realism'));
});

test('no training path runs and frozen existing model stays unchanged',async()=>{
 const model={id:'frozen',count:23},before=JSON.stringify(model);let seen;
 const {runner}=harness({render:async(s,m)=>{seen=m;return pixel();}});
 await assert.rejects(runner.start({prompt:'Test',mode:'learn'}),e=>e.code==='TRAINING_DISABLED');
 await assert.rejects(runner.start({prompt:'Test',learningPolicy:'always'}),e=>e.code==='TRAINING_DISABLED');
 const r=await runner.start({prompt:'One apple',plan,modelSnapshot:model,budget:{maxCandidates:1,maxQualityFeedback:0}});
 assert.equal(JSON.stringify(model),before);assert.deepEqual(seen,model);assert.equal(r.quality.trainingPerformed,false);assert.equal(r.trainingAllowed,false);
});

test('reference mode hydrates only known assets and strips pixel assets from provider input',async()=>{
 const asset={schema:'crf.gaussian_asset.v0.10',width:2,height:1,base:[0,0,0],splats:[[0,0,1,1,0,1,0,0]]},assets={a:asset},calls=[];
 const s={schema:'crf.gaussian_scene.v0.10',width:2,height:1,background:[0,0,0],objects:[{id:'a1',assetId:'a',x:1,y:.5,visible:true}]};
 const runner=T.create({store:T.createMemoryStore(),render:async hydrated=>{assert.deepEqual(hydrated.assets,assets);return pixel();},api:async(path,body)=>{calls.push(body);return body.mode==='critique'?opinion():{action:'scene',scene:s};}});
 const r=await runner.start({prompt:'Reference composition',representation:'reference_gaussian',currentScene:{...s,assets,assetUrls:{a:'assets/object.json'}},plan:{constraints:[],unknownRequirements:[]},budget:{maxCandidates:1,maxQualityFeedback:0}});
 assert.ok(calls.every(x=>!x.currentScene?.assets&&!x.currentScene?.assetUrls));assert.deepEqual(r.candidates[0].scene.assets,assets);
});

test('unknown asset and genuine capability gaps block without repeat calls',async()=>{
 const runner=T.create({store:T.createMemoryStore(),render:async()=>pixel(),api:async()=>({action:'scene',scene:{schema:'crf.gaussian_scene.v0.10',width:2,height:1,objects:[{id:'bad',assetId:'missing'}]}})});
 const r=await runner.start({prompt:'Reference',representation:'reference_gaussian',assets:{a:{}},plan:{constraints:[],unknownRequirements:[]}});assert.equal(r.status,'blocked');assert.equal(r.error.code,'ASSET_MISSING');assert.equal(r.quality.allCandidatesEvaluated,false);
 const h=harness({issues:[{code:'unsupported',severity:'major',description:'Physical refraction is unavailable.'}]});const gap=await h.runner.start({prompt:'Glass',plan});assert.equal(gap.stopReason,'CAPABILITY_GAP');assert.equal(gap.candidates.length,1);
 const count=h.calls.length;await h.runner.resume(gap.id);assert.equal(h.calls.length,count);
});

test('completed task replay uses durable results without new calls',async()=>{
 const {runner,calls}=harness({scores:[5],issues:[]});const result=await runner.start({prompt:'One apple',plan});const count=calls.length;
 assert.equal(result.stopReason,'CHECKS_PASSED_INDEPENDENT_REVIEW_REQUIRED');assert.equal(result.quality.releaseGate,'not_passed');
 const replay=await runner.resume(result.id);assert.equal(calls.length,count);assert.equal(replay.selectedCandidate,0);
});

test('top-level required planning capability gaps stop before any render or proposal',async()=>{
 let requests=0,renders=0;const runner=T.create({store:T.createMemoryStore(),render:async()=>{renders++;return pixel();},api:async()=>{requests++;return{action:'plan',plan,capabilityGaps:[{capability:'rear_view',description:'The required rear view is unavailable.',requiredForGoal:true}]};}});
 const result=await runner.start({prompt:'Show the unseen back of an apple'});
 assert.equal(result.status,'blocked');assert.equal(result.stopReason,'CAPABILITY_GAP');assert.equal(requests,1);assert.equal(renders,0);assert.equal(result.quality.allCandidatesEvaluated,false);
 await runner.resume(result.id);assert.equal(requests,1);
});

test('available occlusion repair proceeds despite a legacy or non-required geometry limit',async()=>{
 for(const gap of ['Cannot recover hidden apple geometry; the pear can cover it.',{capability:'hidden_geometry',description:'Not required when the pear covers the missing edge.',requiredForGoal:false}]){
  let generated=0,reviewed=0;const runner=T.create({store:T.createMemoryStore(),render:async()=>pixel(),api:async(path,body)=>{
   if(body.mode==='plan')return{action:'plan',plan,capabilityGaps:[gap]};
   if(body.mode==='critique'){reviewed++;return{...opinion(3,[{code:'contact',severity:'major',description:'Place the pear in front of the apple.'}]),capabilityGaps:[gap]};}
   return{action:'scene',scene:scene(generated++)};
  }});
  const result=await runner.start({prompt:'Arrange fruit with the pear covering the apple edge',budget:{maxCandidates:2,maxQualityFeedback:1}});
  assert.equal(result.candidates.length,2);assert.equal(reviewed,2);assert.notEqual(result.status,'blocked');assert.equal(result.stopReason,'CANDIDATE_BUDGET_EXHAUSTED');
  assert.ok(result.candidates[0].diagnosis.some(x=>x.status==='unknown'&&x.module==='capability_gap'));
 }
});

test('cancelled inference preserves unknown request outcome and retains earlier candidates',async()=>{
 const store=T.createMemoryStore();let notify;const pending=new Promise(resolve=>{notify=resolve;});let request=0;
 const runner=T.create({store,render:async()=>pixel(),api:async(path,body,{signal})=>{request++;if(body.mode==='generate')return{action:'scene',scene:scene(0)};notify();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{const e=new Error('cancel');e.code='CANCELLED';reject(e);},{once:true}));}});
 const work=runner.start({prompt:'One apple',plan});await pending;assert.equal(runner.cancel(),true);const result=await work;
 assert.equal(result.status,'cancelled');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].status,'rendered');assert.equal(result.usageTotals.uncertainRequestsReserved,2);assert.equal(request,2);assert.equal(runner.isRunning(),false);
});

test('explicit effort change resumes only a truncated missing critique and retains all prior paid evidence',async()=>{
 const calls=[];let renders=0,critiques=0;
 const runner=T.create({store:T.createMemoryStore(),render:async()=>{renders++;return pixel(37);},api:async(path,body)=>{
  calls.push(body);if(body.mode==='generate')return{action:'scene',scene:scene(0),usage:{providerCalls:1,total_tokens:50,requests:[{requestId:'fixture-original-generation'}]}};
  if(critiques++===0)return{ok:false,error:{code:'MODEL_TRUNCATED',message:'Fixture length limit.'},usage:{providerCalls:1,total_tokens:18000,usageComplete:true,requests:[{requestId:'fixture-truncated-max'}]}};
  return opinion(5,[]);
 }});
 const blocked=await runner.start({prompt:'One apple',plan,reasoningEffort:'max',budget:{maxCandidates:1,maxQualityFeedback:0}});assert.equal(blocked.status,'blocked');assert.equal(blocked.stopReason,'EVALUATION_UNAVAILABLE');
 const original=await runner.getRender(blocked.id,0),contract=JSON.stringify(blocked.contract),sceneBytes=JSON.stringify(blocked.candidates[0].scene);
 const resumed=await runner.resume(blocked.id,{reasoningEffort:'high',budget:{maxTotalTokens:300000},reason:'Recover a truncated evaluation without regenerating.'});
 assert.deepEqual(calls.map(x=>x.mode),['generate','critique','critique']);assert.deepEqual(calls.map(x=>x.reasoningEffort),['max','max','high']);assert.equal(renders,1);assert.equal(resumed.candidates.length,1);assert.equal(JSON.stringify(resumed.candidates[0].scene),sceneBytes);assert.equal(JSON.stringify(resumed.contract),contract);assert.equal(resumed.contractSha256,blocked.contractSha256);assert.deepEqual(await runner.getRender(blocked.id,0),original);
 assert.equal(resumed.status,'review_required');assert.equal(resumed.quality.allCandidatesEvaluated,true);assert.equal(resumed.usageTotals.tokens,18060);assert.equal(resumed.usage[1].requests[0].requestId,'fixture-truncated-max');assert.equal(resumed.apiOperations.length,3);assert.equal(resumed.candidates[0].evaluationError,undefined);assert.equal(resumed.candidates[0].evaluationFailures[0].code,'MODEL_TRUNCATED');assert.ok(resumed.candidates[0].evaluationRecoveredAt);
 assert.equal(resumed.resumptionHistory[0].previousError.code,'MODEL_TRUNCATED');assert.equal(resumed.resumptionHistory[0].reasoningEffortBefore,'max');assert.ok(resumed.events.some(e=>e.type==='reasoning_effort_changed'&&e.after==='high'));assert.equal(resumed.budget.maxCandidates,1);assert.equal(resumed.budget.maxTotalTokens,300000);
});

test('budget-only resume completes a saved unreviewed render without another proposal',async()=>{
 const{runner,calls}=harness({scores:[5],issues:[]});const blocked=await runner.start({prompt:'One apple',plan,reasoningEffort:'max',budget:{maxCandidates:1,maxQualityFeedback:0,maxApiOperations:1}});
 assert.equal(blocked.stopReason,'FINAL_EVALUATION_BUDGET_EXHAUSTED');const resumed=await runner.resume(blocked.id,{budget:{maxApiOperations:3}});
 assert.deepEqual(calls.map(x=>x.body.mode),['generate','critique']);assert.equal(resumed.reasoningEffort,'max');assert.equal(resumed.candidates.length,1);assert.equal(resumed.quality.selectedCandidateEvaluated,true);assert.equal(resumed.events.some(e=>e.type==='reasoning_effort_changed'),false);
});

test('resume configuration cannot alter completed goals, unknown fields, or genuine missing capabilities',async()=>{
 const complete=harness({scores:[5],issues:[]}),finished=await complete.runner.start({prompt:'One apple',plan});const completedCalls=complete.calls.length;
 await assert.rejects(complete.runner.resume(finished.id,{reasoningEffort:'high'}),e=>e.code==='RESUME_INELIGIBLE');assert.equal(complete.calls.length,completedCalls);
 const gap=harness({issues:[{code:'unsupported',severity:'major',description:'The explicitly required rear view is unavailable.'}]}),blocked=await gap.runner.start({prompt:'Required rear view',plan});const prior=gap.calls.length;
 await assert.rejects(gap.runner.resume(blocked.id,{reasoningEffort:'high'}),e=>e.code==='RESUME_CAPABILITY_BLOCKED');assert.equal(gap.calls.length,prior);
 const h=harness(),budgeted=await h.runner.start({prompt:'One apple',plan,budget:{maxApiOperations:1}}),calls=h.calls.length;
 await assert.rejects(h.runner.resume(budgeted.id,{reasoningEffort:'low'}),e=>e.code==='INVALID_RESUME_CONFIGURATION');await assert.rejects(h.runner.resume(budgeted.id,{budget:{maxTokens:9000}}),e=>e.code==='INVALID_RESUME_CONFIGURATION');await assert.rejects(h.runner.resume(budgeted.id,{contract:{}}),e=>e.code==='INVALID_RESUME_CONFIGURATION');assert.equal(h.calls.length,calls);assert.equal((await h.runner.getTask(budgeted.id)).contractSha256,budgeted.contractSha256);
});
