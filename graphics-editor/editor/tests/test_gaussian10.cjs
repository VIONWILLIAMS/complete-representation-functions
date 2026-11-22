'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),G=require('../web/crf-gaussian10.js');
const asset=(id,color)=>({schema:G.ASSET_SCHEMA,id,width:24,height:16,base:color,splats:[]});
test('linear light tint identity and exact reversibility',()=>{
 const a=asset('wall',[.2,.4,.6]);a.splats=[[12,8,3,2,.4,.1,-.03,.04]];
 const baseline=G.render(a),changed=G.render(a,{edits:{albedoTint:[1.6,.7,.7]}}),reset=G.render(a,{edits:{albedoTint:[1,1,1]}});
 assert.deepEqual(reset.data,baseline.data);assert.notDeepEqual(changed.data,baseline.data);
 assert.equal(baseline.diagnostics.colourRasterResampling,false);
});
test('visible coverage accounts for subsequent occluders',()=>{
 const s={schema:G.SCENE_SCHEMA,width:24,height:16,background:[0,0,0],assets:{a:asset('back',[.3,.2,.1]),b:asset('front',[.1,.2,.3])},objects:[{id:'back',assetId:'a'},{id:'front',assetId:'b',x:12}]};
 const r=G.renderScene(s,{coverage:true});assert.equal(r.objectCoverage.back[8*24+18],0);assert.equal(r.objectCoverage.front[8*24+18],1);assert.equal(r.objectCoverage.back[8*24+4],1);
});
test('mip filter changes alias-sensitive sampling without a colour raster',()=>{
 const a={schema:G.ASSET_SCHEMA,id:'fine',width:96,height:64,base:[.1,.1,.1],splats:[]};for(let y=3;y<64;y+=6)for(let x=3;x<96;x+=6)a.splats.push([x,y,.3,.3,0,.7,.7,.7]);
 const p=G.render(a,{width:24,height:16,filter:'point'}),m=G.render(a,{width:24,height:16,filter:'mip'});
 assert.notDeepEqual(p.data,m.data);assert.equal(m.diagnostics.pixelFilterVariance,1/12);
});
test('alpha exports do not unpremultiply a quantized RGB raster',()=>{
 const a=asset('edge',[.18,.31,.52]);a.alpha={encoding:'rle8',runs:[64,384]};const r=G.render(a);
 assert.deepEqual(Array.from(r.data.slice(0,4)),[G.srgb(.18),G.srgb(.31),G.srgb(.52),64]);
});
test('invalid covariance and invalid edits are rejected',()=>{
 const a=asset('invalid',[.1,.2,.3]);a.splats=[[2,2,0,1,0,1,1,1]];assert.equal(G.validateAsset(a).ok,false);
 assert.throws(()=>G.render(asset('ok',[.1,.2,.3]),{edits:{albedoTint:[NaN,1,1]}}));
});
test('local scene operations preserve source asset functions',()=>{
 const a=asset('a',[.2,.2,.2]),s={schema:G.SCENE_SCHEMA,width:24,height:16,background:[1,2,3],assets:{a},objects:[{id:'a',assetId:'a'}]};
 const next=G.applyOps(s,[{op:'set',id:'a',patch:{exposure:.5,shadow:{strength:.3,spread:.2}}}]);assert.equal(s.objects[0].exposure,undefined);assert.equal(next.assets.a,a);assert.equal(next.objects[0].exposure,.5);
});
test('optional highlight residual stays neutral while saturated material changes',()=>{
 const white=asset('highlight',[.9,.9,.9]),red=asset('material',[.8,.05,.03]),edit={albedoTint:[.3,1.2,.4],preserveHighlights:true};
 const high=G.render(white,{edits:edit}),plain=G.render(white,{edits:{albedoTint:edit.albedoTint}});
 assert.equal(high.data[0],high.data[1]);assert.equal(high.data[1],high.data[2]);assert.notEqual(plain.data[0],plain.data[1]);
 const saturated=G.render(red,{edits:edit}),baseline=G.render(red,{edits:{albedoTint:edit.albedoTint}});assert.deepEqual(saturated.data,baseline.data);
 assert.equal(high.diagnostics.physicalRelighting,false);assert.match(high.diagnostics.highlightSeparation,/heuristic_not_inverse_rendering/);
});
test('pixel-footprint approximation is closer to independent box integration than point sampling',()=>{
 const a={schema:G.ASSET_SCHEMA,id:'impulse',width:64,height:64,base:[.08,.08,.08],splats:[[34,34,.3,.3,0,.7,.7,.7]]};
 const point=G.render(a,{width:16,height:16,filter:'point'}),mip=G.render(a,{width:16,height:16,filter:'mip'});let pe=0,me=0;
 for(let y=2;y<14;y++)for(let x=2;x<14;x++){let expected=.08;const n=64;let integral=0;for(let yy=0;yy<n;yy++)for(let xx=0;xx<n;xx++){const dx=(x+(xx+.5)/n)*4-34,dy=(y+(yy+.5)/n)*4-34;integral+=.7*Math.exp(-(dx*dx+dy*dy)/(.3*.3*2));}expected+=integral/(n*n);const at=(y*16+x)*4;pe+=(G.linear(point.data[at])-expected)**2;me+=(G.linear(mip.data[at])-expected)**2;}
 assert.ok(me<pe*.05,JSON.stringify({pointMSE:pe/144,mipMSE:me/144}));
});
test('browser fitter exports a renderable function asset without a colour raster',async()=>{
 const w=16,h=12,data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*4;data[at]=50+x*8;data[at+1]=60+y*9;data[at+2]=120;data[at+3]=255;}
 const a=await G.fitImage({width:w,height:h,data},{budget:64,iterations:2,geometrySteps:0,id:'test'}),r=G.render(a);
 assert.equal(G.validateAsset(a).ok,true);assert.equal(a.provenance.sourceRGBEmbedded,false);assert.equal(a.provenance.neuralModelTraining,false);assert.ok(a.fit.finalDisplayMetrics.mae<8,JSON.stringify(a.fit.finalDisplayMetrics));assert.equal(r.data.length,data.length);
});
test('legacy quality fallback is native-sample equivalent and still direct Gaussian evaluation',()=>{
 const previous=require('../web/crf-gaussian08.js'),a={schema:previous.ASSET_SCHEMA,id:'legacy',width:24,height:16,base:[65,95,130],splats:[[8.4,7.1,.5,1.6,.2,-30,120,30],[16,10,2.8,1.1,-.7,90,-40,20]],kernel:{colorSpace:'srgb_encoded_0_255'}};
 const old=previous.renderAsset(a),converted=G.importLegacyAsset(a),r=G.render(converted);
 assert.deepEqual(r.data,old.data);assert.equal(converted.splats.length,a.splats.length);assert.equal(r.diagnostics.sourceRGBBlit,false);assert.equal(converted.kernel.colorSpace,'srgb_encoded_0_1');assert.notEqual(converted.splats[0][2],a.splats[0][2]);
});
