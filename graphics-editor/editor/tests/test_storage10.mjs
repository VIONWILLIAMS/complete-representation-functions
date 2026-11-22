import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createBinaryStore10} from '../scripts/storage10.mjs';
import Tasks from '../web/task-runner10.js';

const source=path.resolve(import.meta.dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fileFor=key=>sha(key)+'.json';
const bytesOf=view=>Buffer.from(view.buffer,view.byteOffset,view.byteLength);
const gaussian=()=>({schema:'crf.gaussian_asset.v0.10',width:3,height:2,base:[.1,.2,.3],splats:[[1,1,.5,.7,.2,-.3,.4,.5]],provenance:{modelTraining:false}});
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'crf-storage10-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function rawRecord(dir,key,value,index={}){await fs.mkdir(path.join(dir,'records'),{recursive:true});await fs.mkdir(path.join(dir,'binaries'),{recursive:true});const file=fileFor(key);await fs.writeFile(path.join(dir,'records',file),JSON.stringify(value));await fs.writeFile(path.join(dir,'index.json'),JSON.stringify({...index,[key]:file}));}
async function readRecord(dir,key){return JSON.parse(await fs.readFile(path.join(dir,'records',fileFor(key)),'utf8'));}

test('RGBA subviews and Float32 coverage round-trip with exact bytes after reopen',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),backing=Uint8ClampedArray.from([99,98,1,2,3,4,5,6,7,8,97]),rgba=backing.subarray(2,10);
 const coverage=Float32Array.from([0,.1,.5,1,-0]),expectedRGBA=Buffer.from(bytesOf(rgba)),expectedCoverage=Buffer.from(bytesOf(coverage));
 await store.set('render:one:0',{width:2,height:1,data:rgba,objectCoverage:{fruit:coverage},diagnostics:{coverageSemantics:'visible_alpha_contribution'}});
 const reopened=await createBinaryStore10(dir),result=await reopened.get('render:one:0');assert.ok(result.data instanceof Uint8ClampedArray);assert.ok(result.objectCoverage.fruit instanceof Float32Array);assert.deepEqual(bytesOf(result.data),expectedRGBA);assert.deepEqual(bytesOf(result.objectCoverage.fruit),expectedCoverage);
 result.data[0]=200;result.objectCoverage.fruit[0]=1;const again=await reopened.get('render:one:0');assert.deepEqual(bytesOf(again.data),expectedRGBA);assert.deepEqual(bytesOf(again.objectCoverage.fruit),expectedCoverage);
 const record=await readRecord(dir,'render:one:0');assert.equal(record.data.length,8);assert.equal(record.data.type,'Uint8ClampedArray');assert.equal(record.objectCoverage.fruit.type,'Float32Array');assert.equal(JSON.stringify(record).includes('"data":['),false);
});

test('all supported typed arrays retain constructor and byte representation',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),arrays={u8:new Uint8Array([0,255]),clamped:new Uint8ClampedArray([0,255]),u16:new Uint16Array([1,65535]),u32:new Uint32Array([1,4294967295]),i32:new Int32Array([-2147483648,2147483647]),f32:Float32Array.from([.1,-0,Infinity,NaN]),f64:Float64Array.from([Math.PI,-0,Number.MIN_VALUE,NaN])};
 await store.set('task:typed',arrays);const loaded=await store.get('task:typed');for(const[key,a]of Object.entries(arrays)){assert.equal(loaded[key].constructor,a.constructor);assert.deepEqual(bytesOf(loaded[key]),bytesOf(a));}
 assert.equal((await fs.readdir(path.join(dir,'binaries'))).filter(x=>x.endsWith('.bin')).length,6); // u8 and clamped share identical byte storage.
});

test('Gaussian assets deduplicate on disk and the shared restored cache is immutable',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),asset=gaussian();
 await store.set('task:one',{assetSnapshot:{fruit:asset},candidates:[{scene:{assets:{fruit:structuredClone(asset)}}},{scene:{assets:{fruit:asset}}}]});await store.set('task:two',{asset:structuredClone(asset)});
 const files=await fs.readdir(path.join(dir,'binaries'));assert.equal(files.filter(x=>x.endsWith('.asset')).length,1);
 const record=await readRecord(dir,'task:one');assert.equal(record.assetSnapshot.fruit.__crfAsset10,record.candidates[1].scene.assets.fruit.__crfAsset10);assert.equal(JSON.stringify(record).includes('"splats"'),false);
 const value=await store.get('task:one'),other=await store.get('task:two');assert.equal(value.assetSnapshot.fruit,value.candidates[0].scene.assets.fruit);assert.equal(value.assetSnapshot.fruit,other.asset);assert.ok(Object.isFrozen(other.asset.splats[0]));assert.throws(()=>{other.asset.splats[0][0]=42;},TypeError);assert.deepEqual((await store.get('task:two')).asset,asset);
 await store.set('task:copy',value);assert.equal((await fs.readdir(path.join(dir,'binaries'))).filter(x=>x.endsWith('.asset')).length,1);
});

test('data URLs externalize from object and primitive-array positions with one shared binary',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),url='data:image/png;base64,'+Buffer.from('fixture-image-bytes').toString('base64'),value={png:url,nested:[url,{image:url},[url]]};
 await store.set('task:images',value);assert.deepEqual(await store.get('task:images'),value);assert.equal((await fs.readdir(path.join(dir,'binaries'))).length,1);assert.equal(JSON.stringify(await readRecord(dir,'task:images')).includes('data:image'),false);
});

test('legacy data URL references and million-number RGBA checkpoints restore without being rewritten',async t=>{
 const dir=await temporary(t),key='render:legacy:0',image=Buffer.from('legacy-image'),imageName=sha(image)+'.png',n=1024*1024;
 const data=Array.from({length:n},(_,i)=>i%256),coverage=Array.from({length:n/4},(_,i)=>i%3===0?.5:1);
 await rawRecord(dir,key,{width:512,height:512,data,objectCoverage:{fruit:coverage},png:{__crfDataURL:imageName,mime:'image/png'},usage:{requests:[{requestId:'fixture-paid-result-preserved',total_tokens:123}]}});
 await fs.writeFile(path.join(dir,'binaries',imageName),image);const before=await fs.readFile(path.join(dir,'records',fileFor(key))),store=await createBinaryStore10(dir),loaded=await store.get(key);
 assert.ok(loaded.data instanceof Uint8ClampedArray);assert.equal(loaded.data.length,n);assert.equal(loaded.data[700001],data[700001]);assert.equal(loaded.data[n-1],255);assert.ok(loaded.objectCoverage.fruit instanceof Float32Array);assert.equal(loaded.objectCoverage.fruit[300],.5);assert.equal(loaded.png,'data:image/png;base64,'+image.toString('base64'));assert.equal(loaded.usage.requests[0].requestId,'fixture-paid-result-preserved');
 assert.deepEqual(await fs.readFile(path.join(dir,'records',fileFor(key))),before);assert.equal((await fs.readdir(path.join(dir,'binaries'))).length,1);
});

test('concurrent commits and multiple adapters retain all indexed records',async t=>{
 const dir=await temporary(t),a=await createBinaryStore10(dir),b=await createBinaryStore10(dir);
 await Promise.all(Array.from({length:24},(_,i)=>(i%2?a:b).set('operation:fixture:'+i,{id:i,requestId:'fixture-'+i})));
 assert.equal((await a.keys('operation:')).length,24);const reopened=await createBinaryStore10(dir);for(let i=0;i<24;i++)assert.equal((await reopened.get('operation:fixture:'+i)).requestId,'fixture-'+i);
 assert.ok(!(await fs.readdir(dir)).some(x=>x.includes('.pending-')));assert.ok(!(await fs.readdir(path.join(dir,'records'))).some(x=>x.includes('.pending-')));
});

test('failed writes preserve prior completed evidence and do not poison following commits',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),paid={requestId:'fixture-completed-call',usage:{total_tokens:321},image:'retained'};await store.set('operation:paid',paid);
 await assert.rejects(store.set('operation:paid',{data:new DataView(new ArrayBuffer(8))}),/Unsupported typed array/);assert.deepEqual(await store.get('operation:paid'),paid);
 const cycle={};cycle.self=cycle;await assert.rejects(store.set('operation:paid',cycle),/Cyclic/);assert.deepEqual(await store.get('operation:paid'),paid);
 await store.set('operation:next',{ok:true});assert.deepEqual(await store.get('operation:next'),{ok:true});
});

test('corrupt or missing index never turns existing paid records into an empty store',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir);await store.set('operation:paid',{requestId:'fixture-retained'});const record=await fs.readFile(path.join(dir,'records',fileFor('operation:paid')));
 await fs.writeFile(path.join(dir,'index.json'),'{truncated');await assert.rejects(createBinaryStore10(dir),/Invalid checkpoint index/);assert.equal(await fs.readFile(path.join(dir,'index.json'),'utf8'),'{truncated');
 await fs.rm(path.join(dir,'index.json'));await assert.rejects(createBinaryStore10(dir),/index is missing while records exist/);assert.deepEqual(await fs.readFile(path.join(dir,'records',fileFor('operation:paid'))),record);
});

test('source root, source descendants and external symlink aliases are rejected',async t=>{
 const dir=await temporary(t),alias=path.join(dir,'source-link');await fs.symlink(source,alias,'dir');
 for(const candidate of [source,path.join(source,'private-storage-test-should-not-exist'),alias,path.join(alias,'private-storage-test-should-not-exist')])await assert.rejects(createBinaryStore10(candidate),/outside source/);
 await assert.rejects(fs.stat(path.join(source,'private-storage-test-should-not-exist')),e=>e.code==='ENOENT');
});

test('checkpoint directories, index, record and binary references cannot use symlinks',async t=>{
 const dir=await temporary(t),target=path.join(dir,'target');await fs.mkdir(target);const linked=path.join(dir,'linked');await fs.mkdir(linked);await fs.symlink(target,path.join(linked,'records'),'dir');await assert.rejects(createBinaryStore10(linked),/symbolic links/);
 const indexed=path.join(dir,'indexed'),store=await createBinaryStore10(indexed);await store.set('task:one',{data:new Uint8Array([1,2,3])});const recordFile=path.join(indexed,'records',fileFor('task:one')),record=await fs.readFile(recordFile);await fs.writeFile(path.join(target,'record.json'),record);await fs.rm(recordFile);await fs.symlink(path.join(target,'record.json'),recordFile);await assert.rejects(store.get('task:one'),/regular private file/);
 await fs.rm(recordFile);await fs.writeFile(recordFile,record);const parsed=JSON.parse(record.toString()),binary=path.join(indexed,'binaries',parsed.data.__crfTyped10);await fs.writeFile(path.join(target,'array.bin'),await fs.readFile(binary));await fs.rm(binary);await fs.symlink(path.join(target,'array.bin'),binary);await assert.rejects(store.get('task:one'),/regular private file/);
 const indexFile=path.join(indexed,'index.json');await fs.writeFile(path.join(target,'index.json'),await fs.readFile(indexFile));await fs.rm(indexFile);await fs.symlink(path.join(target,'index.json'),indexFile);await assert.rejects(createBinaryStore10(indexed),/regular private file/);
});

test('invalid index and binary references, MIME, types and sizes are rejected',async t=>{
 const dir=await temporary(t),key='task:malformed';await rawRecord(dir,key,{});const indexFile=path.join(dir,'index.json');await fs.writeFile(indexFile,JSON.stringify({[key]:'../secret.json'}));await assert.rejects(createBinaryStore10(dir),/record reference/);
 const payload=Buffer.from([1,2,3,4]),name=sha(payload)+'.bin';await fs.writeFile(path.join(dir,'binaries',name),payload);
 const cases=[{__crfTyped10:'../secret.bin',type:'Uint8Array',length:4},{__crfTyped10:name,type:'constructor',length:4},{__crfTyped10:name,type:'Uint8Array',length:-1},{__crfTyped10:name,type:'Float32Array',length:2},{__crfDataURL:name,mime:'text/html'},{__crfDataURL:name,mime:'image/bin'},{__crfAsset10:name},{__crfTyped10:name,__crfAsset10:name,type:'Uint8Array',length:4}];
 for(const value of cases){await rawRecord(dir,key,value);const store=await createBinaryStore10(dir);await assert.rejects(store.get(key),/Invalid|Conflicting/);}
});

test('tampered binary content or a lost referenced file fails instead of inventing replacement evidence',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir);await store.set('render:good:0',{data:new Uint8ClampedArray([1,2,3,255])});const reference=(await readRecord(dir,'render:good:0')).data.__crfTyped10,file=path.join(dir,'binaries',reference);
 await fs.writeFile(file,Buffer.from([9,9,9,9]));await assert.rejects(store.get('render:good:0'),/digest mismatch/);assert.deepEqual(await fs.readFile(file),Buffer.from([9,9,9,9]));
 await fs.rm(file);await assert.rejects(store.get('render:good:0'),e=>e.code==='ENOENT');assert.ok(await fs.stat(path.join(dir,'records',fileFor('render:good:0'))));
});

test('prototype-shaped keys round-trip as data without modifying any prototype',async t=>{
 const dir=await temporary(t),store=await createBinaryStore10(dir),value=JSON.parse('{"__proto__":{"polluted":"fixture"},"constructor":"data"}');await store.set('__proto__',value);const restored=await store.get('__proto__');assert.deepEqual(restored,value);assert.equal({}.polluted,undefined);assert.equal(Object.getPrototypeOf(restored),Object.prototype);assert.deepEqual(await store.keys(),['__proto__']);assert.equal(await store.get('missing'),null);
});

test('reopened binary checkpoint resumes a missing critique without repeating generation or rendering',async t=>{
 const dir=await temporary(t),modes=[];let renders=0,reviews=0;
 const scene={schema:'crf.gaussian_scene.v0.10',width:2,height:1,background:[0,0,0],objects:[{id:'fruit',assetId:'fruit',x:0,y:0}],assets:{fruit:gaussian()}};
 const api=async(path,body)=>{modes.push(body.mode);if(body.mode==='generate'){const s=structuredClone(scene);delete s.assets;return{action:'scene',scene:s,usage:{providerCalls:1,total_tokens:20,requests:[{requestId:'fixture-original-generation'}]}};}if(reviews++===0)return{ok:false,error:{code:'MODEL_TRUNCATED',message:'Fixture retained evaluation failure.'},usage:{providerCalls:1,total_tokens:18000,requests:[{requestId:'fixture-retained-truncation'}]}};return{action:'critique',issues:[],scores:{realism:5,semantic:5,coherence:5},usage:{providerCalls:1,total_tokens:30,requests:[{requestId:'fixture-resumed-evaluation'}]}};};
 const render=async()=>{renders++;return{width:2,height:1,data:Uint8ClampedArray.from([1,2,3,255,4,5,6,255]),image:'data:image/png;base64,AAAA',objectCoverage:{fruit:Float32Array.from([1,1])},diagnostics:{coverageSemantics:'visible_alpha_contribution'}};};
 const first=Tasks.create({store:await createBinaryStore10(dir),api,render}),blocked=await first.start({prompt:'Arrange fixture fruit',representation:'reference_gaussian',currentScene:scene,plan:{constraints:[],unknownRequirements:[]},reasoningEffort:'max',budget:{maxCandidates:1,maxQualityFeedback:0}});assert.equal(blocked.status,'blocked');
 const original=await first.getRender(blocked.id,0),second=Tasks.create({store:await createBinaryStore10(dir),api,render}),resumed=await second.resume(blocked.id,{reasoningEffort:'high',reason:'Fixture recovery of retained output'});
 assert.deepEqual(modes,['generate','critique','critique']);assert.equal(renders,1);assert.equal(resumed.status,'review_required');assert.equal(resumed.candidates.length,1);assert.equal(resumed.usageTotals.tokens,18050);assert.equal(resumed.usage[1].requests[0].requestId,'fixture-retained-truncation');assert.equal(resumed.contractSha256,blocked.contractSha256);assert.deepEqual(await second.getRender(blocked.id,0),original);assert.ok(Object.isFrozen((await second.getTask(blocked.id)).assetSnapshot.fruit));
});
