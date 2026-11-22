#!/usr/bin/env node
'use strict';
// Public headless entry point: the same scene evaluator as the editor.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const Core=require('../web/crf-program.js'),Renderer=require('../web/crf-program-renderer.js');
function help(){console.log(`CRF 0.6 scene-program renderer

node scripts/run_program06.cjs --program scene.json --output image.png
node scripts/run_program06.cjs --program scene.json --output side.png --time 2.5
node scripts/run_program06.cjs --program scene.json --sequence frames --fps 24 --duration 5
node scripts/run_program06.cjs --preset common --output example.png

Options: --width 960 --height 720 --quality final|preview
Programs are declarative JSON. Rendering never executes JavaScript from them.
For a program collection, also specify --scene common.
`);}
function main(){
  const args=process.argv.slice(2),o={};
  if(args.includes('--help')||args.includes('-h'))return help();
  const allowed=new Set(['program','output','sequence','fps','duration','width','height','quality','time','preset','scene']);
  for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Invalid argument: '+args[i]);o[key]=args[i+1];}
  if(Boolean(o.program)===Boolean(o.preset))throw new Error('Choose exactly one of --program or --preset.');
  if(Boolean(o.output)===Boolean(o.sequence))throw new Error('Choose exactly one of --output or --sequence.');
  let p;
  if(o.program){if(fs.statSync(o.program).size>24*1024*1024)throw new Error('Program exceeds 24 MiB.');p=JSON.parse(fs.readFileSync(o.program,'utf8'));if(p.schema==='crf.program_collection.v0.6'){if(!o.scene||!p.programs[o.scene])throw new Error('A collection requires a valid --scene name.');p=p.programs[o.scene];}}
  else{require('../web/assets/v06/observed-fruit.js');p=require('../web/crf-scenes06.js').create(o.preset);}
  Core.assert(p);
  const width=Number(o.width||p.width),height=Number(o.height||p.height),quality=o.quality||'final';
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096||width*height>8000000)throw new Error('Invalid output dimensions.');
  if(!['preview','final'].includes(quality))throw new Error('Invalid quality.');
  const records=[];
  function write(time,file,index){
    const start=Date.now(),frame=Renderer.render(p,{width,height,quality,time});
    const png=new PNG({width,height});png.data=Buffer.from(frame.rgba);const bytes=PNG.sync.write(png);
    fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,bytes);
    records.push({index,time,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),elapsedMs:Date.now()-start,stats:frame.stats});
  }
  if(o.sequence){
    const fps=Number(o.fps||24),duration=Number(o.duration||p.timeline.duration),count=Math.round(fps*duration);
    if(!Number.isInteger(fps)||fps<1||fps>60||!Number.isFinite(duration)||duration<=0||duration>p.timeline.duration||count>1800||Math.abs(count-fps*duration)>1e-6)throw new Error('Sequence needs an integer frame count, fps 1..60, and duration within the scene timeline.');
    fs.mkdirSync(o.sequence,{recursive:true});
    for(let i=0;i<count;i++){write(i/fps,path.join(o.sequence,String(i).padStart(4,'0')+'.png'),i);if(i%12===0)process.stderr.write(`Rendered ${i+1}/${count}\n`);}
    fs.writeFileSync(path.join(o.sequence,'render_manifest.json'),JSON.stringify({schema:'crf.cli_render.v0.6',width,height,fps,duration,frameCount:count,records},null,2));
  }else{const time=o.time===undefined?null:Number(o.time);if(time!==null&&(!Number.isFinite(time)||time<0||time>p.timeline.duration))throw new Error('Invalid --time.');write(time,o.output,0);}
  console.log(JSON.stringify({schema:'crf.cli_result.v0.6',program:p.id,width,height,frameCount:records.length,files:records.map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256}))},null,2));
}
try{main();}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
