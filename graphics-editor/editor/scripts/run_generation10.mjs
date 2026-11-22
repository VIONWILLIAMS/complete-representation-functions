/** Actual DeepSeek -> CRF10 task runner -> CRF10 Gaussian evaluator -> image
 * review. Same modules as studio10; source photos are never blitted at render.
 * This evaluates reference-derived composition, not a learned image generator.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import G from '../web/crf-gaussian10.js';
import V from '../web/crf-verifier10.js';
import Tasks from '../web/task-runner10.js';
import {generateNative10} from '../server/generative10.mjs';
import {createBinaryStore10} from './storage10.mjs';
import {jpegFromPNG,sanitized,PNG} from './experiment_runtime09.mjs';
const ROOT=path.resolve(import.meta.dirname,'..');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const write=async(p,v)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v,null,2)+'\n');};
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const args=process.argv.slice(2),selected=args.includes('--case')?args[args.indexOf('--case')+1]:'all';
const runId=args.includes('--run-id')?args[args.indexOf('--run-id')+1]:'showcase-v1';
const effort=args.includes('--effort')?args[args.indexOf('--effort')+1]:null;
const polish=args.includes('--polish');
if(effort&&!['high','max'].includes(effort))throw new Error('Invalid reasoning effort');
if(!/^[a-z0-9_-]{1,60}$/.test(runId))throw new Error('Invalid run id');
let apiKey='';const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});for await(const line of rl){apiKey=JSON.parse(line).apiKey||'';rl.close();break;}
if(!apiKey)throw new Error('Credential required on stdin');
const objectFiles=['apple','pear','orange','ceramic'];
const frames=['mist_lake','ochre_window'];
const assetUrls={};const library={};
for(const name of objectFiles){const url='assets/v10/objects/'+name+'.json',a=await read(path.join(ROOT,'web',url));assetUrls[a.id]=url;library[a.id]=a;}
for(const name of frames){const url='assets/v10/frames/'+name+'.json',a=await read(path.join(ROOT,'web',url));assetUrls[a.id]=url;library[a.id]=a;}
const frozenPath=path.join(ROOT,'web/assets/v09/shared-appearance.json'),frozenBefore=hash(await fs.readFile(frozenPath));
const obj=(id,assetId,x,y,scale=1,other={})=>({id,assetId,label:id,x,y,scaleX:scale,scaleY:scale,rotation:0,opacity:1,visible:true,zIndex:1,exposure:0,albedoTint:[1,1,1],illuminationGradient:[0,0],preserveHighlights:true,shadow:{strength:.28,spread:.35,dx:.05,dy:0,squash:.06},...other});
const specs=[
 {id:'fruit_trio',title:'果实的三种颜色',category:'still_life',width:1024,height:768,background:[226,231,226],objects:[obj('apple','apple',210,350,.95),obj('pear','pear',445,225,.92),obj('orange','orange',673,408,.94)],prompt:'生成一幅克制的水果静物：一个红苹果、一个黄绿色梨、一个橙子切面，横向疏密有致。灰绿色纯色背景，物体保持真实原有纹理，合理接触阴影，不漂浮；保留apple、pear、orange标识。不生成任何额外道具。输出1024×768，只编排现有高斯物品。'},
 {id:'ceramic_citrus',title:'青釉与柑橘',category:'still_life',width:1024,height:768,background:[207,214,213],objects:[obj('ceramic','ceramic',382,193,1.12),obj('orange','orange',570,443,.88)],prompt:'生成一幅极简陶瓷静物：一个青釉花瓶和一个橙子切面。花瓶偏左、橙子偏右，青灰色纯色背景，接触地面合理，阴影轻柔，照片原有釉面高光和橙子细节清晰。保留ceramic、orange标识。输出1024×768，不加不存在的物体，不声称恢复新视角。'},
 {id:'orchard_duet',title:'暗调果实静物',category:'still_life',width:1024,height:768,background:[48,55,52],objects:[obj('apple','apple',315,361,.95,{exposure:-.3,shadow:{strength:.4,spread:.35,dx:.1,dy:0,squash:.07}}),obj('pear','pear',541,241,.88,{exposure:-.25})],prompt:'生成暗调双果静物：一个红苹果在左，一个黄绿色梨在右。深灰绿色纯色背景。合理距离与接触阴影，保留真实皮肤纹理和中性高光；只轻微压低曝光，不改变原照片方向性。苹果和梨的标识为apple、pear。输出1024×768，主体不能被画框截断。'},
 {id:'mist_lake',title:'雾湖 · 晨光变体',category:'landscape',frame:'frame.mist_lake',prompt:'基于已有雾湖高斯照片函数生成轻微晨光变体：保留全部山脉、湖岸、倒影结构，保持原宽高和完整画面，曝光约增加0.08EV，色调稍暖，禁止新增物体、虚构新视角或改变地貌。这是一张参考重建的光色编辑结果，不是从零生成新的风景。唯一对象ID为frame。'},
 {id:'ochre_window',title:'赭黄墙面 · 柔和光色',category:'architecture',frame:'frame.ochre_window',prompt:'基于已有黄色墙面与阳台的高斯照片函数，生成轻微光色编辑：保留墙面颗粒、阳台栏杆、窗框及所有几何结构。保持原画幅，略降低过强黄色饱和感，可使用小幅反射率乘数与曝光约-0.05EV，不能涂成另一张照片。唯一对象ID为frame。这是参考重建变体，不是新视角。'}
];
function summaryFor(a){
 const isFrame=a.id.startsWith('frame.');const info=G.alphaArray(a);let x0=a.width,y0=a.height,x1=0,y1=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(info[y*a.width+x]>127){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 return{id:a.id,label:({apple:'红苹果',pear:'黄绿色梨',orange:'橙子切面',ceramic:'青釉陶瓷花瓶'})[a.id]||a.id,width:a.width,height:a.height,role:isFrame?'reference-frame':'object',visibleBounds:[x0,y0,x1+1,y1+1],contactPoint:[(x0+x1)/2,y1+1],sourceKind:'observed_photo_gaussian',limitations:'源照片外观由显式高斯参数拟合，继承原光照与视角；没有隐藏几何。'+(a.id==='apple'?'原苹果右边曾受梨遮挡，不能补出不可见部分。':'')};
}
function lite(scene){const s={...scene};delete s.assets;delete s.appearanceModel;delete s.assetUrls;return s;}
async function render(scene,model,{signal}={}){
 if(signal?.aborted)throw new Error('Cancelled');const r=G.renderScene(scene,{filter:'mip',coverage:true});
 const png=PNG.sync.write({width:r.width,height:r.height,data:Buffer.from(r.data)}),jpg=await jpegFromPNG(png,{maxSide:768,quality:92,signal});
 return{...r,image:'data:image/jpeg;base64,'+jpg.toString('base64'),png:'data:image/png;base64,'+png.toString('base64'),report:{...r.diagnostics,pixelSha256:hash(Buffer.from(r.data)),pngSha256:hash(png)}};
}
async function run(spec){
 const dir=path.join(ROOT,'reports/v10/generation',runId,spec.id),privateDir=path.join(ROOT,'..','crf10_runs',runId,spec.id),publicDir=path.join(ROOT,'web/assets/v10/generated',runId);
 await fs.mkdir(dir,{recursive:true});const store=await createBinaryStore10(privateDir);
 const ids=spec.frame?[spec.frame]:[...new Set(spec.objects.map(o=>o.assetId))],assets=Object.fromEntries(ids.map(id=>[id,library[id]]));
 const frame=spec.frame?assets[spec.frame]:null,width=frame?.width||spec.width,height=frame?.height||spec.height;
 let currentScene={schema:G.SCENE_SCHEMA,id:spec.id,title:spec.title,width,height,background:spec.background||[0,0,0],objects:spec.frame?[obj('frame',spec.frame,0,0,1,{shadow:undefined,preserveHighlights:false})]:spec.objects,assets};
 let priorRecord=null;
 if(polish){for(const run of [spec.id==='fruit_trio'?'repair-v2':'showcase-v1']){priorRecord=await read(path.join(ROOT,'reports/v10/generation',run,spec.id,'record.json'));const existing=await read(path.join(ROOT,'web',priorRecord.artifact.sceneUrl));delete existing.assetUrls;currentScene={...existing,assets};}}
 const taskPrompt=spec.prompt+(polish?'\n本轮是在已生成图像上继续打磨。前次实际图像审阅发现：'+JSON.stringify(priorRecord.candidates.find(c=>c.index===priorRecord.selectedCandidate)?.critique?.issues||[])+'。优先改善现有算子可以改善的阴影、构图和轮廓；本轮真实感建议门槛提高到4.5/5，仍需独立评审，不得为通过编造高分。保留全部必需对象。':'');
 const summaries=ids.map(id=>summaryFor(assets[id]));
 const contract=V.createContract({id:'fixed-'+spec.id,width,height,representation:'reference_gaussian',realismThreshold:polish?4.5:4,checks:currentScene.objects.flatMap(o=>[{id:'visible.'+o.id,kind:'pixel',type:'visible_coverage',required:true,objectId:o.id,minimumPixels:500},{id:'count.'+o.id,kind:'declaration',type:'declaration',required:true,constraint:{type:'count',subject:o.assetId,value:1}}])});
 const initial=await render(currentScene,null);await write(path.join(dir,'initial.png'),Buffer.from(initial.png.split(',')[1],'base64'));
 const runner=Tasks.create({store,renderer:G,render,capabilities:{operations:['layout','albedo_tint','exposure','illumination_gradient','preserve_highlights_heuristic','mip_filter','contact_shadow_2d']},
  api:async(route,body,{signal}={})=>{if(route!=='/api/crf/native10/generate')throw new Error('Unexpected API');const r=await generateNative10({...body,...(['generate','edit'].includes(body.mode)&&!body.image?{image:initial.image}: {})},{apiKey,signal,timeoutMs:180000,maxTokens:18000});if(!r.ok){const e=new Error(r.error?.message||'Provider failed');e.code=r.error?.code;e.result=r;throw e;}return r;},
  onEvent:async(event,state)=>{if(['api_started','api_completed','candidate_verified','task_ready','api_failed'].includes(event.type))console.log(JSON.stringify({case:spec.id,...event}));await write(path.join(privateDir,'manifest.json'),{id:state.id,status:state.status,stage:state.stage});},
  onCandidate:async(candidate,output)=>{await write(path.join(dir,'candidate_'+candidate.index+'.png'),Buffer.from(output.png.split(',')[1],'base64'));await write(path.join(dir,'candidate_'+candidate.index+'.scene.json'),{...lite(candidate.scene),assetUrls:Object.fromEntries(ids.map(id=>[id,assetUrls[id]]))});await write(path.join(dir,'candidate_'+candidate.index+'.evidence.json'),{index:candidate.index,critique:sanitized(candidate.critique),verification:candidate.verification,render:output.report});}
 });
 let old;try{old=await read(path.join(privateDir,'manifest.json'));}catch{}
 const task=old?.id?await runner.resume(old.id,effort?{reasoningEffort:effort,reason:'Explicit recovery of missing evaluation after max output truncation; reuse saved scene and frame.'}:{}):await runner.start({prompt:taskPrompt,mode:polish?'edit':'generate',representation:'reference_gaussian',category:spec.category,currentScene,assetSummary:summaries,reasoningEffort:effort||'max',contract,budget:{maxCandidates:polish?3:6,maxQualityFeedback:polish?2:5,maxStagnantCandidates:6,maxTotalTokens:250000},seed:1700+specs.indexOf(spec)});
 let artifact=null;const chosen=task.candidates.find(c=>c.index===task.selectedCandidate);
 if(chosen){
  const output=await runner.getRender(task.id,chosen.index),bytes=Buffer.from(output.png.split(',')[1],'base64'),jpg=await jpegFromPNG(bytes,{maxSide:560,quality:89});
  const base='assets/v10/generated/'+runId+'/'+spec.id;
  await write(path.join(publicDir,spec.id+'.png'),bytes);await write(path.join(publicDir,spec.id+'.jpg'),jpg);
  await write(path.join(publicDir,spec.id+'.scene.json'),{...lite(chosen.scene),assetUrls:Object.fromEntries(ids.map(id=>[id,assetUrls[id]]))});
  artifact={imageUrl:base+'.png',thumbnailUrl:base+'.jpg',sceneUrl:base+'.scene.json',reportUrl:base+'.report.json',width:output.width,height:output.height,pixelSha256:hash(Buffer.from(output.data))};
 }
 const record={schema:'crf.actual_generation_trial.v0.10',id:spec.id,title:spec.title,category:spec.category,prompt:taskPrompt,polish,predecessor:priorRecord?{taskId:priorRecord.taskId,selectedCandidate:priorRecord.selectedCandidate,artifact:priorRecord.artifact}:null,representation:'reference_gaussian',scope:spec.frame?'reference_reconstruction_edit':'new_layout_of_observed_gaussian_objects',at:new Date().toISOString(),taskId:task.id,status:task.status,stopReason:task.stopReason,error:task.error,selectedCandidate:task.selectedCandidate,selectionReason:task.selectionReason,contract:task.contract,contractSha256:task.contractSha256,quality:task.quality,usageTotals:task.usageTotals,usage:task.usage,taskGraph:task.taskGraph,apiOperations:task.apiOperations,resumptionHistory:task.resumptionHistory||[],candidates:task.candidates.map(c=>({index:c.index,parentIndex:c.parentIndex,status:c.status,render:c.render,critique:sanitized(c.critique),evaluationFailures:c.evaluationFailures||[],verification:c.verification})),assets:summaries.map(a=>({...a,url:assetUrls[a.id],gaussians:library[a.id].splats.length,sha256:hash(JSON.stringify(library[a.id])),provenance:library[a.id].provenance})),modelTraining:false,sharedModelBefore:frozenBefore,sharedModelAfter:hash(await fs.readFile(frozenPath)),artifact};
 if(record.sharedModelAfter!==frozenBefore)throw new Error('Frozen model changed');
 await write(path.join(dir,'record.json'),record);if(artifact)await write(path.join(publicDir,spec.id+'.report.json'),record);
 console.log(JSON.stringify({case:spec.id,complete:true,status:task.status,candidates:task.candidates.length,selected:task.selectedCandidate,usage:task.usageTotals,quality:task.quality}));
 return record;
}
const queue=specs.filter(s=>selected==='all'||selected.split(',').includes(s.id));if(!queue.length)throw new Error('Unknown case');
const results=[];await Promise.all([0,1].map(async()=>{while(queue.length){const spec=queue.shift();try{results.push(await run(spec));}catch(e){await write(path.join(ROOT,'reports/v10/generation',runId,spec.id,'runner_error.json'),{message:sanitized(e.message),at:new Date().toISOString()});console.error(JSON.stringify({case:spec.id,error:sanitized(e.message)}));}}}));
apiKey='';
const records=[];for(const spec of specs){try{records.push(await read(path.join(ROOT,'reports/v10/generation',runId,spec.id,'record.json')));}catch{}}
const cases=records.filter(r=>r.artifact).map(r=>({id:r.id,title:r.title,kind:'gaussian',...r.artifact,subtitle:r.scope==='reference_reconstruction_edit'?'参考高斯重建 · 光色编辑':'DeepSeek 编排 · 观测物品新组合',scope:r.scope,modelTraining:false,sourceUrls:r.assets.map(a=>a.provenance?.source?.sourceUrl||a.provenance?.sourceUrl).filter(Boolean)}));
await write(path.join(ROOT,'web/assets/v10/gallery.json'),{schema:'crf.gallery.v0.10',runId,modelTraining:false,cases});
await write(path.join(ROOT,'reports/v10/generation',runId,'summary.json'),{schema:'crf.generation_summary.v0.10',runId,cases:records.map(r=>({id:r.id,status:r.status,selectedCandidate:r.selectedCandidate,candidateCount:r.candidates.length,quality:r.quality,usageTotals:r.usageTotals,artifact:r.artifact})),requests:records.reduce((n,r)=>n+r.usageTotals.providerRequests,0),totalTokens:records.reduce((n,r)=>n+r.usageTotals.tokens,0),modelTraining:false,sharedModelUnchanged:records.every(r=>r.sharedModelBefore===r.sharedModelAfter)});
console.log(JSON.stringify({complete:true,cases:cases.length,runId}));
