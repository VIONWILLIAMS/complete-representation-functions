/** Binary-aware durable task storage. Numerical arrays never expand into
 * millions of promises. Existing 0.9 checkpoints remain readable, without
 * rewriting or guessing missing paid operation results.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const constructors=Object.freeze({Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,Uint16Array,Uint32Array,Int32Array});
const markerNames=['__crfDataURL','__crfTyped10','__crfAsset10'];
const imagePattern=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/;
const writes=new Map(); // Serialize writers sharing a directory in this process.
const own=(o,k)=>Object.hasOwn(o,k);
function put(o,k,v){Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});}
function keyName(key){if(typeof key!=='string'||!key||key.length>2048)throw new Error('Invalid checkpoint key');return hash(key)+'.json';}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
async function physicalPath(candidate){let at=candidate;const parts=[];for(;;){try{return path.resolve(await fs.realpath(at),...parts.reverse());}catch(e){if(e.code!=='ENOENT')throw e;const parent=path.dirname(at);if(parent===at)throw e;parts.push(path.basename(at));at=parent;}}}
async function regularFile(file){const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('Checkpoint reference is not a regular private file');return fs.readFile(file);}
async function atomicWrite(file,bytes){
 const pending=file+'.pending-'+crypto.randomBytes(8).toString('hex');let handle;
 try{handle=await fs.open(pending,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await fs.rename(pending,file);const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}}
 finally{await handle?.close();await fs.rm(pending,{force:true});}
}

export async function createBinaryStore10(directory){
 if(typeof directory!=='string'||!directory.trim())throw new Error('Private checkpoint directory is required');
 const source=await fs.realpath(path.resolve(import.meta.dirname,'..')),requested=path.resolve(directory),root=await physicalPath(requested);
 const inSource=p=>p===source||p.startsWith(source+path.sep);
 if(inSource(requested)||inSource(root))throw new Error('Private checkpoints must be outside source');
 await fs.mkdir(root,{recursive:true,mode:0o700});
 if(inSource(await fs.realpath(root)))throw new Error('Private checkpoints must be outside source');
 const records=path.join(root,'records'),binaries=path.join(root,'binaries'),indexFile=path.join(root,'index.json');
 for(const dir of [records,binaries]){await fs.mkdir(dir,{recursive:true,mode:0o700});const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Checkpoint subdirectories cannot be symbolic links');}
 async function loadIndex(){
  let bytes;try{bytes=await regularFile(indexFile);}catch(e){if(e.code==='ENOENT'){if((await fs.readdir(records)).some(name=>/^[a-f0-9]{64}\.json$/.test(name)))throw new Error('Checkpoint index is missing while records exist; existing evidence has not been replaced');return Object.create(null);}throw e;}
  let parsed;try{parsed=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Invalid checkpoint index; existing evidence has not been replaced');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid checkpoint index');
  const result=Object.create(null);for(const [key,file]of Object.entries(parsed)){if(file!==keyName(key))throw new Error('Invalid checkpoint record reference');result[key]=file;}return result;
 }
 await loadIndex(); // Corruption must not silently look like an empty task store.
 const known=new Set(),assetCache=new Map(),frozenAssetRefs=new WeakMap();
 function safe(name,extensions){if(typeof name!=='string'||!/^[a-f0-9]{64}\.(png|jpeg|webp|bin|asset)$/.test(name)||!extensions.includes(name.split('.').at(-1)))throw new Error('Invalid stored binary reference');return path.join(binaries,name);}
 async function readBlob(name,extensions){const bytes=await regularFile(safe(name,extensions));if(hash(bytes)!==name.slice(0,64))throw new Error('Checkpoint binary digest mismatch');return bytes;}
 async function blob(bytes,extension){
  const file=hash(bytes)+'.'+extension;if(!known.has(file)){try{await readBlob(file,[extension]);}catch(e){if(e.code!=='ENOENT')throw e;await atomicWrite(path.join(binaries,file),bytes);}known.add(file);}return file;
 }
 async function externalize(value,visiting=new Set()){
  const match=typeof value==='string'?imagePattern.exec(value):null;
  if(match){const file=await blob(Buffer.from(match[2],'base64'),match[1]);return{__crfDataURL:file,mime:'image/'+match[1]};}
  if(ArrayBuffer.isView(value)){const type=value.constructor.name;if(!own(constructors,type))throw new Error('Unsupported typed array');const file=await blob(Buffer.from(value.buffer,value.byteOffset,value.byteLength),'bin');return{__crfTyped10:file,type,length:value.length};}
  if(value?.schema==='crf.gaussian_asset.v0.10'){
   let file=frozenAssetRefs.get(value);if(!file)file=await blob(Buffer.from(JSON.stringify(value)),'asset');return{__crfAsset10:file};
  }
  if(value&&typeof value==='object'){
   if(markerNames.some(k=>own(value,k)))throw new Error('Checkpoint reference markers are reserved');
   if(visiting.has(value))throw new Error('Cyclic checkpoint data');visiting.add(value);
   try{
    if(Array.isArray(value)){const out=new Array(value.length);for(let i=0;i<value.length;i++){const v=value[i];out[i]=v&&typeof v==='object'||typeof v==='string'&&imagePattern.test(v)?await externalize(v,visiting):v;}return out;}
    const out={};for(const[k,v]of Object.entries(value))put(out,k,await externalize(v,visiting));return out;
   }finally{visiting.delete(value);}
  }return value;
 }
 async function restore(value){
  if(value&&typeof value==='object'){
   const markers=markerNames.filter(k=>own(value,k));if(markers.length>1)throw new Error('Conflicting checkpoint references');
   if(markers[0]==='__crfDataURL'){
    const name=value.__crfDataURL,extension=typeof name==='string'?name.split('.').at(-1):null;
    if(value.mime!=='image/'+extension)throw new Error('Invalid checkpoint image MIME');
    return'data:'+value.mime+';base64,'+(await readBlob(name,['png','jpeg','webp'])).toString('base64');
   }
   if(markers[0]==='__crfTyped10'){
    if(!own(constructors,value.type)||!Number.isSafeInteger(value.length)||value.length<0)throw new Error('Invalid checkpoint array type or length');
    const C=constructors[value.type],bytes=await readBlob(value.__crfTyped10,['bin']);if(bytes.byteLength!==value.length*C.BYTES_PER_ELEMENT)throw new Error('Invalid checkpoint length');
    return new C(new Uint8Array(bytes).buffer);
   }
   if(markers[0]==='__crfAsset10'){
    const name=value.__crfAsset10;safe(name,['asset']);if(!assetCache.has(name)){const asset=JSON.parse((await readBlob(name,['asset'])).toString('utf8'));if(asset?.schema!=='crf.gaussian_asset.v0.10')throw new Error('Invalid checkpoint Gaussian asset');freeze(asset);assetCache.set(name,asset);frozenAssetRefs.set(asset,name);}return assetCache.get(name);
   }
   if(Array.isArray(value)){const out=new Array(value.length);for(let i=0;i<value.length;i++)out[i]=value[i]&&typeof value[i]==='object'?await restore(value[i]):value[i];return out;}
   const out={};for(const[k,v]of Object.entries(value))put(out,k,await restore(v));return out;
  }return value;
 }
 async function waitForWrites(){await(writes.get(root)||Promise.resolve());}
 return{
  durable:true,directory:root,
  set(key,value){
   const file=keyName(key),pending=(writes.get(root)||Promise.resolve()).then(async()=>{const index=await loadIndex(),record=await externalize(value);await atomicWrite(path.join(records,file),JSON.stringify(record));index[key]=file;await atomicWrite(indexFile,JSON.stringify(index));});
   writes.set(root,pending.catch(()=>{}));return pending;
  },
  async get(key){keyName(key);await waitForWrites();const index=await loadIndex();if(!own(index,key))return null;const out=await restore(JSON.parse((await regularFile(path.join(records,index[key]))).toString('utf8')));
   if(key.startsWith('render:')&&out&&typeof out==='object'){if(Array.isArray(out.data)){if(!out.data.every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw new Error('Invalid legacy RGBA sample');out.data=Uint8ClampedArray.from(out.data);}if(out.objectCoverage)for(const k of Object.keys(out.objectCoverage))if(Array.isArray(out.objectCoverage[k])){if(!out.objectCoverage[k].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Invalid legacy coverage sample');out.objectCoverage[k]=Float32Array.from(out.objectCoverage[k]);}}return out;
  },
  async keys(prefix=''){await waitForWrites();return Object.keys(await loadIndex()).filter(k=>k.startsWith(prefix));}
 };
}
