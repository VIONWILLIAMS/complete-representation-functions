'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const Core=require('../web/crf-core11.js');
const Learn=require('../web/learn11.js');
const Studio=require('../web/editor11.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const web=path.resolve(__dirname,'../web');

test('studio imports and code edits are atomic; stale code cannot replace newer scene',async()=>{
  const session=Studio.createSession(Core),project=await Core.createDemoProject();
  await session.load(project,{remember:false});const original=JSON.stringify(session.snapshot());
  const invalid=clone(project);invalid.scene.objects[0].functionRef='0'.repeat(64);
  await assert.rejects(session.load(invalid),/Missing function/);
  assert.equal(JSON.stringify(session.snapshot()),original);assert.equal(session.state.history.length,0);
  const draftEpoch=session.state.epoch;
  assert.throws(()=>session.applyCode('not JSON',project.scene.revision,draftEpoch),/有效 JSON/);
  assert.equal(JSON.stringify(session.snapshot()),original);
  const target=project.scene.objects[0].id;
  session.patch({baseRevision:project.scene.revision,operations:[{op:'update',id:target,values:{x:15}}]});
  const edited=JSON.stringify(session.snapshot());
  assert.throws(()=>session.applyCode(JSON.stringify(project.scene),project.scene.revision,draftEpoch),/场景已变化/);
  assert.equal(JSON.stringify(session.snapshot()),edited);
  session.undo();assert.equal(JSON.stringify(session.snapshot()),original);
  session.redo();assert.equal(JSON.stringify(session.snapshot()),edited);
});

test('code drafts are stale after undo and branch even when revision numbers repeat',async()=>{
  const session=Studio.createSession(Core);await session.load(await Core.createDemoProject(),{remember:false});
  const object=session.state.project.scene.objects[0];
  session.patch({baseRevision:0,operations:[{op:'update',id:object.id,values:{x:10}}]});
  const old=clone(session.state.project.scene),epoch=session.state.epoch;
  session.undo();session.patch({baseRevision:0,operations:[{op:'update',id:object.id,values:{x:20}}]});
  assert.equal(session.state.project.scene.revision,old.revision);
  assert.throws(()=>session.applyCode(JSON.stringify(old),old.revision,epoch),/场景已变化/);
  assert.equal(session.state.project.scene.objects[0].x,20);
});

test('undo preserves audit records and the UI never silently drops old failed runs',async()=>{
  const session=Studio.createSession(Core);await session.load(await Core.createDemoProject(),{remember:false});
  session.patch({baseRevision:0,operations:[{op:'scene',values:{background:[.1,.1,.1]}}]});
  for(let i=0;i<251;i++)session.append('learningRuns',{id:'failed.'+i,state:'failed',providerUsage:'unknown'});
  session.undo();assert.equal(session.state.project.learningRuns.length,251);assert.equal(session.state.project.learningRuns[0].id,'failed.0');
  session.redo();assert.equal(session.state.project.learningRuns.length,251);
});

test('the GUI controller applies the same typed patch as programmatic callers',async()=>{
  const initial=await Core.createDemoProject(),session=Studio.createSession(Core);
  await session.load(initial,{remember:false});
  const patch={baseRevision:initial.scene.revision,operations:[{op:'update',id:initial.scene.objects[0].id,values:{x:38,opacity:.7}}]};
  const expected=Core.applyPatch(initial,patch);session.patch(patch);
  assert.deepEqual(session.snapshot(),expected);
  const frame=await Core.renderScene(expected,{width:64,height:48,time:2,backend:'cached'});
  const ui=await Core.renderScene(session.snapshot(),{width:64,height:48,time:2,backend:'cached'});
  assert.deepEqual(ui.data,frame.data);
});

test('late frames from prior revisions or prior time requests never become current evidence',async()=>{
  const session=Studio.createSession(Core);await session.load(await Core.createDemoProject(),{remember:false});
  const old=session.beginRender();session.patch({baseRevision:session.state.project.scene.revision,operations:[{op:'scene',values:{background:[.1,.2,.3]}}]});
  const current=session.beginRender(),newer=session.beginRender();
  assert.equal(session.acceptFrame(old,{id:'old revision'}),false);
  assert.equal(session.acceptFrame(current,{id:'old time'}),false);
  assert.equal(session.state.frame,null);
  assert.equal(session.acceptFrame(newer,{id:'actual current'}),true);
  assert.equal(session.state.frame.id,'actual current');
  session.append('feedback',{kind:'explicit_user_annotation',choice:'accept'});
  assert.equal(session.state.frame.id,'actual current','metadata annotations do not invalidate unchanged pixels');
  session.undo();assert.equal(session.state.frame,null,'undo invalidates the former frame');
});

test('a genuinely learned function survives studio export/reopen without reference pixels',async()=>{
  const data=new Uint8ClampedArray(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=(y*16+x)*4;data[i]=40+x*9;data[i+1]=70+y*6;data[i+2]=120;data[i+3]=255;}
  const learned=await Learn.train([{id:'reference.gradient',label:'synthetic diagnostic',sourceGroup:'synthetic.gradient',sourceUri:'synthetic:analytic_gradient',width:16,height:16,data}],{steps:30,hidden:8,seed:4});
  const fn=await Core.createNeuralFunction(learned.model,{id:'learned.gradient',label:'Synthetic diagnostic',width:16,height:16,coverageByInstance:learned.coverageByInstance,report:learned.report});
  let project=await Core.registerFunction(Core.createProject({width:32,height:32}),fn);
  project=Core.applyPatch(project,{baseRevision:0,operations:[{op:'add',object:Core.createInstance(fn,{id:'instance.gradient',width:32,height:32})}]});
  project.learningRuns.push(learned.report);
  const first=Studio.createSession(Core);await first.load(project,{remember:false});
  const exported=JSON.stringify(first.snapshot()),reopened=Studio.createSession(Core);await reopened.load(JSON.parse(exported),{remember:false});
  assert.ok(exported.includes('"weights"'));assert.ok(!exported.includes('"data"'),'source pixels are absent from the exported project');
  const a=await Core.renderScene(first.snapshot(),{backend:'direct'}),b=await Core.renderScene(reopened.snapshot(),{backend:'direct'});assert.deepEqual(a.data,b.data);
  const tampered=JSON.parse(exported);tampered.functions[fn.version].appearance.model.weights.w1[0]+=.01;
  await assert.rejects(reopened.load(tampered),/immutable version/);
  assert.deepEqual((await Core.renderScene(reopened.snapshot(),{backend:'direct'})).data,a.data);
});

function workerHarness(){
  const outputs=[];
  const context=vm.createContext({console,performance,crypto,TextEncoder,TextDecoder,Uint8Array,Uint8ClampedArray,Float64Array,Float32Array,ArrayBuffer,Map,Set,URL,setTimeout,clearTimeout,structuredClone,self:{postMessage:(message,transfer)=>outputs.push({message,transfer})}});
  context.importScripts=(...files)=>{for(const name of files)vm.runInContext(fs.readFileSync(path.join(web,name),'utf8'),context,{filename:name});};
  vm.runInContext(fs.readFileSync(path.join(web,'render-worker11.js'),'utf8'),context,{filename:'render-worker11.js'});
  return{outputs,async send(message){context.serialized=JSON.stringify(message);await vm.runInContext('self.onmessage({data:JSON.parse(serialized)})',context);return outputs.at(-1).message;}};
}
test('shipped render worker executes the shared core and rejects reusing a key for changed content',async()=>{
  const project=await Core.createDemoProject(),options={width:48,height:36,time:1,backend:'cached'},h=workerHarness();
  const frame=await h.send({id:1,operation:'render',projectKey:'immutable.1',revision:project.scene.revision,project,options});
  assert.equal(frame.ok,true,frame.error);assert.deepEqual(Buffer.from(frame.data),Buffer.from((await Core.renderScene(project,options)).data));
  assert.equal(h.outputs[0].transfer[0],frame.data.buffer);
  const next=clone(project);next.scene.background=[.8,.2,.1];
  const wrong=await h.send({id:2,operation:'render',projectKey:'immutable.1',revision:project.scene.revision,project:next,options});
  assert.equal(wrong.ok,false);assert.match(wrong.error,/different immutable/);
  const missing=await h.send({id:3,operation:'render',projectKey:'never.loaded',revision:0,options});assert.equal(missing.ok,false);assert.match(missing.error,/missing/);
});
