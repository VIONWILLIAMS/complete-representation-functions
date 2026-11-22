'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),F=require('../web/crf-observation.js');

function fixture(pear=false,background=[230,230,230]){
 const width=160,height=192,rgba=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4,t=(y-12)/168,yy=1-2*t,r=54*Math.sqrt(Math.max(0,1-yy*yy))*(pear?.8-.4*yy:1+.04*Math.cos(t*8));
  const inside=t>0&&t<1&&Math.abs(x+.5-80)<r;mask[y*width+x]=inside?1:0;
  const c=inside?[140+50*Math.sin(t*2),34+22*(x/width),23+18*Math.cos(t*5)]:background;
  for(let k=0;k<3;k++)rgba[p+k]=Math.round(c[k]);rgba[p+3]=255;
 }
 return{width,height,rgba,mask};
}

test('real profile optimization lowers its declared objective and follows image shape',()=>{
 const a=fixture(false),p=fixture(true),fa=F.fit(a,{mask:a.mask,kind:'apple',fieldSize:32}),fp=F.fit(p,{mask:p.mask,kind:'pear',fieldSize:32});
 assert(fa.report.profile.silhouetteIoU>.96);assert(fp.report.profile.silhouetteIoU>.95);
 assert(fp.report.profile.finalLoss<fp.report.profile.initialLoss*.1);
 const curve=fp.report.profile.lossCurve;for(let i=1;i<curve.length;i++)assert(curve[i].objective<=curve[i-1].objective+1e-12);
 assert.notDeepEqual(fa.object.surface.profile,fp.object.surface.profile);
 assert.equal(fp.object.surface.kind,'lathe');assert.equal(fp.object.material.kind,'field');
});

test('held-out UV colors are predicted from fitting coefficients and outperform constant color',()=>{
 const im=fixture(),fit=F.fit(im,{mask:im.mask,kind:'apple',fieldSize:32});
 assert(fit.report.appearance.heldoutPixels>100);
 assert(fit.report.appearance.holdoutRgbMAE<fit.report.appearance.constantBaselineMAE*.3);
 assert(fit.report.appearance.trainRgbMAE<2);
 const curve=fit.report.appearance.lossCurve;for(let i=1;i<curve.length;i++)assert(curve[i].trainMSE<=curve[i-1].trainMSE+1e-9);
 assert.equal(fit.object.material.field.mode,'observed_radiance');
 assert.equal(fit.report.runtimeData.fullSourceRGBStored,false);
 assert.equal(F.decodeField(fit.object.material.field).rgb.length,32*32*3);
 assert(!JSON.stringify(fit.object).includes('rgba'));
});

test('changing held-out RGB cannot change fitted coefficients, mean, or back prior',()=>{
 const a=fixture(),b=fixture();
 for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(b.mask[y*b.width+x]&&F._internals.hash(x,y)%5===0){const p=(y*b.width+x)*4;b.rgba[p]=20;b.rgba[p+1]=240;b.rgba[p+2]=180;}
 const fa=F.fit(a,{mask:a.mask,kind:'apple',fieldSize:32}),fb=F.fit(b,{mask:b.mask,kind:'apple',fieldSize:32});
 assert.deepEqual(fa.object,fb.object);assert.deepEqual(fa.preview.rgba,fb.preview.rgba);
 assert.equal(fa.report.appearance.trainRgbMAE,fb.report.appearance.trainRgbMAE);
 assert(fb.report.appearance.holdoutRgbMAE>fa.report.appearance.holdoutRgbMAE*20);
});

test('background perturbations cannot become fitted appearance donors with a supplied mask',()=>{
 const a=fixture(false,[240,240,240]),b=fixture(false,[0,255,255]);
 const fa=F.fit(a,{mask:a.mask,kind:'apple',fieldSize:32}),fb=F.fit(b,{mask:b.mask,kind:'apple',fieldSize:32});
 assert.deepEqual(fa.object,fb.object);assert.deepEqual(fa.preview.rgba,fb.preview.rgba);
});

test('fitted fields explicitly distinguish observed front from inferred back',()=>{
 const im=fixture(),fit=F.fit(im,{mask:im.mask,kind:'apple',fieldSize:32}),field=fit.object.material.field,{confidence}=F.decodeField(field);
 assert(confidence[16*32+16]>=160);assert.equal(confidence[16*32],24);
 assert.equal(fit.object.source.sourceImageRequiredAtRuntime,false);
 const reconstructed=JSON.parse(JSON.stringify(fit.object));assert.deepEqual(F.sampleField(reconstructed.material.field,.5,.5),F.sampleField(field,.5,.5));
});

test('bounded automatic color segmentation is reproducible without supplied labels',()=>{
 const im=fixture(),a=F.fit(im,{kind:'auto',fieldSize:32}),b=F.fit(im,{kind:'auto',fieldSize:32});
 assert.equal(a.report.kind,'apple');assert(a.report.profile.silhouetteIoU>.95);assert.deepEqual(a.object,b.object);
});

test('invalid and unsupported image inputs fail clearly instead of fabricating objects',()=>{
 assert.throws(()=>F.fit({width:10,height:10,rgba:new Uint8Array(10)}),/rgba length/);
 const im=fixture();assert.throws(()=>F.fit(im,{bbox:[-1,0,100,100]}),/bbox/);
 assert.throws(()=>F.fit(im,{kind:'car'}),/kind/);
 assert.throws(()=>F.fit(im,{profileSamples:1000}),/profileSamples/);
 assert.throws(()=>F.fit(im,{mask:new Uint8Array(2)}),/mask length/);
 assert.throws(()=>F.fit(im,{budget:{maxInputPixels:64}}),/fitting budget/);
 assert.throws(()=>F.fit(im,{mask:im.mask,budget:{maxForegroundPixels:64}}),/foreground exceeds/);
 assert.throws(()=>F.fit(im,{budget:{maxInputPixels:Infinity}}),/invalid pixel fitting budget/);
 const gray={width:32,height:32,rgba:new Uint8Array(32*32*4).fill(128)};for(let i=3;i<gray.rgba.length;i+=4)gray.rgba[i]=255;
 assert.throws(()=>F.fit(gray),/no supported fruit foreground/);
});

test('an observed fit accepts the same CRFProgram edits and timeline as a generated object',()=>{
 const P=require('../web/crf-program.js'),im=fixture(),fit=F.fit(im,{id:'apple.observed',mask:im.mask,kind:'apple',fieldSize:32});
 const p=P.createPreset('common');p.objects[0]=fit.object;assert(P.validate(p).valid);
 const edited=P.applyOps(p,[{op:'set',id:'apple.observed',path:'material.color',value:[85,170,55]},{op:'set',id:'apple.observed',path:'surface.shape',value:.25},{op:'set',id:'apple.observed',path:'transform.position',value:[-1,0,0]},{op:'timeline',timeline:{duration:5,tracks:[{target:'apple.observed',path:'transform.rotation',keys:[{time:0,value:[0,0,0]},{time:5,value:[0,90,0]}]}]}}]);
 const frame=P.atTime(edited,2.5);assert.deepEqual(frame.objects[0].transform.rotation,[0,45,0]);assert.deepEqual(frame.objects[0].material.color,[85,170,55]);
 assert.equal(frame.objects[0].material.field.rgbBase64,fit.object.material.field.rgbBase64);assert.deepEqual(frame.objects[0].surface.profile,fit.object.surface.profile);
 assert.equal(p.objects[0].surface.shape,0);assert.equal(frame.objects[0].surface.shape,.25);
});

test('the shared renderer evaluates the fitted radius function with the same interpolation',()=>{
 const R=require('../web/crf-program-renderer.js'),im=fixture(true),fit=F.fit(im,{mask:im.mask,kind:'pear',fieldSize:32}),s=fit.object.surface;
 assert.equal(s.profileInterpolation,'linear');
 for(let i=0;i<=100;i++){const t=i/100;assert(Math.abs(R._internals.radiusAt(s,t,0)-s.radius*F._internals.profileAt(s.profile,t))<1e-12);}
});

test('runtime observed rendering needs no source image and uses the same Gaussian path',()=>{
 const P=require('../web/crf-program.js'),R=require('../web/crf-program-renderer.js'),im=fixture(),fit=F.fit(im,{id:'apple.observed',mask:im.mask,kind:'apple',fieldSize:32});
 const p=P.createPreset('common');p.objects[0]=fit.object;p.objects[0].transform.position=[-1.05,0,.2];p.objects[0].source.referenceAsset='/does-not-exist.png';p.width=128;p.height=96;
 const a=R.render(p,{quality:'preview'});p.objects[0].source={kind:'observed_fit'};const b=R.render(JSON.parse(JSON.stringify(p)),{quality:'preview'});
 assert.deepEqual(a.rgba,b.rgba);assert(a.stats.observedSamples>0&&a.stats.generatedSamples>0);assert.equal(a.stats.sourceImageBlit,false);assert.equal(a.stats.sharedGeometryAndVisibility,true);
 const recolored=P.applyOps(p,[{op:'set',id:'apple.observed',path:'material.color',value:[50,170,45]}]),c=R.render(recolored,{quality:'preview'});assert.notDeepEqual(c.rgba,a.rgba);assert.deepEqual(c.ids,a.ids);
});
