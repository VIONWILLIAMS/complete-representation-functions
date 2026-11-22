#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'web/downloads'),reports=path.join(root,'reports/v06');
const Core=require('../web/crf-program.js'),Renderer=require('../web/crf-program-renderer.js');
require('../web/assets/v06/observed-fruit.js');
const Scenes=require('../web/crf-scenes06.js');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(reports,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function png(frame,file){const p=new PNG({width:frame.width,height:frame.height});p.data=Buffer.from(frame.rgba);const b=PNG.sync.write(p);fs.writeFileSync(file,b);return {bytes:b.length,sha256:sha(b)};}
function save(program,id,view){
  const start=Date.now(),frame=Renderer.render(program,{width:960,height:720,time:null,quality:'final'}),file=path.join(out,`crf_0_6_${id}_${view}.png`);
  const stored=png(frame,file);console.log(`${id}/${view}: ${Date.now()-start} ms`);
  return {scene:id,view,file:path.relative(root,file),...stored,width:frame.width,height:frame.height,stats:frame.stats};
}
function stills(ids){
  const records=[],programs={};
  for(const id of ids){
    const original=Scenes.create(id);programs[id]=original;
    for(const [view,values] of Object.entries({reference:{},left:{yaw:-22},right:{yaw:22},elevated:{pitch:25,yaw:8}})){
      const p=JSON.parse(JSON.stringify(original));Object.assign(p.camera,values);records.push(save(p,id,view));
    }
    if(id==='common'){
      const modified=Core.applyOps(original,[{op:'set',id:'apple.observed',path:'surface.shape',value:.45},{op:'set',id:'apple.observed',path:'material.color',value:[117,168,52]}]);
      programs.common_edited=modified;records.push(save(modified,id,'edited'));
      const overlap=Core.applyOps(original,[{op:'set',id:'pear.generated',path:'transform.position',value:[-.75,0,.9]}]);
      programs.common_overlap=overlap;records.push(save(overlap,id,'overlap'));
    }
  }
  fs.writeFileSync(path.join(out,'crf_0_6_programs.json'),JSON.stringify({schema:'crf.program_collection.v0.6',programs},null,2));
  fs.writeFileSync(path.join(reports,'renders.json'),JSON.stringify({schema:'crf.render_evidence.v0.6',records,rendererSha256:sha(fs.readFileSync(path.join(root,'web/crf-program-renderer.js')))},null,2));
}
function frames(id){
  const program=Scenes.create(id),folder=path.join(root,'build/v06_frames',id);fs.mkdirSync(folder,{recursive:true});
  const fps=24,duration=5,count=fps*duration,records=[];
  for(let i=0;i<count;i++){
    const time=i/fps,frame=Renderer.render(program,{width:960,height:720,time,quality:'final'});
    const digest=png(frame,path.join(folder,String(i).padStart(4,'0')+'.png'));
    records.push({index:i,time,...digest});if(i%12===0)console.log(`${id}: ${i}/${count}`);
  }
  fs.writeFileSync(path.join(reports,`${id}_video_render.json`),JSON.stringify({schema:'crf.video_frames.v0.6',id,fps,duration,frameCount:count,width:960,height:720,records},null,2));
  console.log(`${id}: ${count}/${count}`);
}
const [mode='stills',id]=process.argv.slice(2);
if(mode==='stills')stills(id?[id]:['common','stilllife','courtyard']);
else if(mode==='frames')frames(id||'common');
else throw new Error('Usage: node scripts/render_v06.cjs stills [scene] | frames [scene]');
