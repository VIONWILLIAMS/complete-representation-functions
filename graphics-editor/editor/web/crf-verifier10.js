/* CRF 0.10 evidence verifier. Numerical checks concern the submitted frame.
 * Model opinion, parameter declarations and exact pixel checks stay separate.
 * No training, source image decoding, network access or model calls happen here.
 */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.CRF10Verifier=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const VERSION='0.10.0',CONTRACT_SCHEMA='crf.goal_contract.v0.10',RESULT_SCHEMA='crf.verification.v0.10';
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clean=x=>String(x??'').replace(/sk-[A-Za-z0-9_-]{12,}/g,'[credential removed]').slice(0,1800);
const statusNames=['passed','failed','unknown','blocked'];
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(ArrayBuffer.isView(value))return'['+Array.from(value).map(canonical).join(',')+']';
 if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';
 return'{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
async function digest(value){
 const bytes=typeof value==='string'?new TextEncoder().encode(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):value instanceof ArrayBuffer?new Uint8Array(value):Uint8Array.from(value);
 if(root.crypto?.subtle)return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 if(typeof require==='function')return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
 return null;
}
function frameValid(frame){
 if(!frame||!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<1||frame.height<1||frame.width*frame.height>16777216)return{ok:false,reason:'Invalid frame dimensions.'};
 if(!frame.data)return{ok:null,reason:'RGBA samples were not supplied; encoded preview alone is not pixel evidence.'};
 if(frame.data.length!==frame.width*frame.height*4)return{ok:false,reason:'RGBA sample count differs from width × height × 4.'};
 for(let i=0;i<frame.data.length;i++)if(!Number.isInteger(frame.data[i])||frame.data[i]<0||frame.data[i]>255)return{ok:false,reason:'RGBA samples must be finite bytes.'};
 return{ok:true};
}
function maskAt(mask,i){return!mask||mask[i]>0;}
function measurePixels(reference,frame,mask){
 if(frameValid(reference).ok!==true||frameValid(frame).ok!==true)throw new Error('Pixel measurement requires two valid RGBA frames.');
 if(reference.width!==frame.width||reference.height!==frame.height)throw new Error('Reference and output must have identical dimensions; verifier never resizes evidence.');
 const {width:w,height:h}=frame,n=w*h;if(mask&&mask.length!==n)throw new Error('ROI mask length must equal frame pixel count.');
 let samples=0,sum=0,squared=0,max=0,exactRGB=0,exactRGBA=0,alphaSum=0;const histogram=new Uint32Array(256);
 for(let i=0;i<n;i++){if(!maskAt(mask,i))continue;samples++;let equal=true;
  for(let c=0;c<3;c++){const d=Math.abs(reference.data[i*4+c]-frame.data[i*4+c]);sum+=d;squared+=d*d;max=Math.max(max,d);histogram[d]++;if(d)equal=false;}
  const ad=Math.abs(reference.data[i*4+3]-frame.data[i*4+3]);alphaSum+=ad;if(equal)exactRGB++;if(equal&&!ad)exactRGBA++;
 }
 if(!samples)throw new Error('ROI mask contains no evaluated pixel.');
 let gradientSum=0,gradientSamples=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!maskAt(mask,i))continue;
  for(const j of [x+1<w?i+1:-1,y+1<h?i+w:-1]){if(j<0||!maskAt(mask,j))continue;for(let c=0;c<3;c++){gradientSum+=Math.abs((reference.data[j*4+c]-reference.data[i*4+c])-(frame.data[j*4+c]-frame.data[i*4+c]));gradientSamples++;}}
 }
 let cumulative=0,p95=0;for(let i=0;i<256;i++){cumulative+=histogram[i];if(cumulative>=samples*3*.95){p95=i;break;}}
 const mse=squared/(samples*3);
 return{pixels:samples,totalPixels:n,coverage:samples/n,mae:sum/(samples*3),rmse:Math.sqrt(mse),mse,psnr:mse===0?null:10*Math.log10(255*255/mse),perfectRGB:mse===0,maxChannelError:max,p95ChannelError:p95,exactRGB:exactRGB/samples,exactRGBA:exactRGBA/samples,alphaMAE:alphaSum/samples,gradientMAE:gradientSamples?gradientSum/gradientSamples:0,protocol:'aligned_unresized_rgba8_rgb_error_and_forward_difference_v1',psnrNullMeaning:'positive_infinity_only_when_perfectRGB'};
}
function allFinite(value,path='scene',seen=new Set()){
 if(typeof value==='number')return Number.isFinite(value)?null:path;
 if(!value||typeof value!=='object'||seen.has(value))return null;seen.add(value);
 for(const key of Object.keys(value)){const bad=allFinite(value[key],path+'.'+key,seen);if(bad)return bad;}return null;
}
function resolveObjects(scene,assetSummary=[]){
 const list=(scene?.objects||[]).map(clone),byId=new Map(list.map(o=>[o.id,o])),done=new Set(),visiting=new Set();
 function visit(o){if(done.has(o.id))return;if(visiting.has(o.id))throw new Error('Cyclic object attachment.');visiting.add(o.id);if(o.attachment){const p=byId.get(o.attachment.parentId);if(!p||!Array.isArray(o.attachment.anchor)||o.attachment.anchor.length!==2)throw new Error('Missing parent or invalid attachment anchor.');visit(p);o.x=p.x+o.attachment.anchor[0];o.y=p.y+o.attachment.anchor[1];if(p.visible===false)o.visible=false;}visiting.delete(o.id);done.add(o.id);}
 const ref=scene?.schema==='crf.gaussian_scene.v0.10';
 for(const o of list){visit(o);const a=assetSummary.find(x=>x.id===o.assetId);o.semanticType=o.type||o.semanticType||a?.semanticType||a?.type||null;
  if(ref){o.x=o.x/(scene.width||1);o.y=o.y/(scene.height||1);}else{const camera=scene.camera||{},z=camera.zoom??1,d=o.depth??.5;o.x=.5+(o.x-.5)*z-(camera.panX||0)*(.25+.75*d);o.y=.5+(o.y-.5)*z-(camera.panY||0)*(.25+.75*d);}
 }return list;
}
function selectObjects(objects,subject){return objects.filter(o=>o.visible!==false&&(subject==='*'||o.id===subject||o.assetId===subject||o.semanticType===subject));}
function declaration(scene,c,assetSummary){
 let visible;try{visible=resolveObjects(scene,assetSummary);}catch(e){return{status:'failed',reason:e.message};}
 const objects=selectObjects(visible,c.subject),targets=selectObjects(visible,c.target);let observed;
 if(c.type==='count'){observed=objects.length;return{status:observed===c.value?'passed':'failed',observed};}
 if(c.type==='visible'){observed=objects.length>0;return{status:observed===c.value?'passed':'failed',observed};}
 if(c.type==='color'){
  if(!objects.length||objects.some(o=>!Array.isArray(o.color)))return{status:'unknown',reason:'Declared base RGB is absent. Gaussian albedo multiplier is not observed pixel color.'};
  observed=objects.map(o=>o.color);return{status:objects.every(o=>Math.hypot(...o.color.map((v,i)=>v-c.value[i]))<=(c.tolerance??35))?'passed':'failed',observed};
 }
 if(!['left_of','right_of','above','below'].includes(c.type))return{status:'unknown',reason:'Unsupported declaration predicate.'};
 if(!objects.length||!targets.length)return{status:'failed',reason:'The subject or target is absent.'};
 const axis=['above','below'].includes(c.type)?'y':'x',a=objects.reduce((s,o)=>s+o[axis],0)/objects.length,b=targets.reduce((s,o)=>s+o[axis],0)/targets.length;
 if(!finite(a)||!finite(b))return{status:'unknown',reason:'No comparable scene coordinates.'};
 observed={subjectMean:a,targetMean:b};return{status:(['left_of','above'].includes(c.type)?a<b:a>b)?'passed':'failed',observed};
}
function createContract(input={}){
 if(input.schema===CONTRACT_SCHEMA){const result=clone(input);validateContract(result);return result;}
 const checks=[{id:'program.finite',kind:'program',type:'finite_parameters',required:true},{id:'render.frame',kind:'pixel',type:'valid_frame',required:true}];
 if(input.width&&input.height)checks.push({id:'render.dimensions',kind:'pixel',type:'dimensions',required:true,value:[input.width,input.height]});
 for(const [i,c] of (input.plan?.constraints||input.constraints||[]).entries())checks.push({id:'declaration.'+i,kind:'declaration',type:'declaration',required:true,constraint:clone(c)});
 if(input.referenceRequired){checks.push({id:'reference.mae',kind:'measurement',type:'reference_mae',required:true,threshold:input.referenceMAE??3});if(input.referencePSNR!==undefined)checks.push({id:'reference.psnr',kind:'measurement',type:'reference_psnr',required:true,threshold:input.referencePSNR});}
 if(input.protectedMask)checks.push({id:'edit.protected',kind:'pixel',type:'protected_rgba',required:true,maskKey:input.protectedMask,threshold:0});
 if(input.perceptual!==false){checks.push({id:'visual.realism',kind:'perceptual',type:'visual_score',required:true,metric:'realism',threshold:input.realismThreshold??4},{id:'visual.semantic',kind:'perceptual',type:'visual_score',required:true,metric:'semantic',threshold:input.semanticThreshold??4},{id:'visual.coherence',kind:'perceptual',type:'visual_score',required:true,metric:'coherence',threshold:4},{id:'visual.major_issues',kind:'perceptual',type:'no_major_issues',required:true});}
 checks.push(...clone(input.checks||[]));
 const contract={schema:CONTRACT_SCHEMA,id:input.id||'goal',representation:input.representation||'native_procedural',checks,requirements:clone(input.requirements||[]),acceptancePolicy:'all_required_checks_and_independent_visual_review_for_photorealism',revision:1};validateContract(contract);return contract;
}
function validateContract(contract){
 if(!contract||contract.schema!==CONTRACT_SCHEMA||!Array.isArray(contract.checks)||contract.checks.length>128)throw new Error('Invalid goal contract.');
 const ids=new Set();for(const c of contract.checks){if(!c||typeof c.id!=='string'||!c.id||ids.has(c.id))throw new Error('Goal check IDs must be unique.');ids.add(c.id);if(!['program','pixel','measurement','declaration','perceptual','provenance'].includes(c.kind)||typeof c.type!=='string')throw new Error('Invalid goal check kind/type.');if(c.threshold!==undefined&&!finite(c.threshold))throw new Error('Goal thresholds must be finite.');}return true;
}
function summarize(checks){const out={passed:0,failed:0,unknown:0,blocked:0,total:checks.length,required:0,requiredPassed:0};for(const c of checks){out[c.status]++;if(c.required!==false){out.required++;if(c.status==='passed')out.requiredPassed++;}}return out;}
function diagnose(critique,capabilities={}){
 const mapping={edge:'boundary_and_sampling',contact:'attachment_and_occlusion',lighting:'illumination',composition:'layout',semantic:'semantic_program',texture:'appearance',unsupported:'capability_gap'};
 const gaps=(critique?.capabilityGaps||[]).map(g=>typeof g==='string'?{capability:g,description:g,requiredForGoal:null}:g);
 const issues=(critique?.issues||[]).map(issue=>{const missing=issue.code==='unsupported'||capabilities.unsupportedIssueCodes?.includes(issue.code)||issue.requiredCapability&&!capabilities.operations?.includes(issue.requiredCapability),requiredForGoal=issue.requiredForGoal===true?true:issue.requiredForGoal===false?false:issue.code==='unsupported'?true:null;return{module:mapping[issue.code]||'scene_program',status:missing?(requiredForGoal===true?'blocked':'unknown'):'actionable',severity:issue.severity||'minor',objectIds:clone(issue.objectIds||[]),reason:clean(issue.description),requiredCapability:issue.requiredCapability||null,requiredForGoal};});
 for(const gap of gaps){const requiredForGoal=gap.requiredForGoal===true?true:gap.requiredForGoal===false?false:null;issues.push({module:'capability_gap',status:requiredForGoal===true?'blocked':'unknown',severity:gap.severity||'major',objectIds:clone(gap.objectIds||[]),reason:clean(gap.description||gap.capability),requiredCapability:gap.capability||null,requiredForGoal,scope:requiredForGoal===true?'required_for_goal':requiredForGoal===false?'general_limitation':'goal_relevance_unresolved'});}return issues;
}
async function verify({scene,output,contract,reference=null,previousOutput=null,masks={},critique=null,capabilities={},assetSummary=[],validateScene=null,independentReview=null}={}){
 contract=createContract(contract||{width:scene?.width,height:scene?.height});
 const checks=[],frame=frameValid(output),fingerprint=frame.ok===true?await digest(output.data):null,sceneHash=await digest(canonical(scene)),contractHash=await digest(canonical(contract));
 const critiqueMatches=!!(fingerprint&&critique?.sourceFrameSha256===fingerprint&&critique?.imageEvidence===true);
 const cache=new Map();
 function metrics(maskKey){const key=maskKey||'all';if(!cache.has(key))cache.set(key,measurePixels(reference,output,maskKey?masks[maskKey]:null));return cache.get(key);}
 for(const rule of contract.checks){let result={status:'unknown',reason:'This predicate has no registered verifier.'};
  try{
   if(rule.type==='finite_parameters'){const bad=allFinite(scene);result=bad?{status:'failed',observed:bad,reason:'Non-finite parameter.'}:{status:'passed',observed:true};if(validateScene){const v=validateScene(scene);if(v!==true&&v?.ok!==true)result={status:'failed',reason:clean(v?.errors?.join(';')||'Renderer rejected scene.')};}}
   else if(rule.type==='valid_frame')result={status:frame.ok===true?'passed':frame.ok===false?'failed':'unknown',reason:frame.reason||'Actual finite RGBA8 samples provided.',observed:frame.ok};
   else if(rule.type==='dimensions')result={status:output?.width===rule.value?.[0]&&output?.height===rule.value?.[1]?'passed':'failed',observed:[output?.width??null,output?.height??null]};
   else if(rule.type==='declaration')result={...declaration(scene,rule.constraint,assetSummary),scope:'Declared scene parameters only; excludes final-image recognition and occlusion.'};
   else if(['reference_mae','reference_psnr','reference_gradient_mae','reference_exact_rgb'].includes(rule.type)){
    if(!reference)result={status:'unknown',reason:'No independently supplied aligned reference frame.'};
    else if(rule.maskKey&&!masks[rule.maskKey])result={status:'unknown',reason:'Requested ROI mask is missing.'};
    else{const m=metrics(rule.maskKey),key={reference_mae:'mae',reference_psnr:'psnr',reference_gradient_mae:'gradientMAE',reference_exact_rgb:'exactRGB'}[rule.type],v=m[key],passed=rule.type==='reference_psnr'?(m.perfectRGB||v>=rule.threshold):rule.type==='reference_exact_rgb'?v>=rule.threshold:v<=rule.threshold;result={status:passed?'passed':'failed',observed:v,threshold:rule.threshold,metrics:m,scope:'Observed reference reconstruction; not novel-image generative quality.'};}
   }else if(rule.type==='protected_rgba'){
    const mask=masks[rule.maskKey];if(!previousOutput||!mask)result={status:'unknown',reason:'Protected-mask and pre-edit RGBA are both required.'};
    else{const m=measurePixels(previousOutput,output,mask);result={status:m.exactRGBA===1?'passed':'failed',observed:m.exactRGBA,pixels:m.pixels,scope:'Finite specified output pixels, all RGBA channels.'};}
   }else if(rule.type==='visible_coverage'){
    const coverage=output?.objectCoverage?.[rule.objectId],semantics=output?.diagnostics?.coverageSemantics||output?.report?.coverageSemantics;
    if(!coverage||semantics!=='visible_alpha_contribution')result={status:'unknown',reason:'Actual post-occlusion visible contribution was not supplied.'};
    else if(coverage.length!==output.width*output.height||!Array.from(coverage).every(a=>finite(a)&&a>=0&&a<=1))result={status:'failed',reason:'Visible coverage must contain one finite alpha contribution per rendered pixel.'};
    else{let pixels=0;for(const a of coverage)if(a>(rule.alphaThreshold??.01))pixels++;result={status:pixels>=(rule.minimumPixels??1)?'passed':'failed',observed:pixels,scope:'Actual visible alpha contribution; object identity remains a declaration.'};}
   }else if(rule.type==='visual_score'){
    const v=critique?.scores?.[rule.metric];result=finite(v)&&critiqueMatches?{status:v>=rule.threshold?'passed':'failed',observed:v,threshold:rule.threshold,scope:'Model-assisted perception, not a formal proof or independent human certificate.'}:{status:'unknown',reason:'No version-matched model evaluation of this actual rendered frame.'};
   }else if(rule.type==='no_major_issues'){
    if(!Array.isArray(critique?.issues)||!critiqueMatches)result={status:'unknown',reason:'Version-matched actual-frame visual evaluation is missing.'};else{const issues=critique.issues.filter(x=>['major','critical'].includes(x.severity));result={status:issues.length?'failed':'passed',observed:issues.length,issues:clone(issues),scope:'Model-assisted perception only.'};}
   }else if(rule.type==='capability'){const supported=capabilities.operations?.includes(rule.value);result={status:supported?'passed':'blocked',observed:supported,reason:supported?'Registered operation available.':'Required operation is not registered.'};}
   else if(rule.type==='external_evidence'){
    const e=output?.evidence?.[rule.evidenceKey];if(fingerprint&&e&&e.imageSha256===fingerprint&&statusNames.includes(e.status))result={...clone(e),scope:'Externally supplied evidence; evidence producer identity is retained.'};else result={status:'unknown',reason:'Version-matched external evidence unavailable.'};
   }
  }catch(e){result={status:'unknown',reason:clean(e)};}
  checks.push({id:rule.id,kind:rule.kind,type:rule.type,required:rule.required!==false,...result,evidence:{sceneSha256:sceneHash,imageSha256:fingerprint,contractSha256:contractHash}});
 }
 const required=checks.filter(c=>c.required),hard=required.filter(c=>['program','pixel','declaration'].includes(c.kind)),measurement=required.filter(c=>c.kind==='measurement'),perceptual=required.filter(c=>c.kind==='perceptual');
 const all=rows=>rows.every(c=>c.status==='passed'),hardPassed=all(hard),measurementPassed=all(measurement),perceptualPassed=perceptual.length>0&&all(perceptual),allRequiredPassed=all(required);
 const reviewed=!!(independentReview?.passed===true&&independentReview?.imageSha256&&independentReview.imageSha256===fingerprint&&independentReview.reviewer);
 const referenceChecks=measurement.filter(c=>['reference_mae','reference_psnr','reference_gradient_mae','reference_exact_rgb'].includes(c.type));
 return{schema:RESULT_SCHEMA,checkedAt:new Date().toISOString(),imageSha256:fingerprint,sceneSha256:sceneHash,contractSha256:contractHash,checks,summary:summarize(checks),hardPassed,measurementPassed,perceptualPassed,allRequiredPassed,independentReview:reviewed?clone(independentReview):null,photorealisticAccepted:allRequiredPassed&&perceptualPassed&&reviewed,referenceReconstructionAccepted:hardPassed&&referenceChecks.length>0&&measurementPassed,unknowns:checks.filter(c=>c.status==='unknown').map(c=>c.id),blocked:checks.filter(c=>c.status==='blocked').map(c=>c.id),diagnosis:diagnose(critique,capabilities),scope:'Contract checks on this exact scene/frame; no universal correctness or unseen-world claim.'};
}
function ranking(candidate){
 const v=candidate?.verification;if(!v)return null;const checks=v.checks||[],hard=checks.filter(c=>c.required&&['program','pixel','declaration'].includes(c.kind));
 const unresolved=hard.filter(c=>c.status!=='passed').length,measurement=checks.filter(c=>c.required&&c.kind==='measurement'),measurementFailures=measurement.filter(c=>c.status!=='passed').length;
 const scores=candidate.critique?.scores||{},hasScores=['realism','semantic','coherence'].every(k=>finite(scores[k])),visual=hasScores?(scores.realism*2+scores.semantic+scores.coherence)/4:null;
 const perceptualUnresolved=checks.filter(c=>c.required&&c.kind==='perceptual'&&c.status!=='passed').length;
 const perceptualUnknowns=checks.filter(c=>c.required&&c.kind==='perceptual'&&['unknown','blocked'].includes(c.status)).length;
 const major=(candidate.critique?.issues||[]).reduce((n,x)=>n+(x.severity==='critical'?3:x.severity==='major'?1:0),0);
 const error=measurement.filter(c=>c.type==='reference_mae'&&finite(c.observed)).reduce((n,c)=>n+c.observed,0);
 return{unresolved,measurementFailures,allRequiredPassed:v.allRequiredPassed===true,perceptualUnresolved,perceptualUnknowns,visual,major,error,evaluated:!!candidate.critique,photorealisticAccepted:v.photorealisticAccepted===true};
}
function compareCandidates(a,b,{minVisualGain=.025}={}){
 const x=ranking(a),y=ranking(b);if(!x)return-1;if(!y)return 1;
 for(const key of ['unresolved','measurementFailures'])if(x[key]!==y[key])return x[key]<y[key]?1:-1;
 if(x.allRequiredPassed!==y.allRequiredPassed)return x.allRequiredPassed?1:-1;
 for(const key of ['perceptualUnresolved','perceptualUnknowns'])if(x[key]!==y[key])return x[key]<y[key]?1:-1;
 if(x.evaluated!==y.evaluated)return x.evaluated?1:-1;
 if(x.visual!==null&&y.visual!==null&&Math.abs(x.visual-y.visual)>=minVisualGain)return x.visual>y.visual?1:-1;
 if(x.major!==y.major)return x.major<y.major?1:-1;
 if(Math.abs(x.error-y.error)>1e-6)return x.error<y.error?1:-1;
 return 0; // Ties preserve earlier evidence; a newer candidate is not inherently better.
}
function selectBest(candidates,options){let best=null;for(const c of candidates)if(c?.verification&&(!best||compareCandidates(c,best,options)>0))best=c;return best;}
return{VERSION,CONTRACT_SCHEMA,RESULT_SCHEMA,canonical,digest,frameValid,measurePixels,createContract,validateContract,verify,summarize,resolveObjects,diagnose,ranking,compareCandidates,selectBest};
});
