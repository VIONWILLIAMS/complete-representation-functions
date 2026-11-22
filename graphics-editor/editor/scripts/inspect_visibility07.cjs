#!/usr/bin/env node
'use strict';
/* Geometric visibility of actual LLM programs. Never modifies input programs. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Renderer = require('../web/crf-radiance07.js');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] || 'refined';
if (!/^(initial|refined[0-9]*)$/.test(phase)) throw new Error('Use initial, refined, refined2, etc.');
const output = path.resolve(root, process.argv[3] || `reports/v07/object_visibility_diagnostic${phase === 'refined' ? '' : '_' + phase}.json`);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const options = {width:160, height:120, samples:1, bounces:1, denoise:false};
const targets = {
  citrus:['orange_large', 'orange_medium', 'orange_small'],
  ceramics:['window_glass', 'celadon_body', 'smoke_glass_ball', 'brass_ball']
};
const report = {
  schema:'crf.geometry_visibility_diagnostic.v0.7',
  phase,
  source:'actual_llm_programs',
  geometryDiagnosticOnly:true,
  photoQualityScore:false,
  rendererSha256:sha(fs.readFileSync(path.join(root, 'web/crf-radiance07.js'))),
  diagnosticScriptSha256:sha(fs.readFileSync(__filename)),
  renderOptions:options,
  method:{
    fullScene:'Render the actual saved program and count its first-hit object-ID map. Counts are camera geometry coverage, not final RGB segmentation.',
    isolatedFootprint:'In an in-memory clone, hide all other objects and remove area-light rectangles. Force the target visible; retain every object record/index, camera, transform, surface, image dimensions and seed. Count the same target ID.',
    ratio:'visiblePixels / isolatedFootprintPixels; null if the isolated footprint is empty.',
    sampling:'One deterministic jittered primary ray per pixel at 160 x 120. Source aperture and focus are preserved. One bounce suffices because IDs record the first geometric intersection.',
    maskEncoding:'One unsigned byte per pixel, row-major: 1 for this object ID and 0 otherwise. SHA256 hashes the exact mask bytes.',
    limitations:[
      'A transparent surface still receives the first-hit ID; this is not semantic visibility after transmission.',
      'An intentionally hidden object has zero full-scene coverage; declaredVisible is recorded separately.',
      'One sample and low resolution approximate the boundary; this is not a pixel-perfect full-resolution segmentation.',
      'Coverage does not measure realism, material quality, perceptual similarity, or fidelity to a photograph.',
      'No generated candidate is replaced, and no input program or renderer is modified.'
    ]
  },
  scenes:[]
};
function maskInfo(frame, index) {
  const mask = new Uint8Array(frame.ids.length);
  let count=0, minX=frame.width, minY=frame.height, maxX=-1, maxY=-1;
  for(let i=0;i<frame.ids.length;i++) if(frame.ids[i]===index) {
    mask[i]=1;count++;
    const x=i%frame.width, y=Math.floor(i/frame.width);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return {pixels:count, boundsInclusive:count?[minX,minY,maxX,maxY]:null, maskSha256:sha(mask)};
}
for(const [id, objectIds] of Object.entries(targets)) {
  const relative=`web/assets/v07/generated/${id}_${phase}.crf.json`;
  const file=path.join(root,relative), bytes=fs.readFileSync(file), program=JSON.parse(bytes);
  Renderer.assert(program);
  const full=Renderer.render(program, options);
  const scene={id, programSourceFile:relative, programFileSha256:sha(bytes), programCanonicalSha256:sha(JSON.stringify(program)), seed:program.seed, camera:program.camera, objects:[]};
  for(const objectId of objectIds) {
    const index=program.objects.findIndex(o=>o.id===objectId);
    if(index<0){scene.objects.push({id:objectId,status:'missing_from_program'});continue;}
    const visible=maskInfo(full,index);
    const isolated=JSON.parse(JSON.stringify(program));
    isolated.objects.forEach(o=>{o.visible=o.id===objectId;});
    isolated.lights=[];
    const footprint=maskInfo(Renderer.render(isolated,options),index);
    scene.objects.push({
      id:objectId,status:'measured',sourceObjectIndex:index,declaredVisible:program.objects[index].visible!==false,
      visiblePixels:visible.pixels, isolatedFootprintPixels:footprint.pixels,
      visibleFraction:footprint.pixels?Number((visible.pixels/footprint.pixels).toFixed(6)):null,
      visibleBoundsInclusive:visible.boundsInclusive,isolatedBoundsInclusive:footprint.boundsInclusive,
      visibleMaskSha256:visible.maskSha256,isolatedMaskSha256:footprint.maskSha256
    });
  }
  if(sha(fs.readFileSync(file))!==sha(bytes))throw new Error('Input file changed during diagnosis: '+relative);
  report.scenes.push(scene);
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:path.relative(root,output),rendererSha256:report.rendererSha256,geometryDiagnosticOnly:true,photoQualityScore:false,scenes:report.scenes.map(s=>({id:s.id,objects:s.objects.map(o=>({id:o.id,status:o.status,declaredVisible:o.declaredVisible,visiblePixels:o.visiblePixels,isolatedFootprintPixels:o.isolatedFootprintPixels,visibleFraction:o.visibleFraction}))}))},null,2));
