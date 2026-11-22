import test from 'node:test';
import assert from 'node:assert/strict';
import {researchGaussian08,aggregateLearningRounds08} from '../server/learning08.mjs';
const apiKey='test-only-learning-credential';
const a='https://commons.wikimedia.org/wiki/File:Apple_test.jpg',b='https://www.pexels.com/photo/apple-example-123/';
function response({search=true,summary}={}){return {id:'learning-request-1',model:'deepseek-flash',choices:[{message:{content:summary||JSON.stringify({summary:'发现轮廓与表皮纹理参考',features:['平滑轮廓与颗粒纹理需图像验证'],selectionCriteria:['主体完整'],uncertainties:['许可证待查'],nextFocus:'侧光'}),...(search?{server_tool_calls:[{calls:[{id:'search-1',type:'deepseek_web_search',kind:'image_search',status:'completed',action:{type:'search',queries:['apples photos Wikimedia Commons']},sources:[{url:a,title:'Apple',image_url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Apple_test.jpg'},{url:a,title:'duplicate'},{url:b,title:'Apple second photo'}]}],reasoning_content:'private search deliberation'}]}:{})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300}};}
function provider(data){const calls=[];return {calls,fetchImpl:async(u,o)=>{calls.push({url:u,body:JSON.parse(o.body)});return new Response(JSON.stringify(data));}};}

test('one request does one real search round with source dedupe, semantic uncertainty and checkpoint',async()=>{
 const m=provider(response());const r=await researchGaussian08({topic:'苹果',round:2,excludeSourceUrls:[b]}, {apiKey,fetchImpl:m.fetchImpl,searchFallback:false});
 assert.equal(r.ok,true);assert.equal(m.calls.length,1);assert.equal(r.round,2);assert.equal(r.sources.length,2);assert.equal(r.imageCandidates.length,1);assert.equal(r.checkpoint.newSourceCount,1);
 assert.deepEqual(r.checkpoint.queries,['apples photos Wikimedia Commons']);assert.deepEqual(r.checkpoint.requestIds,['learning-request-1']);assert.equal(r.checkpoint.fittedFunctionCount,0);
 assert.equal(r.semanticPlan.pixelAnalysisPerformed,false);assert.equal(r.semanticPlan.format,'model_semantic_plan');assert.equal(r.images.length,0);assert.equal(JSON.stringify(r).includes('private search deliberation'),false);
 assert.ok(m.calls[0].body.messages.at(-1).content[0].text.includes('4–6'));assert.ok(m.calls[0].body.messages.at(-1).content[0].text.includes('2/10'));
});

test('no actual tool invocation means the round is not counted as searched',async()=>{
 const m=provider(response({search:false,summary:'我搜索了许多参考照片。'}));
 const r=await researchGaussian08({query:'橙子',round:1,collectImages:true},{apiKey,fetchImpl:m.fetchImpl,searchFallback:false,collectReferences:async()=>{throw new Error('should not collect');}});
 assert.equal(r.ok,true);assert.equal(r.checkpoint.status,'search_not_observed');assert.equal(r.checkpoint.sourceCount,0);assert.equal(r.images.length,0);assert.equal(r.semanticPlan.format,'unstructured_model_summary');
});

test('downloaded images are separately recorded and never marked fitted',async()=>{
 const m=provider(response());let called=false;
 const r=await researchGaussian08({topic:'苹果',round:3,collectImages:true,maxImages:4},{apiKey,fetchImpl:m.fetchImpl,searchFallback:false,collectReferences:async(e,o)=>{called=true;assert.equal(o.maxImages,4);assert.equal(e.sources.length,2);return {images:[{url:'data:image/png;base64,YQ==',sourceUrl:a,sha256:'a'.repeat(64),width:200,height:200,bytes:44}],attempts:[{sourceUrl:a,status:'downloaded'}]};}});
 assert.equal(r.ok,true);assert.equal(called,true);assert.equal(r.checkpoint.downloadedImageCount,1);assert.equal(r.checkpoint.fittedFunctionCount,0);assert.equal(r.imageMetadata[0].pixelFitPerformed,false);assert.equal(r.imageMetadata[0].url,undefined);assert.equal(r.images[0].url.startsWith('data:'),true);
});

test('collection failure does not discard successful research evidence',async()=>{
 const m=provider(response());const r=await researchGaussian08({topic:'墙面',round:4,collectImages:true},{apiKey,fetchImpl:m.fetchImpl,searchFallback:false,collectReferences:async()=>{throw new Error('downloader offline');}});
 assert.equal(r.ok,true);assert.equal(r.checkpoint.status,'searched');assert.equal(r.images.length,0);assert.equal(r.sources.length,2);assert.ok(r.warnings.some(x=>x.includes('下载未完成')));
});

test('invalid round and asset request is rejected before calling provider',async()=>{
 for(const input of [{topic:'test',round:0},{topic:'test',round:11},{topic:'test',round:1,maxImages:30},{topic:'test',round:1,collectImages:'yes'},{round:1}]){
  const r=await researchGaussian08(input,{apiKey,fetchImpl:async()=>{throw new Error('should not call');}});assert.equal(r.ok,false);assert.equal(r.httpStatus,400);
 }
});

test('aggregate deduplicates retry rounds, source pages, requests and downloaded image hashes',()=>{
 const cp={sessionId:'test',round:1,status:'searched'};
 const rounds=[{checkpoint:cp,sources:[{url:a}],usage:{requests:[{requestId:'r1',total_tokens:15}]}},{checkpoint:{...cp,status:'failed'},sources:[{url:a},{url:b}],usage:{requests:[{requestId:'r1',total_tokens:15},{requestId:'r2',total_tokens:8}]}},{checkpoint:{...cp,round:2,status:'search_not_observed'},sources:[],usage:{requests:[]}}];
 const d={status:'downloaded',bytes:123,sha256:'a'.repeat(64)};
 const r=aggregateLearningRounds08(rounds,{downloads:[d,d,{status:'unavailable',bytes:12,sha256:'b'.repeat(64)}],fits:[{assetId:'apple',status:'fitted',gaussianCount:4096},{assetId:'apple',status:'fitted',gaussianCount:8192}]});
 assert.equal(r.counts.completedSearchRounds,1);assert.equal(r.counts.distinctSourcePages,2);assert.equal(r.counts.downloadedDistinctImages,1);assert.equal(r.counts.fittedFunctions,1);assert.equal(r.counts.providerCalls,2);assert.equal(r.usage.total_tokens,23);assert.equal(r.modelWeightsUpdated,false);
});

import {learnSemanticDescriptors08} from '../server/learning08.mjs';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII=';
function semantics(){return {items:[{id:'photo.apple',label:'单只苹果',category:'apple',role:'object',bbox:[.1,.05,.9,.95],palette:[[180,40,30],[230,210,170]],lightDirection:'left',description:'左侧高光、红色表皮、背景浅色。',tags:['apple','red','still-life'],limitations:['边界框不等于分割']}],sharedFeatures:['暖色照明'],missingEvidence:['背面不可见']};}
function semanticResponse(data=semantics()){return {id:'semantic-1',model:'deepseek-flash',choices:[{message:{content:JSON.stringify(data),reasoning_content:'do not persist private reasoning'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300,completion_tokens_details:{reasoning_tokens:80}}};}
const semanticInput=()=>({topic:'水果外观',round:1,images:[{id:'photo.apple',url:PNG,sourceUrl:a,sha256:'a'.repeat(64)}]});

test('semantic learning submits real image bytes and returns bounded descriptors tied to source IDs',async()=>{
 const m=provider(semanticResponse());const r=await learnSemanticDescriptors08(semanticInput(),{apiKey,fetchImpl:m.fetchImpl,schemaRepair:false});
 assert.equal(r.ok,true);assert.equal(r.items[0].id,'photo.apple');assert.deepEqual(r.items[0].bbox,[.1,.05,.9,.95]);
 assert.equal(m.calls[0].body.thinking.type,'enabled');assert.equal(m.calls[0].body.messages[1].content[2].image_url.url,PNG);
 assert.equal(r.images[0].submittedToVision,true);assert.equal(r.images[0].sha256,'a'.repeat(64));assert.equal(r.images[0].url,undefined);
 assert.equal(r.usage.reasoning_tokens,80);assert.equal(r.usage.requests[0].referenceImagesProvided,1);assert.equal(r.modelWeightsUpdated,false);assert.equal(r.validation.pixelMaskVerified,false);
 assert.equal(JSON.stringify(r).includes('do not persist private reasoning'),false);assert.equal(JSON.stringify(r).includes('base64,'),false);
});

test('semantic model cannot substitute source IDs or return invalid bounding boxes',async()=>{
 for(const mutate of [v=>v.items[0].id='other.image',v=>v.items[0].bbox=[.9,.2,.1,.8],v=>v.items[0].palette=[[300,2,3]],v=>v.items[0].role='complete-world',v=>v.items.push({...v.items[0]})]){
  const data=semantics();mutate(data);const m=provider(semanticResponse(data));const r=await learnSemanticDescriptors08(semanticInput(),{apiKey,fetchImpl:m.fetchImpl,schemaRepair:false});assert.equal(r.ok,false);assert.equal(r.items,undefined);assert.equal(r.usage.providerCalls,1);
 }
});

test('semantic validation rejects remote URLs in place of provided bytes and oversized inputs',async()=>{
 for(const mutate of [v=>v.images[0].url='https://example.org/image.jpg',v=>v.images[0].url='data:image/png;base64,'+'A'.repeat(6000001),v=>v.images[0].sourceUrl='file:///secret',v=>v.images.push({...v.images[0]})]){
  const input=semanticInput();mutate(input);const r=await learnSemanticDescriptors08(input,{apiKey,fetchImpl:async()=>{throw new Error('must not call');}});assert.equal(r.ok,false);assert.equal(r.usage.providerCalls,0);
 }
});
