import test from 'node:test';
import assert from 'node:assert/strict';
import {generateNative10,validateGaussianScene10} from '../server/generative10.mjs';
import G from '../web/crf-gaussian10.js';
import Native from '../web/crf-generative09.js';
import Tasks from '../web/task-runner10.js';

// Every transport in this file is injected. No real credential or network call.
const fakeKey='test-only-no-network-credential';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII=';
const assets=()=>[{id:'apple',label:'Apple',width:128,height:128,role:'object',visibleBounds:[0,0,128,128],contactPoint:[64,128]}];
const asset=()=>({schema:G.ASSET_SCHEMA,width:128,height:128,base:[.2,.1,.1],splats:[]});
const scene=()=>({schema:G.SCENE_SCHEMA,id:'scene.test',title:'Test arrangement',width:512,height:384,background:[220,220,220],objects:[{id:'apple.one',assetId:'apple',x:20,y:100,scaleX:1,scaleY:1,rotation:0,opacity:1,visible:true,zIndex:0,exposure:0,albedoTint:[1,1,1],illuminationGradient:[0,0],preserveHighlights:true}]});
const input=(extra={})=>({prompt:'Arrange this observed apple naturally.',representation:'reference_gaussian',assetSummary:assets(),seed:42,...extra});
const envelope=s=>({action:'scene',message:'Candidate requires actual rendering.',scene:s||scene(),qualityNotes:[],warnings:[],capabilityGaps:[]});
const opinion=(extra={})=>({action:'critique',message:'Check this rendered frame.',issues:[],scores:{realism:4,semantic:4,coherence:4},...extra});
const response=(content,extra={})=>({id:'fixture-provider-10',model:'fixture-deepseek',choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content),reasoning_content:'PRIVATE_FIXTURE_REASONING'},finish_reason:extra.finish||'stop'}],usage:{prompt_tokens:50,completion_tokens:100,total_tokens:150,completion_tokens_details:{reasoning_tokens:60}},...extra});
function mock(items){const calls=[];return{calls,fetchImpl:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});assert.ok(items.length,'unexpected mock request');const item=items.shift();if(item instanceof Error)throw item;return item instanceof Response?item:new Response(JSON.stringify(item),{headers:{'content-type':'application/json'}});}};}
const options=(m,extra={})=>({apiKey:fakeKey,fetchImpl:m.fetchImpl,schemaRepair:false,...extra});

test('high and max reach real transport request bodies in both representations',async()=>{
 for(const representation of ['reference_gaussian','native_procedural'])for(const effort of ['high','max']){
  const s=representation==='reference_gaussian'?scene():Native.createScene({category:'still_life',seed:42,width:512,height:384});
  const payload=envelope(s);if(representation==='native_procedural')delete payload.capabilityGaps;
  const m=mock([response(payload)]);const r=await generateNative10(input({representation,reasoningEffort:effort}),options(m));
  assert.equal(r.ok,true);assert.equal(m.calls.length,1);assert.equal(m.calls[0].body.reasoning_effort,effort);assert.deepEqual(m.calls[0].body.thinking,{type:'enabled'});assert.equal(r.usage.requests[0].reasoningEffort,effort);assert.equal(r.modelTraining,false);
  assert.equal(JSON.stringify(r).includes('PRIVATE_FIXTURE_REASONING'),false);assert.equal(JSON.stringify(r).includes(fakeKey),false);
 }
});

test('preserveHighlights accepts booleans and agrees with the actual Gaussian scene validator',async()=>{
 for(const value of [true,false]){const s=scene();s.objects[0].preserveHighlights=value;const checked=validateGaussianScene10(s,assets());assert.equal(G.validateScene({...checked,assets:{apple:asset()}}).ok,true);const m=mock([response(envelope(s))]);const r=await generateNative10(input(),options(m));assert.equal(r.ok,true);assert.equal(r.scene.objects[0].preserveHighlights,value);}
 const bad=scene();bad.objects[0].preserveHighlights='true';assert.throws(()=>validateGaussianScene10(bad,assets()),/布尔值/);
});

test('reference assets and URL transport metadata are stripped before provider submission',async()=>{
 const hydrated={...scene(),assets:{apple:asset()},assetUrls:{apple:'https://invalid.example/SHOULD_NOT_FORWARD_RASTER'}};
 const summary=[{...assets()[0],splats:'SHOULD_NOT_FORWARD_RASTER',url:'https://invalid.example/SHOULD_NOT_FORWARD_RASTER',code:'SHOULD_NOT_FORWARD_CODE'}];
 const m=mock([response(envelope())]);const r=await generateNative10(input({currentScene:Tasks.lightweightScene(hydrated),assetSummary:summary}),options(m));
 assert.equal(r.ok,true);const submitted=JSON.stringify(m.calls[0].body.messages);assert.equal(submitted.includes('SHOULD_NOT_FORWARD'),false);
 const sent=JSON.parse(m.calls[0].body.messages[1].content[0].text);assert.equal(sent.currentScene.assets,undefined);assert.equal(sent.currentScene.assetUrls,undefined);assert.equal(r.scene.assets,undefined);
});

test('generated references must be allowlisted; model pixels, URLs and weight updates are rejected',async()=>{
 for(const alter of [s=>s.objects[0].assetId='unknown.asset',s=>s.objects[0].url='https://invalid.example/pixels.png',s=>s.assets={apple:asset()},s=>s.weights=[1,2,3]]){
  const s=scene();alter(s);const m=mock([response(envelope(s))]);const r=await generateNative10(input(),options(m));assert.equal(r.ok,false);assert.equal(r.scene,undefined);assert.equal(r.usage.providerCalls,1);assert.equal(r.usage.total_tokens,150);assert.equal(r.attempts[0].validation,'failed');
 }
});

test('invalid descriptors and input evidence fail before any transport call',async()=>{
 const cases=[{assetSummary:[...assets(),...assets()]},{assetSummary:[{...assets()[0],id:'constructor'}]},{assetSummary:[{...assets()[0],width:128.5}]},{assetSummary:[{...assets()[0],visibleBounds:{url:'https://invalid.example'}}]},{assetSummary:[{...assets()[0],contactPoint:[129,0]}]},{seed:-1},{reasoningEffort:'low'},{image:'https://invalid.example/image.png'},{mode:'critique',currentScene:scene()},{mode:'edit'},{currentScene:{...scene(),assets:{apple:asset()}}}];
 for(const extra of cases){const m=mock([]);const r=await generateNative10(input(extra),options(m));assert.equal(r.ok,false);assert.equal(m.calls.length,0);assert.equal(r.usage.providerCalls,0);}
});

test('critique requires the actual image, preserves the input and cannot carry a scene mutation',async()=>{
 const before=scene(),saved=structuredClone(before),m=mock([response(opinion())]);const r=await generateNative10(input({mode:'critique',currentScene:before,image:PNG}),options(m));
 assert.equal(r.ok,true);assert.equal(r.action,'critique');assert.equal(r.scene,undefined);assert.deepEqual(before,saved);assert.equal(m.calls[0].body.messages[1].content[1].image_url.url,PNG);assert.equal(r.usage.requests[0].renderedImageProvided,true);
 for(const bad of [envelope(),opinion({scene:scene()}),{action:'critique',scores:{realism:5,semantic:5,coherence:5}}]){const invalid=mock([response(bad)]);const rejected=await generateNative10(input({mode:'critique',currentScene:scene(),image:PNG}),options(invalid));assert.equal(rejected.ok,false);assert.equal(rejected.scene,undefined);assert.equal(invalid.calls.length,1);}
});

test('unsupported is an explicit capability outcome and cannot masquerade as a generated image',async()=>{
 const m=mock([response({action:'unsupported',message:'Unobserved rear view is unavailable.',capabilityGaps:[{capability:'rear_geometry',description:'The requested rear view is required.',requiredForGoal:true}]})]);
 const r=await generateNative10(input(),options(m));assert.equal(r.ok,true);assert.equal(r.action,'unsupported');assert.equal(r.scene,undefined);assert.equal(r.quality.status,'blocked_capability');assert.equal(r.quality.modelScoreIsProof,false);
 const illegal=mock([response({action:'unsupported',scene:scene()})]);assert.equal((await generateNative10(input(),options(illegal))).ok,false);
});

test('capability parsing preserves goal relevance and legacy strings without claiming them required',async()=>{
 const gaps=['Legacy general limitation.',{capability:'hidden_geometry',description:'A pear can occlude the missing area.',requiredForGoal:false},{capability:'rear_view',description:'Required back view cannot be obtained.',requiredForGoal:true}];
 const m=mock([response(opinion({capabilityGaps:gaps}))]);const r=await generateNative10(input({mode:'critique',currentScene:scene(),image:PNG}),options(m));assert.equal(r.ok,true);assert.deepEqual(r.capabilityGaps,gaps);assert.ok(m.calls[0].body.messages[0].content.includes('遮挡'));
});

test('object-targeted edits protect canvas, background, unrelated objects and their order',async()=>{
 const before=scene();before.objects.push({...structuredClone(before.objects[0]),id:'apple.two',x:170},{...structuredClone(before.objects[0]),id:'apple.three',x:320});
 for(const alter of [s=>s.width=640,s=>s.background=[0,0,0],s=>s.objects[1].x+=10,s=>s.objects.splice(1,1),s=>s.objects.push({...s.objects[0],id:'new'}),s=>{[s.objects[1],s.objects[2]]=[s.objects[2],s.objects[1]];}]){
  const after=structuredClone(before);alter(after);const m=mock([response(envelope(after))]);const r=await generateNative10(input({mode:'edit',currentScene:before,editableObjectIds:['apple.one']}),options(m));assert.equal(r.ok,false);assert.equal(r.error.code,'EDIT_SCOPE_VIOLATION');assert.equal(r.scene,undefined);
 }
 const after=structuredClone(before);after.objects[0].albedoTint=[.7,1.2,.8];after.objects[1]=Object.fromEntries(Object.entries(after.objects[1]).reverse());
 const m=mock([response(envelope(after))]);const allowed=await generateNative10(input({mode:'edit',currentScene:before,editableObjectIds:['apple.one']}),options(m));assert.equal(allowed.ok,true);assert.deepEqual(allowed.scene.objects[0].albedoTint,[.7,1.2,.8]);assert.deepEqual(JSON.parse(m.calls[0].body.messages[1].content[0].text).editableObjectIds,['apple.one']);
 const full=structuredClone(before);full.background=[0,0,0];const free=mock([response(envelope(full))]);assert.equal((await generateNative10(input({mode:'edit',currentScene:before}),options(free))).ok,true);
});

test('schema repair is bounded, configurable and retains usage from both attempts',async()=>{
 const bad=scene();bad.objects[0].assetId='unknown';const m=mock([response(envelope(bad)),response(envelope())]);const r=await generateNative10(input(),options(m,{schemaRepair:true}));assert.equal(r.ok,true);assert.equal(m.calls.length,2);assert.equal(r.usage.providerCalls,2);assert.equal(r.usage.total_tokens,300);assert.deepEqual(r.attempts.map(a=>a.validation),['failed','passed']);
 const one=mock([response('not-json')]);const failed=await generateNative10(input(),options(one));assert.equal(failed.ok,false);assert.equal(one.calls.length,1);assert.equal(failed.usage.total_tokens,150);assert.equal(failed.usage.usageComplete,true);
});

test('truncation retains known usage and transport failure retains an unknown usage outcome',async()=>{
 const truncated=response(envelope());truncated.choices[0].finish_reason='length';const m=mock([truncated]);const r=await generateNative10(input(),options(m));assert.equal(r.ok,false);assert.equal(r.error.code,'MODEL_TRUNCATED');assert.equal(r.usage.total_tokens,150);assert.equal(r.usage.providerCalls,1);assert.equal(r.usage.usageComplete,true);assert.equal(r.usage.requests[0].reasoningEffort,'high');
 for(const item of [new Response('limited',{status:429}),new Error('simulated network failure'),response('')]){const unavailable=mock([item]);const failed=await generateNative10(input(),options(unavailable));assert.equal(failed.ok,false);assert.equal(failed.scene,undefined);assert.equal(failed.usage.providerCalls,1);assert.equal(failed.usage.usageComplete,false);assert.equal(failed.usage.unknownUsageCalls,1);assert.equal(failed.usage.requests.length,0);assert.equal(failed.usage.totalsScope,'known_provider_reports_only');}
 const unconfigured=mock([]);const absent=await generateNative10(input(),options(unconfigured,{apiKey:null}));assert.equal(absent.ok,false);assert.equal(absent.usage.providerCalls,0);assert.equal(unconfigured.calls.length,0);
});

test('all explicit training requests are rejected and normal generation cannot mutate frozen input data',async()=>{
 for(const representation of ['native_procedural','reference_gaussian'])for(const extra of [{mode:'learn'},{trainingAllowed:true},{learningPolicy:'always'}]){const m=mock([]);const r=await generateNative10(input({representation,...extra}),options(m));assert.equal(r.ok,false);assert.equal(r.error.code,'TRAINING_DISABLED');assert.equal(m.calls.length,0);}
 const prior=Object.freeze({id:'frozen-existing-model',weights:Object.freeze([1,2,3])}),before=JSON.stringify(prior),m=mock([response(envelope())]);const r=await generateNative10(input({modelSnapshot:prior}),options(m));assert.equal(r.ok,true);assert.equal(JSON.stringify(prior),before);assert.equal(r.modelTraining,false);assert.equal(r.scene.provenance.neuralWeightsUpdated,false);assert.equal(r.scene.appearanceModel,undefined);assert.equal(JSON.stringify(m.calls[0].body).includes('frozen-existing-model'),false);
});
