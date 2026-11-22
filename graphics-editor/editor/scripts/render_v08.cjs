#!/usr/bin/env node
'use strict';
// Independent export harness using exactly the editor's Gaussian evaluator.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{PNG}=require('pngjs');
const G=require('../web/crf-gaussian08.js');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'web'),OUT=path.join(WEB,'assets/v08/renders');
fs.mkdirSync(OUT,{recursive:true});
const catalogue=JSON.parse(fs.readFileSync(path.join(WEB,'assets/v08/catalog.json'))),byId=new Map(catalogue.assets.map(a=>[a.id,a]));
function hydrate(raw){const s={...raw,assets:{...(raw.assets||{})}};for(const id of new Set(s.objects.map(o=>o.assetId))){if(!s.assets[id]){const a=byId.get(id);if(!a)throw new Error('Unknown fitted asset '+id);s.assets[id]=JSON.parse(fs.readFileSync(path.join(WEB,a.assetUrl)));}}return s;}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function render(raw,target,reference){
 const scene=hydrate(raw),t=performance.now(),image=G.renderScene(scene),elapsedMs=performance.now()-t;
 const png=PNG.sync.write({width:image.width,height:image.height,data:Buffer.from(image.data)});fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,png);
 const report={schema:'crf.actual_render.v0.8',sceneId:scene.id,width:image.width,height:image.height,objectCount:scene.objects.length,gaussianCount:scene.objects.reduce((n,o)=>n+(o.visible===false?0:scene.assets[o.assetId].splats.length),0),elapsedMs,rgbaSHA256:hash(image.data),pngSHA256:hash(png),engine:'web/crf-gaussian08.js',rendererSourceSHA256:hash(fs.readFileSync(path.join(WEB,'crf-gaussian08.js'))),sourceRasterReadByRenderer:false,assetIds:Object.keys(scene.assets),metrics:null};
 if(reference){const ref=PNG.sync.read(fs.readFileSync(reference));report.metrics=G.calculateMetrics(ref,image);}
 fs.writeFileSync(target.replace(/\.png$/,'.render.json'),JSON.stringify(report,null,2)+'\n');return{image,report};
}
if(require.main===module){
 const args=process.argv.slice(2);if(args.length){const s=JSON.parse(fs.readFileSync(path.resolve(args[0]))),target=path.resolve(args[1]);console.log(JSON.stringify(render(s,target,args[2]&&path.resolve(args[2])).report));}
 else{
  const records=[];
  for(const [id,file,ref]of[['street','street.scene.json','assets/reference.png'],['street-full','street-full.scene.json','assets/reference.png'],['still-life','still-life.scene.json',null],['alpine','alpine.scene.json','assets/cases/alpine-reference.png']]){const s=JSON.parse(fs.readFileSync(path.join(WEB,'assets/v08',file)));records.push(render(s,path.join(OUT,id+'.png'),ref&&path.join(WEB,ref)).report);}
  const street=JSON.parse(fs.readFileSync(path.join(WEB,'assets/v08/street.scene.json')));
  const edit=JSON.parse(JSON.stringify(street));edit.id='street.wall-blue';edit.objects.find(o=>o.id==='wall.main').hue=150;edit.objects.find(o=>o.id==='wall.main').exposure=.15;records.push(render(edit,path.join(OUT,'street-wall-blue.png')).report);
  edit.objects.find(o=>o.id==='signal.main').visible=false;edit.id='street.signal-removed';records.push(render(edit,path.join(OUT,'street-signal-removed.png')).report);
  fs.writeFileSync(path.join(ROOT,'reports/v08/rendered.json'),JSON.stringify({renders:records},null,2)+'\n');for(const r of records)console.log(JSON.stringify(r));
 }
}
module.exports={hydrate,render};
