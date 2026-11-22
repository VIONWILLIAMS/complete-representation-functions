/** Public reference collection for Gaussian learning.
 * Only published source-page URLs and documented Commons thumbnail metadata are
 * used. A 401/403 is a terminal source failure; credentials are never forwarded.
 */
import {referenceInternals07} from './references07.mjs';
const PAGE_HOSTS=new Set(['commons.wikimedia.org','www.pexels.com','pexels.com','unsplash.com','www.unsplash.com']);
const IMAGE_HOSTS=new Set(['upload.wikimedia.org','thumb.wikimedia.org','images.pexels.com','images.unsplash.com']);
const LIMITS=Object.freeze({page:700000,api:700000,image:1800000});
const decode=value=>String(value).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const stripHTML=value=>decode(String(value||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,2000);
function permitted(value,kind){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(kind==='api'){if(u.hostname!=='commons.wikimedia.org'||u.pathname!=='/w/api.php')return null;}
  else if(!(kind==='page'?PAGE_HOSTS:IMAGE_HOSTS).has(u.hostname.toLowerCase()))return null;
  u.hash='';return u;
 }catch{return null;}
}
async function bounded(value,kind,fetchImpl,signal){
 if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
 let current=permitted(value,kind);if(!current)throw new Error('unsupported_source_host');
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,14000);
 try{
  for(let redirects=0;redirects<4;redirects++){
   if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
   const response=await fetchImpl(current.href,{redirect:'manual',credentials:'omit',signal:controller.signal,headers:{Accept:kind==='page'?'text/html':kind==='api'?'application/json':'image/jpeg,image/png,image/webp'}});
   if(response.status>=300&&response.status<400){const next=permitted(new URL(response.headers.get('location')||'',current).href,kind);await response.body?.cancel();if(!next)throw new Error('redirect_not_allowed');current=next;continue;}
   if(!response.ok){await response.body?.cancel();throw new Error('http_'+response.status);}
   const limit=LIMITS[kind];if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();throw new Error('size_limit');}
   if(!response.body?.getReader)throw new Error('response_body_unavailable');
   const reader=response.body.getReader(),parts=[];let length=0;
   for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>limit){await reader.cancel();throw new Error('size_limit');}parts.push(item.value);}
   const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   return {bytes,url:current.href,contentType:response.headers.get('content-type')||''};
  }
  throw new Error('redirect_limit');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function commonsTitle(pageURL){
 try{const u=new URL(pageURL);if(u.hostname!=='commons.wikimedia.org')return null;
  const title=u.pathname.startsWith('/wiki/')?decodeURIComponent(u.pathname.slice(6)):u.pathname==='/w/index.php'?u.searchParams.get('title'):null;
  return /^File:.+/i.test(title||'')?title:null;
 }catch{return null;}
}
function attrs(tag){const a={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g))a[match[1].toLowerCase()]=decode(match[2]);return a;}
function imageCandidates(html,pageURL){
 const result=[],title=commonsTitle(pageURL);
 const add=value=>{try{const u=permitted(new URL(decode(value),pageURL).href,'image');if(u)result.push(u.href);}catch{}};
 for(const tag of html.match(/<meta\b[^>]+>/gi)||[]){const a=attrs(tag);if(/^(og:image(?::url)?|twitter:image(?::src)?)$/i.test(a.property||a.name||'')&&a.content)add(a.content);}
 // Commons actual file previews (not gallery logos) provide their own URLs.
 if(title){
  const fileKey=title.slice(5).replaceAll(' ','_').toLowerCase();
  for(const tag of html.match(/<img\b[^>]+>/gi)||[]){const a=attrs(tag);for(const candidate of [a.src,...(a.srcset||'').split(',').map(x=>x.trim().split(/\s+/)[0])])if(candidate){try{const u=new URL(candidate,pageURL);const decoded=decodeURIComponent(u.pathname).toLowerCase();if(decoded.includes('/'+fileKey+'/')||decoded.endsWith('/'+fileKey))add(u.href);}catch{}}}
 }
 for(const match of html.matchAll(/https:\/\/(?:images\.pexels\.com|images\.unsplash\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org)\/[^\s"<>\\]+/g)){add(match[0]);if(result.length>=30)break;}
 let values=[...new Set(result)];
 if(title){const fileKey=title.slice(5).replaceAll(' ','_').toLowerCase();values=values.filter(value=>{try{const p=decodeURIComponent(new URL(value).pathname).toLowerCase();return p.includes('/'+fileKey+'/')||p.endsWith('/'+fileKey);}catch{return false;}});values.sort((a,b)=>Number(b.includes('/thumb/'))-Number(a.includes('/thumb/')));}
 return values.slice(0,8);
}
function normalizeImageURL(value){
 const u=permitted(value,'image');if(!u)return null;
 if(u.hostname==='images.pexels.com'){
  // OG crops often force 1100×627 and destroy portrait/object silhouettes.
  for(const key of ['h','height','fit','crop','rect'])u.searchParams.delete(key);
  u.searchParams.set('w','768');u.searchParams.set('auto','compress');u.searchParams.set('cs','tinysrgb');
 }
 if(u.hostname==='images.unsplash.com'){
  for(const key of ['h','fit','crop','rect'])u.searchParams.delete(key);
  u.searchParams.set('w','768');u.searchParams.set('q','85');u.searchParams.set('auto','format');
 }
 return u.href;
}
async function commonsThumbnail(pageURL,fetchImpl,signal){
 const title=commonsTitle(pageURL);if(!title)return {urls:[]};
 const u=new URL('https://commons.wikimedia.org/w/api.php');
 for(const [key,value] of Object.entries({action:'query',format:'json',formatversion:'2',redirects:'1',prop:'imageinfo',titles:title,iiprop:'url|size|extmetadata',iiurlwidth:'768',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms'}))u.searchParams.set(key,value);
 const result=await bounded(u.href,'api',fetchImpl,signal);let data;try{data=JSON.parse(new TextDecoder().decode(result.bytes));}catch{throw new Error('invalid_commons_metadata');}
 const pages=Array.isArray(data?.query?.pages)?data.query.pages:Object.values(data?.query?.pages||{}),page=pages.find(p=>/^File:/i.test(p.title||'')),info=page?.imageinfo?.[0];
 if(!info)return {urls:[],apiUrl:result.url};
 const urls=[info.thumburl,...(Number(info.size)<=LIMITS.image?[info.url]:[])].filter(v=>permitted(v,'image'));
 const ext=info.extmetadata||{},license={name:stripHTML(ext.LicenseShortName?.value),url:ext.LicenseUrl?.value||null,artist:stripHTML(ext.Artist?.value),credit:stripHTML(ext.Credit?.value),usageTerms:stripHTML(ext.UsageTerms?.value),attributionRequired:stripHTML(ext.AttributionRequired?.value),source:'commons-imageinfo'};
 if(license.url){try{const l=new URL(license.url);if(!['https:','http:'].includes(l.protocol)||l.username||l.password)license.url=null;}catch{license.url=null;}}
 return {urls,apiUrl:result.url,license,original:{url:permitted(info.url,'image')?.href||null,width:info.width,height:info.height,bytes:info.size}};
}
const base64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(out);};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function collectReferences08(input,{fetchImpl=fetch,signal,maxImages=6}={}){
 if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');
 maxImages=Math.max(1,Math.min(6,Math.floor(Number(maxImages)||4)));
 const evidence=input.research||input,sources=Array.isArray(evidence.sources)?evidence.sources:[],pages=[...new Map(sources.filter(s=>permitted(s.url,'page')).map(s=>[permitted(s.url,'page').href,s])).values()].slice(0,24);
 const images=[],attempts=[],used=new Set();
 for(let offset=0;offset<pages.length&&images.length<maxImages;offset+=3){
  const results=await Promise.all(pages.slice(offset,offset+3).map(async source=>{
   const attempt={sourceUrl:source.url,title:source.title||source.url,status:'unavailable',imageAttempts:[]};
   try{
    if(new URL(source.url).hostname==='commons.wikimedia.org'&&!commonsTitle(source.url))throw new Error('source_is_not_photo_detail');
    // No fallback is attempted if the source page requires authorization.
    const page=await bounded(source.url,'page',fetchImpl,signal),html=new TextDecoder().decode(page.bytes);
    let urls=imageCandidates(html,page.url),meta=null;
    if(commonsTitle(page.url)){
     try{meta=await commonsThumbnail(page.url,fetchImpl,signal);urls=[...meta.urls,...urls];if(meta.license)attempt.license=meta.license;attempt.metadataSource=meta.apiUrl;}
     catch(error){if(signal?.aborted)throw error;attempt.metadataError=error.message;if(['http_401','http_403'].includes(error.message))throw error;}
    }
    urls=[...new Set(urls.map(normalizeImageURL).filter(Boolean))].slice(0,6);
    for(const imageURL of urls){
     try{
      const downloaded=await bounded(imageURL,'image',fetchImpl,signal),info=referenceInternals07.imageInfo(downloaded.bytes);if(!info)throw new Error('invalid_image_container');
      const hash=await sha(downloaded.bytes);attempt.imageAttempts.push({url:imageURL,status:'downloaded'});
      Object.assign(attempt,{status:'downloaded',imageUrl:downloaded.url,bytes:downloaded.bytes.length,...info,sha256:hash});
      return {attempt,image:{url:'data:'+info.mime+';base64,'+base64(downloaded.bytes),imageUrl:downloaded.url,sourceUrl:source.url,title:source.title||source.url,sha256:hash,bytes:downloaded.bytes.length,...info,...(meta?.license?{license:meta.license}:{}),...(meta?.original?{original:meta.original}:{})}};
     }catch(error){if(signal?.aborted)throw error;attempt.error=error.message;attempt.imageAttempts.push({url:imageURL,status:'unavailable',error:error.message});if(['http_401','http_403'].includes(error.message))break;}
    }
    if(!urls.length)attempt.error='no_supported_image';
   }catch(error){if(signal?.aborted)throw new DOMException('Reference collection cancelled','AbortError');attempt.error=error.message;}
   return {attempt};
  }));
  for(const result of results){attempts.push(result.attempt);if(result.image&&!used.has(result.image.sha256)&&images.length<maxImages){used.add(result.image.sha256);images.push(result.image);}}
 }
 return {images,attempts,candidatePageCount:pages.length,sourcePageCount:attempts.length,downloadedCount:images.length,submittedToVision:false,method:'source-page photos; Commons documented 768px imageinfo thumbnails; uncropped Pexels 768px; checked image containers/dimensions/SHA-256; access denials respected'};
}
export const referenceInternals08={permitted,commonsTitle,imageCandidates,normalizeImageURL,commonsThumbnail,bounded};
