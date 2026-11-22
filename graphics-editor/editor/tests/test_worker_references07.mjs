import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../server/worker07.mjs';
import {collectReferences07} from '../server/references07.mjs';
import {DEFAULT_MODEL} from '../server/deepseek07.mjs';

const originalFetch=globalThis.fetch;
before(()=>{globalThis.fetch=async()=>{throw new Error('Unexpected network request in offline test');};});
after(()=>{globalThis.fetch=originalFetch;});
const runtimeKey='test-only-worker-runtime-token';
const site='https://crf.example';
const source=i=>({url:'https://www.pexels.com/photo/reference-'+i+'/',title:'Reference '+i});
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
function referencesMock({imageBytes=png,onPage}={}) {
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push({url,signalAborted:options.signal.aborted});
    if(url.startsWith('https://images.pexels.com/')) return new Response(imageBytes,{headers:{'content-type':'image/png'}});
    onPage?.();
    return new Response('<meta property="og:image" content="https://images.pexels.com/photos/reference/image.png">',{headers:{'content-type':'text/html'}});
  }};
}

test('Worker delegates non-API requests to the asset binding',async()=>{
  let received;const request=new Request(site+'/editor07.html');
  const response=await Worker.fetch(request,{ASSETS:{fetch:async r=>{received=r;return new Response('asset');}}});
  assert.equal(received,request);assert.equal(await response.text(),'asset');
});

test('Worker status exposes configuration only, never credentials or a different model',async()=>{
  const response=await Worker.fetch(new Request(site+'/api/crf/status'),{DEEPSEEK_API_KEY:runtimeKey,DEEPSEEK_MODEL:'deepseek-v4-pro'});
  const result=await response.json();
  assert.equal(result.configured,true);assert.equal(result.connection,'configuration_only');
  assert.equal(result.model,DEFAULT_MODEL);
  assert.equal(JSON.stringify(result).includes(runtimeKey),false);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('Worker rejects malformed, cross-origin, and unconfigured API requests locally',async()=>{
  const cases=[
    [new Request(site+'/api/crf/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{},503],
    [new Request(site+'/api/crf/generate',{method:'POST',headers:{origin:'https://different.example','content-type':'application/json'},body:'{}'}),{DEEPSEEK_API_KEY:runtimeKey},403],
    [new Request(site+'/api/crf/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'}),{DEEPSEEK_API_KEY:runtimeKey},400],
    [new Request(site+'/api/crf/generate',{method:'POST',body:'text'}),{DEEPSEEK_API_KEY:runtimeKey},415],
    [new Request(site+'/api/crf/generate'),{DEEPSEEK_API_KEY:runtimeKey},405]
  ];
  for(const [request,env,status] of cases) {
    const response=await Worker.fetch(request,env);assert.equal(response.status,status);
    assert.equal((await response.text()).includes(runtimeKey),false);
  }
});

test('Worker enforces actual streamed body size without relying on Content-Length',async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024));controller.enqueue(new Uint8Array(3*1024*1024));},cancel(){cancelled=true;}});
  const request=new Request(site+'/api/crf/generate',{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
  const response=await Worker.fetch(request,{DEEPSEEK_API_KEY:runtimeKey});
  assert.equal(response.status,413);assert.equal(cancelled,true);
  assert.equal((await response.json()).error.code,'body_limit');
});

test('collector refuses an already-cancelled operation before any page or image request',async()=>{
  const controller=new AbortController();controller.abort();const mock=referencesMock();
  await assert.rejects(collectReferences07({sources:[source(1)]},{fetchImpl:mock.fetchImpl,signal:controller.signal}),error=>error.name==='AbortError'||/abort|cancel/i.test(error.message));
  assert.equal(mock.calls.length,0);
});

test('collector propagates cancellation between page and image without continuing downloads',async()=>{
  const controller=new AbortController(),mock=referencesMock({onPage:()=>controller.abort()});
  await assert.rejects(collectReferences07({sources:[source(1)]},{fetchImpl:mock.fetchImpl,signal:controller.signal}),error=>error.name==='AbortError'||/abort|cancel/i.test(error.message));
  assert.equal(mock.calls.length,1);
});

test('collector rejects truncated magic-prefix payloads instead of reporting a usable photo',async()=>{
  const mock=referencesMock({imageBytes:new Uint8Array([137,80,78,71])});
  const result=await collectReferences07({sources:[source(1)]},{fetchImpl:mock.fetchImpl});
  assert.equal(result.images.length,0);assert.equal(result.downloadedCount,0);
  assert.equal(result.attempts[0].status,'unavailable');
});

test('collector reports actual attempted pages separately from planned candidates',async()=>{
  const mock=referencesMock();
  const result=await collectReferences07({sources:Array.from({length:6},(_,i)=>source(i))},{fetchImpl:mock.fetchImpl,maxImages:1});
  const pageCalls=mock.calls.filter(c=>!c.url.startsWith('https://images.pexels.com/')).length;
  assert.equal(result.images.length,1);
  assert.equal(result.sourcePageCount,pageCalls);
  assert.equal(result.attempts.length,pageCalls);
  assert.equal(result.candidatePageCount,6);
});

test('collector rejects off-list source hosts and never forwards authorization to public images',async()=>{
  let calls=0;
  const result=await collectReferences07({sources:[{url:'https://example.org/private',title:'Off-list'}]},{fetchImpl:async()=>{calls++;throw new Error('must not fetch');}});
  assert.equal(calls,0);assert.equal(result.images.length,0);
  const mock=referencesMock();
  const accepted=await collectReferences07({sources:[source(1)]},{fetchImpl:async(url,options)=>{
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.authorization,undefined);
    return mock.fetchImpl(url,options);
  }});
  assert.equal(accepted.images.length,1);
  assert.equal(accepted.images[0].bytes,png.length);
  assert.match(accepted.images[0].sha256,/^[a-f0-9]{64}$/);
  assert.ok(accepted.images[0].url.startsWith('data:image/png;base64,'));
  assert.equal(accepted.images[0].sourceUrl,source(1).url);
});
