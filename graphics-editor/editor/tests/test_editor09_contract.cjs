'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web');
const G=require('../web/crf-gaussian08.js'),F=require('../web/crf-generative09.js'),B=require('../web/crf-boundary09.js');
const json=p=>JSON.parse(fs.readFileSync(path.join(web,p),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
const bytes=r=>Buffer.from(r.data.buffer,r.data.byteOffset,r.data.byteLength);

// Run the shipped Worker source, including its actual importScripts and resource
// fetches. Browser transport is replaced with local files; no API is contacted.
function workerHarness({failFirst=false}={}){
 const outputs=[],requests=[],imports=[];let failed=false;
 const scope={console,performance,Uint8ClampedArray,Uint8Array,Float64Array,Float32Array,Map,Set,URL,TextEncoder,TextDecoder,
  fetch:async url=>{requests.push(String(url));if(failFirst&&!failed){failed=true;return new Response('transient',{status:503});}const f=path.resolve(web,String(url));assert.ok(f.startsWith(web+path.sep));return new Response(fs.readFileSync(f));},
  self:{postMessage(message,transfer){outputs.push({message,transfer});}}};
 const context=vm.createContext(scope);
 context.importScripts=(...scripts)=>{for(const script of scripts){imports.push(script);vm.runInContext(fs.readFileSync(path.join(web,script),'utf8'),context,{filename:script});}};
 vm.runInContext(fs.readFileSync(path.join(web,'render-worker09.js'),'utf8'),context,{filename:'render-worker09.js'});
 return{context,outputs,requests,imports,send:async data=>{await context.self.onmessage({data});return outputs.at(-1).message;}};
}

test('0.9 renderer Worker preserves native and observation bytes and reports invalid input',async()=>{
 const h=workerHarness();
 const scene=F.createScene({category:'still_life',seed:7741,width:128,height:96});
 const options={width:128,height:96,time:1.3,camera:{panX:.014,panY:-.004,zoom:1.02}};
 const native=await h.send({id:17,kind:'native',scene,options});
 assert.equal(native.id,17);assert.equal(native.ok,true);assert.deepEqual(bytes(native),bytes(F.renderScene(scene,options)));
 assert.equal(h.outputs[0].transfer.length,1);assert.equal(h.outputs[0].transfer[0],native.data.buffer);
 const asset={schema:'crf.gaussian_asset.v0.8',id:'independent.worker.fixture',width:8,height:8,base:[100,90,80],splats:[[3,4,1.2,.7,.3,45,-25,10]]};
 const observed=await h.send({id:18,kind:'observation',scene:asset});
 assert.equal(observed.ok,true);assert.deepEqual(bytes(observed),bytes(G.renderAsset(asset)));
 const invalid=await h.send({id:19,kind:'native',scene:{schema:'invalid'}});
 assert.equal(invalid.ok,false);assert.equal(invalid.id,19);assert.ok(invalid.error.length>0&&invalid.error.length<=500);
 assert.equal(h.requests.length,0,'new scenes must not fetch a photo at render time');
 assert.deepEqual(h.imports,['crf-gaussian08.js','crf-generative09.js','crf-boundary09.js']);
});

test('street Worker loads all declared functions, retries failure, and caches without source image fetch',async()=>{
 const h=workerHarness({failFirst:true});
 assert.equal((await h.send({id:1,kind:'street',state:B.createState()})).ok,false);
 const state=B.applyEdit(B.createState(),{wallColor:[72,142,181],wallStrength:.76,signalVisible:false});
 const output=await h.send({id:2,kind:'street',state});assert.equal(output.ok,true);
 const context=json('assets/v09/street/context.json'),baseline=G.renderAsset(json(context.baselineAssetUrl));
 const prepared=B.prepareStreet({baseline,context,detail:json(context.detailAssetUrl)});
 assert.deepEqual(bytes(output),bytes(B.renderStreet(prepared,state)));
 const fetched=h.requests.length;
 const reset=await h.send({id:3,kind:'street',state:B.createState()});
 assert.equal(reset.ok,true);assert.equal(h.requests.length,fetched,'second edit reuses reconstructed functions');
 assert.deepEqual([...new Set(h.requests)].sort(),['assets/v09/street/context.json',context.baselineAssetUrl,context.detailAssetUrl].sort());
 assert.ok(h.requests.every(p=>p.endsWith('.json')),'runtime observation uses disclosed Gaussian coefficients, never reference PNG');
});

// This VM runs the complete editor code. The only instrumentation is a test
// handle immediately before automatic boot; production functions are unmodified.
// Its simple DOM validates state/transport contracts, not browser layout or video.
function editorHarness({gallery=null,videoEncoder=null,sampleRenderer=null}={}){
 const html=fs.readFileSync(path.join(web,'studio09.html'),'utf8'),nodes=new Map(),requests=[],storage=new Map(),timers=new Map(),blobURLs=new Map();let timerId=0,blobId=0;
 class Element{
  constructor(type='div'){this.type=type;this.children=[];this.dataset={};this.style={};this.attributes={};this.value='';this.textContent='';this.hidden=false;this.checked=false;this.disabled=false;this.canvasOps=[];this.classList={toggle:()=>false,add(){},remove(){}};}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(){}remove(){}click(){}focus(){}showModal(){}close(){}
  getContext(){const self=this;return{fillStyle:'#000000',fillRect(x,y,w,h){self.canvasOps.push({op:'fillRect',x,y,width:w,height:h,color:this.fillStyle});},putImageData(p,x=0,y=0){self.pixels=p;self.canvasOps.push({op:'putImageData',x,y,width:p.width,height:p.height});},getImageData(){return self.pixels||{data:new Uint8ClampedArray(self.width*self.height*4)};},drawImage(source){self.pixels=source.pixels;self.canvasOps.push({op:'drawImage'});}};}
 }
 for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element());
 const localStore={get:async k=>storage.get(k)||null,set:async(k,v)=>{storage.set(k,clone(v));},keys:async prefix=>[...storage.keys()].filter(k=>k.startsWith(prefix))};
 const document={getElementById:id=>nodes.get(id)||null,createElement:t=>new Element(t),querySelectorAll:()=>[],body:new Element('body')};
 class LocalWorker{constructor(){if(!sampleRenderer)this.h=workerHarness();}postMessage(data){const result=sampleRenderer?Promise.resolve(sampleRenderer(data)):this.h.send(data);result.then(message=>this.onmessage?.({data:message}),error=>this.onerror?.(error));}terminate(){}}
 class LocalURL extends URL{static createObjectURL(blob){const id='blob:editor-contract/'+(++blobId);blobURLs.set(id,blob);return id;}static revokeObjectURL(id){blobURLs.delete(id);}}
 const context=vm.createContext({console,performance,document,URL:LocalURL,Blob,Map,Set,Promise,Date,Number,String,JSON,Array,Math,Uint8ClampedArray,DOMException,AbortController,CRF08:G,CRF09:F,CRFBoundary09:B,Worker:LocalWorker,
  ImageData:class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}},
  setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,options)=>{requests.push({url,options});if(url==='/api/crf/status')return{ok:true,json:async()=>({configured:false})};if(url==='assets/v09/generated/index.json'&&gallery)return{ok:true,json:async()=>clone(gallery)};const file=path.resolve(web,url);if(!fs.existsSync(file))return{ok:false,status:404};return{ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};},
  CRF09Tasks:{createIndexedDBStore:()=>localStore,create:options=>({store:localStore,isRunning:()=>false,listTasks:async()=>[],options})},CRFVideo:videoEncoder||{},window:{addEventListener(){}}});
 let source=fs.readFileSync(path.join(web,'editor09.js'),'utf8');
 const bootLine=/\n\s*boot\(\)\.catch\([^\n]+\);/;
 assert.equal((source.match(bootLine)||[]).length,1,'expected one automatic boot entry');
 source=source.replace(bootLine,"\n window.__editorContract09={state,snapshot,restore,cameraAt,importProject,saveWork,editStreet,editOps,exportVideo,boot};");
 vm.runInContext(source,context,{filename:'editor09.js'});
 return{api:context.window.__editorContract09,context,nodes,requests,storage,timers,blobURLs};
}

test('editor history preserves model, scene, camera and time, and restores deterministic pixels',async()=>{
 const h=editorHarness(),a=h.api;
 const scene=F.createScene({category:'still_life',seed:991,width:128,height:96});
 Object.assign(a.state,{kind:'native',scene,model:{schema:F.MODEL_SCHEMA,id:'history.fixture',sourceCount:0,categories:{}},camera:'left',time:1.75,selected:scene.objects[0].id,entry:'test'});
 const before=a.snapshot(),original=F.renderScene(scene,{width:128,height:96,model:a.state.model,time:a.state.time,camera:a.cameraAt()});
 a.state.model={schema:F.MODEL_SCHEMA,id:'changed',sourceCount:9,categories:{}};a.state.camera='right';a.state.time=4;
 a.state.scene=F.applyOps(a.state.scene,[{op:'set',id:a.state.selected,values:{color:[40,120,210]}}]);
 assert.equal(before.model?.id,'history.fixture','undo must capture the learned model used to render the scene');
 assert.equal(before.camera,'left');assert.equal(before.time,1.75);
 await a.restore(before);
 const restored=F.renderScene(a.state.scene,{width:128,height:96,model:a.state.model,time:a.state.time,camera:a.cameraAt()});
 assert.deepEqual(bytes(restored),bytes(original));
});

test('editor camera trajectory is continuous across t=0 and finite over the complete five seconds',()=>{
 const a=editorHarness().api;
 for(const view of ['front','left','right']){
  const start=a.cameraAt(0,view),near=a.cameraAt(1e-6,view);
  for(const key of ['panX','panY','zoom'])assert.ok(Math.abs(start[key]-near[key])<1e-5,`${view} ${key} has a first-frame jump`);
  for(let i=0;i<=120;i++)for(const v of Object.values(a.cameraAt(i/24,view)))assert.ok(Number.isFinite(v));
 }
});

test('invalid project import leaves the active scene and history unchanged; valid export reopens with its model',async()=>{
 const h=editorHarness(),a=h.api;
 const scene=F.createScene({category:'still_life',seed:319,width:128,height:96});
 Object.assign(a.state,{kind:'native',scene,selected:scene.objects[0].id,model:json('assets/v09/shared-appearance.json'),camera:'right',time:2});
 const before=JSON.stringify(a.state);
 for(const p of [
  {schema:'crf.editor_project.v0.9',kind:'not-a-kind'},
  {schema:'crf.editor_project.v0.9',kind:'native',scene:{schema:'bad'}},
  {schema:'crf.editor_project.v0.9',kind:'street',street:{signalVisible:'bad'}},
  {schema:'crf.editor_project.v0.9',kind:'native',scene,camera:'unknown'},
  {schema:'crf.editor_project.v0.9',kind:'native',scene,time:Infinity}
 ]){
  await assert.rejects(()=>a.importProject(p));
  assert.equal(JSON.stringify(a.state),before,'invalid input must not mutate active state or history');
 }
 await a.saveWork(false);const exported=[...h.storage.values()].find(v=>v.schema==='crf.editor_project.v0.9');assert.ok(exported);
 const fresh=editorHarness();await fresh.api.importProject(exported);
 assert.deepEqual(clone(fresh.api.state.scene),clone(a.state.scene));assert.deepEqual(clone(fresh.api.state.model),clone(a.state.model));
 assert.equal(fresh.api.state.camera,'right');assert.equal(fresh.api.state.time,2);
 // Explicit null is a valid unlearned-model selection, not an absent field.
 // Reopening it while another learned model is active must not inherit that model.
 const withoutModel={...clone(exported),model:null};await fresh.api.importProject(withoutModel);
 assert.equal(fresh.api.state.model,null,'an explicit model:null must preserve unlearned scene rendering');
 const actual=F.renderScene(fresh.api.state.scene,{width:128,height:96,model:fresh.api.state.model});
 assert.deepEqual(bytes(actual),bytes(F.renderScene(withoutModel.scene,{width:128,height:96,model:null})));
 fresh.api.state.model=clone(exported.model);
 await fresh.context.window.CRFEditor09.loadNative({...clone(scene),appearanceModel:null});
 assert.equal(fresh.api.state.model,null,'direct native scene import must also honor an explicit null snapshot');
});

test('opening the editor never starts a paid provider call; street export declares every runtime dependency',async()=>{
 const h=editorHarness({gallery:{examples:[{id:'failed.fixture',title:'Failed generation retained',status:'failed',error:{message:'Controlled failure; no scene generated'}}]}});await h.api.boot();
 assert.ok(h.requests.some(r=>r.url==='/api/crf/status'));
 assert.ok(h.requests.every(r=>!r.options?.method||r.options.method==='GET'),'boot must not submit inference/learning requests');
 await h.api.saveWork(false);const exported=[...h.storage.values()].find(v=>v.schema==='crf.editor_project.v0.9');
 assert.equal(exported.kind,'street');
 const context=json('assets/v09/street/context.json');
 for(const p of ['crf-gaussian08.js','crf-boundary09.js','assets/v09/street/context.json',context.baselineAssetUrl,context.detailAssetUrl]){assert.ok(exported.dependencies.includes(p),p);assert.ok(fs.statSync(path.join(web,p)).isFile(),p);}
 const failedCard=h.nodes.get('generatedList').children.find(c=>c.dataset.id==='failed.fixture');
 assert.ok(failedCard,'failed tasks remain visible in the gallery');
 const count=h.requests.length;await failedCard.onclick();
 assert.equal(h.requests.length,count,'a failed task without sceneUrl must show its error without requesting an undefined resource');
 assert.equal(h.api.state.kind,'street','inspecting a failed task must not replace the current scene');
});

test('0.9 UI uses the colour-aware exporter, contains portrait/4:3 content, and preserves the returned colour report',async()=>{
 const html=fs.readFileSync(path.join(web,'studio09.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(x=>x[1]);
 assert.ok(scripts.includes('crf-video09.js'),'0.9 must load the versioned colour-aware exporter');
 assert.ok(!scripts.includes('crf-video.js'),'legacy exporter must not overwrite the 0.9 browser global');
 assert.ok(scripts.indexOf('crf-video09.js')<scripts.indexOf('editor09.js'));
 const video=require('../web/crf-video09.js');assert.equal(video.VERSION,'0.9.1');
 const declared={primaries:'bt709',transfer:'iec61966-2-1',matrix:'bt709',fullRange:true};
 const colorMetadata={source:'VideoEncoder output metadata.decoderConfig.colorSpace',...video._internals.describeColour(declared)};
 // Actual muxer/WebCodecs byte correctness is covered independently in
 // test_video09.cjs. This contract samples the UI's real render callback and
 // download report; it neither runs 120 expensive renders nor claims decoding.
 for(const fixture of [{width:128,height:96,viewport:{x:240,y:0,width:1440,height:1080}},{width:96,height:128,viewport:{x:555,y:0,width:810,height:1080}}]){
  const renderMessages=[],sampled=[],payloads=new Map();let encodingOptions;
  const h=editorHarness({sampleRenderer:message=>{
   renderMessages.push(message);const {width,height}=message.options,key=width+'x'+height;
   if(!payloads.has(key)){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=17;data[i+1]=55;data[i+2]=103;data[i+3]=255;}payloads.set(key,data);}
   return{id:message.id,ok:true,width,height,data:payloads.get(key),milliseconds:0,diagnostics:{scope:'transport fixture'}};
  },videoEncoder:{VERSION:video.VERSION,encode:async options=>{
   encodingOptions=options;
   for(const time of [0,2.5,119/24])sampled.push(await options.renderFrame(time));
   return{blob:new Blob([Uint8Array.of(1,2,3)],{type:'video/webm'}),width:options.width,height:options.height,fps:options.fps,duration:options.duration,frameCount:120,encodedFrames:120,exporterVersion:video.VERSION,colorMetadata};
  }}});
  const scene=F.createScene({category:'still_life',seed:948,width:fixture.width,height:fixture.height,camera:{panX:.02,panY:-.01,zoom:1.03}},null);
  Object.assign(h.api.state,{kind:'native',scene,model:null});await h.api.exportVideo();
  assert.ok(encodingOptions,'UI must call the configured exporter');
  assert.deepEqual([encodingOptions.width,encodingOptions.height,encodingOptions.fps,encodingOptions.duration],[1920,1080,24,5]);
  assert.equal(renderMessages.length,3);assert.equal(sampled.length,3);
  for(let i=0;i<sampled.length;i++){
   const message=renderMessages[i],canvas=sampled[i];
   assert.equal(message.options.width,fixture.viewport.width);assert.equal(message.options.height,fixture.viewport.height);
   assert.equal(message.options.width/message.options.height,fixture.width/fixture.height,'objects retain the authored aspect ratio before padding');
   assert.deepEqual([canvas.width,canvas.height],[1920,1080]);
   assert.deepEqual(canvas.canvasOps,[{op:'fillRect',x:0,y:0,width:1920,height:1080,color:'#000000'},{op:'putImageData',...fixture.viewport}]);
   assert.deepEqual(Array.from(canvas.pixels.data.subarray(0,4)),[17,55,103,255],'the UI copies calculated pixels without range remapping');
  }
  const links=h.nodes.get('videoResult').children,reportLink=links.find(x=>x.download?.endsWith('_video_report.json'));
  assert.ok(reportLink,'encoding report remains downloadable after export');
  const report=JSON.parse(await h.blobURLs.get(reportLink.href).text());
  assert.deepEqual(report.viewport,fixture.viewport);assert.equal(report.exporterVersion,'0.9.1');
  assert.deepEqual(report.colorMetadata,colorMetadata,'UI must preserve encoder metadata rather than inventing or dropping colour fields');
  assert.equal(report.aspectRatioPolicy,'contain with opaque black padding; no object stretching');
  assert.equal(h.nodes.get('videoButton').disabled,false);assert.equal(h.nodes.get('videoResult').hidden,false);
 }
});
