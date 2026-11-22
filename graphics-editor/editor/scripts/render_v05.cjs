#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {PNG}=(()=>{try{return require('pngjs')}catch(e){return require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'pngjs'))}})();
require('../web/crf-fruit.js');const C=require('../web/crf-core.js');
require('../web/assets/scene-data.js');require('../web/assets/cases.js');
const out=path.join(root,'web/downloads'),reportdir=path.join(root,'reports/v05');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(reportdir,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function encode(frame){return PNG.sync.write({width:frame.width,height:frame.height,data:Buffer.from(frame.rgba)},{colorType:6});}
function emit(name,frame){const bytes=encode(frame),file=`crf_0_5_${name}.png`;fs.writeFileSync(path.join(out,file),bytes);return{file,bytes:bytes.length,sha256:hash(bytes),...frame.stats};}
function setup(item){if(item.id!=='street')require(path.join(root,'web',item.dataUrl));const data=globalThis[item.global];let state=C.applyOperations(C.initialState(data),[{op:'setTimeline',timeline:item.timeline}]);if(item.initialOps)state=C.applyOperations(state,item.initialOps);return{data,state};}
const cameras={reference:{yaw:0,pitch:0,zoom:1},left:{yaw:-7,pitch:0,zoom:1.07},right:{yaw:7,pitch:0,zoom:1.07},elevated:{yaw:1.5,pitch:6,zoom:1.08}};
const mode=process.argv[2]||'stills',selected=process.argv[3];
if(mode==='stills'){
 const reports=[],states={};
 for(const item of CRF_CASES){if(selected&&selected!==item.id)continue;const {data,state}=setup(item);states[item.id]={initial:state,views:{}};
  for(const [view,camera] of Object.entries(cameras)){
   const s=C.applyOperations(state,[{op:'setCamera',values:camera}]);const quality=view==='reference'&&item.kind!=='procedural'?'exact':'interactive';
   const frame=C.CPUrender(data,s,{quality,lod:1,time:null});const result=emit(item.id+'_'+view,frame);reports.push({...result,caseId:item.id,view,referenceKind:item.kind});states[item.id].views[view]=s;
   if(item.id==='fruit_lab'&&view==='reference')fs.writeFileSync(path.join(root,'web/assets/cases/fruit_lab-reference.png'),encode(frame));
   console.log(JSON.stringify({case:item.id,view,ms:Math.round(frame.stats.elapsedMs),samples:frame.stats.gaussianCount}));
  }
  const variants=item.id==='street'?{
   wall_blue:[{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}}],
   wall_blue_removed:[{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}},{op:'set',id:'signal.main',path:'visible',value:false}],
   signal_removed:[{op:'set',id:'signal.main',path:'visible',value:false}],
   green:[{op:'set',id:'signal.main',path:'signalState',value:'go'}]
  }:item.id==='fruit_lab'?{
   apple_to_pear:[{op:'replace',id:'apple.main',prototype:'pear'}],
   apple_green:[{op:'set',id:'apple.main',path:'color',value:{tint:[122,175,49],amount:.86}}]
  }:item.id==='orchard'?{apple_green:[{op:'set',id:'apple.photo',path:'color',value:{tint:[122,175,49],amount:.86}}]}
   :{lake_cyan:[{op:'set',id:'lake.main',path:'color',value:{tint:[47,151,163],amount:.7}}]};
  for(const [name,ops] of Object.entries(variants)){const s=C.applyOperations(state,ops);const frame=C.CPUrender(data,s,{quality:item.kind==='procedural'?'interactive':'exact',lod:1,time:null});reports.push({...emit(item.id+'_'+name,frame),caseId:item.id,variant:name});states[item.id][name]=s;}
 }
 fs.writeFileSync(path.join(reportdir,`renders${selected?'_'+selected:''}.json`),JSON.stringify({schema:'crf.renders.v0.5',coreSha256:hash(fs.readFileSync(path.join(root,'web/crf-core.js'))),fruitSha256:hash(fs.readFileSync(path.join(root,'web/crf-fruit.js'))),items:reports},null,2)+'\n');
 fs.writeFileSync(path.join(out,`crf_0_5_states${selected?'_'+selected:''}.json`),JSON.stringify({schema:'crf.example_states.v0.5',states},null,2)+'\n');
}else if(mode==='frames'){
 const item=CRF_CASES.find(c=>c.id===(selected||'street'));if(!item)throw Error('Unknown case');const{data,state}=setup(item);
 const dir=path.join(root,'build/v05_frames',item.id);fs.mkdirSync(dir,{recursive:true});const timings=[];
 for(let i=0;i<120;i++){const f=C.CPUrender(data,state,{quality:'interactive',lod:1,time:i/24});fs.writeFileSync(path.join(dir,String(i).padStart(4,'0')+'.png'),encode(f));timings.push(f.stats.elapsedMs);if(i%12===0||i===119)console.log(JSON.stringify({case:item.id,completed:i+1,total:120,ms:Math.round(f.stats.elapsedMs)}));}
 fs.writeFileSync(path.join(reportdir,item.id+'_video_render.json'),JSON.stringify({schema:'crf.video_render.v0.5',caseId:item.id,frameCount:120,fps:24,durationSeconds:5,width:data.width,height:data.height,lod:1,timeline:state.timeline,timingsMs:timings,sourceDataSha256:hash(fs.readFileSync(path.join(root,'web',item.dataUrl))),coreSha256:hash(fs.readFileSync(path.join(root,'web/crf-core.js'))),fruitSha256:hash(fs.readFileSync(path.join(root,'web/crf-fruit.js')))},null,2)+'\n');
}else throw Error('Usage: render_v05.cjs stills [case] | frames [case]');
