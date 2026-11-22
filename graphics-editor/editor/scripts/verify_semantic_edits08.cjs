#!/usr/bin/env node
'use strict';
// Targeted acceptance of two actual DeepSeek scene edits. No hidden-wall truth.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),G=require('../web/crf-gaussian08.js');
const root=path.resolve(__dirname,'..'),web=path.join(root,'web');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const catalog=read('web/assets/v08/catalog.json'),declarations=new Map(catalog.assets.map(a=>[a.id,a]));
const basePath='web/assets/v08/street.scene.json',base=read(basePath);
const defaults={x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1,visible:true,hue:0,exposure:0,zIndex:0};
function normalized(o){const n={id:o.id,assetId:o.assetId};for(const [k,v]of Object.entries(defaults))n[k]=o[k]??v;return n;}
const assets={};
function hydrate(scene){for(const o of scene.objects)if(!assets[o.assetId]){const declared=declarations.get(o.assetId);if(!declared)throw new Error('Missing asset '+o.assetId);const file=path.resolve(web,declared.assetUrl);if(!file.startsWith(web+path.sep))throw new Error('Asset outside web directory');assets[o.assetId]=JSON.parse(fs.readFileSync(file,'utf8'));}return{...scene,assets:Object.fromEntries(scene.objects.map(o=>[o.assetId,assets[o.assetId]]))};}
const baseScene=hydrate(base),baseRender=G.renderScene(baseScene);

function coverage(o,width,height){
 const a=assets[o.assetId],alpha=G.alphaArray(a),out=new Float64Array(width*height);
 if(o.visible===false)return out;
 const sx=o.scaleX??1,sy=o.scaleY??1,rad=(o.rotation||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),cx=(o.x||0)+a.width*sx/2,cy=(o.y||0)+a.height*sy/2;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dx=x+.5-cx,dy=y+.5-cy,u=(c*dx+s*dy)/sx+a.width/2-.5,v=(-s*dx+c*dy)/sy+a.height/2-.5;
  if(u<=-1||v<=-1||u>=a.width||v>=a.height)continue;
  const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;let ap=0;
  for(let j=0;j<2;j++)for(let k=0;k<2;k++){const xx=ix+k,yy=iy+j;if(xx<0||yy<0||xx>=a.width||yy>=a.height)continue;ap+=(k?fx:1-fx)*(j?fy:1-fy)*alpha[yy*a.width+xx]/255;}
  out[y*width+x]=ap*(o.opacity??1);
 }
 return out;
}
function pixelStats(before,after,selected){let pixels=0,changedPixels=0,changedChannels=0,totalError=0,maxError=0;for(let i=0;i<before.width*before.height;i++){if(selected&&!selected[i])continue;pixels++;let changed=false;for(let k=0;k<3;k++){const d=Math.abs(before.data[4*i+k]-after.data[4*i+k]);totalError+=d;maxError=Math.max(maxError,d);if(d){changed=true;changedChannels++;}}if(changed)changedPixels++;}return{pixels,changedPixels,changedChannels,mae:pixels?totalError/(pixels*3):0,maxError,exactRGBFraction:pixels?(pixels-changedPixels)/pixels:1,allUnchanged:changedPixels===0};}
function maskWhere(array,predicate){return Uint8Array.from(array,predicate);}
function bounds(array,width){let x0=width,y0=Infinity,x1=-1,y1=-1;for(let i=0;i<array.length;i++)if(array[i]>0){const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:[x0,y0,x1+1,y1+1];}
function pngParity(render,file){const png=PNG.sync.read(fs.readFileSync(path.join(root,file)));if(png.width!==render.width||png.height!==render.height)return{matchingRGBA:false,reason:'dimensions differ'};let n=0,max=0;for(let i=0;i<render.data.length;i++){const d=Math.abs(render.data[i]-png.data[i]);if(d)n++;max=Math.max(max,d);}return{matchingRGBA:n===0,mismatchedChannels:n,maxChannelDifference:max,path:file,sha256:hash(file)};}
function objectComparison(candidate,allowed){const b=new Map(base.objects.map(o=>[o.id,o])),c=new Map(candidate.objects.map(o=>[o.id,o])),added=[...c.keys()].filter(id=>!b.has(id)),removed=[...b.keys()].filter(id=>!c.has(id)),changes=[],labelOnly=[];for(const [id,old]of b){if(!c.has(id))continue;const now=c.get(id),left=normalized(old),right=normalized(now),fields={};for(const key of Object.keys(left))if(left[key]!==right[key])fields[key]={before:left[key],after:right[key]};if(Object.keys(fields).length)changes.push({id,requested:allowed.has(id),fields});else if(old.label!==now.label)labelOnly.push({id,before:old.label,after:now.label});}return{added,removed,changes,labelOnly,normalizationDefaults:defaults,labelsAffectRendering:false,allNonrequestedObjectsIdentical:added.length===0&&removed.length===0&&changes.every(c=>c.requested),globalRenderSettingsIdentical:['schema','width','height','background'].every(k=>JSON.stringify(base[k])===JSON.stringify(candidate[k]))};}

const report={schema:'crf.semantic_edit_acceptance.v0.8',evaluatedAtUTC:new Date().toISOString(),reference:{scenePath:basePath,sceneSHA256:hash(basePath),rendererPath:'web/crf-gaussian08.js',rendererSHA256:hash('web/crf-gaussian08.js'),width:base.width,height:base.height,parityWithSharedStreetPNG:pngParity(baseRender,'web/assets/v08/renders/street.png')},cases:[],notes:['These are tests of actual exported DeepSeek candidate programs, not synthetic substitute edits.','All masks are transformed with the renderer’s pixel-centre and premultiplied bilinear coverage convention.','Exact protected-region equality is relative to the base Gaussian render, not an assertion of 100% reconstruction of the source photograph.','Signal removal reveals the previously inferred wall layer. No unobserved wall ground truth is available; this test does not measure hidden-wall correctness or continuity.']};

const wallPath='web/assets/v08/examples/04_street_teal.candidate.scene.json',wall=read(wallPath),wallRender=G.renderScene(hydrate(wall));
const wallObject=base.objects.find(o=>o.id==='wall.main'),wallCoverage=coverage(wallObject,base.width,base.height);
const foregroundOpaque=new Uint8Array(base.width*base.height),blocking=[];
const ordered=base.objects.map((o,index)=>({o,index})).sort((a,b)=>(a.o.zIndex??0)-(b.o.zIndex??0)||a.index-b.index),wallOrder=ordered.findIndex(x=>x.o.id==='wall.main');
for(let j=wallOrder+1;j<ordered.length;j++){const o=ordered[j].o,alpha=coverage(o,base.width,base.height);let count=0;for(let i=0;i<alpha.length;i++)if(alpha[i]===1){foregroundOpaque[i]=1;count++;}if(count)blocking.push({id:o.id,fullyOpaquePixels:count});}
const wallOutside=maskWhere(wallCoverage,a=>a===0);
const wallCase={id:'04_street_teal',scenePath:wallPath,sceneSHA256:hash(wallPath),requestedObjectIds:['wall.main'],objects:objectComparison(wall,new Set(['wall.main'])),allPixels:pixelStats(baseRender,wallRender),protectedFullyOpaqueForeground:{definition:'Any later layer with exact effective alpha=1 fully blocks the edited wall.',blockingObjects:blocking,...pixelStats(baseRender,wallRender,foregroundOpaque)},protectedOutsideWallCoverage:{definition:'Exact transformed wall alpha equals zero.',...pixelStats(baseRender,wallRender,wallOutside)},publishedCandidateParity:pngParity(wallRender,'web/assets/v08/examples/04_street_teal.candidate.png')};
wallCase.pass=wallCase.objects.allNonrequestedObjectsIdentical&&wallCase.objects.globalRenderSettingsIdentical&&wallCase.protectedFullyOpaqueForeground.allUnchanged&&wallCase.protectedOutsideWallCoverage.allUnchanged&&wallCase.allPixels.changedPixels>0&&wallCase.publishedCandidateParity.matchingRGBA;
report.cases.push(wallCase);

const signalPath='web/assets/v08/examples/05_street_context_fill.candidate.scene.json',signal=read(signalPath),signalRender=G.renderScene(hydrate(signal)),signalObject=base.objects.find(o=>o.id==='signal.main'),signalCoverage=coverage(signalObject,base.width,base.height),outsideSignal=maskWhere(signalCoverage,a=>a===0),insideSignal=maskWhere(signalCoverage,a=>a>0);
const signalCase={id:'05_street_context_fill',scenePath:signalPath,sceneSHA256:hash(signalPath),requestedObjectIds:['signal.main'],objects:objectComparison(signal,new Set(['signal.main'])),signalCoverageBounds:bounds(signalCoverage,base.width),protectedOutsideExactSignalCoverage:{definition:'Exact transformed original signal alpha equals zero; this includes holes inside the bounding rectangle.',...pixelStats(baseRender,signalRender,outsideSignal)},insideOriginalSignalCoverage:pixelStats(baseRender,signalRender,insideSignal),allPixels:pixelStats(baseRender,signalRender),outputFullyOpaque:signalRender.data.every((v,i)=>i%4!==3||v===255),publishedCandidateParity:pngParity(signalRender,'web/assets/v08/examples/05_street_context_fill.candidate.png'),hiddenWallGroundTruthAvailable:false,hiddenWallReconstructionAccuracy:null,wallContinuity:'not measured here; requires visual/structural review'};
signalCase.pass=signalCase.objects.allNonrequestedObjectsIdentical&&signalCase.objects.globalRenderSettingsIdentical&&signalCase.protectedOutsideExactSignalCoverage.allUnchanged&&signalCase.insideOriginalSignalCoverage.changedPixels>0&&signalCase.outputFullyOpaque&&signalCase.publishedCandidateParity.matchingRGBA;
report.cases.push(signalCase);report.allPassed=report.reference.parityWithSharedStreetPNG.matchingRGBA&&report.cases.every(c=>c.pass);
const output=path.join(root,'reports/v08/semantic_edit_acceptance.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,allPassed:report.allPassed,cases:report.cases.map(c=>({id:c.id,pass:c.pass,changes:c.objects.changes,protected:c.protectedFullyOpaqueForeground||c.protectedOutsideExactSignalCoverage,changedPixels:c.allPixels.changedPixels}))},null,2));
if(!report.allPassed)process.exitCode=1;
