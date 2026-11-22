/* CRF 0.10 bounded visual-feedback runtime. Every candidate, including the last,
 * is evaluated. No model/appearance training or learnAppearance call is exposed.
 * LLM opinion guides search; it cannot issue a photorealism certificate.
 */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.CRF10Tasks=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const VERSION='0.10.0',SCHEMA='crf.task.v0.10',DB='crf10-tasks',STORE='records';
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));
const now=()=>new Date().toISOString(),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clean=x=>String(x?.message||x||'任务未完成。').replace(/sk-[A-Za-z0-9_-]{12,}/g,'[credential removed]').slice(0,1800);
const uid=()=>('crf10_'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)));
function fail(code,message){const e=new Error(message);e.code=code;return e;}
function check(signal){if(signal?.aborted)throw fail('CANCELLED','已取消；已渲染候选和证据保留。');}
function verifierAPI(){if(root.CRF10Verifier)return root.CRF10Verifier;if(typeof require==='function')return require('./crf-verifier10.js');throw fail('VERIFIER_UNAVAILABLE','CRF 0.10 验证器尚未载入。');}
function createMemoryStore(){const map=new Map();return{durable:false,async get(key){return map.has(key)?clone(map.get(key)):null;},async set(key,value){map.set(key,clone(value));},async keys(prefix=''){return[...map.keys()].filter(k=>k.startsWith(prefix));}};}
function createIndexedDBStore(){
 if(!root.indexedDB)throw fail('STORAGE_UNAVAILABLE','当前环境没有 IndexedDB，请提供存储实现。');let opened;
 function db(){if(!opened)opened=new Promise((resolve,reject)=>{const r=root.indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(fail('STORAGE_FAILED',clean(r.error)));});return opened;}
 async function operation(mode,fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode);let value;try{const r=fn(tx.objectStore(STORE));r.onsuccess=()=>{value=r.result;};r.onerror=()=>reject(fail('STORAGE_FAILED',clean(r.error)));}catch(e){reject(e);}tx.oncomplete=()=>resolve(value??null);tx.onerror=()=>reject(fail('STORAGE_FAILED',clean(tx.error)));tx.onabort=()=>reject(fail('STORAGE_FAILED','保存事务已中断。'));});}
 return{durable:true,get:k=>operation('readonly',s=>s.get(k)),set:(k,v)=>operation('readwrite',s=>s.put(v,k)),async keys(prefix=''){return(await operation('readonly',s=>s.getAllKeys())).filter(k=>typeof k==='string'&&k.startsWith(prefix));}};
}
async function defaultApi(path,body,{signal}={}){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let data;try{data=await response.json();}catch{throw fail('API_RESPONSE','服务未返回 JSON（HTTP '+response.status+'）。');}if(!response.ok||data?.ok===false){const error=fail(data?.error?.code||'API_FAILED',data?.error?.message||'服务调用失败（HTTP '+response.status+'）。');error.result=data;throw error;}return data;}
function categoryFromPrompt(prompt){if(/苹果|梨|橙|水果|静物|花瓶|apple|pear|orange|still.life|vase/i.test(prompt))return'still_life';if(/海|湖|山|森林|风景|自然|landscape|mountain|coast|lake|forest/i.test(prompt))return'landscape';return'architecture';}
function lightweightScene(scene){if(!scene)return null;const copy={...scene};delete copy.assets;delete copy.appearanceModel;delete copy.assetUrls;return clone(copy);}
function modelSummary(model){return model?{id:model.id||model.version||model.schema,scope:model.scope||'Frozen existing model snapshot',sourceCount:model.sourceCount||0,trainingAllowed:false}:{id:null,scope:'No shared model',trainingAllowed:false};}
async function defaultRender(scene,model,{signal,representation}={}){
 check(signal);const renderer=representation==='reference_gaussian'?(root.CRFGaussian10||root.CRF10Gaussian):root.CRF09;
 if(!renderer?.renderScene)throw fail('RENDERER_UNAVAILABLE','当前表示的求值器尚未载入。');const result=await renderer.renderScene(scene,{model,coverage:true,filter:'mip',signal});check(signal);
 if(!root.document)throw fail('ENCODER_REQUIRED','当前环境需提供渲染 PNG/预览编码器。');const canvas=document.createElement('canvas');canvas.width=result.width;canvas.height=result.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.data),result.width,result.height),0,0);
 const preview=document.createElement('canvas'),scale=Math.min(1,768/Math.max(result.width,result.height));preview.width=Math.round(result.width*scale);preview.height=Math.round(result.height*scale);preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
 return{...result,image:preview.toDataURL('image/jpeg',.92),png:canvas.toDataURL('image/png'),report:result.diagnostics||null};
}
function budget(input){const b=input.budget||{};function n(k,d,min,max){const v=b[k]??d;if(!Number.isInteger(v)||v<min||v>max)throw fail('INVALID_BUDGET',k+' 超出允许范围。');return v;}return{maxCandidates:n('maxCandidates',6,1,12),maxQualityFeedback:n('maxQualityFeedback',5,0,11),maxStagnantCandidates:n('maxStagnantCandidates',3,1,12),maxApiOperations:n('maxApiOperations',32,1,80),maxProviderRequests:n('maxProviderRequests',64,2,160),maxTotalTokens:n('maxTotalTokens',250000,1000,2000000)};}
function create(options={}){
 const V=options.verifier||verifierAPI(),store=options.store||createIndexedDBStore(),api=options.api||defaultApi,render=options.render||defaultRender,endpoint=options.endpoint||'/api/crf/native10/generate';
 let active=null,controller=null;
 async function emit(state,type,detail={}){state.updatedAt=now();state.events.push({at:state.updatedAt,type,...clone(detail)});await store.set('task:'+state.id,state);try{await options.onEvent?.({taskId:state.id,type,stage:state.stage,status:state.status,...clone(detail)},clone(state));}catch(e){(state.observerErrors ||= []).push({at:now(),type,message:clean(e)});}}
 function node(state,id,type,dependsOn,status='pending',evidence=null){let item=state.taskGraph.nodes.find(x=>x.id===id);if(!item){item={id,type,dependsOn:[...dependsOn],status};state.taskGraph.nodes.push(item);}item.status=status;item.updatedAt=now();if(evidence)item.evidence=evidence;return item;}
 function usageTotals(state){const uncertain=state.apiOperations.filter(x=>['inflight','interrupted_outcome_unknown','cancelled_outcome_unknown'].includes(x.status)).length;return{providerRequests:state.usage.reduce((n,x)=>n+(x.providerCalls??x.requests?.length??0),0),tokens:state.usage.reduce((n,x)=>n+(x.total_tokens||0),0),uncertainRequestsReserved:uncertain*2};}
 async function operation(state,phase,body,fn){
  const cached=state.apiOperations.findLast(x=>x.phase===phase&&x.resultKey);if(cached){const result=await store.get(cached.resultKey);if(result)return result;}
  check(controller.signal);const used=usageTotals(state);if(state.apiOperations.length>=state.budget.maxApiOperations||used.providerRequests+used.uncertainRequestsReserved+2>state.budget.maxProviderRequests||used.tokens>=state.budget.maxTotalTokens)throw fail('BUDGET_EXHAUSTED','达到调用或 token 预算；已有候选保留。');
  const op={index:state.apiOperations.length,phase,path:endpoint,status:'inflight',startedAt:now()};state.apiOperations.push(op);await emit(state,'api_started',{phase,operation:op.index});
  try{const result=await (fn?fn(body,{signal:controller.signal,task:clone(state)}):api(endpoint,body,{signal:controller.signal}));if(result?.ok===false){const e=fail(result.error?.code||'API_FAILED',result.error?.message||'服务返回失败。');e.result=result;throw e;}if(!result)throw fail('EMPTY_RESPONSE','服务未返回结果。');op.resultKey='operation:'+state.id+':'+op.index;await store.set(op.resultKey,result);op.status='completed';op.finishedAt=now();op.runId=result.runId||null;if(result.usage)state.usage.push({phase,...clone(result.usage)});await emit(state,'api_completed',{phase,operation:op.index});return result;}
  catch(e){op.status=controller.signal.aborted?'cancelled_outcome_unknown':'failed';op.finishedAt=now();op.errorCode=e.code||'API_FAILED';if(e.result?.usage){state.usage.push({phase,...clone(e.result.usage)});if(e.result.usage.usageComplete===false)op.status='interrupted_outcome_unknown';}else if(controller.signal.aborted||['NETWORK','NETWORK_ERROR','TIMEOUT'].includes(e.code)||e.name==='TypeError')op.status='interrupted_outcome_unknown';await emit(state,'api_failed',{phase,error:clean(e),requestOutcome:op.status});throw e;}
 }
 function commonBody(state){return{prompt:state.prompt,representation:state.representation,category:state.category,seed:state.seed,reasoningEffort:state.reasoningEffort,assetSummary:clone(state.assetSummary),plan:state.plan,modelSummary:modelSummary(state.modelSnapshot),trainingAllowed:false};}
 async function hydrate(state,raw){
  let scene=clone(raw);if(state.representation==='reference_gaussian'){scene.assets=clone(state.assetSnapshot);if(scene.schema!=='crf.gaussian_scene.v0.10')throw fail('INVALID_SCENE','高斯场景格式不匹配。');for(const o of scene.objects||[])if(!Object.hasOwn(scene.assets,o.assetId))throw fail('ASSET_MISSING','模型引用了未加载的高斯资产：'+clean(o.assetId));}
  if(options.hydrateScene)scene=await options.hydrateScene(scene,{assets:clone(state.assetSnapshot),model:clone(state.modelSnapshot),signal:controller.signal});return scene;
 }
 async function verifyCandidate(state,candidate,output){
  const currentHash=await V.digest(V.canonical(state.contract));if(!currentHash)throw fail('HASH_UNAVAILABLE','当前环境不能计算证据摘要，验收保持未知。');if(currentHash!==state.contractSha256)throw fail('CONTRACT_CHANGED','运行中的验收合约发生变化，不能继续使用旧验收标准。');
  const reference=state.referenceKey?await store.get(state.referenceKey):null,previousOutput=state.previousOutputKey?await store.get(state.previousOutputKey):null;
  const renderer=typeof options.renderer==='function'?options.renderer(state.representation):options.renderer;
  candidate.verification=await V.verify({scene:candidate.scene,output,contract:state.contract,reference,previousOutput,masks:state.masks||{},critique:candidate.critique,capabilities:state.capabilities,assetSummary:state.assetSummary,validateScene:renderer?.validateScene?.bind(renderer)});
  candidate.diagnosis=clone(candidate.verification.diagnosis);node(state,'verify.'+candidate.index,'verify',['render.'+candidate.index,'critique.'+candidate.index],candidate.verification.allRequiredPassed?'passed':'complete',{imageSha256:candidate.verification.imageSha256,contractSha256:state.contractSha256,summary:candidate.verification.summary});
 }
 function candidateFeedback(best,last){
  const parts=[];if(best?.critique){parts.push('修订基于当前保留候选 '+best.index+'。',best.critique.message||'',...(best.critique.issues||[]).map(x=>x.description));}
  if(best?.verification)parts.push('尚未通过的合约项：'+JSON.stringify(best.verification.checks.filter(c=>c.status!=='passed').map(c=>({id:c.id,status:c.status,observed:c.observed,reason:c.reason}))));
  if(last&&best&&last.index!==best.index)parts.push('最近尝试 '+last.index+' 未优于保留版本。其问题：'+(last.critique?.message||'见验证证据')+'。避免重复无效调整。');
  return parts.filter(Boolean).join('\n').slice(0,10000);
 }
 function quality(state){const selected=state.selectedCandidate===null?null:state.candidates[state.selectedCandidate],rendered=state.candidates.filter(x=>x.status!=='compiled');return{releaseGate:selected?.verification?.photorealisticAccepted?'passed':'not_passed',independentHumanReview:!!selected?.verification?.independentReview,allCandidatesEvaluated:rendered.length>0&&rendered.every(x=>!!x.critique),selectedCandidateEvaluated:!!selected?.critique,trainingPerformed:false,scope:'Evidence-guided bounded search. Model scores are advisory; unknown checks remain unresolved.'};}
 async function finish(state,reason){state.stopReason=reason;state.finishedAt=now();state.lastStage=state.stage;state.stage='complete';if(!['blocked','cancelled','failed'].includes(state.status))state.status='review_required';state.quality=quality(state);state.usageTotals=usageTotals(state);await emit(state,'task_ready',{selectedCandidate:state.selectedCandidate,candidateCount:state.candidates.length,feedbackCount:state.feedbackCount,stopReason:reason,quality:state.quality});return clone(state);}
 async function execute(state){
  active=state;controller=new AbortController();state.status='running';state.error=null;
  try{
   for(const op of state.apiOperations.filter(x=>x.status==='inflight')){const result=await store.get('operation:'+state.id+':'+op.index);if(result){op.resultKey='operation:'+state.id+':'+op.index;op.status='completed';if(result.usage&&!state.usage.some(u=>u.phase===op.phase))state.usage.push({phase:op.phase,...clone(result.usage)});}else op.status='interrupted_outcome_unknown';}
   state.startedAt ||= now();await emit(state,'task_started',{resumed:state.events.length>0,trainingAllowed:false});
   if(!state.plan){state.stage='planning';node(state,'plan','plan',[],'running');const result=await operation(state,'plan',{...commonBody(state),mode:'plan',currentScene:lightweightScene(state.initialScene)},options.plan);if(result.action!=='plan'||!result.plan)throw fail('PLAN_FAILED','没有可执行计划。');state.plan=clone(result.plan);state.planEvidence={runId:result.runId||null,qualityNotes:clone(result.qualityNotes||[]),warnings:clone(result.warnings||[]),capabilityGaps:clone(result.capabilityGaps||[])};node(state,'plan','plan',[],'complete',{runId:result.runId||null});await emit(state,'plan_ready',{plan:state.plan});}
   if(state.planEvidence?.capabilityGaps?.some(g=>g?.requiredForGoal===true)){state.status='blocked';state.capabilityGaps=clone(state.planEvidence.capabilityGaps);return await finish(state,'CAPABILITY_GAP');}
   if(state.plan.unknownRequirements?.length){state.status='blocked';state.capabilityGaps=clone(state.plan.unknownRequirements);return await finish(state,'UNSUPPORTED_REQUIREMENTS');}
   if(!state.contract){state.contract=V.createContract({...state.contractInput,representation:state.representation,plan:state.plan});state.contractSha256=await V.digest(V.canonical(state.contract));await emit(state,'contract_frozen',{contractSha256:state.contractSha256,checkCount:state.contract.checks.length});}
   for(let index=0;index<state.budget.maxCandidates;index++){
    check(controller.signal);let candidate=state.candidates[index];
    if(candidate?.status==='verified'&&candidate.critique)continue; // Durable evidence is reused, not re-counted as stagnation.
    if(!candidate){
     if(index>0&&state.feedbackCount>=state.budget.maxQualityFeedback)return await finish(state,'REVISION_BUDGET_EXHAUSTED');
     const best=state.selectedCandidate===null?null:state.candidates[state.selectedCandidate],last=state.candidates.at(-1),parent=best||last;
     state.stage=index?'repairing':'generating';node(state,'propose.'+index,index?'repair':'generate',index?['verify.'+(parent?.index??index-1)]:['plan'],'running');
     const body={...commonBody(state),mode:index?'edit':state.mode,currentScene:lightweightScene(parent?.scene||state.initialScene),feedback:index?candidateFeedback(parent,last):'',...(state.editableObjectIds?{editableObjectIds:state.editableObjectIds}:{})};
     if(parent){const p=await store.get(parent.renderKey);body.image=p?.image;}
     const result=await operation(state,index?'revision_'+index:'generate',body,options.propose);
     if(result.action==='unsupported'||result.action==='blocked'){state.status='blocked';state.capabilityGaps=clone(result.capabilityGaps||result.qualityNotes||[result.message||'Unsupported operation']);return await finish(state,'CAPABILITY_GAP');}
     let raw=result.scene;if(result.action==='ops'&&options.applyOps&&parent)raw=await options.applyOps(parent.scene,result.ops);if(!raw)throw fail('SCENE_MISSING','生成器未返回可渲染场景。');
     candidate={index,parentIndex:parent?.index??null,scene:await hydrate(state,raw),provider:clone(result),createdAt:now(),status:'compiled',renderKey:'render:'+state.id+':'+index,critique:null,verification:null};state.candidates.push(candidate);if(index)state.feedbackCount++;node(state,'propose.'+index,'propose',[],'complete',{runId:result.runId||null});await emit(state,'candidate_compiled',{index,parentIndex:candidate.parentIndex});
    }
    let output=await store.get(candidate.renderKey);
    if(!output){state.stage='rendering';node(state,'render.'+index,'render',['propose.'+index],'running');const started=Date.now();output=await render(candidate.scene,state.modelSnapshot,{signal:controller.signal,representation:state.representation,coverage:true});check(controller.signal);
     if(!output||!Number.isInteger(output.width)||!Number.isInteger(output.height)||typeof output.image!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,/.test(output.image))throw fail('RENDER_FAILED','渲染器必须提供实际画面及其尺寸。');
     await store.set(candidate.renderKey,output);candidate.render={width:output.width,height:output.height,elapsedMs:Date.now()-started,report:clone(output.diagnostics||output.report||null),rgbaProvided:!!output.data};candidate.status='rendered';node(state,'render.'+index,'render',[],'complete',{renderKey:candidate.renderKey});await emit(state,'candidate_rendered',{index});
    }
    let evaluationError=null;
    if(!candidate.critique){state.stage='evaluating';node(state,'critique.'+index,'critique',['render.'+index],'running');try{const response=await operation(state,'critique_'+index,{...commonBody(state),mode:'critique',currentScene:lightweightScene(candidate.scene),image:output.image},options.evaluate);if(response.action!=='critique'||!Array.isArray(response.issues))throw fail('CRITIQUE_FAILED','没有基于画面的完整评价。');candidate.critique={...clone(response),imageEvidence:true,sourceFrameSha256:output.data?await V.digest(output.data):null,submittedImageDataURLSha256:await V.digest(output.image)};if(candidate.evaluationError){if(!candidate.evaluationFailures?.length)candidate.evaluationFailures=[clone(candidate.evaluationError)];candidate.evaluationRecoveredAt=now();delete candidate.evaluationError;}node(state,'critique.'+index,'critique',[],'complete',{runId:response.runId||null});await emit(state,'candidate_critiqued',{index,scores:response.scores||null});}
     catch(e){if(controller.signal.aborted)throw e;evaluationError=e;candidate.evaluationError={code:e.code||'EVALUATION_FAILED',message:clean(e),at:now(),reasoningEffort:state.reasoningEffort};(candidate.evaluationFailures ||= []).push(clone(candidate.evaluationError));node(state,'critique.'+index,'critique',[],'blocked',{error:candidate.evaluationError});}
    }
    state.stage='verifying';await verifyCandidate(state,candidate,output);candidate.status='verified';
    const previous=state.selectedCandidate===null?null:state.candidates[state.selectedCandidate];if(!previous||V.compareCandidates(candidate,previous)>0){state.selectedCandidate=index;state.selectionReason='Best evaluated candidate under hard constraints, observed reconstruction checks and advisory visual scores; ties retain the earlier candidate.';state.stagnantCandidates=0;}else if(previous.index!==candidate.index)state.stagnantCandidates++;
    await emit(state,'candidate_verified',{index,selectedCandidate:state.selectedCandidate,summary:candidate.verification.summary,diagnosis:candidate.diagnosis});try{await options.onCandidate?.(clone(candidate),output,clone(state));}catch(e){(state.observerErrors ||= []).push({at:now(),type:'onCandidate',message:clean(e)});}
    if(evaluationError){state.status='blocked';state.error={code:evaluationError.code||'EVALUATION_FAILED',message:clean(evaluationError)};return await finish(state,evaluationError.code==='BUDGET_EXHAUSTED'?'FINAL_EVALUATION_BUDGET_EXHAUSTED':'EVALUATION_UNAVAILABLE');}
    if(candidate.diagnosis.some(x=>x.status==='blocked')){state.status='blocked';state.capabilityGaps=candidate.diagnosis.filter(x=>x.status==='blocked');return await finish(state,'CAPABILITY_GAP');}
    if(candidate.verification.allRequiredPassed)return await finish(state,candidate.verification.photorealisticAccepted?'GOAL_ACCEPTED':'CHECKS_PASSED_INDEPENDENT_REVIEW_REQUIRED');
    if(state.stagnantCandidates>=state.budget.maxStagnantCandidates)return await finish(state,'QUALITY_PLATEAU');
    const actionable=candidate.critique.issues.some(x=>x.description&&x.code!=='unsupported')||candidate.verification.checks.some(c=>c.status==='failed'&&c.kind!=='perceptual');
    if(!actionable)return await finish(state,'NO_ACTIONABLE_REPAIR_WITH_UNRESOLVED_CHECKS');
   }
   return await finish(state,'CANDIDATE_BUDGET_EXHAUSTED');
  }catch(e){state.status=controller.signal.aborted||e.code==='CANCELLED'?'cancelled':['BUDGET_EXHAUSTED','CONTRACT_CHANGED','ASSET_MISSING','CAPABILITY_GAP','HASH_UNAVAILABLE'].includes(e.code)?'blocked':'failed';state.error={code:e.code||'TASK_FAILED',message:clean(e),at:now()};return await finish(state,state.error.code);}
  finally{active=null;controller=null;}
 }
 async function start(input){
  if(active)throw fail('BUSY','已有任务运行中。');if(!object(input)||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>8000)throw fail('INVALID_INPUT','请输入 1–8000 字符的目标描述。');
  if(input.mode==='learn'||input.learningPolicy==='always'||input.trainingAllowed===true)throw fail('TRAINING_DISABLED','0.10 本轮禁止模型训练；可进行逐图高斯参数拟合。');
  const representation=input.representation||'native_procedural';if(!['native_procedural','reference_gaussian'].includes(representation))throw fail('INVALID_INPUT','未知的表示模式。');const mode=input.mode||'generate',initialScene=input.currentScene||input.initialScene||null;if(!['generate','edit'].includes(mode)||mode==='edit'&&!initialScene)throw fail('INVALID_INPUT','编辑需要已有场景。');
  const effort=input.reasoningEffort||'high';if(!['high','max'].includes(effort))throw fail('INVALID_INPUT','推理档位应为 high 或 max。');const seed=input.seed??initialScene?.seed??42;if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw fail('INVALID_INPUT','种子应为 uint32。');
  const id=uid();active={id,status:'initializing'};
  try{
   const assets=clone(input.assets||initialScene?.assets||(options.getAssets?await options.getAssets():{})||{}),model=clone(input.modelSnapshot??(options.getModel?await options.getModel():initialScene?.appearanceModel??null));
   if(representation==='reference_gaussian'&&!Object.keys(assets).length)throw fail('ASSET_MISSING','参考高斯模式需要已拟合的资产；不会用空场景冒充。');
   const state={schema:SCHEMA,id,prompt:input.prompt,mode,representation,category:input.category||initialScene?.category||categoryFromPrompt(input.prompt),seed,reasoningEffort:effort,initialScene:clone(initialScene),assetSnapshot:assets,assetSummary:clone(input.assetSummary||(options.getAssetSummary?await options.getAssetSummary():[])||[]),modelSnapshot:model,trainingAllowed:false,capabilities:clone(input.capabilities||options.capabilities||{}),editableObjectIds:clone(input.editableObjectIds||null),budget:budget(input),plan:clone(input.plan||null),contract:input.contract?V.createContract(input.contract):null,contractInput:{width:input.width||initialScene?.width,height:input.height||initialScene?.height,referenceRequired:input.referenceRequired===true,referenceMAE:input.referenceMAE,perceptual:input.perceptual!==false},status:'queued',stage:'queued',createdAt:now(),updatedAt:now(),events:[],apiOperations:[],usage:[],candidates:[],selectedCandidate:null,feedbackCount:0,stagnantCandidates:0,taskGraph:{schema:'crf.task_graph.v0.10',nodes:[]},persistence:{durable:store.durable===true},masks:clone(input.masks||{})};
   if(state.contract)state.contractSha256=await V.digest(V.canonical(state.contract));
   if(input.reference){state.referenceKey='reference:'+id;await store.set(state.referenceKey,input.reference);}if(input.previousOutput){state.previousOutputKey='previous:'+id;await store.set(state.previousOutputKey,input.previousOutput);}
   await store.set('task:'+id,state);return await execute(state);
  }catch(e){active=null;throw e;}
 }
 async function resume(id,configuration={}){
  if(active)throw fail('BUSY','已有任务运行中。');const state=await store.get('task:'+id);if(state?.schema!==SCHEMA)throw fail('TASK_MISSING','找不到任务。');
  if(!object(configuration)||Object.keys(configuration).some(k=>!['reasoningEffort','budget','reason'].includes(k)))throw fail('INVALID_RESUME_CONFIGURATION','恢复配置只接受 reasoningEffort、budget 和 reason。');
  const configured=Object.keys(configuration).length>0;
  if(configured&&!['failed','blocked','cancelled'].includes(state.status))throw fail('RESUME_INELIGIBLE','仅可为失败、阻塞或取消的任务调整恢复配置。');
  if(['CAPABILITY_GAP','UNSUPPORTED_REQUIREMENTS','CONTRACT_CHANGED'].includes(state.stopReason)){if(configured)throw fail('RESUME_CAPABILITY_BLOCKED','推理档位无法补齐必需能力或改变验收合约；请建立目标明确的新任务。');return state;}
  if(state.status==='review_required')return state;
  const effort=configuration.reasoningEffort??state.reasoningEffort;if(!['high','max'].includes(effort))throw fail('INVALID_RESUME_CONFIGURATION','推理档位应为 high 或 max。');
  if(configuration.budget!==undefined&&(!object(configuration.budget)||Object.keys(configuration.budget).some(k=>!Object.hasOwn(state.budget,k))))throw fail('INVALID_RESUME_CONFIGURATION','恢复预算包含未知字段。');
  const nextBudget=budget({budget:{...state.budget,...(configuration.budget||{})}});
  if(nextBudget.maxCandidates<state.candidates.length||nextBudget.maxQualityFeedback<state.feedbackCount)throw fail('INVALID_RESUME_CONFIGURATION','恢复预算不能少于已经保留的候选或修订数量。');
  if(configuration.reason!==undefined&&typeof configuration.reason!=='string')throw fail('INVALID_RESUME_CONFIGURATION','恢复原因必须为文字。');
  if(active)throw fail('BUSY','已有任务运行中。');active={id,status:'resuming'};
  try{
   const entry={at:now(),previousStatus:state.status,previousStopReason:state.stopReason||null,previousError:clone(state.error),reason:clean(configuration.reason||'Explicit resume of unfinished task.'),reasoningEffortBefore:state.reasoningEffort,reasoningEffortAfter:effort,budgetBefore:clone(state.budget),budgetAfter:clone(nextBudget),retainedCandidates:state.candidates.length,retainedContractSha256:state.contractSha256||null,retainedUsage:usageTotals(state)};
   (state.resumptionHistory ||= []).push(entry);state.reasoningEffort=effort;state.budget=nextBudget;
   if(entry.reasoningEffortBefore!==effort)await emit(state,'reasoning_effort_changed',{before:entry.reasoningEffortBefore,after:effort,reason:entry.reason});
   await emit(state,'task_resuming',{configurationChanged:configured,retainedCandidates:state.candidates.length,previousStatus:entry.previousStatus});return await execute(state);
  }catch(e){active=null;throw e;}
 }
 function cancel(){if(!controller)return false;controller.abort();return true;}
 async function selectCandidate(id,index){if(active)throw fail('BUSY','任务运行时不能手动替换选择。');const state=await store.get('task:'+id);if(!state?.candidates[index]||!state.candidates[index].verification)throw fail('CANDIDATE_MISSING','候选尚无验证证据。');state.selectedCandidate=index;state.selectionReason='Explicit user selection; all prior failure and unknown checks remain.';state.quality=quality(state);await emit(state,'candidate_selected',{index});return state;}
 return{start,resume,cancel,selectCandidate,isRunning:()=>!!active,getTask:id=>store.get('task:'+id),getRender:(id,index)=>store.get('render:'+id+':'+index),async listTasks(){const keys=await store.keys('task:');return(await Promise.all(keys.map(k=>store.get(k)))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},store};
}
return{VERSION,SCHEMA,create,createMemoryStore,createIndexedDBStore,defaultApi,defaultRender,lightweightScene,modelSummary,categoryFromPrompt,budget};
});
