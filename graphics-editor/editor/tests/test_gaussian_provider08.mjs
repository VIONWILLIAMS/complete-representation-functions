import test from 'node:test';
import assert from 'node:assert/strict';
import {generateGaussian08,validateGaussianScene08,gaussianCatalog08,GAUSSIAN_SCHEMA08} from '../server/gaussian08.mjs';
const apiKey='test-only-not-a-real-credential';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII=';
const catalog={assets:[{id:'fruit.apple',label:'红苹果函数',width:300,height:300,description:'从实拍拟合的有遮罩苹果'},{id:'fruit.table',label:'桌面',width:960,height:640}]};
function scene(){return {schema:GAUSSIAN_SCHEMA08,id:'two-apples',title:'桌上苹果',width:960,height:640,background:[225,220,210],objects:[{id:'table',label:'桌面',assetId:'fruit.table',x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1,visible:true,hue:0,exposure:0,zIndex:0},{id:'apple',label:'苹果',assetId:'fruit.apple',x:300,y:210,scaleX:1,scaleY:1,rotation:0,opacity:1,visible:true,hue:0,exposure:0,zIndex:1}]};}
const envelope=(s=scene())=>({action:'scene',scene:s,message:'已编排拟合函数，等待实际渲染。',qualityNotes:['检查边缘与接触'],warnings:[]});
function reply(value,extra={}) {return {id:'request-test',model:'deepseek-flash',choices:[{message:{content:typeof value==='string'?value:JSON.stringify(value),reasoning_content:'private deliberation never persist'},finish_reason:'stop'}],usage:{prompt_tokens:80,completion_tokens:240,total_tokens:320,completion_tokens_details:{reasoning_tokens:100}},...extra};}
function mock(values){const calls=[];return {calls,fetchImpl:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});const item=values.shift();assert.notEqual(item,undefined,'unexpected provider request');return item instanceof Response?item:new Response(JSON.stringify(item),{headers:{'content-type':'application/json'}});}};}
const opts=(m,extra={})=>({apiKey,catalog,fetchImpl:m.fetchImpl,schemaRepair:false,...extra});
const generate=(prompt='两只苹果')=>({prompt,search:false});

test('composition enables reasoning and uses only catalogue functions; no private reasoning returned',async()=>{
 const m=mock([reply(envelope())]);const result=await generateGaussian08(generate(),opts(m));
 assert.equal(result.ok,true);assert.equal(result.scene.schema,GAUSSIAN_SCHEMA08);assert.equal(result.rendered,false);
 assert.deepEqual(m.calls[0].body.thinking,{type:'enabled'});assert.equal(m.calls[0].body.reasoning_effort,'high');
 assert.deepEqual(m.calls[0].body.response_format,{type:'json_object'});assert.equal(m.calls[0].body.tools,undefined);
 assert.equal(result.usage.reasoning_tokens,100);assert.equal(result.usage.requests[0].reasoningObserved,true);
 assert.equal(JSON.stringify(result).includes('private deliberation'),false);assert.equal(JSON.stringify(result).includes(apiKey),false);
 assert.equal(result.scene.assets,undefined);assert.equal(result.validation.renderer,false);assert.equal(result.quality.automaticRealismScore,false);
});

test('scene bounds and allowlists reject unknown assets and nonfinite transforms before use',()=>{
 for(const mutate of [s=>s.objects[0].assetId='unknown',s=>s.objects[0].scaleX=NaN,s=>s.objects[0].shadow={},s=>s.objects[1].id='table',s=>s.width=50000]){
  const s=scene();mutate(s);assert.throws(()=>validateGaussianScene08(s,catalog));
 }
 const s=scene();s.assets={untrusted:{rgb:'pixels'}};s.provenance={verified:true};const v=validateGaussianScene08(s,catalog);
 assert.equal(v.assets,undefined);assert.equal(v.provenance,undefined);
});

test('invalid current state and invalid images do not call the provider',async()=>{
 for(const input of [{prompt:'改图',mode:'edit'}, {prompt:'检查',mode:'critique',currentScene:scene()}, {prompt:'图',image:'https://example.com/a.png'}, {prompt:'图',currentScene:{...scene(),width:-1}}]){
  const m=mock([]);const r=await generateGaussian08({...input,search:false},opts(m));assert.equal(r.ok,false);assert.equal(m.calls.length,0);
 }
});

test('a failed model candidate leaves the input scene unmodified and has no renderable result',async()=>{
 const before=scene(),copy=JSON.stringify(before),bad=scene();bad.objects[1].assetId='invented.surface';
 const m=mock([reply(envelope(bad))]);const r=await generateGaussian08({prompt:'换个苹果',mode:'edit',currentScene:before,search:false},opts(m));
 assert.equal(r.ok,false);assert.equal(r.retainedCurrentScene,true);assert.equal(r.scene,undefined);assert.equal(JSON.stringify(before),copy);
});

test('one schema repair can replace only the invalid candidate, and records both calls',async()=>{
 const bad=scene();bad.objects[1].hue=999;const m=mock([reply(envelope(bad)),reply(envelope())]);
 const r=await generateGaussian08(generate(),opts(m,{schemaRepair:true}));assert.equal(r.ok,true);assert.equal(r.validation.repairUsed,true);assert.equal(r.usage.providerCalls,2);
 assert.equal(m.calls[1].body.messages.at(-1).role,'user');assert.equal(m.calls[1].body.messages.some(x=>String(x.content).includes('private deliberation')),false);
});

test('targeted edits reject changes to protected objects and background',async()=>{
 for(const mutate of [s=>s.objects[0].exposure=.2,s=>s.background=[0,0,0],s=>s.objects.unshift({...s.objects[0],id:'extra'})]){
  const candidate=scene();mutate(candidate);const m=mock([reply(envelope(candidate))]);
  const r=await generateGaussian08({prompt:'只改苹果颜色',mode:'edit',currentScene:scene(),editableObjectIds:['apple'],search:false},opts(m));
  assert.equal(r.ok,false);assert.equal(r.error.code,'EDIT_SCOPE_VIOLATION');assert.equal(r.scene,undefined);
 }
 const candidate=scene();candidate.objects[1].hue=30;const m=mock([reply(envelope(candidate))]);
 const r=await generateGaussian08({prompt:'只改苹果颜色',mode:'edit',currentScene:scene(),editableObjectIds:['apple'],search:false},opts(m));
 assert.equal(r.ok,true);assert.equal(r.scene.objects[1].hue,30);assert.deepEqual(r.scene.objects[0],scene().objects[0]);
});

test('critique requires an actual image and cannot return an unexpected mutation',async()=>{
 const m=mock([reply({action:'critique',message:'苹果底部与桌面衔接需检查。',qualityNotes:['降低苹果 y 位置'],warnings:[]})]);
 const r=await generateGaussian08({prompt:'看一下图',mode:'critique',currentScene:scene(),image:PNG,search:false},opts(m));
 assert.equal(r.ok,true);assert.equal(r.scene,undefined);assert.equal(r.vision.renderedImageProvided,true);
 assert.equal(m.calls[0].body.messages.at(-1).content[1].image_url.url,PNG);
 const m2=mock([reply(envelope())]);const r2=await generateGaussian08({prompt:'看一下',mode:'critique',currentScene:scene(),image:PNG,search:false},opts(m2));assert.equal(r2.ok,false);
});

test('search evidence is separate from reasoning-enabled composition and does not claim pixel learning',async()=>{
 const found=reply('侧光和接触阴影可提升摄影层次。');
 found.choices[0].message.server_tool_calls=[{calls:[{id:'s1',type:'deepseek_web_search',kind:'search',status:'completed',action:{type:'search',queries:['apple still life photography']},sources:[{url:'https://example.org/photo',title:'Photo reference',snippet:'Soft light'}]}],reasoning_content:'private tool reasoning'}];
 const m=mock([found,reply(envelope())]);const r=await generateGaussian08({prompt:'苹果静物',search:true},opts(m));
 assert.equal(r.ok,true);assert.equal(r.research.searched,true);assert.equal(r.usage.providerCalls,2);
 assert.deepEqual(m.calls[0].body.thinking,{type:'disabled'});assert.deepEqual(m.calls[1].body.thinking,{type:'enabled'});
 assert.equal(r.research.sources.length,1);assert.ok(r.warnings.some(x=>x.includes('独立')));assert.equal(JSON.stringify(r).includes('private tool reasoning'),false);
});

test('HTTP redirects and upstream errors do not leak credentials or trigger silent mode downgrade',async()=>{
 for(const response of [Response.redirect('https://not-deepseek.example/collect',307),new Response('bad model',{status:400}),new Response(apiKey,{status:401}),new Response('slow',{status:429})]){
  const m=mock([response]);const r=await generateGaussian08(generate(),opts(m));assert.equal(r.ok,false);assert.equal(m.calls.length,1);assert.equal(m.calls[0].options.redirect,'manual');assert.equal(JSON.stringify(r).includes(apiKey),false);assert.equal(r.scene,undefined);
 }
});

test('truncated provider output retains token accounting and current state',async()=>{
 const data=reply(envelope());data.choices[0].finish_reason='length';const m=mock([data]);
 const r=await generateGaussian08({prompt:'修改',mode:'edit',currentScene:scene(),search:false},opts(m));
 assert.equal(r.ok,false);assert.equal(r.error.code,'MODEL_TRUNCATED');assert.equal(r.usage.providerCalls,1);assert.equal(r.usage.total_tokens,320);assert.equal(r.retainedCurrentScene,true);
});

test('browser-local fitted assets can be used in generation before they are placed in a scene',async()=>{
 const s=scene();s.objects[1].assetId='upload.photo';const desc={id:'upload.photo',label:'上传拟合图',width:300,height:300};
 const m=mock([reply(envelope(s))]);const r=await generateGaussian08({prompt:'移动上传对象',mode:'edit',currentScene:s,assetDescriptors:[desc],search:false},opts(m));assert.equal(r.ok,true);
 const m2=mock([reply(envelope(s))]);const r2=await generateGaussian08({prompt:'使用新学的函数',mode:'generate',assetDescriptors:[desc],search:false},opts(m2));assert.equal(r2.ok,true);assert.equal(r2.scene.objects[1].assetId,'upload.photo');
 const m3=mock([]);const r3=await generateGaussian08({prompt:'生成',assetDescriptors:[{...desc,width:NaN}],search:false},opts(m3));assert.equal(r3.ok,false);assert.equal(m3.calls.length,0);
});

test('missing and duplicate catalogues fail locally',()=>{
 assert.throws(()=>gaussianCatalog08({assets:[]}));assert.throws(()=>gaussianCatalog08({assets:[catalog.assets[0],catalog.assets[0]]}));
});
