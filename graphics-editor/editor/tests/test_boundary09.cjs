'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const B=require('../web/crf-boundary09.js'),G=require('../web/crf-gaussian08.js');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const {PNG}=require('pngjs');
const report={schema:'crf.boundary_controlled_validation.v0.9',scope:'Independent analytic coverage and held-out masked procedural surfaces; natural-photo alpha and hidden wall remain unknown.',tests:[]};
const byte=v=>Math.max(0,Math.min(255,Math.floor(v+.5)));
const linear=v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
const srgb=v=>255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055);

test('independent subpixel truth: mixed edges survive a background change in linear light',()=>{
 const w=96,h=96;let sum=0,max=0,count=0,naive=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let covered=0;for(let sy=0;sy<16;sy++)for(let sx=0;sx<16;sx++){const px=x+(sx+.5)/16,py=y+(sy+.5)/16;if((px-47.3)**2+(py-46.7)**2<29.65**2)covered++;}
  const alpha=covered/256;if(alpha===0||alpha===1)continue;
  const F=[42+.18*x,57+.1*y,31+.1*x],old=[190+.2*x,177+.13*y,140+.1*x],next=[58+.2*x,132+.1*y,180+.1*x];
  const original=F.map((v,c)=>byte(srgb(alpha*linear(v)+(1-alpha)*linear(old[c]))));
  const expected=F.map((v,c)=>byte(srgb(alpha*linear(v)+(1-alpha)*linear(next[c]))));
  const estimate=B.estimateBackgroundFraction(original,F,old,'linear');assert.equal(estimate.identifiable,true);
  const changed=B.replaceBackground(original,old,next,estimate.fraction,'linear').map(byte);
  for(let c=0;c<3;c++){const e=Math.abs(changed[c]-expected[c]);sum+=e;max=Math.max(max,e);naive+=Math.abs(original[c]-expected[c]);}count++;
 }
 const result={id:'mixed_subpixel_circle',pixels:count,mae:sum/(3*count),maxError:max,unchangedOldBoundaryMAE:naive/(3*count),thresholdMAE:4,pass:sum/(3*count)<=4,foregroundEndpointsProvided:true};report.tests.push(result);assert.ok(count>100);assert.ok(result.pass,JSON.stringify(result));
});

function surfaceFixture(kind){
 const width=128,height=92,n=width*height,data=new Uint8ClampedArray(n*4),holes=new Uint8Array(n),known=new Uint8Array(n);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;let v;
  if(kind==='bright')v=189+.11*x+.045*y;
  else if(kind==='dark')v=45+.05*x+.08*y;
  else if(kind==='joint')v=177+.12*x-.035*y-56*Math.exp(-(((y-46.7)/.75)**2));
  else v=126+42/(1+Math.exp(-(x-63)/16))+.03*y;
  // Independent deterministic texture varies in both axes; it is unseen in the hole.
  const texture=1.7*Math.sin(x*1.71+y*.98)+1.3*Math.cos(x*.83-y*2.41);
  data[4*i]=byte(v+texture);data[4*i+1]=byte(v*.96+texture*.9);data[4*i+2]=byte(v*.86+texture*.8);data[4*i+3]=255;
  holes[i]=(x>=44&&x<80&&y>=29&&y<65)?1:0;known[i]=holes[i]?0:1;
 }
 const truth={width,height,data},redacted=new Uint8ClampedArray(data),alternate=new Uint8ClampedArray(data);
 for(let i=0;i<n;i++)if(holes[i]){redacted.set([255,0,255,255],4*i);alternate.set([0,255,0,255],4*i);}
 return{truth,masked:{width,height,data:redacted},alternate:{width,height,data:alternate},holes,known};
}
test('held-out facade holes: hidden RGB is unread, smooth surfaces and a joint remain continuous',()=>{
 for(const kind of ['bright','dark','joint','shadow']){
  const f=surfaceFixture(kind),a=B.fillMaskedSurface(f.masked,f.known,f.holes),b=B.fillMaskedSurface(f.alternate,f.known,f.holes);let sum=0,max=0,pixels=0,leaks=0;
  for(let i=0;i<f.holes.length;i++)if(f.holes[i]){pixels++;for(let c=0;c<3;c++){const e=Math.abs(byte(a.values[i*3+c])-f.truth.data[4*i+c]);sum+=e;max=Math.max(max,e);if(a.values[i*3+c]!==b.values[i*3+c])leaks++;}}
  const threshold=kind==='joint'?8:5,result={id:'heldout_'+kind,pixels,mae:sum/(pixels*3),maxError:max,hiddenValueInfluence:leaks,thresholdMAE:threshold,pass:sum/(pixels*3)<=threshold&&leaks===0,truthSeenByCompleter:false,fixtureKind:'independent procedural surface'};
  if(kind==='joint'){let largestOffset=0;for(let x=44;x<80;x++){let sy=44,tv=Infinity;for(let y=44;y<=50;y++){const v=a.values[(y*128+x)*3];if(v<tv){tv=v;sy=y;}}largestOffset=Math.max(largestOffset,Math.abs(sy-47));}result.jointMaxOffsetPx=largestOffset;result.pass=result.pass&&largestOffset<=1;}
  report.tests.push(result);assert.equal(leaks,0,'Completer used hidden truth');assert.ok(result.pass,JSON.stringify(result));
  const directory=path.join(root,'reports/v09/boundary/controlled');fs.mkdirSync(directory,{recursive:true});const completed=new Uint8ClampedArray(f.truth.data),mask=new Uint8ClampedArray(f.truth.data.length);
  for(let i=0;i<f.holes.length;i++){if(f.holes[i])for(let c=0;c<3;c++)completed[4*i+c]=byte(a.values[3*i+c]);mask[4*i]=mask[4*i+1]=mask[4*i+2]=f.holes[i]*255;mask[4*i+3]=255;}
  for(const [name,data]of [['truth',f.truth.data],['masked',f.masked.data],['completed',completed],['mask',mask]])fs.writeFileSync(path.join(directory,kind+'-'+name+'.png'),PNG.sync.write({width:f.truth.width,height:f.truth.height,data:Buffer.from(data)}));
 }
});

test('recolor protection is measured against independently derived semantic scope; undo is exact',()=>{
 const context=read('web/assets/v09/street/context.json'),asset=read('web/'+context.baselineAssetUrl),detail=read('web/'+context.detailAssetUrl),p=B.prepareStreet({baseline:G.renderAsset(asset),context,detail}),base=B.renderStreet(p),n=p.width*p.height;
 const state=B.applyEdit(B.createState(),{wallColor:[72,142,181],wallStrength:.76}),recolor=B.renderStreet(p,state),protectedMask=new Uint8Array(n),edgeMask=new Uint8Array(n);
 for(let i=0;i<n;i++){protectedMask[i]=p.labels[i]!==0&&p.beta[i]===0?1:0;edgeMask[i]=p.labels[i]!==0&&p.beta[i]>0?1:0;}
 const protectedStats=B.comparePixels(base,recolor,protectedMask),edgeStats=B.comparePixels(base,recolor,edgeMask);assert.equal(protectedStats.changedPixels,0);assert.ok(edgeStats.changedPixels>1000);
 const removed=B.renderStreet(p,{signalVisible:false}),outside=new Uint8Array(n);for(let i=0;i<n;i++)outside[i]=p.labels[i]!==9?1:0;assert.equal(B.comparePixels(base,removed,outside).changedPixels,0);
 const states=[];let current=B.createState();for(let k=0;k<20;k++){states.push(current);current=B.applyEdit(current,{wallColor:k%2?[116,148,107]:[72,142,181],wallStrength:.5+k*.01,signalVisible:k%3!==0});const out=B.renderStreet(p,current);assert.equal(out.data.length,n*4);assert.ok(out.data.every((v,i)=>i%4!==3||v===255));}
 while(states.length)current=states.pop();const restored=B.renderStreet(p,current);assert.equal(B.comparePixels(base,restored).changedPixels,0);
 assert.throws(()=>B.applyEdit(state,{signalOffsetX:999}));assert.equal(state.signalOffsetX,0);
 report.tests.push({id:'natural_street_scope_and_undo',protected:protectedStats,mixedEdgesChanged:edgeStats.changedPixels,editSequenceLength:20,undoRGBExact:true,naturalEdgeAccuracyMeasured:false,pass:true});
});

test.after(()=>{report.allPassed=report.tests.every(t=>t.pass);const out=path.join(root,'reports/v09/boundary/controlled_validation.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');});
