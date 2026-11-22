#!/usr/bin/env node
/* Deterministic native code render. No external image assets are sampled. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),Photo=require('../web/crf-photo07.js');
const root=path.resolve(__dirname,'..');
const [source='live',phase='initial',ids='ceramics,interior,rainstreet,citrus',widthArg='640',samplesArg='24']=process.argv.slice(2);
const width=Number(widthArg),height=Math.round(width*.75),samples=Number(samplesArg);
const outDir=path.join(root,source==='live'?'build/v07_live':'web/media/v07');fs.mkdirSync(outDir,{recursive:true});
for(const id of ids.split(',')){
 const program=source==='live'?JSON.parse(fs.readFileSync(path.join(root,`web/assets/v07/generated/${id}_${phase}.crf.json`),'utf8')):Photo.createPreset(id);
 const start=Date.now(),frame=Photo.render(program,{width,height,samples,bounces:5,denoise:true});
 const png=PNG.sync.write({width:frame.width,height:frame.height,data:Buffer.from(frame.rgba)});
 const name=source==='live'?`${id}_${phase}`:`${id}_showcase`;
 fs.writeFileSync(path.join(outDir,name+'.png'),png);
 const meta={schema:'crf.render_evidence.v0.7',id,source,phase,width:frame.width,height:frame.height,samples,elapsedMs:Date.now()-start,sha256:crypto.createHash('sha256').update(png).digest('hex'),programSha256:crypto.createHash('sha256').update(JSON.stringify(program)).digest('hex'),rendererSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'web/crf-radiance07.js'))).digest('hex'),stats:frame.stats};
 fs.writeFileSync(path.join(outDir,name+'.json'),JSON.stringify(meta,null,2)+'\n');
 console.log(JSON.stringify(meta));
}
