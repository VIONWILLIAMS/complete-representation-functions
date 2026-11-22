#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const G=require('../web/crf-gaussian08.js'),B=require('../web/crf-boundary09.js'),root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const context=read('web/assets/v09/street/context.json'),asset=read('web/'+context.baselineAssetUrl),detail=read('web/'+context.detailAssetUrl);
const start=performance.now(),prepared=B.prepareStreet({baseline:G.renderAsset(asset),context,detail});
const directory=path.join(root,'web/assets/v09/street'),reportDirectory=path.join(root,'reports/v09/boundary');
fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(reportDirectory,{recursive:true});
const save=(name,image)=>fs.writeFileSync(path.join(directory,name+'.png'),PNG.sync.write({width:image.width,height:image.height,data:Buffer.from(image.data)}));
const cases=[['reference',{}],['wall-blue',{wallColor:[72,142,181],wallStrength:.76}],['wall-sage',{wallColor:[108,145,112],wallStrength:.68}],['signal-removed',{signalVisible:false}],['blue-signal-removed',{wallColor:[72,142,181],wallStrength:.76,signalVisible:false}],['signal-moved',{signalOffsetX:46,signalOffsetY:15}]];
const reference=B.renderStreet(prepared),results=[];
for(const [id,state]of cases){const begin=performance.now(),out=B.renderStreet(prepared,state),renderMilliseconds=performance.now()-begin;save(id,out);const protectedMask=Uint8Array.from(out.influenceMask,v=>v?0:1),protect=B.comparePixels(reference,out,protectedMask);results.push({id,state,renderMilliseconds,renderExportAndScopeCheckMilliseconds:performance.now()-begin,protected:protect,stats:out.stats,pass:protect.changedPixels===0});if(id==='wall-blue'||id==='blue-signal-removed'||id==='signal-moved'){const crop={width:230,height:190,data:Buffer.alloc(230*190*4)};for(let y=0;y<190;y++)for(let x=0;x<230;x++){const i=((y+345)*out.width+x+140)*4,j=(y*230+x)*4;for(let c=0;c<4;c++)crop.data[j+c]=out.data[i+c];}save(id+'-detail',crop);}}
// Compare rendered CPU output against builder's independently produced baseline.
const expected=PNG.sync.read(fs.readFileSync(path.join(reportDirectory,'reference09.png'))),parity=B.comparePixels(reference,expected);
const json={schema:'crf.street_runtime.v0.9',elapsedMilliseconds:performance.now()-start,referenceParity:parity,cases:results,hiddenWallGroundTruthAvailable:false,photoMatteGroundTruthAvailable:false,interpretation:'Observed Gaussian editing; protected pixels are verified, estimated natural edges still require visual review.'};
fs.writeFileSync(path.join(reportDirectory,'runtime.json'),JSON.stringify(json,null,2)+'\n');
console.log(JSON.stringify({referenceParity:parity,cases:results.map(x=>({id:x.id,protectedChanges:x.protected.changedPixels,ms:x.renderMilliseconds})),totalMs:json.elapsedMilliseconds},null,2));
