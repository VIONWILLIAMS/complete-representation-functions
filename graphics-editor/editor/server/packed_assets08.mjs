// Build-only transport packing. Source web/ files and their public URLs stay intact.
// Unbundled local preview deliberately has no manifest and uses the normal ASSETS path.
export const PACKED_ASSET_MANIFEST08 = typeof __CRF_PACKED_ASSETS08__ === 'undefined'
  ? Object.freeze({}) : __CRF_PACKED_ASSETS08__;

export function findPackedAsset08(pathname, manifest=PACKED_ASSET_MANIFEST08) {
  let decoded;
  try { decoded=decodeURIComponent(pathname); } catch { return null; }
  const candidates=[decoded];
  if(decoded.endsWith('/'))candidates.push(`${decoded}index.html`);
  else if(!decoded.slice(decoded.lastIndexOf('/')+1).includes('.'))candidates.push(`${decoded}.html`);
  for(const name of candidates){
    if(!Object.hasOwn(manifest,name))continue;
    const value=manifest[name];
    if(!value||typeof value.file!=='string'||!value.file.startsWith('/')||value.file.startsWith('//')||
      !['gzip','identity'].includes(value.encoding)||!Number.isSafeInteger(value.bytes)||value.bytes<0||
      typeof value.mime!=='string'||!/^\w[\w+./; =-]*$/.test(value.mime)||!/^[a-f0-9]{64}$/.test(value.sha256))return null;
    return {name,...value};
  }
  return null;
}

function representationHeaders(entry, sourceHeaders) {
  const headers=new Headers(sourceHeaders);
  // The backing object can have a different MIME, length and entity tag.
  for(const name of ['Content-Encoding','Content-Range','Content-Disposition','ETag','Last-Modified'])headers.delete(name);
  headers.set('Content-Type',entry.mime);
  headers.set('Content-Length',String(entry.bytes));
  headers.set('ETag',`"sha256-${entry.sha256}"`);
  headers.set('X-Content-Type-Options','nosniff');
  if(!headers.has('Cache-Control'))headers.set('Cache-Control','public, max-age=0, must-revalidate');
  if(entry.encoding==='gzip')headers.set('Accept-Ranges','none');
  return headers;
}

/** Returns null only when the ordinary static-asset handler should run. */
export async function servePackedAsset08(request, env, manifest=PACKED_ASSET_MANIFEST08) {
  if(!['GET','HEAD'].includes(request.method)||!env?.ASSETS?.fetch)return null;
  const url=new URL(request.url),entry=findPackedAsset08(url.pathname,manifest);
  if(!entry)return null;
  const etag=`"sha256-${entry.sha256}"`;
  const matchingTag=(request.headers.get('If-None-Match')||'').split(',').some(x=>x.trim()==='*'||x.trim().replace(/^W\//,'')===etag);
  if(matchingTag){
    const headers=representationHeaders(entry);headers.delete('Content-Length');
    return new Response(null,{status:304,headers});
  }
  const backingURL=new URL(entry.file,url.origin);
  if(backingURL.origin!==url.origin)return null;
  const headers=new Headers({'Accept':'application/octet-stream','Accept-Encoding':'identity'});
  // Byte ranges for identity aliases use the normal static binding. A gzip text
  // asset deliberately answers a range request with its full 200 representation.
  const range=request.headers.get('Range'),ifRange=request.headers.get('If-Range');
  const singleByteRange=range&&/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/.test(range);
  if(request.method==='GET'&&entry.encoding==='identity'&&singleByteRange&&(!ifRange||ifRange===etag))headers.set('Range',range);
  const upstream=await env.ASSETS.fetch(new Request(backingURL,{method:request.method,headers,redirect:'manual',signal:request.signal}));
  if(upstream.status!==200&&!(entry.encoding==='identity'&&[206,416].includes(upstream.status))){
    if(upstream.body)await upstream.body.cancel();
    return new Response(request.method==='HEAD'?null:'Packaged asset is unavailable.',{status:502,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  }
  const outputHeaders=representationHeaders(entry,upstream.headers);
  if(upstream.status===206||upstream.status===416){
    for(const name of ['Content-Range','Content-Length']){
      if(upstream.headers.has(name))outputHeaders.set(name,upstream.headers.get(name));else outputHeaders.delete(name);
    }
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:outputHeaders});
  }
  if(request.method==='HEAD')return new Response(null,{status:200,headers:outputHeaders});
  if(!upstream.body)return new Response('Packaged asset has no body.',{status:502,headers:{'Cache-Control':'no-store'}});
  let body=entry.encoding==='gzip'?upstream.body.pipeThrough(new DecompressionStream('gzip')):upstream.body;
  // Workers ignores a manually assigned Content-Length for unknown-length
  // streams. Its FixedLengthStream both enforces and advertises the original
  // byte length. Standard Web/Node preview keeps the normal stream instead.
  if(typeof FixedLengthStream==='function')body=body.pipeThrough(new FixedLengthStream(entry.bytes));
  return new Response(body,{status:200,headers:outputHeaders});
}
