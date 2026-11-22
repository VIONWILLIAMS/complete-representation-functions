// Application development server; launched only through sites-preview in managed QA.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../server/worker07.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'web');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i>=0?args[i+1]:fallback;};
const port=Number(arg('--port','4173')),host=arg('--host','127.0.0.1');
const state={DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY||'',DEEPSEEK_MODEL:process.env.DEEPSEEK_MODEL||'deepseek-flash'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm','.zip':'application/zip','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml'};
state.ASSETS={async fetch(request){
 let pathname;try{pathname=decodeURIComponent(new URL(request.url).pathname);}catch{return new Response('Bad path',{status:400});}
 if(/^\/(?:server|client|\.openai|\.sites-runtime)(?:\/|$)/.test(pathname))return new Response('Not found',{status:404});
 const filename=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));if(!filename.startsWith(dist+path.sep))return new Response('Not found',{status:404});
 try{const stat=await fs.stat(filename);if(!stat.isFile())return new Response('Not found',{status:404});const data=await fs.readFile(filename);return new Response(data,{headers:{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'}});}catch{return new Response('Not found',{status:404});}
}};
const server=http.createServer(async(req,res)=>{
 const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
 try{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>6*1024*1024){res.writeHead(413);res.end('Request too large');return;}chunks.push(c);}
 const request=new Request('http://'+(req.headers.host||'localhost')+req.url,{method:req.method,headers:req.headers,signal:abort.signal,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,state);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});const message=String(error.message).replaceAll(state.DEEPSEEK_API_KEY||'__no_key__','[redacted]');res.end(JSON.stringify({ok:false,error:{message}}));}
});
server.listen(port,host,()=>console.log('CRF development server ready on '+host+':'+port));
const stop=()=>{state.DEEPSEEK_API_KEY='';server.close(()=>process.exit(0));};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
