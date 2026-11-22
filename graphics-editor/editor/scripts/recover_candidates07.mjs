// Revalidate unchanged, previously charged provider output after the AST extension.
// This is a local language repair, not a new provider call or a fabricated HTTP success.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import Photo from '../web/crf-photo07.js';
import {normalizeInput,validateEnvelope} from '../server/deepseek07.mjs';
const candidates={citrus:'diagnostic_citrus_compose_b4c314c0-a4fb-4178-a973-65e42d788ca6.json',ceramics:'diagnostic_ceramics_schema_repair_ab62be28-2727-4374-a793-ba82f6ef0fcd.json'};
for(const [id,name] of Object.entries(candidates)){
 const base=`reports/v07/api_${id}_initial.json`,previous=JSON.parse(await fs.readFile(base,'utf8'));
 await fs.writeFile(`reports/v07/attempt3_api_${id}_initial.json`,JSON.stringify(previous,null,2)+'\n');
 const diagnostic=JSON.parse(await fs.readFile('reports/v07/'+name,'utf8')),candidate=JSON.parse(diagnostic.content);
 const before=JSON.stringify(candidate.program),result=await validateEnvelope(candidate,normalizeInput({prompt:previous.prompt,mode:'generate',search:false}),{validateProgram:Photo.validate});
 if(before!==JSON.stringify(result.program))throw new Error('Candidate mutated');
 const usage={...diagnostic.usage,previouslyCharged:true};
 const recovery={kind:'representation_extension',detail:'add/mul now accept 2–8 operands, evaluated by ordered left fold; 96-node/depth-12 limits preserved.',unchangedProgram:true,sourceDiagnostic:name,sourceRequestId:diagnostic.requestId,paidCallsThisStep:0,programSha256:crypto.createHash('sha256').update(before).digest('hex')};
 const response={ok:true,model:diagnostic.model,runId:diagnostic.runId,...result,research:previous.response.research,usage:{providerCalls:0,requests:[],previouslyChargedSource:usage},vision:{referenceImagesProvided:previous.response.research?.referenceImagesSubmitted||0,renderedImageProvided:false},validation:{renderer:true,declarative:true,recoveredAfterRepresentationExtension:true},recovery};
 const report={schema:'crf.api_acceptance.v0.7',recordedAt:new Date().toISOString(),id,phase:'initial',prompt:previous.prompt,endpoint:'local revalidation of unchanged recorded provider JSON',httpStatus:null,elapsedMs:0,inputImageProvided:false,recovery,response};
 await fs.writeFile(base,JSON.stringify(report,null,2)+'\n');
 await fs.writeFile(`web/assets/v07/generated/${id}_initial.crf.json`,JSON.stringify(result.program,null,2)+'\n');
 console.log(JSON.stringify({id,valid:true,objects:result.program.objects.length,sourceRequestId:diagnostic.requestId,paidCallsThisStep:0,unchangedProgram:true}));
}
