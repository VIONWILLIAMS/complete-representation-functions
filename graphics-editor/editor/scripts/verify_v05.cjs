#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {PNG}=(()=>{try{return require('pngjs')}catch(e){return require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'pngjs'))}})();
const C=require('../web/crf-core.js');require('../web/crf-fruit.js');require('../web/assets/scene-data.js');require('../web/assets/cases.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=[],observations=[];
function check(name,pass,details){checks.push({name,pass:!!pass,details});if(!pass)console.error('FAIL '+name);}
function metrics(a,b){if(a.length!==b.length)throw Error('dimension mismatch');let exact=0,mae=0,max=0;for(let i=0;i<a.length;i+=4){let same=true;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,d);mae+=d;same&&=d===0;}exact+=same;}return{exactPixels:exact,totalPixels:a.length/4,mae:mae/(a.length/4*3),maxAbsChannelError:max,exact100:exact===a.length/4};}
for(const item of CRF_CASES){
 if(item.id!=='street')require(path.join(root,'web',item.dataUrl));const data=globalThis[item.global];
 let state=C.applyOperations(C.initialState(data),[{op:'setTimeline',timeline:item.timeline}]);if(item.initialOps)state=C.applyOperations(state,item.initialOps);
 const reference=PNG.sync.read(fs.readFileSync(path.join(root,'web',item.referenceUrl)));
 const quality=item.kind==='procedural'?'interactive':'exact';
 const f=C.CPUrender(data,state,{quality,lod:1,time:null});const m=metrics(f.rgba,reference.data);
 check(item.id+'_native_reference_match',f.width===reference.width&&f.height===reference.height&&m.exact100,{...m,width:f.width,height:f.height,referenceType:item.kind==='photo'?'independently_decoded_canonical_photo':'generated_golden_repeatability',referenceSha256:hash(fs.readFileSync(path.join(root,'web',item.referenceUrl)))});
 if(item.kind==='photo')observations.push({caseId:item.id,...m,width:f.width,height:f.height,canonicalSource:data.source||null});
 check(item.id+'_five_second_timeline',state.timeline.duration===5&&item.timeline.tracks.some(t=>t.id==='$camera'),{duration:state.timeline.duration,frameCountAt24fps:Math.round(state.timeline.duration*24)});
 const angle=C.CPUrender(data,C.applyOperations(state,[{op:'setCamera',values:{yaw:7,zoom:1.07}}]),{quality:'interactive',lod:1,time:null});
 check(item.id+'_camera_changes_render',metrics(f.rgba,angle.rgba).mae>1,{mae:metrics(f.rgba,angle.rgba).mae,hypothesis:item.kind==='photo'});
 if(item.id==='street'){
  const removed=C.CPUrender(data,C.applyOperations(state,[{op:'set',id:'signal.main',path:'visible',value:false}]),{quality:'exact',time:null});
  const d=C.decodeData(data),signal=data.objects.find(o=>o.id==='signal.main').index,wall=data.objects.find(o=>o.id==='wall.main').index;
  let target=0,filled=0,otherChanged=0;
  for(let i=0;i<d.labels.length;i++){if(d.labels[i]===signal){target++;filled+=removed.ids[i]===wall&&removed.inferred[i]===1;}else if([0,1,2].some(k=>removed.rgba[i*4+k]!==f.rgba[i*4+k]))otherChanged++;}
  check('street_removal_reveals_inferred_wall_only',filled===target&&target>4000&&otherChanged===0,{targetPixels:target,markedWallFill:filled,changedOutsideTarget:otherChanged,physicalHiddenTruth:'unavailable'});
 }
 if(item.id==='fruit_lab'){
  const replaced=C.applyOperations(state,[{op:'replace',id:'apple.main',prototype:'pear'}]);const r=C.CPUrender(data,replaced,{quality:'interactive',lod:1,time:null});
  check('apple_to_pear_preserves_editable_identity',replaced.objects.find(o=>o.id==='apple.main').prototype==='pear'&&metrics(f.rgba,r.rgba).mae>1,{mae:metrics(f.rgba,r.rgba).mae});
  const varied=C.applyOperations(state,[{op:'set',id:'apple.main',path:'generator.shape',value:.7},{op:'set',id:'pear.main',path:'generator.seed',value:99}]);const v=C.CPUrender(data,varied,{quality:'interactive',lod:1,time:null});
  check('procedural_geometry_and_seed_reach_pixels',metrics(f.rgba,v.rgba).mae>.1,{mae:metrics(f.rgba,v.rgba).mae});
 }
}
const files=['web/crf-core.js','web/crf-renderer.js','web/crf-fruit.js','web/crf-video.js','web/editor.js','web/assets/scene-data.js','web/assets/cases/orchard-data.js','web/assets/cases/alpine-data.js','web/assets/cases/fruit_lab-data.js'];
const report={schema:'crf.acceptance.v0.5',pass:checks.every(c=>c.pass),checks,observedPhotoCases:observations,observedPhotoTotalPixels:observations.reduce((n,x)=>n+x.totalPixels,0),hashes:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))])),limits:['Dense observed RGB is retained; this is not compact recovery from language alone.','Unseen views and occluded backgrounds have no photograph ground truth.','Procedural fruit golden comparison verifies repeatability, not photographic realism.']};
fs.mkdirSync(path.join(root,'reports/v05'),{recursive:true});fs.writeFileSync(path.join(root,'reports/v05/acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:checks.length,observedPhotos:observations.map(x=>({id:x.caseId,exact100:x.exact100,pixels:x.totalPixels})),observedPhotoTotalPixels:report.observedPhotoTotalPixels},null,2));
if(!report.pass)process.exitCode=1;
