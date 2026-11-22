#!/usr/bin/env node
import {createServer} from 'node:http';
import {createReadStream, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {build}=require('./build_quality_review13.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if (args.length && (args.length!==2 || args[0]!=='--port')) throw new Error('Usage: npm run dev:detail -- [--port 4178]');
const port=args.length?Number(args[1]):4178;
if (!Number.isInteger(port)||port<1024||port>65535) throw new Error('Port must be an integer in 1024..65535');
const output=path.join(root,'build/quality13/CRF_Detail_Review.html');
const result=build({output});
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://127.0.0.1').pathname;
  if (!['GET','HEAD'].includes(request.method)) {response.writeHead(405);response.end();return;}
  if (!['/','/CRF_Detail_Review.html'].includes(pathname)) {response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':statSync(output).size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(request.method==='HEAD')response.end();else createReadStream(output).pipe(response);
});
server.on('error',error=>{console.error('Could not start the detail review:',error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`CRF detail review: http://127.0.0.1:${port}/\n${result.scenes.length} actual function scenes; ${result.bytes} bytes. Keep this terminal open.`));
