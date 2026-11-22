// Public reference photographs: inspected bytes go to vision, never to the renderer.
const PAGE_HOSTS=new Set(['unsplash.com','www.unsplash.com','www.pexels.com','pexels.com','commons.wikimedia.org']);
const IMAGE_HOSTS=new Set(['images.unsplash.com','images.pexels.com','upload.wikimedia.org']);
const pageLimit=700000,imageLimit=1800000;
function permitted(value,kind){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const hosts=kind==='page'?PAGE_HOSTS:IMAGE_HOSTS;return hosts.has(u.hostname.toLowerCase())?u:null;}catch{return null;}}
async function bounded(url,kind,fetchImpl,signal){
 if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
 let current=permitted(url,kind);if(!current)throw new Error('unsupported_source_host');
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),14000);
 const onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});
 try{
  for(let i=0;i<4;i++){
   if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
   const response=await fetchImpl(current.href,{redirect:'manual',signal:abort.signal,headers:{'Accept':kind==='page'?'text/html':'image/jpeg,image/png,image/webp'}});
   if(response.status>=300&&response.status<400){const next=permitted(new URL(response.headers.get('location')||'',current).href,kind);if(!next)throw new Error('redirect_not_allowed');current=next;continue;}
   if(!response.ok)throw new Error('http_'+response.status);
   const limit=kind==='page'?pageLimit:imageLimit;if(Number(response.headers.get('content-length')||0)>limit)throw new Error('size_limit');
   const reader=response.body.getReader(),chunks=[];let length=0;
   while(true){const c=await reader.read();if(c.done)break;length+=c.value.length;if(length>limit){await reader.cancel();throw new Error('size_limit');}chunks.push(c.value);}
   const bytes=new Uint8Array(length);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}
   return {bytes,url:current.href,contentType:response.headers.get('content-type')||''};
  }
  throw new Error('redirect_limit');
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);}
}
function decode(value){return value.replaceAll('&amp;','&').replaceAll('&quot;','"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function imageCandidates(html,pageUrl){
 const found=[];
 for(const tag of html.match(/<meta\b[^>]+>/gi)||[]){const attrs={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=m[2];if(/^(og:image(?::url)?|twitter:image(?::src)?)$/i.test(attrs.property||attrs.name||'')&&attrs.content){try{found.push(new URL(decode(attrs.content),pageUrl).href);}catch{}}}
 for(const m of html.matchAll(/https:\/\/(?:images\.unsplash\.com|images\.pexels\.com|upload\.wikimedia\.org)\/[^\s"<>\\]+/g)){found.push(decode(m[0]));if(found.length>=12)break;}
 return [...new Set(found)].filter(u=>permitted(u,'image')).slice(0,3);
}
function imageInfo(bytes){
 const n=bytes.length;if(n<24)return null;
 const v=new DataView(bytes.buffer,bytes.byteOffset,n),ascii=(o,len)=>String.fromCharCode(...bytes.subarray(o,o+len));
 const result=(mime,width,height)=>Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=12000&&height<=12000&&width*height<=25000000?{mime,width,height}:null;
 if([137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)){
  if(n<45||v.getUint32(8)!==13||ascii(12,4)!=='IHDR')return null;
  const width=v.getUint32(16),height=v.getUint32(20);let pos=8,hasData=false,ended=false;
  while(pos+12<=n){const len=v.getUint32(pos),kind=ascii(pos+4,4);if(pos+12+len>n)return null;if(kind==='IDAT'&&len>0)hasData=true;pos+=12+len;if(kind==='IEND'){ended=len===0&&pos===n;break;}}
  return hasData&&ended?result('image/png',width,height):null;
 }
 if(bytes[0]===255&&bytes[1]===216&&bytes[n-2]===255&&bytes[n-1]===217){
  let pos=2,dimensions=null;
  while(pos+4<n){if(bytes[pos++]!==255)return null;while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===0xda)return dimensions;if(marker===0xd9)return null;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;if(pos+2>n)return null;const len=v.getUint16(pos);if(len<2||pos+len>n)return null;if([0xc0,0xc1,0xc2].includes(marker)&&len>=8)dimensions=result('image/jpeg',v.getUint16(pos+5),v.getUint16(pos+3));pos+=len;}
  return null;
 }
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'&&v.getUint32(4,true)+8===n){
  let pos=12,dimensions=null,hasFrame=false;
  while(pos+8<=n){const kind=ascii(pos,4),len=v.getUint32(pos+4,true),data=pos+8;if(data+len>n)return null;
   if(kind==='VP8X'&&len>=10){const a=data+4;dimensions=result('image/webp',1+bytes[a]+(bytes[a+1]<<8)+(bytes[a+2]<<16),1+bytes[a+3]+(bytes[a+4]<<8)+(bytes[a+5]<<16));}
   if(kind==='VP8 '&&len>=10&&bytes[data+3]===157&&bytes[data+4]===1&&bytes[data+5]===42){hasFrame=true;dimensions=dimensions||result('image/webp',v.getUint16(data+6,true)&16383,v.getUint16(data+8,true)&16383);}
   if(kind==='VP8L'&&len>=5&&bytes[data]===47){hasFrame=true;const bits=v.getUint32(data+1,true);dimensions=dimensions||result('image/webp',(bits&16383)+1,((bits>>>14)&16383)+1);}
   pos=data+len+(len%2);
  }
  return pos===n&&hasFrame?dimensions:null;
 }
 return null;
}
function imageType(bytes){return imageInfo(bytes)?.mime||null;}
function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(value);}
async function sha(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function collectReferences07(input,{fetchImpl=fetch,signal,maxImages=6}={}){
 if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
 maxImages=Math.max(1,Math.min(8,Math.floor(maxImages)));
 const research=input.research||input,sources=research.sources||[];const candidates=sources.filter(s=>permitted(s.url,'page')).slice(0,12);
 const images=[],attempts=[],used=new Set();
 for(let offset=0;offset<candidates.length&&images.length<maxImages;offset+=3){
  const results=await Promise.all(candidates.slice(offset,offset+3).map(async source=>{
   const attempt={sourceUrl:source.url,title:source.title||source.url,status:'unavailable'};
   try{
    const page=await bounded(source.url,'page',fetchImpl,signal);const urls=imageCandidates(new TextDecoder().decode(page.bytes),source.url);
    for(const value of urls){try{const u=new URL(value);if(u.hostname==='images.unsplash.com'){u.searchParams.set('w','1100');u.searchParams.set('q','85');u.searchParams.set('auto','format');}if(u.hostname==='images.pexels.com'){u.searchParams.set('w','1100');u.searchParams.set('auto','compress');}
      const image=await bounded(u.href,'image',fetchImpl,signal);const info=imageInfo(image.bytes);if(!info)throw new Error('invalid_image_container');const {mime,width,height}=info;
      const hash=await sha(image.bytes);Object.assign(attempt,{status:'downloaded',imageUrl:image.url,bytes:image.bytes.length,mime,width,height,sha256:hash});
      return {attempt,image:{url:'data:'+mime+';base64,'+base64(image.bytes),imageUrl:image.url,sourceUrl:source.url,title:source.title||source.url,sha256:hash,bytes:image.bytes.length,mime,width,height}};
    }catch(error){if(signal?.aborted||error.name==='AbortError')throw error;attempt.error=error.message;}}
    if(!urls.length)attempt.error='no_supported_image';
   }catch(error){if(signal?.aborted||error.name==='AbortError')throw error;attempt.error=error.message;}
   return {attempt};
  }));
  for(const r of results){attempts.push(r.attempt);if(r.image&&!used.has(r.image.sha256)&&images.length<maxImages){used.add(r.image.sha256);images.push(r.image);}}
 }
 return {images,attempts,candidatePageCount:candidates.length,sourcePageCount:attempts.length,downloadedCount:images.length,submittedToVision:false,method:'public source-page image metadata; container, dimensions and byte hash checked; not render textures'};
}
export const referenceInternals07={permitted,imageCandidates,imageType,imageInfo};
