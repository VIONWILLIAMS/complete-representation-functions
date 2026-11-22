#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{PNG}=require('pngjs'),Photo=require('../web/crf-photo07.js');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){const key=args[i];if(key==='--raw'||key==='--help')options[key.slice(2)]=true;else if(['--program','--preset','--output','--width','--height','--samples','--bounces'].includes(key)){if(!args[i+1])throw new Error('Missing value for '+key);options[key.slice(2)]=args[++i];}else throw new Error('Unknown argument '+key);}
if(options.help){console.log('node scripts/run_program07.cjs --program scene.json --output image.png [--width 960 --height 720 --samples 48 --bounces 5 --raw]\nOr use --preset ceramics|citrus|interior|rainstreet.');process.exit(0);}
if(options.program&&options.preset)throw new Error('Choose a program file or a preset.');
const source=options.program?JSON.parse(fs.readFileSync(options.program,'utf8')):Photo.createPreset(options.preset||'ceramics');
const program=source.program||source;Photo.assert(program);
const width=Number(options.width||program.width),height=Number(options.height||Math.round(width*program.height/program.width)),samples=Number(options.samples||32),bounces=Number(options.bounces||5);
const frame=Photo.render(program,{width,height,samples,bounces,denoise:!options.raw});
const png=PNG.sync.write({width,height,data:Buffer.from(frame.rgba)}),output=path.resolve(options.output||'crf-image.png');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,png);
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const evidence={schema:'crf.cli_render.v0.7',programId:program.id,output,width,height,samples,bounces,denoise:!options.raw,pngSha256:sha(png),rgbaSha256:sha(frame.rgba),programSha256:sha(JSON.stringify(program)),stats:frame.stats};
fs.writeFileSync(output.replace(/\.png$/i,'')+'.render.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
