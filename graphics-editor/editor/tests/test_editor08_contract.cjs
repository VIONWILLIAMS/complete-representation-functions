const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const engine=require('../web/crf-gaussian08.js');

test('Gaussian Worker caches functions without retaining a source bitmap',async()=>{
 const outputs=[];
 const ctx=vm.createContext({console,performance,Uint8ClampedArray,Map,AbortController,CRF08:engine,importScripts(){},self:{postMessage(value){outputs.push(value);}}});
 vm.runInContext(fs.readFileSync(path.join(root,'web/gaussian-worker08.js'),'utf8'),ctx);
 const asset={schema:'crf.gaussian_asset.v0.8',id:'test.field',width:8,height:8,base:[80,110,60],splats:[[4,4,2,1,0,50,-20,10]]};
 const scene={schema:'crf.gaussian_scene.v0.8',width:8,height:8,background:[0,0,0],assets:{'test.field':asset},objects:[{id:'object',assetId:'test.field'}]};
 await ctx.self.onmessage({data:{type:'render',id:1,scene,assetKeys:{'test.field':7}}});
 assert.equal(outputs[0].type,'render');
 assert.deepEqual([...outputs[0].data],[...engine.renderScene(scene).data]);
 const edited={...scene,assets:{},objects:[{id:'object',assetId:'test.field',exposure:.5}]};
 await ctx.self.onmessage({data:{type:'render',id:2,scene:edited,assetKeys:{'test.field':7}}});
 assert.equal(outputs[1].type,'render');
 assert.notDeepEqual([...outputs[0].data],[...outputs[1].data]);
 await ctx.self.onmessage({data:{type:'render',id:3,scene:edited,assetKeys:{'test.field':999}}});
 assert.equal(outputs[2].type,'error');
});

function learningHarness({saved=null,failFirst=false,imageFixture=null}={}){
 const {PNG}=require('pngjs');
 class Element{
  constructor(){this.children=[];this.textContent='';this.value='';this.checked=true;this.dataset={};this.disabled=false;this.hidden=false;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(){}
 }
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
 el('learningTopic').value='真实参考学习测试';el('learningBatch').value='10';
 const local=new Map();if(saved)local.set('crf08.learning.checkpoint.v1',JSON.stringify(saved));
 class ImageFixture{set src(value){const p=PNG.sync.read(Buffer.from(value.split(',')[1],'base64'));this.naturalWidth=p.width;this.naturalHeight=p.height;this.data=p.data;queueMicrotask(()=>this.onload());}}
 class CanvasFixture extends Element{getContext(){const that=this;return{drawImage(image){that.data=image.data;},getImageData(){return{data:new Uint8ClampedArray(that.data)};}};}toDataURL(){return'data:image/png;base64,'+PNG.sync.write({width:this.width,height:this.height,data:this.data}).toString('base64');}}
 class FitWorker{async postMessage(m){try{const a=await engine.fitImage({width:m.width,height:m.height,data:m.data},{...m.options,onProgress:p=>this.onmessage?.({data:{type:'progress',id:m.id,...p}})});this.onmessage?.({data:{type:'fit',id:m.id,asset:a}});}catch(e){this.onmessage?.({data:{type:'error',id:m.id,error:e.message}});}}terminate(){}}
 const requests=[],messages=[],registered=[];let busy=false,failed=false;
 const context=vm.createContext({console,Map,Set,Promise,Date,Number,String,JSON,Array,Math,DOMException,AbortController,URL,Uint8ClampedArray,Image:ImageFixture,Worker:FitWorker,setTimeout,clearTimeout,
  document:{getElementById:el,createElement:type=>type==='canvas'?new CanvasFixture():new Element()},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)},
  fetch:async(url,options)=>{requests.push({url,options});if(url==='assets/v08/learning.json')return{ok:true,json:async()=>({schema:'test',rounds:[],counts:{completedSearchRounds:0,distinctSourcePages:0,downloadedDistinctImages:0,fittedFunctions:0}})};
   const input=JSON.parse(options.body);if(failFirst&&!failed){failed=true;return{ok:false,status:503,json:async()=>({ok:false,error:{message:'temporary failure'}})}}
   if(url==='/api/crf/gaussian/describe')return{ok:true,status:200,json:async()=>({ok:true,items:input.images.map(x=>({id:x.id,label:'测试主体',category:'fixture',tags:['test'],description:'实际测试图像的语义',limitations:[]})),usage:{providerCalls:1}})};
   return{ok:true,status:200,json:async()=>({ok:true,query:input.topic,round:input.round,checkpoint:{sessionId:input.sessionId,round:input.round,status:'searched',sourceCount:1,downloadedImageCount:imageFixture?1:0,fittedFunctionCount:0},research:{searched:true,summary:'found sources'},sources:[{url:'https://example.org/photo/'+input.round}],images:imageFixture?[imageFixture]:[],usage:{providerCalls:1}})};
  }});
 vm.runInContext(fs.readFileSync(path.join(root,'web/learning-client08.js'),'utf8'),context);
 const controller=context.CRF08Learning.create({getBusy:()=>busy,setBusy:x=>{busy=x;},toast:(...x)=>messages.push(x),showReport(){},download(){},getAssetMeta(){return null;},registerAsset:(...x)=>registered.push(x),openAsset(){}});
 return{controller,requests,messages,el,local,registered};
}

test('opening the learning tab never starts paid model calls',async()=>{
 const h=learningHarness();await h.controller.init();
 assert.deepEqual(h.requests.map(x=>x.url),['assets/v08/learning.json']);
 assert.equal(h.el('learningRounds').textContent,0);
});

test('ten-round learning uses actual per-round requests and never counts missing images as fitted',async()=>{
 const h=learningHarness();await h.controller.init();await h.controller.start();
 const calls=h.requests.filter(x=>x.url==='/api/crf/gaussian/research');
 assert.equal(calls.length,10);
 assert.deepEqual(calls.map(x=>JSON.parse(x.options.body).round),[1,2,3,4,5,6,7,8,9,10]);
 assert.equal(h.el('learningRounds').textContent,10);
 assert.equal(h.el('learningSources').textContent,10);
 assert.equal(h.el('learningImages').textContent,0);
 assert.equal(h.el('learningFits').textContent,0);
 assert.equal(h.controller.evidence().session.nextRound,11);
});

test('retry history deduplicates a logical round, source and downloaded image',async()=>{
 const round={sessionId:'same',round:1,checkpoint:{sessionId:'same',round:1,status:'searched'},research:{searched:true},sources:[{url:'https://example.org/photo/one'}],images:[{sha256:'abc'}],fitResults:[]};
 const h=learningHarness({saved:{runs:[round,{...round}],assets:[],session:null}});await h.controller.init();
 assert.equal(h.el('learningRounds').textContent,1);
 assert.equal(h.el('learningSources').textContent,1);
 assert.equal(h.el('learningImages').textContent,1);
});

test('a failed round remains resumable and does not erase its evidence',async()=>{
 const h=learningHarness({failFirst:true});await h.controller.init();await h.controller.start();
 assert.equal(h.controller.evidence().session.nextRound,1);
 assert.equal(h.controller.evidence().browserSessions.length,1);
 assert.equal(h.el('learningRounds').textContent,0);
 await h.controller.start();
 assert.equal(h.controller.evidence().session.nextRound,11);
 assert.equal(h.controller.evidence().browserSessions.length,11);
 assert.equal(h.el('learningRounds').textContent,10);
});

test('downloaded pixels are semantically inspected then fitted into reusable Gaussian coefficients',async()=>{
 const {PNG}=require('pngjs');
 const pixels=Buffer.alloc(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=4*(y*8+x);pixels[i]=20+x*25;pixels[i+1]=60+y*15;pixels[i+2]=40;pixels[i+3]=255;}
 const imageFixture={url:'data:image/png;base64,'+PNG.sync.write({width:8,height:8,data:pixels}).toString('base64'),sourceUrl:'https://example.org/source',imageUrl:'https://example.org/actual.png',sha256:'a'.repeat(64)};
 const h=learningHarness({imageFixture});await h.controller.init();h.el('learningBatch').value='1';await h.controller.start();
 assert.deepEqual(h.requests.filter(x=>x.options?.method==='POST').map(x=>x.url),['/api/crf/gaussian/research','/api/crf/gaussian/describe']);
 assert.equal(h.registered.length,1);
 const [meta,asset]=h.registered[0];assert.equal(meta.label,'测试主体');assert.equal(asset.schema,'crf.gaussian_asset.v0.8');assert.ok(asset.splats.length>0);assert.equal(asset.rgb,undefined);
 assert.equal(h.el('learningRounds').textContent,1);assert.equal(h.el('learningImages').textContent,1);assert.equal(h.el('learningFits').textContent,1);
 assert.equal(h.controller.evidence().browserAssets[0].semanticStatus,'image_observed');
});
