// Original ZIP bytes are streamed from shared compressed-entry slices.
// No archive is recompressed, re-created, renamed or omitted from its public URL.
export const PACKED_ARCHIVE_MANIFEST09=typeof __CRF_ARCHIVES09__==='undefined'?Object.freeze({}):__CRF_ARCHIVES09__;
const MAX_PACK=4*1024*1024,MAX_CACHE=32*1024*1024,MAX_ENTRIES=8,caches=new WeakMap();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');

export function findPackedArchive09(pathname,manifest=PACKED_ARCHIVE_MANIFEST09){
 let key;try{key=decodeURIComponent(pathname);}catch{return null;}
 if(!manifest?.files||!Object.hasOwn(manifest.files,key))return null;
 const e=manifest.files[key];if(!e||e.mime!=='application/zip'||!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256)||!Array.isArray(e.segments)||e.segments.length>50000)return null;
 let total=0;for(const s of e.segments){if(!Array.isArray(s)||s.length!==3||typeof s[0]!=='string'||!/^\/_crf-archives\/pack-[0-9]+-[a-f0-9]{16}\.bin$/.test(s[0]))return null;const p=manifest.packs?.[s[0]];if(!p||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PACK||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isInteger(s[1])||s[1]<0||!Number.isInteger(s[2])||s[2]<1||s[1]+s[2]>p.bytes)return null;total+=s[2];}
 if(total!==e.bytes)return null;return{url:key,...e};
}

async function readPack(binding,url,entry,origin){
 let cache=caches.get(binding);if(!cache){cache={entries:new Map(),bytes:0};caches.set(binding,cache);}
 const key=url+':'+entry.sha256;
 if(cache.entries.has(key)){const hit=cache.entries.get(key);cache.entries.delete(key);cache.entries.set(key,hit);return hit.promise;}
 const holder={bytes:entry.bytes,promise:null};
 holder.promise=(async()=>{const response=await binding.fetch(new Request(new URL(url,origin),{headers:{Accept:'application/octet-stream','Accept-Encoding':'identity'},redirect:'manual'}));if(response.status!==200){await response.body?.cancel();throw new Error('Archive pack unavailable');}const array=new Uint8Array(await response.arrayBuffer());if(array.length!==entry.bytes)throw new Error('Archive pack length mismatch');if(hex(await crypto.subtle.digest('SHA-256',array))!==entry.sha256)throw new Error('Archive pack checksum mismatch');return array;})();
 cache.entries.set(key,holder);cache.bytes+=entry.bytes;
 while(cache.entries.size>MAX_ENTRIES||cache.bytes>MAX_CACHE){const oldest=cache.entries.keys().next().value;const victim=cache.entries.get(oldest);cache.entries.delete(oldest);cache.bytes-=victim.bytes;}
 try{return await holder.promise;}catch(error){if(cache.entries.get(key)===holder){cache.entries.delete(key);cache.bytes-=holder.bytes;}throw error;}
}

function rangeOf(value,bytes){
 if(!value)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||!m[1]&&!m[2])return false;
 let start,end;if(!m[1]){const suffix=Number(m[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,bytes-suffix);end=bytes-1;}else{start=Number(m[1]);end=m[2]?Number(m[2]):bytes-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=bytes||end<start)return false;return[start,Math.min(end,bytes-1)];
}

/** Returns null only when the ordinary asset handler should try this URL. */
export async function servePackedArchive09(request,env,manifest=PACKED_ARCHIVE_MANIFEST09){
 if(!['GET','HEAD'].includes(request.method)||!env?.ASSETS?.fetch)return null;
 const origin=new URL(request.url).origin,entry=findPackedArchive09(new URL(request.url).pathname,manifest);if(!entry)return null;
 const etag=`"sha256-${entry.sha256}"`,headers=new Headers({'Content-Type':'application/zip','Content-Length':String(entry.bytes),'Accept-Ranges':'bytes','ETag':etag,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=0, must-revalidate'});
 if((request.headers.get('If-None-Match')||'').split(',').some(x=>x.trim()==='*'||x.trim().replace(/^W\//,'')===etag)){headers.delete('Content-Length');return new Response(null,{status:304,headers});}
 let range=null;if(request.method==='GET'&&(!request.headers.get('If-Range')||request.headers.get('If-Range')===etag))range=rangeOf(request.headers.get('Range'),entry.bytes);
 if(range===false){headers.set('Content-Range',`bytes */${entry.bytes}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 const start=range?range[0]:0,end=range?range[1]:entry.bytes-1,length=Math.max(0,end-start+1),status=range?206:200;
 headers.set('Content-Length',String(length));if(range)headers.set('Content-Range',`bytes ${start}-${end}/${entry.bytes}`);
 if(request.method==='HEAD')return new Response(null,{status:200,headers});
 const selected=[];let position=0;for(const [pack,offset,count]of entry.segments){const a=Math.max(start,position),b=Math.min(end+1,position+count);if(a<b)selected.push([pack,offset+a-position,b-a]);position+=count;}
 if(selected.length){try{await readPack(env.ASSETS,selected[0][0],manifest.packs[selected[0][0]],origin);}catch{return new Response('Archive storage unavailable.',{status:502,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}}
 let index=0,cancelled=false;
 let body=new ReadableStream({async pull(controller){if(cancelled)return;try{if(request.signal.aborted){controller.error(new Error('Request cancelled'));return;}if(index>=selected.length){controller.close();return;}const [pack,offset,count]=selected[index++],bytes=await readPack(env.ASSETS,pack,manifest.packs[pack],origin);if(!cancelled)controller.enqueue(bytes.subarray(offset,offset+count));}catch(error){controller.error(error);}},cancel(){cancelled=true;}});
 if(typeof FixedLengthStream==='function')body=body.pipeThrough(new FixedLengthStream(length));
 return new Response(body,{status,headers});
}
