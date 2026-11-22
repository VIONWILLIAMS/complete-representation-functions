/** Node execution adapter for exactly the browser's CRF09Tasks pipeline.
 * Credentials are accepted from stdin only. Full task checkpoints stay outside
 * the repository; published evidence is separately sanitized and contains no
 * embedded reference rasters or private model reasoning.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import CRF09 from '../web/crf-generative09.js';
import CRF08 from '../web/crf-gaussian08.js';
import Tasks from '../web/task-runner09.js';
import {generateNative09} from '../server/generative09.mjs';
import {researchGaussian08,learnSemanticDescriptors08} from '../server/learning08.mjs';
const require=createRequire(import.meta.url),{PNG}=require('pngjs');
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const PRIVATE_ROOT=path.resolve(ROOT,'..','crf09_runs');
export const DEFAULT_MODEL_PATH=path.join(ROOT,'web/assets/v09/shared-appearance.json');
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const safeName=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(value))throw new Error('Invalid experiment name');return value;};
export async function readJSON(file,fallback=null){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function writeJSON(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.tmp-'+randomBytes(4).toString('hex');await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n');await fs.rename(temporary,file);}
export async function commitAppearanceUpdate(modelPath,incoming){
 const lock=modelPath+'.update-lock';let handle=null;await fs.mkdir(path.dirname(modelPath),{recursive:true});
 for(let attempt=0;attempt<50;attempt++){try{handle=await fs.open(lock,'wx');break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
 if(!handle)throw new Error('Shared model is being updated; checkpoint retained for resume');
 try{const latest=await readJSON(modelPath),committed=latest?CRF09.learnAppearance(incoming.observations||[],{previousModel:latest}):incoming;committed.onlineUpdate={at:new Date().toISOString(),kind:'shared_statistics_only',previousModelId:latest?.id||null,preservedFunctionFamilies:Object.keys(latest?.functionFamilies||{}),generatorBasisRetrained:false};await writeJSON(modelPath,committed);return committed;}
 finally{await handle.close();await fs.unlink(lock);}
}
export function progress(value){console.log(JSON.stringify(value));}
export function args(argv=process.argv.slice(2)){
 const out={};for(let i=0;i<argv.length;i++){const v=argv[i];if(!v.startsWith('--'))throw new Error('Unexpected argument '+v);const key=v.slice(2);if(['resume','replan','prepare','run','help'].includes(key))out[key]=true;else{const value=argv[++i];if(value===undefined||value.startsWith('--'))throw new Error('Missing --'+key+' value');out[key]=value;}}
 return out;
}
export async function readCredential(){
 return new Promise((resolve,reject)=>{let text='',done=false;const stop=()=>{process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.off('error',error);};const error=e=>{if(done)return;done=true;stop();reject(e);};const end=()=>{if(!done)error(new Error('Credential input ended before a JSON line'));};const data=chunk=>{text+=chunk;if(text.length>8192){error(new Error('Credential input exceeded limit'));return;}const at=text.indexOf('\n');if(at<0)return;done=true;stop();try{const parsed=JSON.parse(text.slice(0,at));text='';if(typeof parsed.apiKey!=='string'||parsed.apiKey.length<12||parsed.apiKey.length>512||/\s/.test(parsed.apiKey))throw new Error('Missing runtime credential');resolve(parsed.apiKey);}catch(e){reject(e);}};process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stdin.on('end',end);process.stdin.on('error',error);});
}
function dataURL(value){if(typeof value!=='string')return null;const m=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);return m?{mime:m[1],bytes:Buffer.from(m[2],'base64')}:null;}
export function sanitized(value){
 if(typeof value==='string'){const image=dataURL(value);if(image)return{embeddedImageOmitted:true,mime:image.mime,bytes:image.bytes.length,sha256:sha256(image.bytes)};return value.replace(/sk-[A-Za-z0-9_-]{12,}/g,'[credential removed]');}
 if(Array.isArray(value))return value.map(sanitized);if(value&&typeof value==='object'){if(ArrayBuffer.isView(value))return{typedArrayOmitted:true,length:value.length,sha256:sha256(Buffer.from(value.buffer,value.byteOffset,value.byteLength))};const result={};for(const [key,v]of Object.entries(value)){if(['apiKey','api_key','authorization','reasoning_content','reasoning_text'].includes(key))continue;result[key]=sanitized(v);}return result;}return value;
}
export async function createFileStore(directory){
 if(path.resolve(directory).startsWith(path.resolve(ROOT)+path.sep))throw new Error('Full task store must be outside the source repository');
 const records=path.join(directory,'records'),binaries=path.join(directory,'binaries'),indexFile=path.join(directory,'index.json');await fs.mkdir(records,{recursive:true});await fs.mkdir(binaries,{recursive:true});let index=await readJSON(indexFile,{});
 async function externalize(value){const media=dataURL(value);if(media){const ext=media.mime.split('/')[1],file=sha256(media.bytes)+'.'+ext;await fs.writeFile(path.join(binaries,file),media.bytes);return{__crfDataURL:file,mime:media.mime};}if(Array.isArray(value))return await Promise.all(value.map(externalize));if(value&&typeof value==='object'){if(ArrayBuffer.isView(value))return Array.from(value);const out={};for(const [k,v]of Object.entries(value))out[k]=await externalize(v);return out;}return value;}
 async function restore(value){if(value&&typeof value==='object'&&typeof value.__crfDataURL==='string'){const name=value.__crfDataURL;if(!/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(name))throw new Error('Invalid checkpoint binary reference');return'data:'+value.mime+';base64,'+(await fs.readFile(path.join(binaries,name))).toString('base64');}if(Array.isArray(value))return await Promise.all(value.map(restore));if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value))out[k]=await restore(v);return out;}return value;}
 return{durable:true,directory,async set(key,value){const file=sha256(key)+'.json';const record=await externalize(value);await writeJSON(path.join(records,file),record);index[key]=file;await writeJSON(indexFile,index);},async get(key){const file=index[key];if(!file)return null;return restore(await readJSON(path.join(records,file)));},async keys(prefix=''){return Object.keys(index).filter(k=>k.startsWith(prefix));}};
}
const PYTHON=process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3';
async function pythonImage(bytes,script,argv=[],signal){
 return new Promise((resolve,reject)=>{let length=0,stderr='';const chunks=[];const p=spawn(PYTHON,['-c',script,...argv],{stdio:['pipe','pipe','pipe'],signal});p.stdout.on('data',chunk=>{length+=chunk.length;if(length>24*1024*1024){p.kill();reject(new Error('Image conversion output too large'));}else chunks.push(chunk);});p.stderr.on('data',chunk=>{stderr+=chunk.toString();if(stderr.length>2000)stderr=stderr.slice(-2000);});p.on('error',reject);p.on('close',code=>{if(code===0)resolve(Buffer.concat(chunks));else reject(new Error('Image conversion failed: '+stderr.slice(-500)));});p.stdin.on('error',()=>{});p.stdin.end(bytes);});
}
const DECODE=`from PIL import Image, ImageOps\nimport io,sys\nim=ImageOps.exif_transpose(Image.open(io.BytesIO(sys.stdin.buffer.read()))).convert('RGBA')\nn=int(sys.argv[1]);im.thumbnail((n,n),Image.Resampling.LANCZOS)\nim.save(sys.stdout.buffer,format='PNG')`;
const JPEG=`from PIL import Image\nimport io,sys\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')\nn=int(sys.argv[1]);im.thumbnail((n,n),Image.Resampling.LANCZOS)\nim.save(sys.stdout.buffer,format='JPEG',quality=int(sys.argv[2]),subsampling=0)`;
export async function jpegFromPNG(bytes,{maxSide=768,quality=88,signal}={}){return pythonImage(bytes,JPEG,[String(maxSide),String(quality)],signal);}
export async function decodeReference09(url,{signal,maxSide=192}={}){
 const image=dataURL(url);if(!image)throw new Error('Actual reference image bytes required');const png=await pythonImage(image.bytes,DECODE,[String(Math.min(512,maxSide))],signal),decoded=PNG.sync.read(png),jpeg=await jpegFromPNG(png,{maxSide,quality:86,signal});return{width:decoded.width,height:decoded.height,data:new Uint8ClampedArray(decoded.data),vision:'data:image/jpeg;base64,'+jpeg.toString('base64'),visionSha256:sha256(jpeg)};
}
export async function renderNative09(scene,model,{signal}={}){
 if(signal?.aborted)throw new Error('Cancelled');const started=Date.now(),image=CRF09.renderScene(scene,{model}),kernelMs=Date.now()-started;
 const png=PNG.sync.write({width:image.width,height:image.height,data:Buffer.from(image.data)}),jpeg=await jpegFromPNG(png,{maxSide:768,quality:90,signal});
 return{width:image.width,height:image.height,image:'data:image/jpeg;base64,'+jpeg.toString('base64'),png:'data:image/png;base64,'+png.toString('base64'),report:{...(image.diagnostics||{}),kernelMs,pixelSha256:sha256(Buffer.from(image.data)),pngSha256:sha256(png),renderer:'CRF09.renderScene',rendererVersion:CRF09.VERSION}};
}
export async function verifyProtocol(){const file=path.join(ROOT,'benchmarks/v09/protocol.json'),bytes=await fs.readFile(file),expected=(await fs.readFile(file+'.sha256','utf8')).trim(),actual=sha256(bytes);if(actual!==expected)throw new Error('Frozen protocol hash changed');return{protocol:JSON.parse(bytes),hash:actual};}
export async function createNodeRuntime({apiKey,runId,specId,kind='generation',modelPath=DEFAULT_MODEL_PATH,onEvent,fitBudget=1024,referenceSide=192,readOnlyModel=false}){
 safeName(runId);safeName(specId);const directory=path.join(PRIVATE_ROOT,kind,runId,specId),store=await createFileStore(directory),manifestPath=path.join(directory,'run.json');let activeModel=await readJSON(modelPath);
 const referenceRoot=path.join(ROOT,'fitting/learning09',runId,specId),reportRoot=path.join(ROOT,'reports/v09',kind,runId,specId);
 const api=async(route,body,{signal}={})=>{
  const options={apiKey,signal,timeoutMs:150000,maxTokens:12000,researchMaxTokens:3200};let result;
  if(route==='/api/crf/native/generate')result=await generateNative09(body,options);
  else if(route==='/api/crf/gaussian/research'){
   result=await researchGaussian08(body,options);await fs.mkdir(path.join(referenceRoot,'originals'),{recursive:true});
   const downloads=[];for(const image of result.images||[]){const media=dataURL(image.url);if(!media)continue;const hash=sha256(media.bytes),file=hash+'.'+media.mime.split('/')[1],target=path.join(referenceRoot,'originals',file);await fs.writeFile(target,media.bytes);downloads.push({...sanitized(image),file:path.relative(ROOT,target),sha256:hash,bytes:media.bytes.length});}
   await writeJSON(path.join(reportRoot,'round_'+String(body.round).padStart(2,'0')+'.search.json'),{...sanitized(result),downloads});
  }else if(route==='/api/crf/gaussian/describe'){result=await learnSemanticDescriptors08(body,options);await writeJSON(path.join(reportRoot,'round_'+String(body.round).padStart(2,'0')+'.vision.json'),sanitized(result));}
  else throw new Error('Unsupported task route '+route);
  if(result.ok===false){const e=new Error(result.error?.message||result.message||'Provider request failed');e.code=result.error?.code||'PROVIDER_FAILED';e.result=result;throw e;}return result;
 };
 const runner=Tasks.create({store,api,renderer:CRF09,getModel:async()=>{if(kind==='learning')activeModel=await readJSON(modelPath,activeModel);return activeModel;},setModel:async model=>{if(readOnlyModel)throw new Error('Terminal model is frozen');activeModel=await commitAppearanceUpdate(modelPath,model);await writeJSON(path.join(reportRoot,'shared_model_after.json'),activeModel);return activeModel;},decodeImage:async(url,opts)=>decodeReference09(url,{...opts,maxSide:referenceSide}),render:renderNative09,
  fitReference:async(pixels,{signal,id,onProgress}={})=>{const asset=await CRF08.fitImage(pixels,{id,budget:fitBudget,iterations:3,geometrySteps:8,signal,onProgress});const rendered=CRF08.renderAsset(asset),metrics=CRF08.calculateMetrics(pixels,rendered);const file=safeName(id.slice(0,100))+'.json';await writeJSON(path.join(referenceRoot,'fits',file),asset);return{asset,metrics,qualityTier:'preview',compositionEligible:false,representationScope:'observed_image_plane'};},
  onEvent:async(event,task)=>{const old=await readJSON(manifestPath,{});await writeJSON(manifestPath,{...old,taskId:task.id,status:task.status,stage:task.stage,updatedAt:task.updatedAt});progress({experiment:specId,runId,taskId:task.id,stage:event.stage,event:event.type,round:event.round,index:event.index,status:task.status,...(event.error?{error:sanitized(event.error)}:{})});await onEvent?.(event,task);}});
 return{runner,store,directory,manifestPath,reportRoot,referenceRoot,getModel:()=>activeModel};
}
export async function exportTrial({runtime,task,spec,protocolHash,runId,kind='generation'}){
 const reportDirectory=path.join(ROOT,'reports/v09',kind,runId,spec.id),publicDirectory=path.join(ROOT,'web/assets/v09/generated',runId);await fs.mkdir(reportDirectory,{recursive:true});await fs.mkdir(publicDirectory,{recursive:true});
 const previousRecord=await readJSON(path.join(reportDirectory,'record.json')),runnerHistory=[...(previousRecord?.additionalRunnerFailures||[])];if(previousRecord?.runnerFailure&&previousRecord.error&&!runnerHistory.some(r=>r.code===previousRecord.error.code&&r.at===previousRecord.error.at))runnerHistory.push({...previousRecord.error,kind:'previous_runner_or_export_failure',recoveredTaskEvidence:true});
 const frames=[];for(const candidate of task.candidates){if(candidate.status!=='rendered')continue;const output=await runtime.runner.getRender(task.id,candidate.index),png=dataURL(output?.png),jpg=dataURL(output?.image);if(!png||!jpg)throw new Error('Missing durable actual candidate image');const prefix='candidate_'+String(candidate.index).padStart(2,'0');await fs.writeFile(path.join(reportDirectory,prefix+'.jpg'),jpg.bytes);await fs.writeFile(path.join(reportDirectory,prefix+'.png'),png.bytes);await writeJSON(path.join(reportDirectory,prefix+'.scene.json'),{...candidate.scene,appearanceModel:task.modelSnapshot});frames.push({index:candidate.index,png:path.relative(ROOT,path.join(reportDirectory,prefix+'.png')),jpeg:path.relative(ROOT,path.join(reportDirectory,prefix+'.jpg')),render:output.report,semanticFromPlanner:candidate.constraints,semanticFrozen:Tasks.assessConstraints(candidate.scene,{constraints:spec.expectedConstraints||[]}),critique:sanitized(candidate.critique||null)});}
 const selected=task.selectedCandidate===null?null:task.candidates[task.selectedCandidate];let artifact=null;
 if(selected?.status==='rendered'){
  const output=await runtime.runner.getRender(task.id,selected.index),png=dataURL(output.png),thumbnail=await jpegFromPNG(png.bytes,{maxSide:560,quality:88}),scene={...selected.scene,appearanceModel:task.modelSnapshot};
  await fs.writeFile(path.join(publicDirectory,spec.id+'.png'),png.bytes);await fs.writeFile(path.join(publicDirectory,spec.id+'.jpg'),thumbnail);await writeJSON(path.join(publicDirectory,spec.id+'.scene.json'),scene);
  const base='assets/v09/generated/'+runId+'/'+spec.id;artifact={imageUrl:base+'.png',thumbnailUrl:base+'.jpg',sceneUrl:base+'.scene.json',reportUrl:base+'.record.json',width:output.width,height:output.height,pixelSha256:output.report.pixelSha256,modelId:task.modelSnapshot?.id||null,modelSha256:task.modelSnapshot?sha256(JSON.stringify(task.modelSnapshot)):null};
 }
 const record={schema:'crf.actual_generation_trial.v0.9',id:spec.id,title:spec.title,category:spec.category,prompt:spec.prompt,seed:spec.seed,protocolSha256:protocolHash,runId,taskId:task.id,status:task.status,stage:task.stage,error:task.error||null,completedAt:task.finishedAt||null,selection:{index:task.selectedCandidate,reason:task.selectionReason||null,independentReview:false},frameGate:{expected:[spec.width||1024,spec.height||768],actual:artifact?[artifact.width,artifact.height]:null,passed:!!artifact&&artifact.width===(spec.width||1024)&&artifact.height===(spec.height||768)},model:{id:task.modelSnapshot?.id||null,sha256:task.modelSnapshot?sha256(JSON.stringify(task.modelSnapshot)):null,sourceRGBEmbedded:task.modelSnapshot?.sourceRGBEmbedded??null,scope:task.modelSnapshot?.scope||null},candidates:frames,usage:sanitized(task.usage),apiOperations:sanitized(task.apiOperations),planningHistory:sanitized(task.planningHistory||[]),replanCount:task.replanCount||0,planEvidence:sanitized(task.planEvidence||null),learning:task.learning?{rounds:task.learning.rounds.length,sharedUpdate:task.learning.sharedUpdate,failures:task.learning.failures}:null,quality:task.quality||{releaseGate:'not_evaluated'},artifact,...(runnerHistory.length?{additionalRunnerFailures:runnerHistory}:{}),limits:['These are fixed showcase trials, not the unrun 180-task terminal benchmark.','Model critique is auxiliary; photoreal quality requires independent review.','Current renderer is a restricted procedural/statistical 2D Gaussian function generator.']};
 await writeJSON(path.join(reportDirectory,'record.json'),record);await writeJSON(path.join(reportDirectory,'task_evidence.json'),sanitized(task));await writeJSON(path.join(publicDirectory,spec.id+'.record.json'),record);return record;
}
export async function updateShowcaseIndex(runId,protocolHash){
 // Separate category processes publish disjoint cases. Serialize the complete
 // read + rebuild + atomic writes, not only the final rename. Old processes
 // loaded before this guard can still race; the final rebuild reads all records.
 safeName(runId);const lock=path.join(PRIVATE_ROOT,'index-locks','generated-gallery.lock');await fs.mkdir(path.dirname(lock),{recursive:true});let handle=null;
 for(let attempt=0;attempt<100;attempt++){try{handle=await fs.open(lock,'wx');break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
 if(!handle)throw new Error('Gallery index lock timed out; per-case artifacts retained; run rebuild_gallery09.mjs');
 try{
 const dir=path.join(ROOT,'reports/v09/generation',runId);let names=[];try{names=await fs.readdir(dir,{withFileTypes:true});}catch{}const records=[];for(const entry of names.filter(n=>n.isDirectory())){const r=await readJSON(path.join(dir,entry.name,'record.json'));if(r?.schema==='crf.actual_generation_trial.v0.9'&&r.runId===runId)records.push(r);}records.sort((a,b)=>a.id.localeCompare(b.id));
 const usage=records.flatMap(r=>r.usage||[]),requests=usage.flatMap(u=>u.requests||[]);const value={schema:'crf.generated_gallery.v0.9',runId,protocolSha256:protocolHash,updatedAt:new Date().toISOString(),status:'candidate_results_require_review',attemptedTasks:records.length,renderedTasks:records.filter(r=>r.artifact).length,failedTasks:records.filter(r=>r.status==='failed'||r.status==='cancelled').length,providerRequests:requests.length,totalTokens:usage.reduce((n,u)=>n+(u.total_tokens||0),0),examples:records.map(r=>({id:r.id,title:r.title,category:r.category,prompt:r.prompt,seed:r.seed,status:r.status,taskId:r.taskId,scope:'native_gaussian_function_generation',qualityGate:r.quality?.releaseGate||'not_evaluated',candidateCount:r.candidates.length,modelId:r.model.id,...(r.artifact||{}),error:r.error||null}))};
 await writeJSON(path.join(ROOT,'web/assets/v09/generated/index.json'),value);await writeJSON(path.join(ROOT,'reports/v09/generation',runId,'summary.json'),{...value,records});return value;
 }finally{await handle.close();await fs.unlink(lock);}
}
export async function recordRunnerFailure({spec,runId,protocolHash,error,kind='generation'}){
 const publicFile=path.join(ROOT,'web/assets/v09/generated',runId,spec.id+'.record.json'),reportFile=path.join(ROOT,'reports/v09',kind,runId,spec.id,'record.json'),previous=await readJSON(reportFile);
 const failure={at:new Date().toISOString(),code:error.code||'RUNNER_FAILED',message:sanitized(String(error.message||error))};
 const saved=await readSavedTrial09({runId,specId:spec.id,kind}),task=saved?.task;
 const record=previous?{...previous,...(task?{taskId:task.id,status:task.status,stage:task.stage,error:task.error||previous.error||null,usage:sanitized(task.usage),apiOperations:sanitized(task.apiOperations),taskError:task.error||null,planningHistory:sanitized(task.planningHistory||[]),replanCount:task.replanCount||0}:{}),additionalRunnerFailures:[...(previous.additionalRunnerFailures||[]),failure]}:{schema:'crf.actual_generation_trial.v0.9',id:spec.id,title:spec.title,category:spec.category,prompt:spec.prompt,seed:spec.seed,protocolSha256:protocolHash,runId,status:task?.status||'failed',stage:task?.stage||'export',taskId:task?.id||null,error:task?.error||failure,additionalRunnerFailures:task?[failure]:[],candidates:[],usage:sanitized(task?.usage||[]),apiOperations:sanitized(task?.apiOperations||[]),planningHistory:sanitized(task?.planningHistory||[]),replanCount:task?.replanCount||0,model:{id:task?.modelSnapshot?.id||null},quality:{releaseGate:'not_evaluated'},artifact:null,runnerFailure:true,artifactExportStatus:'failed',checkpointRecovered:!!task};
 await writeJSON(reportFile,record);await writeJSON(publicFile,record);if(kind==='generation')await updateShowcaseIndex(runId,protocolHash);return record;
}
export async function runOneTrial({apiKey,spec,runId,protocolHash,options={},kind='generation'}){
 const modelPath=options.model?path.resolve(ROOT,options.model):DEFAULT_MODEL_PATH,runtime=await createNodeRuntime({apiKey,specId:spec.id,runId,kind,modelPath,readOnlyModel:kind==='terminal'}),old=await readJSON(runtime.manifestPath);
 let task;if(old?.taskId){if(!options.resume)throw new Error('Trial already exists; use --resume or another --run-id.');if(old.protocolSha256!==protocolHash||old.promptSha256!==sha256(spec.prompt))throw new Error('Resume protocol/prompt mismatch');task=options.replan?await runtime.runner.replan(old.taskId,{reason:options['replan-reason']||'编译器能力描述修正：已有类型的照片真实感、纹理和阴影精度限制应保留为质量说明；signal 已有简化行人 glyph。重新核对必要对象和算子，真正未实现的语义仍必须明确拒绝。'}):await runtime.runner.resume(old.taskId);}
 else{if(options.replan)throw new Error('Replan requires an existing failed planning task');await writeJSON(runtime.manifestPath,{protocolSha256:protocolHash,promptSha256:sha256(spec.prompt),specId:spec.id,runId,modelPath:path.relative(ROOT,modelPath),createdAt:new Date().toISOString()});task=await runtime.runner.start({prompt:spec.prompt,category:spec.category,seed:spec.seed,learningPolicy:kind==='terminal'?'never':options.learning||'auto',budget:{maxCandidates:Number(options.candidates||3),maxQualityFeedback:Number(options.feedback??2),maxReferencePixels:192}});}
 const record=await exportTrial({runtime,task,spec,protocolHash,runId,kind});if(kind==='generation')await updateShowcaseIndex(runId,protocolHash);progress({experiment:spec.id,runId,status:task.status,renderedCandidates:record.candidates.length,selected:record.selection.index,error:record.error});return record;
}
export async function readSavedTrial09({runId,specId,kind='generation'}){
 safeName(runId);safeName(specId);const directory=path.join(PRIVATE_ROOT,kind,runId,specId),manifest=await readJSON(path.join(directory,'run.json'));if(!manifest?.taskId)return null;
 const store=await createFileStore(directory),task=await store.get('task:'+manifest.taskId);if(!task)return null;
 return{task,manifest,runtime:{store,runner:{getRender:async(id,index)=>store.get('render:'+id+':'+index)}}};
}
export {CRF09,CRF08,Tasks,PNG};
