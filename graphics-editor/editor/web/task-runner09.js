/* CRF 0.9 resumable semantic task runtime. No credential enters browser state.
 * Search/vision, decoded observations, Gaussian fits and shared statistics have
 * separate evidence. Candidate readiness never means human realism approval.
 */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.CRF09Tasks=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const SCHEMA='crf.task.v0.9',DB='crf09-tasks',STORE='records';
const CATEGORIES=['architecture','landscape','still_life'];
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));
const now=()=>new Date().toISOString();
const clean=x=>String(x?.message||x||'任务未完成。').replace(/sk-[A-Za-z0-9_-]{12,}/g,'[credential removed]').slice(0,1400);
const uid=()=>('crf09_'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)));
const stableId=text=>{let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(16);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(code,message){const e=new Error(message);e.code=code;return e;}
function check(signal){if(signal?.aborted)throw fail('CANCELLED','已取消；已完成阶段和候选已保存。');}
function safeMeta(v){if(v===undefined)return null;const result=clone(v);if(result.images)result.images=result.images.map(({url,...x})=>x);return result;}
function categoryFromPrompt(prompt){if(/苹果|梨|橙|水果|静物|花瓶|apple|pear|orange|still.life|vase/i.test(prompt))return'still_life';if(/海|湖|山|森林|风景|自然|landscape|mountain|coast|lake|forest/i.test(prompt))return'landscape';return'architecture';}

function createMemoryStore(){const map=new Map();return{durable:false,async get(key){return map.has(key)?clone(map.get(key)):null;},async set(key,value){map.set(key,clone(value));},async keys(prefix=''){return[...map.keys()].filter(k=>k.startsWith(prefix));}};}
function createIndexedDBStore(){
 if(!root.indexedDB)throw fail('STORAGE_UNAVAILABLE','此环境没有 IndexedDB；请明确提供持久存储后运行任务。');
 let promise;
 function db(){if(!promise)promise=new Promise((resolve,reject)=>{const req=root.indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};req.onerror=()=>reject(fail('STORAGE_FAILED',clean(req.error)));req.onsuccess=()=>resolve(req.result);});return promise;}
 async function operation(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode),s=tx.objectStore(STORE);let value;try{const request=fn(s);request.onsuccess=()=>{value=request.result;};request.onerror=()=>reject(fail('STORAGE_FAILED',clean(request.error)));}catch(e){reject(e);}tx.oncomplete=()=>resolve(value??null);tx.onerror=()=>reject(fail('STORAGE_FAILED',clean(tx.error)));tx.onabort=()=>reject(fail('STORAGE_FAILED','本地保存被中断。'));});}
 return{durable:true,get:key=>operation('readonly',s=>s.get(key)),set:(key,value)=>operation('readwrite',s=>s.put(value,key)),async keys(prefix=''){return(await operation('readonly',s=>s.getAllKeys())).filter(k=>typeof k==='string'&&k.startsWith(prefix));}};
}
async function defaultApi(path,body,{signal}={}){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let data;
 try{data=await response.json();}catch{throw fail('API_RESPONSE','服务返回无效 JSON（HTTP '+response.status+'）。');}
 if(!response.ok||data.ok===false){const e=fail(data.error?.code||'API_FAILED',data.error?.message||'服务调用失败（HTTP '+response.status+'）。');e.result=data;throw e;}return data;
}
async function decodeImage(dataURL,{maxSide=256,signal}={}){
 check(signal);if(typeof dataURL!=='string'||!/^data:image\/(?:jpeg|png|webp);base64,/.test(dataURL)||dataURL.length>6000000)throw fail('INVALID_IMAGE','参考图片无效或过大。');
 if(!root.document)throw fail('DECODER_REQUIRED','当前环境需要提供图片解码器。');
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(fail('IMAGE_DECODE','参考图解码失败。'));image.src=dataURL;});check(signal);
 const scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);const vision=canvas.toDataURL('image/jpeg',.86);let visionSha256=null;if(root.crypto?.subtle){const bytes=Uint8Array.from(atob(vision.split(',')[1]),c=>c.charCodeAt(0));visionSha256=[...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}return{width,height,data:ctx.getImageData(0,0,width,height).data,vision,visionSha256};
}
async function defaultRender(scene,model,{signal}={}){
 check(signal);if(!root.CRF09)throw fail('RENDERER_UNAVAILABLE','CRF 0.9 内核尚未载入。');
 const result=await root.CRF09.renderScene(scene,{model});check(signal);
 if(!root.document)throw fail('ENCODER_REQUIRED','当前环境需要提供渲染图片编码器。');
 const canvas=document.createElement('canvas');canvas.width=result.width;canvas.height=result.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.data),result.width,result.height),0,0);
 const v=document.createElement('canvas'),scale=Math.min(1,768/Math.max(result.width,result.height));v.width=Math.round(result.width*scale);v.height=Math.round(result.height*scale);v.getContext('2d').drawImage(canvas,0,0,v.width,v.height);
 return{width:result.width,height:result.height,image:v.toDataURL('image/jpeg',.9),png:canvas.toDataURL('image/png'),report:result.diagnostics||result.report||result.metrics||null};
}
async function defaultFit(pixels,{signal,id,onProgress}={}){
 if(!root.CRF08)throw fail('FITTER_UNAVAILABLE','参考高斯拟合内核尚未载入。');
 const asset=await root.CRF08.fitImage(pixels,{id,budget:2048,iterations:3,geometrySteps:12,signal,onProgress});
 const rendered=root.CRF08.renderAsset(asset),metrics=root.CRF08.calculateMetrics(pixels,rendered);
 return{asset,metrics,qualityTier:'preview',compositionEligible:false,representationScope:'observed_image_plane'};
}
function appearanceSummary(model){
 if(!model)return{id:'no-shared-model',categories:{},scope:'No learned appearance model loaded'};
 const categories={};for(const [key,value]of Object.entries(model.categories||{}))categories[key]={samples:value.samples??value.sampleCount??value.count??0,sourceCount:value.sourceCount??value.sources?.length??null,mean:value.mean,std:value.std,bands:value.bands};
 return{id:model.id||model.version||model.schema,categories,scope:model.scope||'Shared reference appearance statistics; not a general image generator',sourceCount:model.sourceCount||model.sources?.length||0};
}
function hasAppearance(model,category){const c=model?.categories?.[category];if(!object(c))return false;if(Array.isArray(c.sourceGroups))return new Set(c.sourceGroups).size>=2;return Number(c.samples??c.sampleCount??c.count??c.sourceCount??model.sources?.filter(s=>s.category===category).length??0)>=2;}

function resolveConstraintObjects(scene){
 const objects=(scene.objects||[]).map(clone),byId=new Map(objects.map(o=>[o.id,o])),resolved=new Set(),active=new Set();
 function visit(o){if(resolved.has(o.id))return;if(active.has(o.id))throw fail('INVALID_SCENE','语义验收遇到循环连接。');active.add(o.id);if(o.attachment){const parent=byId.get(o.attachment.parentId),anchor=o.attachment.anchor;if(!parent||!Array.isArray(anchor)||anchor.length!==2)throw fail('INVALID_SCENE','语义验收遇到无效连接。');visit(parent);o.x=parent.x+anchor[0];o.y=parent.y+anchor[1];if(parent.visible===false)o.visible=false;}active.delete(o.id);resolved.add(o.id);}
 for(const o of objects)visit(o);const camera=scene.camera||{},zoom=camera.zoom??1;
 for(const o of objects){const depth=o.depth??.5;o.x=.5+(o.x-.5)*zoom-(camera.panX||0)*(.25+.75*depth);o.y=.5+(o.y-.5)*zoom-(camera.panY||0)*(.25+.75*depth);}
 return objects;
}
function assessConstraints(scene,plan){
 const visible=resolveConstraintObjects(scene).filter(o=>o.visible!==false),checks=[];
 for(const c of plan?.constraints||[]){const objects=visible.filter(o=>o.type===c.subject),targets=visible.filter(o=>o.type===c.target);let passed=false,observed=null;
  if(c.type==='count'){observed=objects.length;passed=objects.length===c.value;}
  else if(c.type==='visible'){observed=objects.length>0;passed=observed===c.value;}
  else if(c.type==='color'){observed=objects.map(o=>o.color);passed=objects.length>0&&objects.every(o=>o.color&&Math.sqrt(o.color.reduce((sum,v,i)=>sum+(v-c.value[i])**2,0))<=35);}
  else if(objects.length&&targets.length){const axis=['above','below'].includes(c.type)?'y':'x',a=objects.reduce((s,o)=>s+o[axis],0)/objects.length,b=targets.reduce((s,o)=>s+o[axis],0)/targets.length;observed={subjectMean:a,targetMean:b};passed=['left_of','above'].includes(c.type)?a<b:a>b;}
  checks.push({...clone(c),passed,observed});
 }
 return{checks,evaluated:checks.length,passed:checks.filter(x=>x.passed).length,allPassed:checks.every(x=>x.passed),coordinatePolicy:'Resolved attachment chain, inherited visibility and scene camera transform; counts only declared objects, not occlusion or implicit populations.',scope:'Checks effective declared scene parameters, not visual recognition or human realism.'};
}
function diagnose(critique){const map={edge:'coverage_and_boundary',contact:'attachment_and_contact',lighting:'shared_light',composition:'scene_layout',semantic:'semantic_program',texture:'shared_appearance',unsupported:'capability_gap'};return(critique?.issues||[]).map(issue=>({module:map[issue.code]||'scene_program',severity:issue.severity,objectIds:issue.objectIds||[],reason:issue.description}));}

function create(options={}){
 const store=options.store||createIndexedDBStore(),api=options.api||defaultApi,render=options.render||defaultRender,decode=options.decodeImage||decodeImage,fit=options.fitReference||defaultFit;
 let active=null,controller=null,modelCache=null;
 const renderer=options.renderer||root.CRF09;
 async function getModel(){if(options.getModel)return await options.getModel();if(modelCache)return modelCache;modelCache=await store.get('model:current');return modelCache;}
 async function setModel(model){const accepted=options.setModel?await options.setModel(model):null;const committed=accepted&&accepted.schema===model.schema?accepted:model;await store.set('model:current',committed);modelCache=committed;return committed;}
 async function emit(state,type,detail={}){state.updatedAt=now();state.events.push({at:state.updatedAt,type,...clone(detail)});if(state.events.length>400)state.events.splice(0,state.events.length-400);await store.set('task:'+state.id,state);try{await options.onEvent?.({taskId:state.id,type,stage:state.stage,status:state.status,...clone(detail)},clone(state));}catch(error){(state.observerErrors ||= []).push({at:now(),event:type,message:clean(error)});state.observerErrors=state.observerErrors.slice(-20);}}
 function budget(input){const b=input.budget||{};function n(k,d,min,max){const v=b[k]??d;if(!Number.isInteger(v)||v<min||v>max)throw fail('INVALID_BUDGET',k+' 超出允许预算。');return v;}return{maxCandidates:n('maxCandidates',3,1,3),maxQualityFeedback:n('maxQualityFeedback',2,0,2),learningRounds:n('learningRounds',10,10,10),imagesPerRound:n('imagesPerRound',4,1,6),maxApiOperations:n('maxApiOperations',40,1,60),maxProviderRequests:n('maxProviderRequests',80,2,120),maxReferencePixels:n('maxReferencePixels',256,64,512)};}
 async function call(state,path,body,phase){
  const cached=state.apiOperations.findLast(op=>op.phase===phase&&op.resultKey);if(cached){const result=await store.get(cached.resultKey);if(result?.ok!==false&&result)return result;}
  check(controller.signal);if(state.apiOperations.length>=state.budget.maxApiOperations)throw fail('BUDGET_EXHAUSTED','已达到 API 操作预算。');
  const used=state.usage.reduce((sum,x)=>sum+(x.providerCalls||0),0);if(used+2>state.budget.maxProviderRequests)throw fail('BUDGET_EXHAUSTED','剩余模型请求预算不足以保留一次结构修复。');
  const operation={index:state.apiOperations.length,phase,path,startedAt:now(),status:'inflight'};state.apiOperations.push(operation);await emit(state,'api_started',{phase,operation:operation.index});
  try{const result=await api(path,body,{signal:controller.signal});if(result.ok===false){const e=fail(result.error?.code||'API_FAILED',result.error?.message||'服务返回失败。');e.result=result;throw e;}operation.resultKey='operation:'+state.id+':'+operation.index;await store.set(operation.resultKey,result);operation.status='completed';operation.finishedAt=now();operation.runId=result.runId||null;if(result.usage)state.usage.push({phase,...clone(result.usage)});await emit(state,'api_completed',{phase,operation:operation.index});return result;}
  catch(e){operation.status=controller.signal.aborted?'cancelled':'failed';operation.finishedAt=now();operation.errorCode=e.code||'API_FAILED';if(e.result?.usage)state.usage.push({phase,...clone(e.result.usage)});await emit(state,'api_failed',{phase,error:clean(e)});throw e;}
 }
 async function learn(state){
  state.stage='learning';state.learning ||= {nextRound:1,rounds:[],references:[],samples:[],priorSummary:'',excludedSources:[],failures:[]};await emit(state,'learning_started',{rounds:state.budget.learningRounds});
  const learned=state.learning;
  for(let round=learned.nextRound;round<=state.budget.learningRounds;round++){
   check(controller.signal);let record=learned.rounds.find(r=>r.round===round);
   if(!record){record={round,status:'pending',references:[],fitResults:[],startedAt:now()};learned.rounds.push(record);}
   if(!record.search){
    const result=await call(state,'/api/crf/gaussian/research',{topic:state.plan.learningTopic||state.prompt,round,sessionId:state.id,priorSummary:learned.priorSummary,excludeSourceUrls:learned.excludedSources,collectImages:true,maxImages:state.budget.imagesPerRound},'research_'+round);
    record.search=safeMeta(result);record.status='searched';
    for(let i=0;i<(result.images||[]).length;i++){const image=result.images[i],id='ref.'+round+'.'+i,sourceGroup=image.sourceUrl||image.imageUrl||id,duplicate=learned.rounds.flatMap(r=>r.references).some(r=>image.sha256&&r.sha256===image.sha256||r.sourceGroup===sourceGroup);if(duplicate){(record.excludedDuplicates ||= []).push({id,sha256:image.sha256,sourceUrl:image.sourceUrl,reason:'same_sha256_or_source_page'});continue;}const storageKey='reference:'+state.id+':'+id;await store.set(storageKey,image);record.references.push({id,storageKey,sourceUrl:image.sourceUrl,sha256:image.sha256,bytes:image.bytes,sourceGroup});}
    await emit(state,'references_acquired',{round,sourceCount:result.sources?.length||0,downloaded:record.references.length,searchObserved:result.research?.searched===true});
   }
   const decoded=[];
   for(const reference of record.references){check(controller.signal);if(reference.decodeFailed)continue;try{const source=await store.get(reference.storageKey);if(!source?.url)throw fail('REFERENCE_MISSING','持久保存的参考图不存在。');const pixels=await decode(source.url,{signal:controller.signal,maxSide:state.budget.maxReferencePixels});decoded.push({reference,pixels});}catch(e){if(controller.signal.aborted)throw e;reference.decodeFailed=clean(e);learned.failures.push({round,id:reference.id,stage:'decode',error:clean(e)});await emit(state,'reference_decode_failed',{round,id:reference.id,error:clean(e)});}}
   if(decoded.length&&!record.semantics){
    record.visionInputs=decoded.map(({reference,pixels})=>({id:reference.id,sourceSha256:reference.sha256||null,submittedSha256:pixels.visionSha256||null,width:pixels.width,height:pixels.height,encoding:'jpeg'}));
    const response=await call(state,'/api/crf/gaussian/describe',{topic:state.plan.learningTopic||state.prompt,round,images:decoded.map(({reference,pixels})=>({id:reference.id,url:pixels.vision,sourceUrl:reference.sourceUrl,...(pixels.visionSha256?{sha256:pixels.visionSha256}:{})}))},'vision_'+round);
    record.semantics=response;await emit(state,'references_observed',{round,images:response.images?.length||0});
   }
   for(const {reference,pixels}of decoded){
    check(controller.signal);const semantic=record.semantics?.items?.find(s=>s.id===reference.id)||null;
    if(!reference.sampleAdded){
     if(!renderer?.extractAppearance||!renderer?.learnAppearance)throw fail('LEARNER_UNAVAILABLE','共享外观学习内核尚未载入，不能把独立拟合计作共享学习。');
     const sample=renderer.extractAppearance(pixels,{category:state.plan.category,id:'observation.'+(reference.sha256||stableId(reference.sourceGroup)),sourceGroup:reference.sourceGroup,semantic});
     learned.samples.push(sample);reference.sampleAdded=true;learned.references.push({...reference,semanticLabel:semantic?.label||null,role:semantic?.role||null,observed:!!semantic});await emit(state,'appearance_measured',{round,id:reference.id});
    }
    if(!record.fitResults.some(f=>f.referenceId===reference.id)){
     try{const fitId='obs.'+state.id+'.'+reference.id;const result=await fit(pixels,{signal:controller.signal,id:fitId,semantic,onProgress:p=>options.onProgress?.({stage:'fit',round,referenceId:reference.id,...p})});
      await store.set('fitted:'+fitId,result.asset);record.fitResults.push({referenceId:reference.id,id:fitId,status:'fitted',gaussianCount:result.asset.splats?.length||0,metrics:result.metrics||null,qualityTier:result.qualityTier||'preview',compositionEligible:result.compositionEligible===true,representationScope:result.representationScope||'observed_image_plane',sourceUrl:reference.sourceUrl});
      await emit(state,'reference_fitted',{round,id:reference.id,gaussianCount:result.asset.splats?.length||0});
     }catch(e){if(controller.signal.aborted)throw e;record.fitResults.push({referenceId:reference.id,status:'failed',error:clean(e)});learned.failures.push({round,id:reference.id,stage:'fit',error:clean(e)});await emit(state,'reference_fit_failed',{round,id:reference.id,error:clean(e)});}
    }
   }
   learned.excludedSources=[...new Set([...learned.excludedSources,...(record.search.sources||[]).map(s=>s.url).filter(Boolean)])].slice(-160);
   learned.priorSummary=String(record.search.semanticPlan?.summary||record.search.research?.summary||'').slice(0,5000);record.status='complete';record.completedAt=now();learned.nextRound=round+1;await emit(state,'learning_round_complete',{round,decoded:decoded.length,fitted:record.fitResults.filter(f=>f.status==='fitted').length});
  }
  const unique=new Set(learned.samples.map(s=>s.sourceGroup||s.id));if(unique.size<2)throw fail('LEARNING_INSUFFICIENT','十轮检索后不足两个独立参考来源，不能登记已学习的类别。');
  const previous=await getModel(),model=await setModel(renderer.learnAppearance(learned.samples,{previousModel:previous}));state.modelSnapshot=clone(model);learned.sharedUpdate={at:now(),inputSamples:learned.samples.length,independentSourceGroups:unique.size,previousModelId:previous?.id||null,modelId:model.id||model.version||null,kind:'shared_appearance_statistics',languageModelWeightsUpdated:false,coverage:{plannedReferenceMinimum:40,actualIndependentSources:unique.size,plannedMinimumMet:unique.size>=40,maturity:unique.size>=40?'coverage_target_met_quality_unverified':'pilot_prior_below_planned_reference_count'}};await emit(state,'shared_model_updated',learned.sharedUpdate);
 }
 async function execute(state){
  active=state;controller=new AbortController();state.status='running';state.error=null;
  try{
   if(state.apiOperations.some(x=>x.status==='inflight')){for(const op of state.apiOperations.filter(x=>x.status==='inflight')){const key='operation:'+state.id+':'+op.index,cached=await store.get(key);if(cached?.ok!==false&&cached){op.status='completed';op.resultKey=key;op.recoveredFromDurableResponse=true;if(cached.usage)state.usage.push({phase:op.phase,...clone(cached.usage)});}else op.status='interrupted_outcome_unknown';}await emit(state,'resume_recovery',{unresolved:state.apiOperations.filter(x=>x.status==='interrupted_outcome_unknown').length,message:'已保存响应直接恢复；结果未知的请求保留计数，恢复时重做未完成阶段。'});}
   await emit(state,'task_started',{resumed:!!state.startedAt});state.startedAt ||= now();
   if(!state.plan){state.stage='planning';const result=await call(state,'/api/crf/native/generate',{mode:'plan',prompt:state.prompt,seed:state.seed,category:state.category,modelSummary:appearanceSummary(await getModel()),...(state.replanReason?{feedback:state.replanReason}:{})},state.planPhase||'plan');if(result.action!=='plan'||!result.plan)throw fail('PLAN_FAILED','模型未返回可执行语义计划。');state.plan=result.plan;state.planEvidence={qualityNotes:clone(result.qualityNotes||[]),warnings:clone(result.warnings||[]),runId:result.runId||null,requestIds:(result.usage?.requests||[]).map(r=>r.requestId).filter(Boolean)};state.category=result.plan.category;await emit(state,'plan_ready',{category:state.category,unknownRequirements:state.plan.unknownRequirements,qualityNotes:state.planEvidence.qualityNotes,warnings:state.planEvidence.warnings});}
   if(state.plan.unknownRequirements?.length)throw fail('UNSUPPORTED_REQUIREMENTS','当前形态函数不能表达：'+state.plan.unknownRequirements.join('；'));
   if(!state.modelSnapshot){const model=await getModel();state.capability={category:state.plan.category,sharedAppearanceAvailable:hasAppearance(model,state.plan.category),supportedTypes:state.plan.requiredTypes,scope:'Limited procedural shape functions and learned appearance statistics'};
    if(state.learningPolicy==='always'||state.learningPolicy==='auto'&&!state.capability.sharedAppearanceAvailable)await learn(state);
    else{state.modelSnapshot=model?clone(model):null;state.modelResolved=true;await emit(state,'model_reused',{learningPolicy:state.learningPolicy,appearanceAvailable:state.capability.sharedAppearanceAvailable});}
   }
   if(state.mode==='learn'){state.status='learning_ready';state.stage='complete';state.finishedAt=now();state.quality={releaseGate:'not_evaluated',independentHumanReview:false,scope:'Reference acquisition, actual fitting and shared appearance update only; no generated-picture quality claim'};await emit(state,'learning_task_ready',{sharedUpdate:state.learning?.sharedUpdate||null});return clone(state);}
   const max=state.budget.maxCandidates;
   for(let index=0;index<max;index++){
    check(controller.signal);let candidate=state.candidates[index];
    if(!candidate){
     if(index>0){const parent=state.candidates[index-1];if(!parent.critique||!parent.critique.issues?.length||state.feedbackCount>=state.budget.maxQualityFeedback&&index>state.feedbackCount)break;}
     state.stage=index?'repairing':'generating';const parent=index?state.candidates[index-1]:null;
     const mode=index?'edit':state.mode;
     const body={mode,prompt:state.prompt,category:state.plan.category,seed:state.seed,plan:state.plan,modelSummary:appearanceSummary(state.modelSnapshot),...(index?{currentScene:parent.scene,image:(await store.get(parent.renderKey))?.image,feedback:[parent.critique.message,...(parent.critique.qualityNotes||[]),...(parent.critique.issues||[]).map(i=>i.description)].join('\n')} : state.mode==='edit'?{currentScene:state.initialScene,...(state.editableObjectIds?{editableObjectIds:state.editableObjectIds}:{})}:{})};
     if(index&&state.editableObjectIds)body.editableObjectIds=state.editableObjectIds;
     const result=await call(state,'/api/crf/native/generate',body,index?'revision_'+index:'generate');if(result.action!=='scene'||!result.scene)throw fail('UNSUPPORTED_SCENE',result.message||'当前内核无法表达该场景。');
     candidate={index,scene:result.scene,provider:result,createdAt:now(),status:'compiled',constraints:assessConstraints(result.scene,state.plan),renderKey:'render:'+state.id+':'+index};state.candidates.push(candidate);await emit(state,'candidate_compiled',{index,constraints:candidate.constraints});
    }
    if(candidate.status==='compiled'){
     state.stage='rendering';const start=Date.now(),output=await render(candidate.scene,state.modelSnapshot,{signal:controller.signal});check(controller.signal);
     if(!output||!Number.isInteger(output.width)||!Number.isInteger(output.height)||typeof output.image!=='string'||!output.image.startsWith('data:image/'))throw fail('RENDER_FAILED','渲染器没有提供实际画面用于检查。');
     await store.set(candidate.renderKey,output);candidate.render={width:output.width,height:output.height,elapsedMs:Date.now()-start,report:output.report||null};candidate.status='rendered';
     const previous=state.selectedCandidate===null?null:state.candidates[state.selectedCandidate];if(!previous||candidate.constraints.passed>=previous.constraints.passed){state.selectedCandidate=index;state.selectionReason='Latest candidate without declared semantic-constraint regression; visual approval remains pending.';}
     await emit(state,'candidate_rendered',{index,selectedCandidate:state.selectedCandidate});try{await options.onCandidate?.(clone(candidate),output,clone(state));}catch(error){(state.observerErrors ||= []).push({at:now(),event:'onCandidate',message:clean(error)});}
    }
    if(index<max-1&&state.feedbackCount<state.budget.maxQualityFeedback&&!candidate.critique){
     state.stage='evaluating';const image=await store.get(candidate.renderKey);const critique=await call(state,'/api/crf/native/generate',{mode:'critique',prompt:state.prompt,currentScene:candidate.scene,image:image.image,seed:state.seed,category:state.plan.category,plan:state.plan},'critique_'+index);candidate.critique=critique;candidate.diagnosis=diagnose(critique);state.feedbackCount++;await emit(state,'candidate_critiqued',{index,diagnosis:candidate.diagnosis,scores:critique.scores||null});
     if(!critique.issues?.length){state.stopReason='No actionable model-identified issue; independent visual review still required.';break;}
    }else if(candidate.critique&&!candidate.critique.issues?.length)break;
   }
   if(!state.candidates.some(c=>c.status==='rendered'))throw fail('NO_RENDER','没有完成的渲染结果。');
   state.status='review_required';state.stage='complete';state.finishedAt=now();state.quality={releaseGate:'not_evaluated',independentHumanReview:false,scope:'Actual rendered candidates with bounded model feedback; not a photorealism certificate'};await emit(state,'task_ready',{selectedCandidate:state.selectedCandidate,candidateCount:state.candidates.length,feedbackCount:state.feedbackCount});
  }catch(e){state.status=controller.signal.aborted||e.code==='CANCELLED'?'cancelled':'failed';state.error={code:e.code||'TASK_FAILED',message:clean(e),at:now()};state.finishedAt=now();await emit(state,'task_stopped',{error:state.error,retainedCandidates:state.candidates.filter(c=>c.status==='rendered').length});}
  finally{active=null;controller=null;}
  return clone(state);
 }
 async function start(input){
  if(active)throw fail('BUSY','已有任务正在运行。');if(!object(input)||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>8000)throw fail('INVALID_INPUT','请输入有效场景描述。');
  const mode=input.mode||'generate';if(!['generate','edit','learn'].includes(mode)||mode==='edit'&&!input.currentScene)throw fail('INVALID_INPUT','修改任务需要当前场景。');
  const policy=input.learningPolicy||'auto';if(!['auto','always','never'].includes(policy))throw fail('INVALID_INPUT','学习策略无效。');
  const category=input.category||input.currentScene?.category||categoryFromPrompt(input.prompt);if(!CATEGORIES.includes(category))throw fail('INVALID_INPUT','场景类别无效。');
  const seed=input.seed??input.currentScene?.seed??42;if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw fail('INVALID_INPUT','种子无效。');
  const state={schema:SCHEMA,id:uid(),prompt:input.prompt,mode,seed,category,learningPolicy:policy,initialScene:input.currentScene?clone(input.currentScene):null,editableObjectIds:input.editableObjectIds?clone(input.editableObjectIds):null,budget:budget(input),status:'queued',stage:'queued',createdAt:now(),updatedAt:now(),events:[],apiOperations:[],usage:[],candidates:[],feedbackCount:0,selectedCandidate:null,persistence:{durable:store.durable===true},plan:input.plan?clone(input.plan):null};
  active=state;try{await store.set('task:'+state.id,state);return await execute(state);}catch(error){active=null;throw error;}
 }
 async function resume(id){if(active)throw fail('BUSY','已有任务正在运行。');active={id,status:'loading'};try{const state=await store.get('task:'+id);if(state?.schema!==SCHEMA)throw fail('TASK_MISSING','找不到可恢复的任务。');if(['review_required','learning_ready'].includes(state.status)){active=null;return state;}return await execute(state);}catch(error){active=null;throw error;}}
 async function replan(id,{reason}={}){
  if(active)throw fail('BUSY','已有任务正在运行。');active={id,status:'loading'};
  try{
   const state=await store.get('task:'+id);if(state?.schema!==SCHEMA)throw fail('TASK_MISSING','找不到可恢复的任务。');
   if(state.status!=='failed'||state.stage!=='planning'||state.candidates.length!==0)throw fail('REPLAN_INELIGIBLE','仅可重审在规划阶段失败且没有候选的任务。');
   if((state.replanCount||0)>=1)throw fail('REPLAN_LIMIT','同一任务最多允许一次规划重审。');
   if(typeof reason!=='string'||!reason.trim()||reason.length>1400)throw fail('REPLAN_REASON_REQUIRED','规划重审需要明确的能力描述修正原因。');
   (state.planningHistory ||= []).push({at:now(),reason:clean(reason),plan:clone(state.plan),planEvidence:clone(state.planEvidence||null),error:clone(state.error),finishedAt:state.finishedAt||null,phase:state.planPhase||'plan',apiOperationCount:state.apiOperations.length,providerRequestIds:state.usage.flatMap(u=>(u.requests||[]).map(r=>r.requestId).filter(Boolean)),budget:clone(state.budget)});
   state.replanCount=1;state.planPhase='plan_replan_1';state.replanReason=clean(reason);state.plan=null;delete state.planEvidence;delete state.finishedAt;state.status='queued';
   await emit(state,'replan_requested',{reason:state.replanReason,previousFailuresPreserved:state.planningHistory.length});
   return await execute(state);
  }catch(error){active=null;throw error;}
 }
 function cancel(){if(!controller)return false;controller.abort();return true;}
 async function selectCandidate(id,index){if(active?.id===id)throw fail('BUSY','任务运行中，请完成或停止后选择候选。');const state=await store.get('task:'+id);if(!state||!state.candidates[index]||state.candidates[index].status!=='rendered')throw fail('CANDIDATE_MISSING','候选不存在。');state.selectedCandidate=index;state.selectionReason='Explicit user selection; no automatic quality certification.';await emit(state,'candidate_selected',{index});return state;}
 return{start,resume,replan,cancel,selectCandidate,isRunning:()=>!!active,getTask:id=>store.get('task:'+id),getRender:async(id,index)=>store.get('render:'+id+':'+index),async listTasks(){const keys=await store.keys('task:');const tasks=await Promise.all(keys.map(k=>store.get(k)));return tasks.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},getModel,setModel,store};
}
return{VERSION:'0.9.0',SCHEMA,create,createMemoryStore,createIndexedDBStore,decodeImage,defaultRender,defaultFit,appearanceSummary,hasAppearance,resolveConstraintObjects,assessConstraints,diagnose};
});
