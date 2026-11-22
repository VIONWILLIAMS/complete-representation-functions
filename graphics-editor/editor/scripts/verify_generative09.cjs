#!/usr/bin/env node
/* Independent exported-program renders and bounded research evidence. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const G=require('../web/crf-generative09.js');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reports/v09/hypothesis03');
fs.mkdirSync(dir,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const model=JSON.parse(fs.readFileSync(path.join(root,'web/assets/v09/shared-appearance.json'))),results=[];
for(const scene of G.generateExamples(model)){
 const rendered=G.renderScene(scene),png=new PNG(rendered);png.data=Buffer.from(rendered.data);
 const bytes=PNG.sync.write(png),file=path.join(dir,scene.id+'.png'),program=path.join(dir,scene.id+'.scene.json');
 fs.writeFileSync(file,bytes);fs.writeFileSync(program,JSON.stringify(scene));
 const independent=G.renderScene(JSON.parse(fs.readFileSync(program)));
 results.push({id:scene.id,title:scene.title,category:scene.category,width:rendered.width,height:rendered.height,
   file:path.relative(root,file),program:path.relative(root,program),pixelSHA256:hash(rendered.data),fileSHA256:hash(bytes),
   independentExportRerenderIdentical:hash(rendered.data)===hash(independent.data),diagnostics:rendered.diagnostics});
 console.log(JSON.stringify({id:scene.id,renderMs:rendered.diagnostics.elapsedMs,pixels:rendered.width*rendered.height}));
}
const legacyExperiments=[['H1','reports/v09/core-preview','hand-authored statistical Gaussian field baseline; no learned model'],['H2','reports/v09/hypothesis02','shared Gaussian-band moments and canonical Gaussian mean/PCA, before structural H3 refinements']].map(([id,folder,description])=>({id,description,earlierSourceSnapshotAvailable:false,
 outputs:fs.readdirSync(path.join(root,folder)).filter(f=>f.endsWith('.png')).map(f=>{const file=path.join(root,folder,f),bytes=fs.readFileSync(file),im=PNG.sync.read(bytes);return{file:path.relative(root,file),width:im.width,height:im.height,sha256:hash(bytes)};})}));
const report={schema:'crf.generative_core_verification.v0.9',version:G.VERSION,sourceSHA256:hash(fs.readFileSync(path.join(root,'web/crf-generative09.js'))),modelId:model.id,
  modelSHA256:hash(fs.readFileSync(path.join(root,'web/assets/v09/shared-appearance.json'))),actualReferenceCount:model.allObservationCount,trainingObservationCount:model.sourceCount,
  canonicalFruitBasis:{trainingCount:model.functionFamilies.fruit_skin.trainingCount,rank:model.functionFamilies.fruit_skin.rank,gaussians:model.functionFamilies.fruit_skin.mean.length,
   learnedShapeApplied:false,reason:'Only one valid orange silhouette survived screening; runtime requires at least two same-class samples.'},
  experiments:[...legacyExperiments,{id:'H3',description:'shared illumination, analytic normal/silhouette refinement, softbox response, attachment visibility, tree/shore grounding; canonical coefficient family retained',outputs:results}],
  results,
  observedLimitations:['Generated images remain procedural illustrations by visual inspection; no independent photoreal blind evaluation has passed.',
    'Held-out Gaussian-band error did not improve overall; shared basis texture is trained on five heterogeneous fruit observations.',
    'Gaussian coefficients are learned; geometry remains mostly hand-authored. Camera is image-plane depth-layer parallax, not recovered geometry.',
    'H1/H2 images are retained but historical source snapshots were not separately frozen; H3 outputs include exact executable programs and model.'],
  gates:{deterministicExportReconstruction:results.every(r=>r.independentExportRerenderIdentical),nativeNewPixels:true,sharedParametersLearned:true,
    fullP3Passed:false,G2PhotorealismPassed:false,referencePixelReconstructionNotAssessed:true},
  selection:'All eight predefined core examples retained; no success filtering; coast/forest were added as actual distinct H3 terrain functions'};
fs.writeFileSync(path.join(root,'reports/v09/generative_core_verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.gates));
