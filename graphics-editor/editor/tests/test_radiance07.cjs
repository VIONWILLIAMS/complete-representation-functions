'use strict';
const assert = require('node:assert/strict');
const Photo = require('../web/crf-photo07.js');
const Renderer = require('../web/crf-radiance07.js');
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS', name); };
const mat = color => ({color, roughness:.45, metalness:0, transmission:0, ior:1.5});
const obj = (id, surface, position, material) => ({id, label:id, surface, transform:{position,rotation:[0,0,0],scale:[1,1,1]}, material});
const program = {
  schema:'crf.image_program.v0.7', id:'test-native-scene', title:'Reconstruction contracts',
  width:64,height:64,seed:19,exposure:1,
  camera:{position:[0,1,4],target:[0,1,0],fov:42},
  environment:{top:[150,175,205],bottom:[105,110,115],strength:.3},
  lights:[{id:'key',type:'area',position:[-3,4,3],target:[0,1,0],size:[3,3],color:[255,241,218],intensity:5}],
  objects:[
    obj('subject',{kind:'ellipsoid',radius:.8,height:1.6},[0,.2,0],mat([200,60,35])),
    obj('wall',{kind:'box',width:14,height:8,depth:.15},[0,-2,-3],mat([45,90,165])),
    obj('ground',{kind:'box',width:16,height:.1,depth:16},[0,-.1,0],mat([150,155,140]))
  ]
};
check('all four varied procedural cases validate', () => {
  assert.deepEqual(Photo.presets().map(x=>x.id), ['citrus','ceramics','interior','rainstreet']);
  for(const entry of Photo.presets()) {
    const p=Photo.createPreset(entry.id); assert.equal(Photo.validate(p).valid,true);
    assert.ok(p.objects.every(o=>o.surface && o.material));
    assert.equal(JSON.stringify(p).includes('data:image'),false);
  }
  assert.ok(Photo.createPreset('interior').objects.some(o=>o.surface.bevel>0));
  assert.ok(Photo.createPreset('rainstreet').objects.some(o=>o.id==='signal.hanger'));
});
check('expression, transform, geometry and resource budgets reject malformed programs', () => {
  for(const mutate of [
    p=>p.objects[0].material.function={op:'javascript',code:'process.exit()'},
    p=>p.objects[0].transform.scale[0]=0,
    p=>p.objects[0].surface.height=Infinity,
    p=>p.width=4096,
    p=>p.objects[0].surface={kind:'lathe',radius:1,height:1,profile:[0,0,0]},
    p=>p.objects[0].surface={kind:'box',width:1,height:1,depth:1,bevel:.6}
  ]) { const p=clone(program); mutate(p); assert.equal(Photo.validate(p).valid,false); }
  let expression={op:'const',value:1};for(let i=0;i<20;i++)expression={op:'sin',args:[expression]};
  const p=clone(program);p.objects[0].material.function=expression;assert.equal(Photo.validate(p).valid,false);
  assert.throws(()=>Photo.render(program,{width:2048,height:2048,samples:1}),/budget/);
  assert.throws(()=>Photo.render(program,{width:64,height:64,samples:129}),/budget/);
});
check('invalid compound edits are atomic; prototype paths cannot execute', () => {
  const before=JSON.stringify(program);
  assert.throws(()=>Photo.applyOps(program,[{op:'set',id:'subject',path:'material.color',value:[1,2,3]},{op:'set',id:'subject',path:'surface.height',value:-1}]));
  assert.equal(JSON.stringify(program),before);
  assert.throws(()=>Photo.applyOps(program,[{op:'set',id:'subject',path:'material.__proto__.test',value:1}]));
  assert.equal({}.test,undefined);
});
check('n-ary add and mul preserve nested binary order and enforce operand bounds',()=>{
  for(const op of ['add','mul'])for(const count of [2,3,5,8]){
    const leaves=Array.from({length:count},(_,i)=>({op:'const',value:.17+i*.21}));
    const nary={op,args:leaves};let nested=leaves[0];for(const leaf of leaves.slice(1))nested={op,args:[nested,leaf]};
    const p=clone(program);p.objects[0].material.function=nary;assert.equal(Photo.validate(p).valid,true);
    const a=Renderer._internals.compileExpression(nary),b=Renderer._internals.compileExpression(nested);
    assert.equal(a(.3,.7,-.4),b(.3,.7,-.4));
  }
  for(const count of [1,9]){const p=clone(program);p.objects[0].material.function={op:'add',args:Array.from({length:count},()=>({op:'const',value:1}))};assert.equal(Photo.validate(p).valid,false);}
});
const options={width:64,height:64,samples:3,bounces:4};
const raw=Photo.render(program,options);
check('same code and seed produce identical complete RGBA and object visibility',()=>{
  const again=Photo.render(program,options);
  assert.deepEqual(raw.rgba,again.rgba);assert.deepEqual(raw.ids,again.ids);
  assert.ok(raw.ids.includes(0)&&raw.ids.includes(1));
  for(let i=3;i<raw.rgba.length;i+=4)assert.equal(raw.rgba[i],255);
  assert.equal(raw.stats.tracedPrimarySamples,64*64*3);
  assert.equal(raw.stats.sourceImageBlit,false);assert.equal(raw.stats.imageTextureReads,0);
});
check('model-authored function changes actual pixels',()=>{
  const p=Photo.applyOps(program,[{op:'set',id:'subject',path:'material.function',value:{op:'const',value:.12}}]);
  const edited=Photo.render(p,options);let difference=0;
  for(let i=0;i<raw.ids.length;i++)if(raw.ids[i]===0)difference+=Math.abs(raw.rgba[i*4]-edited.rgba[i*4]);
  assert.ok(difference>1000);
});
check('object removal re-evaluates a real background with opaque pixels',()=>{
  const p=Photo.applyOps(program,[{op:'remove',id:'subject'}]);
  const edited=Photo.render(p,options),i=32*64+32;
  assert.equal(raw.ids[i],0);assert.equal(p.objects[edited.ids[i]].id,'wall');
  assert.equal(edited.rgba[i*4+3],255);assert.ok(edited.depth[i]>raw.depth[i]+1);
  assert.ok(edited.rgba[i*4+2]>edited.rgba[i*4]);
});
check('glass and metal take distinct rendered transport paths',()=>{
  const glass=Photo.applyOps(program,[{op:'set',id:'subject',path:'material.color',value:[240,245,250]},{op:'set',id:'subject',path:'material.transmission',value:1}]);
  const metal=Photo.applyOps(program,[{op:'set',id:'subject',path:'material.metalness',value:1},{op:'set',id:'subject',path:'material.roughness',value:.1}]);
  const a=Photo.render(glass,options),b=Photo.render(metal,options);
  assert.notDeepEqual(a.rgba,b.rgba);assert.notDeepEqual(raw.rgba,a.rgba);
  assert.equal(a.stats.refraction,true);assert.equal(b.stats.reflection,true);
});
check('hollow lathe exposes its internal floor, rim stays connected',()=>{
  const p=clone(program);p.objects=[obj('vessel',{kind:'lathe',radius:.8,height:1.5,profile:[1,1,1],thickness:.08},[0,0,0],mat([170,180,190]))];
  const ctx=Renderer._internals.prepare(p,{width:32,height:32,samples:1,bounces:1});
  const floor=Renderer._internals.trace(ctx,[0,3,0],[0,-1,0],100,false);
  const rim=Renderer._internals.trace(ctx,[.78,3,0],[0,-1,0],100,false);
  assert.ok(Math.abs(floor.point[1]-.08)<1e-5);assert.ok(Math.abs(rim.point[1]-1.5)<1e-5);
});
check('box bevel changes geometric silhouette rather than painting a highlight',()=>{
  const p=clone(program);p.objects=[obj('rounded',{kind:'box',width:1,height:1,depth:1,bevel:.2},[0,0,0],mat([180,190,200]))];
  const ctx=Renderer._internals.prepare(p,{width:32,height:32,samples:1,bounces:1});
  assert.equal(Renderer._internals.trace(ctx,[.49,.99,3],[0,0,-1],100,false),null);
  assert.ok(Renderer._internals.trace(ctx,[0,.5,3],[0,0,-1],100,false));
  p.objects[0].surface.bevel=0;const square=Renderer._internals.prepare(p,{width:32,height:32,samples:1,bounces:1});
  assert.ok(Renderer._internals.trace(square,[.49,.99,3],[0,0,-1],100,false));
});
check('denoising is explicit, deterministic, and retains object/depth maps',()=>{
  const a=Photo.render(program,{...options,denoise:true}),b=Photo.render(program,{...options,denoise:true});
  assert.deepEqual(a.rgba,b.rgba);assert.deepEqual(a.ids,raw.ids);assert.deepEqual(a.depth,raw.depth);
  assert.equal(a.stats.denoiser,'bounded-spatial-object-depth-bilateral');assert.equal(raw.stats.denoiser,'none');
});
(async()=>{
  const asyncFrame=await Photo.renderAsync(program,{...options,batchRows:8});
  assert.deepEqual(asyncFrame.rgba,raw.rgba);checks++;console.log('PASS asynchronous and synchronous rendering agree');
  const controller=new AbortController();let updates=0;
  await assert.rejects(Photo.renderAsync(program,{...options,signal:controller.signal,batchRows:2,onProgress:p=>{updates++;assert.ok(p.progress>0&&p.progress<1);controller.abort();}}),{name:'AbortError'});
  assert.equal(updates,1);checks++;console.log('PASS progressive rendering cancels without committing a completed frame');
  console.log(JSON.stringify({suite:'CRF Radiance 0.7',checks,status:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
