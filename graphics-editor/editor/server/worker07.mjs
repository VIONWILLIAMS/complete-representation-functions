import {research,compose,generate,DEFAULT_MODEL} from './deepseek07.mjs';
import Photo07 from '../web/crf-photo07.js';
import {collectReferences07} from './references07.mjs';
import {generateCanvas} from './canvas07.mjs';
import {generateGaussian08} from './gaussian08.mjs';
import {researchGaussian08,learnSemanticDescriptors08} from './learning08.mjs';
import gaussianCatalog from './catalog08.json' with {type:'json'};
import {servePackedAsset08} from './packed_assets08.mjs';
import {servePackedArchive09} from './packed_archives09.mjs';
import {generateNative09} from './generative09.mjs';
import {generateNative10} from './generative10.mjs';

const MAX_BODY=6*1024*1024;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const failure=(code,message,status)=>json({ok:false,error:{code,message,retryable:false}},status);
async function readBounded(request){
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)throw new Error('body_limit');
  const reader=request.body?.getReader();if(!reader)throw new Error('json_body_required');
  const chunks=[];let size=0;
  while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error('body_limit');}chunks.push(item.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/crf/')){
      const archive=await servePackedArchive09(request,env);
      if(archive)return archive;
      const packed=await servePackedAsset08(request,env);
      if(packed)return packed;
      if(env.ASSETS?.fetch)return env.ASSETS.fetch(request);
      return new Response('Static asset binding is unavailable.',{status:503});
    }
    // This shared API is deployed behind the existing owner-private Sites policy.
    // Service access is also enforced by Sites dispatch before this handler.
    const origin=request.headers.get('origin');
    if(origin&&origin!==url.origin)return failure('origin_rejected','请求必须来自当前编辑器。',403);
    const key=env.DEEPSEEK_API_KEY;
    if(request.method==='GET'&&url.pathname==='/api/crf/status'){
      return json({ok:true,version:'0.10.0',releaseStatus:'frozen_model_research_release',configured:typeof key==='string'&&key.length>0,model:DEFAULT_MODEL,connection:'configuration_only',capabilities:{search:true,vision:true,programOutput:true,gaussianFunctions:true,referenceLearning:true,semanticComposition:true,sharedAppearanceLearning:true,nativeSceneGeneration:true,resumableTasks:true,gaussian10:true,pixelFootprintFiltering:true,everyCandidateEvaluated:true},currentWorkflow:{modelTraining:false,sharedModelUpdates:false,referenceDerivedCompositing:true,physicalRelighting:false,unseen3DRecovery:false},quality:{photorealism:'not_certified',fullPlanAcceptance:'see_assets/v10/acceptance.json'},secretLocation:'server',message:key?'服务端已配置；实际调用结果将显示在对话记录中。':'服务端尚未配置测试密钥。'});
    }
    const handlers={'/api/crf/research':research,'/api/crf/compose':compose,'/api/crf/generate':generate,'/api/crf/canvas/generate':generateCanvas,'/api/crf/gaussian/generate':generateGaussian08,'/api/crf/gaussian/research':researchGaussian08,'/api/crf/gaussian/describe':learnSemanticDescriptors08,'/api/crf/gaussian/semantics':learnSemanticDescriptors08,'/api/crf/native/generate':generateNative09,'/api/crf/native10/generate':generateNative10};
    if(!handlers[url.pathname])return failure('not_found','未知的 CRF 接口。',404);
    if(request.method!=='POST')return failure('method_not_allowed','此接口需要 POST。',405);
    if(!key)return failure('not_configured','服务端尚未配置 DeepSeek 密钥。',503);
    if(!request.headers.get('content-type')?.includes('application/json'))return failure('content_type','请求需要 JSON。',415);
    let input;try{input=await readBounded(request);}catch(error){return failure(error.message==='body_limit'?'body_limit':'invalid_json',error.message==='body_limit'?'请求超过 6 MiB 限制。':'请求 JSON 无效。',error.message==='body_limit'?413:400);}
    try{
      const result=await handlers[url.pathname](input,{apiKey:key,model:DEFAULT_MODEL,catalog:gaussianCatalog,signal:request.signal,onProviderResponse:typeof env.CRF_DIAGNOSTICS==='function'?env.CRF_DIAGNOSTICS:undefined,validateProgram:program=>Photo07.validate(program),...(url.pathname.startsWith('/api/crf/gaussian/')?{}:{collectReferences:evidence=>collectReferences07(evidence,{signal:request.signal,maxImages:6})})});
      return json(result,result.ok===false?(result.httpStatus||502):200);
    }catch(error){
      const message=String(error?.message||'').replaceAll(key,'[redacted]');
      if(request.signal.aborted)return failure('aborted','请求已取消。',499);
      return failure('request_failed',message.length<240?message:'模型请求未完成，请查看状态后重试。',502);
    }
  }
};
