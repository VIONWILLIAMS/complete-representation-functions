#!/usr/bin/env node
'use strict';
// The CLI and editor call the same Gaussian field implementation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function dependency(name) {
  try { return require(name); }
  catch (error) {
    if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
    return require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, name));
  }
}
const {PNG} = dependency('pngjs');
const C = require('../web/crf-core.js');
globalThis.window = globalThis;
require('../web/assets/scene-data.js');
const data = globalThis.CRF_SCENE_DATA;
const out = path.join(root, 'web', 'downloads');
fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(path.join(root, 'reports'), {recursive: true});
const initial = C.initialState(data);
const states = {};
const apply = ops => C.applyOperations(initial, ops);
states.reference = initial;
states.wall_blue = apply([{op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:.72}}]);
states.green = apply([{op:'set',id:'signal.main',path:'signalState',value:'go'}]);
states.left = apply([{op:'setCamera',values:{yaw:-7,pitch:0,zoom:1.055}}]);
states.right = apply([{op:'setCamera',values:{yaw:7,pitch:0,zoom:1.055}}]);
states.elevated = apply([{op:'setCamera',values:{yaw:1.5,pitch:6,zoom:1.08}}]);
states.prototype = apply([
  {op:'replace',id:'signal.main',prototype:'diamond'},
  {op:'set',id:'signal.main',path:'color',value:{tint:[241,171,45],amount:.9}}
]);
const movie = apply([{op:'setTimeline',timeline:{duration:3,tracks:[
  {id:'$camera',path:'yaw',interpolation:'smooth',keyframes:[{time:0,value:-4},{time:1.5,value:4},{time:3,value:-4}]},
  {id:'$camera',path:'pitch',interpolation:'smooth',keyframes:[{time:0,value:-.6},{time:1.5,value:.6},{time:3,value:-.6}]},
  {id:'$camera',path:'zoom',interpolation:'linear',keyframes:[{time:0,value:1.04},{time:3,value:1.04}]},
  {id:'signal.main',path:'signalState',interpolation:'step',keyframes:[{time:0,value:'observed'},{time:1.5,value:'go'},{time:3,value:'go'}]}
]}}]);
states.movie = movie;
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function writePNG(name, frame) {
  const filename = 'crf_street_0_4_'+name+'.png';
  const bytes = PNG.sync.write({width:frame.width,height:frame.height,data:Buffer.from(frame.rgba)}, {colorType:6});
  fs.writeFileSync(path.join(out,filename), bytes);
  return {file:filename,bytes:bytes.length,sha256:sha(bytes),...frame.stats};
}
const mode = process.argv[2] || 'stills';
if (mode === 'stills') {
  const items = [];
  for (const [name,state] of Object.entries(states)) {
    if (name === 'movie') continue;
    const quality = ['left','right','elevated'].includes(name) ? 'interactive' : 'exact';
    const frame = C.CPUrender(data,state,{quality,lod:1,time:null});
    items.push(writePNG(name,frame));
    console.log(JSON.stringify({name,elapsedMs:Math.round(frame.stats.elapsedMs),gaussians:frame.stats.gaussianCount,visibleInferredPixels:frame.stats.visibleInferredPixels}));
  }
  fs.writeFileSync(path.join(root,'reports','render_report.json'),JSON.stringify({schema:'crf.render_report.v0.4',rendererSha256:sha(fs.readFileSync(path.join(root,'web','crf-core.js'))),sourceDataSha256:sha(fs.readFileSync(path.join(root,'web','assets','scene-data.js'))),items},null,2)+'\n');
  fs.writeFileSync(path.join(out,'crf_street_0_4_states.json'),JSON.stringify({schema:'crf.example_states.v0.4',states},null,2)+'\n');
} else if (mode === 'frames') {
  const dir = path.join(root,'build','frames');
  fs.mkdirSync(dir,{recursive:true});
  const timings=[];
  for (let i=0;i<72;i++) {
    const frame=C.CPUrender(data,movie,{quality:'interactive',lod:1,time:i/24});
    const bytes=PNG.sync.write({width:frame.width,height:frame.height,data:Buffer.from(frame.rgba)},{colorType:6});
    fs.writeFileSync(path.join(dir,String(i).padStart(4,'0')+'.png'),bytes);
    timings.push(frame.stats.elapsedMs);
    if(i%12===0||i===71) console.log(JSON.stringify({completed:i+1,frames:72,elapsedMs:Math.round(frame.stats.elapsedMs)}));
  }
  fs.writeFileSync(path.join(root,'reports','video_render_report.json'),JSON.stringify({schema:'crf.video_render_report.v0.4',frameCount:72,fps:24,durationSeconds:3,sourceFrameSize:[667,1000],encodedSize:[668,1000],encodingNote:'One black rightmost padding column for H.264 yuv420p; no spatial rescaling of the 667 source columns.',quality:'interactive',lod:1,timingsMs:timings,timeline:movie.timeline,novelViews:'single-view inferred 2.5D surfaces, not recovered hidden physical geometry'},null,2)+'\n');
} else throw new Error('Usage: node scripts/render_deliverables.cjs [stills|frames]');
