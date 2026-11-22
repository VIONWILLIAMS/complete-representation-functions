#!/usr/bin/env node
'use strict';
/** Re-create the full recorded candidate history without keeping duplicate PNGs. */
const fs=require('node:fs'),path=require('node:path');
const {writeRender}=require('./render_v09.cjs');
const ROOT=path.resolve(__dirname,'..');
function local(file){if(typeof file!=='string'||file.includes('://'))throw new Error('Local candidate path required');const result=path.resolve(ROOT,file);if(!result.startsWith(ROOT+path.sep))throw new Error('Candidate path outside kit root');return result;}
function main(argv){
 if(argv.length<2||argv.includes('--help')){console.log('node scripts/render_candidates09.cjs CANDIDATES.json candidate_outputs');return;}
 const index=JSON.parse(fs.readFileSync(path.resolve(argv[0]),'utf8')),target=path.resolve(argv[1]);
 if(index.schema!=='crf.candidate_index.v0.9'||!Array.isArray(index.candidates)||!index.candidates.length)throw new Error('Invalid candidate index');
 const results=[];for(const entry of index.candidates){
  if(typeof entry.id!=='string'||!/^[-a-zA-Z0-9_.]+$/.test(entry.id))throw new Error('Unsafe candidate ID');
  if(typeof entry.expectedPixelSha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.expectedPixelSha256))throw new Error('Each candidate requires its recorded 64-character RGBA SHA-256');
  const scene=JSON.parse(fs.readFileSync(local(entry.scenePath),'utf8'));
  if(!Object.hasOwn(scene,'appearanceModel'))throw new Error('Candidate must embed its exact model, including null');
  const report=writeRender(scene,path.join(target,entry.id+'.png'));
  const match=report.rgbaSHA256===entry.expectedPixelSha256;
  results.push({id:entry.id,caseId:entry.caseId,candidateIndex:entry.candidateIndex,...report,recordedPixelSHA256:entry.expectedPixelSha256??null,exactRecordedRGBAMatch:match});
 }
 fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'candidate-render-reports.json'),JSON.stringify(results,null,2)+'\n');
 const compared=results.filter(x=>x.exactRecordedRGBAMatch!==null),mismatches=compared.filter(x=>!x.exactRecordedRGBAMatch);
 console.log(JSON.stringify({schema:'crf.candidate_rerender.v0.9',count:results.length,compared:compared.length,mismatches:mismatches.map(x=>x.id),reports:results}));
 if(mismatches.length)process.exitCode=2;
}
if(require.main===module)try{main(process.argv.slice(2));}catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
module.exports={main};
