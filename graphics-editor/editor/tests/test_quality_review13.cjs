'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const vm = require('node:vm'), crypto = require('node:crypto');
const {PNG} = require('pngjs');
const Core = require('../web/crf-quality12.js');
const {loadScene, jsonForHTML, build} = require('../scripts/build_quality_review13.cjs');
const kernel = fs.readFileSync(path.join(__dirname, '../web/crf-quality12.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, '../templates/quality-review13.html'), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-review13-'));
  const contractHash = '1'.repeat(64);
  const gaussian = {schema:'crf.gaussian_asset.v0.8',id:'fixture',width:8,height:6,
    base:[30,50,70],splats:[[2.5,2.5,1,1,0,80,30,-20],[5.5,3.5,.5,1.2,.4,-10,90,40]],
    kernel:{type:'signed_additive_gaussian',cutoffSigma:4,sample:'pixel_centres',colorSpace:'srgb_encoded_0_255'}};
  const asset = {schema:'crf.quality_asset.v1',gaussian,qualityContractHash:contractHash};
  const assetBytes = Buffer.from(JSON.stringify(asset));
  const project = Core.createProject(asset), frame = Core.render(project);
  const referenceBytes = PNG.sync.write({width:8,height:6,data:Buffer.from(frame.data)});
  const scene = {id:'fixture',title:'Fixture',referencePath:'reference.png',width:8,height:6,
    rois:[{id:'detail',bounds:[.25,.25,.75,.75]}],fileSHA256:sha(referenceBytes)};
  const report = {schema:'crf.detail_quality_evidence.v1',source:{sha256:scene.fileSHA256},
    assetSHA256:sha(assetBytes),qualityContractHash:contractHash,replayRGBASHA256:sha(frame.data),
    metrics:{psnr:40,ssim:.99,mae:1},passed:true};
  fs.mkdirSync(path.join(root,'quality-packs'),{recursive:true});
  fs.mkdirSync(path.join(root,'reports/quality13/fitting/fixture'),{recursive:true});
  fs.writeFileSync(path.join(root,'reference.png'),referenceBytes);
  fs.writeFileSync(path.join(root,'quality-packs/fixture.asset.json'),assetBytes);
  const reportPath=path.join(root,'reports/quality13/fitting/fixture/fixture.quality.json');
  fs.writeFileSync(reportPath,JSON.stringify(report));
  return {root,scene,asset,project,frame,report,reportPath,contractHash,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('portable input binds saved coefficients, frozen reference and actual RGBA report',()=>{
  const f=fixture();try{
    const packed=loadScene(f.root,f.scene,f.contractHash);
    assert.equal(packed.expectedRGBASHA256,sha(f.frame.data));
    assert.equal(packed.gaussianSHA256,sha(Core.canonical(f.asset.gaussian)));
    assert.ok(packed.comparisonOnly.imageDataURL.startsWith('data:image/png;base64,'));
    assert.equal(packed.outputImage,undefined);
    fs.writeFileSync(f.reportPath,JSON.stringify({...f.report,source:{sha256:'2'.repeat(64)}}));
    assert.throws(()=>loadScene(f.root,f.scene,f.contractHash),/another reference/);
    fs.writeFileSync(f.reportPath,JSON.stringify({...f.report,assetSHA256:'3'.repeat(64)}));
    assert.throws(()=>loadScene(f.root,f.scene,f.contractHash),/saved asset bytes/);
    fs.writeFileSync(f.reportPath,JSON.stringify({...f.report,qualityContractHash:'4'.repeat(64)}));
    assert.throws(()=>loadScene(f.root,f.scene,f.contractHash),/contract binding/);
  }finally{f.cleanup();}
});

test('embedded metadata cannot terminate its JSON script element',()=>{
  const input={title:'</script><script>window.injected=true</script>',text:'a\u2028b\u2029c'};
  const safe=jsonForHTML(input);assert.equal(/<\/script/i.test(safe),false);assert.deepEqual(JSON.parse(safe),input);
});

test('large portable artifact cannot be placed in the hosted web bundle',()=>{
  assert.throws(()=>build({output:path.join(__dirname,'../web/portable.html')}),/outside the hosted web bundle/);
});

function workerContext() {
  const sourceFunction=template.match(/function workerSource\(\)\{[\s\S]*?\nfunction ensureWorker/)[0].replace(/\nfunction ensureWorker$/,'');
  const getSource=vm.runInNewContext(sourceFunction+';workerSource();',{$:()=>({textContent:kernel}),String});
  const messages=[];
  const context=vm.createContext({setTimeout,clearTimeout,performance,TextEncoder,crypto:crypto.webcrypto,postMessage:message=>messages.push(message)});
  context.self=context;
  vm.runInContext(getSource,context);
  return {context,messages,send:message=>vm.runInContext('self.onmessage({data:'+jsonForHTML(message)+'})',context)};
}

test('embedded worker computes pixels from functions and ignores comparison metadata',async()=>{
  const f=fixture();try{
    const w=workerContext();
    Object.defineProperty(w.context,'comparisonOnly',{get(){throw new Error('Reference pixels must not be consulted.');}});
    await w.send({type:'render',requestId:1,project:f.project});
    const result=w.messages.find(m=>m.type==='result');assert.ok(result);
    assert.deepEqual(Buffer.from(result.data),Buffer.from(f.frame.data));
    assert.equal(result.diagnostics.sourceRGBAtRender,false);
    assert.equal(result.diagnostics.colourRasterResampling,false);
  }finally{f.cleanup();}
});

test('a superseded worker render cannot publish an old frame',async()=>{
  const f=fixture();try{
    const w=workerContext();
    const first=w.send({type:'render',requestId:1,project:f.project});
    const next=Core.applyEdits(f.project,{exposure:.3});
    const second=w.send({type:'render',requestId:2,project:next});
    await Promise.all([first,second]);
    assert.deepEqual(w.messages.filter(m=>m.type==='result').map(m=>m.requestId),[2]);
    const result=w.messages.find(m=>m.type==='result');
    assert.deepEqual(Buffer.from(result.data),Buffer.from(Core.render(next).data));
  }finally{f.cleanup();}
});

test('portable worker preserves the existing output-pixel guard',async()=>{
  const f=fixture();try{
    const w=workerContext(),project=JSON.parse(JSON.stringify(f.project));project.view.width=4001;project.view.height=1000;
    await w.send({type:'render',requestId:1,project});
    assert.equal(w.messages.some(m=>m.type==='result'),false);
    assert.equal(w.messages.find(m=>m.type==='error').code,'RESOURCE_LIMIT');
  }finally{f.cleanup();}
});

function uiContext(packed) {
  const elements=new Map(),workers=[],timers=new Set();let paints=0;
  function element(id=''){
    return {id,children:[],style:{},dataset:{},className:'',value:'',hidden:false,disabled:false,textContent:'',width:1,height:1,clientWidth:800,clientHeight:600,
      classList:{toggle(){}},listeners:{},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},remove(){},click(){},
      getContext(){return{putImageData(){paints++;},drawImage(){}};},showModal(){},close(){}};
  }
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},createElement:()=>element(),body:element()};
  document.getElementById('crf-review-data').textContent=JSON.stringify({schema:'test',scenes:[packed],renderingContract:{}});
  document.getElementById('crf-kernel').textContent=kernel;
  document.getElementById('displaySelect').value='fit';
  class Worker{constructor(){this.messages=[];workers.push(this);}postMessage(m){this.messages.push(m);}terminate(){}}
  const context=vm.createContext({document,Worker,Blob,TextEncoder,performance,crypto:crypto.webcrypto,
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    ImageData:class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}},
    ResizeObserver:class{observe(){}},
    setTimeout(fn,ms){const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;},
    clearTimeout(t){timers.delete(t);clearTimeout(t);},innerWidth:1440,addEventListener(){}});
  context.window=context;
  vm.runInContext(kernel,context);
  const main=[...template.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(main,context);
  return {context,elements,workers,getPaints:()=>paints,cleanup:()=>{for(const t of timers)clearTimeout(t);}};
}

test('editing during the debounce interval rejects an earlier completed UI frame',async()=>{
  const f=fixture(),packed=loadScene(f.root,f.scene,f.contractHash),ui=uiContext(packed);
  try{
    for(let i=0;i<100&&!ui.workers[0]?.messages.some(m=>m.type==='render');i++)await new Promise(r=>setTimeout(r,2));
    const worker=ui.workers[0],request=worker.messages.find(m=>m.type==='render');assert.ok(request);
    const slider=ui.elements.get('exposure');slider.value='0.4';slider.listeners.input({});
    await Promise.resolve();await Promise.resolve();
    worker.onmessage({data:{type:'result',requestId:request.requestId,width:f.frame.width,height:f.frame.height,data:f.frame.data.buffer,diagnostics:f.frame.diagnostics}});
    await Promise.resolve();await Promise.resolve();
    assert.equal(ui.getPaints(),0);
    assert.equal(ui.context.__CRF_REVIEW13__.getFrame(),null);
    assert.equal(ui.elements.get('exportPNG').disabled,true);
  }finally{ui.cleanup();f.cleanup();}
});
