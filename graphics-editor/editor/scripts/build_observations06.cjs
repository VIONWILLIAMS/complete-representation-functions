#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),F=require('../web/crf-observation.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'web/assets/v06'),reportDir=path.join(root,'reports/v06');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(reportDir,{recursive:true});
const sourcePath=path.join(root,'web/assets/cases/orchard-reference.png'),sourceBytes=fs.readFileSync(sourcePath),im=PNG.sync.read(sourceBytes);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const input={width:im.width,height:im.height,rgba:im.data};
// Human-selected rectangles isolate one visible fruit. The apple's right edge
// is partly occluded by the pear; its contact shadow is excluded by the ROI.
// These rectangles are explicit assistance, not automatic scene understanding.
const defs=[{kind:'apple',id:'observed.apple',title:'参考照片中的苹果',bbox:[128,202,392,470]},{kind:'pear',id:'observed.pear',title:'参考照片中的梨子',bbox:[349,72,647,515]}];
const assets=[];
for(const def of defs){
 const started=performance.now(),fit=F.fit(input,{...def,label:def.title,profileSamples:32,fieldSize:256});
 const [x0,y0,x1,y1]=fit.report.bbox,w=x1-x0,h=y1-y0,crop=new PNG({width:w,height:h}),masked=new PNG({width:w,height:h});
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=((y+y0)*im.width+x+x0)*4,to=(y*w+x)*4;for(let c=0;c<3;c++){crop.data[to+c]=im.data[from+c];masked.data[to+c]=im.data[from+c];}crop.data[to+3]=255;masked.data[to+3]=fit.mask[(y+y0)*im.width+x+x0]?255:0;}
 const refName=def.kind+'-reference.png',maskName=def.kind+'-reference-mask.png',fitName=def.kind+'-fit-front.png';
 fs.writeFileSync(path.join(out,refName),PNG.sync.write(crop));fs.writeFileSync(path.join(out,maskName),PNG.sync.write(masked));
 fs.writeFileSync(path.join(out,fitName),PNG.sync.write({width:fit.preview.width,height:fit.preview.height,data:Buffer.from(fit.preview.rgba)}));
 Object.assign(fit.object.source,{referenceAsset:'assets/v06/'+refName,sourcePhoto:'assets/cases/orchard-reference.png',sourcePhotoSha256:sha(sourceBytes),sourceTitle:'Apple and pear',sourceAuthor:'Yves Geissbühler',sourceUrl:'https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg',license:'CC0 1.0',assistance:'Human-selected rectangular ROI; color segmentation computes the mask, no legacy masks used.'});
 if(def.kind==='apple')fit.report.warnings.push('参考苹果右侧被梨子遮挡；矩形 ROI 排除了邻物和接触阴影，剩余遮挡与果柄仍会影响单图外观。');
 const objectBytes=Buffer.from(JSON.stringify(fit.object));
 fit.report.elapsedMs=performance.now()-started;fit.report.objectSerializedBytes=objectBytes.length;fit.report.objectSha256=sha(objectBytes);
 assets.push({id:def.id,title:def.title,kind:def.kind,object:fit.object,report:fit.report,referenceUrl:'assets/v06/'+refName,maskReferenceUrl:'assets/v06/'+maskName,fitPreviewUrl:'assets/v06/'+fitName});
 console.log(JSON.stringify({id:def.id,pass:fit.report.pass,bbox:fit.report.bbox,IoU:fit.report.profile.silhouetteIoU,initialLoss:fit.report.profile.initialLoss,finalLoss:fit.report.profile.finalLoss,holdoutMAE:fit.report.appearance.holdoutRgbMAE,baselineMAE:fit.report.appearance.constantBaselineMAE,objectBytes:objectBytes.length,elapsedMs:Math.round(fit.report.elapsedMs)}));
}
const payload={schema:'crf.observed_assets.v0.6',version:'0.6.0',source:{title:'Apple and pear',author:'Yves Geissbühler',url:'https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg',license:'CC0 1.0',canonicalDimensions:[im.width,im.height],canonicalSha256:sha(sourceBytes)},assets};
const target=path.join(out,'observed-fruit.js');fs.writeFileSync(target,'globalThis.CRF_OBSERVED_FRUIT='+JSON.stringify(payload)+';\n');
fs.writeFileSync(path.join(reportDir,'observation_fit.json'),JSON.stringify({schema:'crf.observation_acceptance.v0.6',algorithmSha256:sha(fs.readFileSync(path.join(root,'web/crf-observation.js'))),source:payload.source,assetFile:'web/assets/v06/observed-fruit.js',assetFileBytes:fs.statSync(target).size,assetFileSha256:sha(fs.readFileSync(target)),pass:assets.every(a=>a.report.pass),objects:assets.map(a=>({id:a.id,...a.report}))},null,2)+'\n');
