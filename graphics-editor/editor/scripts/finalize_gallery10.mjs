/** Publish reproducible outputs and compact evidence; never invent a result. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {jpegFromPNG,sanitized} from './experiment_runtime09.mjs';
import {createBinaryStore10} from './storage10.mjs';
const root=path.resolve(import.meta.dirname,'..'),web=path.join(root,'web');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const write=async(p,data)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n');};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const wanted=['fruit_trio','ceramic_citrus','orchard_duet','mist_lake','ochre_window'],all=[],latest=new Map();
for(const run of ['showcase-v1','repair-v2','polish-v3'])for(const id of wanted){
 const dir=path.join(root,'reports/v10/generation',run,id);let r;try{r=await read(path.join(dir,'record.json'));}catch{continue;}
 const store=await createBinaryStore10(path.join(root,'..','crf10_runs',run,id)),task=await store.get('task:'+r.taskId);
 if(task){r.apiOperations=sanitized(task.apiOperations);r.unresolvedProviderAttempts=task.apiOperations.filter(o=>['inflight','interrupted_outcome_unknown','cancelled_outcome_unknown'].includes(o.status)).length;r.usageComplete=r.unresolvedProviderAttempts===0&&r.usage.every(u=>u.usageComplete!==false);}
 if(r.artifact){
  const base='assets/v10/generated/'+run+'/'+id;
  for(const c of r.candidates){
   const file=path.join(dir,'candidate_'+c.index+'.png');let png;try{png=await fs.readFile(file);}catch{continue;}
   c.imageUrl=base+'.candidate_'+c.index+'.jpg';c.sceneUrl=base+'.candidate_'+c.index+'.scene.json';
   await write(path.join(web,c.imageUrl),await jpegFromPNG(png,{maxSide:320,quality:80}));
   await write(path.join(web,c.sceneUrl),await read(path.join(dir,'candidate_'+c.index+'.scene.json')));
  }
  await write(path.join(web,r.artifact.reportUrl),r);
  const evaluated=r.candidates.find(c=>c.index===r.selectedCandidate)?.critique;
  if(evaluated||!latest.has(id))latest.set(id,r);
 }
 await write(path.join(dir,'record.json'),r);all.push({run,...r});
}
const cases=wanted.filter(id=>latest.has(id)).map(id=>{const r=latest.get(id);const sourceUrls=[...new Set(r.assets.map(a=>a.provenance?.source?.sourceUrl||a.provenance?.sourceUrl).filter(Boolean))];return{id:r.id,title:r.title,kind:'gaussian',...r.artifact,subtitle:r.scope==='reference_reconstruction_edit'?'参考高斯重建 · 光色编辑':'DeepSeek 编排 · 观测物品新组合',scope:r.scope,modelTraining:false,sourceUrl:sourceUrls[0]||null,sourceUrls};});
await write(path.join(web,'assets/v10/kernel-evidence.json'),await read(path.join(root,'reports/v10/kernel/evidence-summary.json')));
cases.push({id:'street_kernel10',title:'街景 · 新内核兼容对照',kind:'gaussian',assetUrl:'assets/v08/gaussians/street.optimized.json',imageUrl:'assets/v08/gaussians/street.optimized.png',reportUrl:'assets/v10/kernel-evidence.json',referenceUrl:'assets/reference.png',subtitle:'旧参数迁移 · 新旧求值像素一致',scope:'legacy_gaussian_compatibility_not_original_photo_exact'});
await write(path.join(web,'assets/v10/gallery.json'),{schema:'crf.gallery.v0.10',modelTraining:false,at:new Date().toISOString(),cases});
const summary={schema:'crf.release_evidence.v0.10',at:new Date().toISOString(),publishedCases:cases.length,newDeepSeekCases:cases.length-1,realExecutedTasks:all.length,recordedProviderRequests:all.reduce((n,r)=>n+r.usageTotals.providerRequests,0),unresolvedProviderAttempts:all.reduce((n,r)=>n+(r.unresolvedProviderAttempts||0),0),reportedTokens:all.reduce((n,r)=>n+r.usageTotals.tokens,0),modelTraining:false,sharedModelUnchanged:all.every(r=>r.sharedModelBefore===r.sharedModelAfter),selected:cases.filter(c=>latest.has(c.id)).map(c=>{const r=latest.get(c.id);return{id:c.id,title:c.title,status:r.status,stopReason:r.stopReason,selectedCandidate:r.selectedCandidate,candidates:r.candidates.length,allCandidatesEvaluated:r.quality.allCandidatesEvaluated,quality:r.quality,scores:r.candidates.find(x=>x.index===r.selectedCandidate)?.critique?.scores,record:c.reportUrl,output:c.imageUrl,scope:c.scope};}),history:all.map(r=>({run:r.run,id:r.id,status:r.status,candidates:r.candidates.length,stopReason:r.stopReason,requests:r.usageTotals.providerRequests,reportedTokens:r.usageTotals.tokens,unresolvedProviderAttempts:r.unresolvedProviderAttempts||0})),limits:['Reference-derived composition is not novel-image synthesis from a learned visual prior.','The photo-level release gate has not passed independent human review.','Interrupted provider attempts, if reported, have unknown usage and are excluded from known token totals.','The 8192-point street fitting quality regressed; legacy observation compatibility avoids replacing the better asset.']};
await write(path.join(root,'reports/v10/release_evidence.json'),summary);
await write(path.join(web,'assets/v10/acceptance.json'),summary);
const links=[];for(const c of cases)for(const k of ['imageUrl','thumbnailUrl','sceneUrl','assetUrl','reportUrl','referenceUrl'])if(c[k])links.push(c[k]);for(const u of links){const b=await fs.readFile(path.join(web,u));if(!b.length)throw new Error('Empty artifact '+u);}
await write(path.join(root,'reports/v10/artifact_integrity.json'),{schema:'crf.artifact_integrity.v0.10',files:await Promise.all([...new Set(links)].map(async url=>{const b=await fs.readFile(path.join(web,url));return{url,bytes:b.length,sha256:hash(b)};}))});
console.log(JSON.stringify(summary,null,2));
