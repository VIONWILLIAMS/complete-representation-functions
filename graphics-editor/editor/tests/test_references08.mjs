import test from 'node:test';
import assert from 'node:assert/strict';
import {collectReferences08,referenceInternals08 as I} from '../server/references08.mjs';
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCOQAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const commons='https://commons.wikimedia.org/wiki/File:Test_Fruit.jpg',original='https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_Fruit.jpg',thumb='https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Fruit.jpg/960px-Test_Fruit.jpg';
const pexels='https://www.pexels.com/photo/test-fruit-123/';
const imageResponse=()=>new Response(png,{headers:{'content-type':'image/png'}});

test('Commons uses imageinfo-returned 768px thumbnail and keeps source attribution',async()=>{
 const calls=[];const r=await collectReferences08({sources:[{url:commons,title:'Fruit'}]},{maxImages:1,fetchImpl:async(value,options)=>{
  const u=new URL(value);calls.push(value);assert.equal(options.credentials,'omit');assert.deepEqual(Object.keys(options.headers),['Accept']);
  if(u.pathname==='/w/api.php'){
   assert.equal(u.searchParams.get('iiurlwidth'),'768');assert.equal(u.searchParams.get('titles'),'File:Test_Fruit.jpg');
   return new Response(JSON.stringify({query:{pages:[{ns:6,title:'File:Test Fruit.jpg',imageinfo:[{thumburl:thumb,url:original,width:5000,height:7000,size:9000000,extmetadata:{LicenseShortName:{value:'CC BY 4.0'},Artist:{value:'<a href="x">Photographer</a>'}}}]}]}}));
  }
  if(u.hostname==='commons.wikimedia.org')return new Response('<meta property="og:image" content="'+original+'">');
  assert.equal(value,thumb);return imageResponse();
 }});
 assert.equal(r.images.length,1);assert.equal(r.images[0].imageUrl,thumb);assert.equal(r.images[0].license.name,'CC BY 4.0');assert.equal(r.images[0].license.artist,'Photographer');assert.equal(r.images[0].original.bytes,9000000);assert.equal(calls.includes(original),false);
});

test('Pexels gets proportional 768px image without forced OG height or crop',async()=>{
 const r=await collectReferences08({sources:[{url:pexels}]},{fetchImpl:async(value)=>{
  const u=new URL(value);if(u.hostname==='www.pexels.com')return new Response('<meta property="og:image" content="https://images.pexels.com/photos/123/example.jpeg?h=627&amp;w=1100&amp;fit=crop&amp;crop=faces&amp;rect=0,0,100,100">');
  assert.equal(u.searchParams.get('h'),null);assert.equal(u.searchParams.get('fit'),null);assert.equal(u.searchParams.get('crop'),null);assert.equal(u.searchParams.get('rect'),null);assert.equal(u.searchParams.get('w'),'768');assert.equal(u.searchParams.get('auto'),'compress');return imageResponse();
 }});assert.equal(r.downloadedCount,1);
});

test('401 or 403 source denial is terminal, no image or alternate metadata request follows',async()=>{
 for(const status of [401,403]){
  const calls=[];const r=await collectReferences08({sources:[{url:commons},{url:'https://unsplash.com/photos/example'}]},{fetchImpl:async(value)=>{calls.push(value);return new Response('access denied',{status});}});
  assert.equal(calls.length,2);assert.equal(r.images.length,0);assert.ok(r.attempts.every(x=>x.error==='http_'+status));
 }
});

test('off-list hosts and redirect destinations cannot receive secrets or requests',async()=>{
 let calls=0;const rejected=await collectReferences08({sources:[{url:'https://example.com/a'},{url:'https://commons.wikimedia.org.evil.test/'}]},{fetchImpl:async()=>{calls++;throw new Error('not expected');}});assert.equal(calls,0);assert.equal(rejected.images.length,0);
 const r=await collectReferences08({sources:[{url:pexels}]},{fetchImpl:async(value,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(options.credentials,'omit');return Response.redirect('http://127.0.0.1/private',302);}});
 assert.equal(calls,1);assert.equal(r.attempts[0].error,'redirect_not_allowed');
});

test('unknown image hosts inside public source metadata are never fetched',async()=>{
 let calls=0;const r=await collectReferences08({sources:[{url:pexels}]},{fetchImpl:async()=>{calls++;return new Response('<meta property="og:image" content="https://internal.example/secret">');}});assert.equal(calls,1);assert.equal(r.images.length,0);assert.equal(r.attempts[0].error,'no_supported_image');
});

test('image byte limit and invalid containers remain enforced',async()=>{
 for(const image of [new Response(new Uint8Array(1800001)),new Response(png.slice(0,12))]){
  const r=await collectReferences08({sources:[{url:pexels}]},{fetchImpl:async(value)=>new URL(value).hostname==='www.pexels.com'?new Response('<meta property="og:image" content="https://images.pexels.com/photos/123/image.png">'):image});assert.equal(r.images.length,0);assert.equal(r.attempts[0].status,'unavailable');
 }
});

test('Commons category pages cannot accidentally collect gallery icons as photographs',async()=>{
 let calls=0;const r=await collectReferences08({sources:[{url:'https://commons.wikimedia.org/wiki/Category:Fruit'}]},{fetchImpl:async()=>{calls++;throw new Error('must not fetch');}});assert.equal(calls,0);assert.equal(r.attempts[0].error,'source_is_not_photo_detail');
});

test('source-provided Commons previews are restricted to the actual file',()=>{
 const html='<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Fruit.jpg/600px-Test_Fruit.jpg"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Logo.png/100px-Logo.png">';
 assert.deepEqual(I.imageCandidates(html,commons),['https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Test_Fruit.jpg/600px-Test_Fruit.jpg']);
});

test('cancelled download is rejected before any network activity',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(collectReferences08({sources:[{url:pexels}]},{signal:controller.signal,fetchImpl:async()=>{throw new Error('must not fetch');}}),x=>x.name==='AbortError');
});

test('documented Wikimedia thumbnail CDN is permitted but lookalike and non-HTTPS hosts are rejected',()=>{
 assert.ok(I.permitted('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Test.jpg/960px-Test.jpg','image'));
 assert.equal(I.permitted('https://thumb.wikimedia.org.evil.test/image.jpg','image'),null);
 assert.equal(I.permitted('http://thumb.wikimedia.org/image.jpg','image'),null);
});
