/** Bounded explicit DeepSeek Search API recovery for a zero-download round. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectReferences08} from '../server/references08.mjs';
import {aggregateLearningRounds08} from '../server/learning08.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'reports/v08/learning');
const {apiKey}=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>{s+=v;if(s.includes('\n'))resolve(JSON.parse(s.split('\n')[0]));});});
const p=path.join(OUT,'round_02.json'),record=JSON.parse(await fs.readFile(p,'utf8'));
if(record.downloads?.length){console.log(JSON.stringify({alreadyRecovered:true,count:record.downloads.length}));process.exit(0);}
const queries=['site:pexels.com/photo/ apple fruit','site:pexels.com/photo/ pear fruit'];
const responses=await Promise.allSettled(queries.map(async query=>{
 const start=Date.now();const response=await fetch('https://api.deepseek.com/v1/tools/search',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(90000),headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({query,count:8,need_content:true})});
 if(!response.ok)throw new Error('search_api_http_'+response.status);
 const raw=await response.text();if(raw.length>2000000)throw new Error('search_response_limit');const data=JSON.parse(raw);
 if(!Array.isArray(data.results))throw new Error('invalid_search_results');
 return {query,data,elapsedMs:Date.now()-start,requestId:data.id||response.headers.get('x-request-id')||null};
}));
const calls=[];for(let i=0;i<responses.length;i++){
 const r=responses[i];if(r.status==='rejected'){calls.push({query:queries[i],ok:false,error:String(r.reason.message).replaceAll(apiKey,'[redacted]')});continue;}
 const {data,...meta}=r.value;calls.push({...meta,ok:true,results:data.results,usage:data.usage||null});
}
const sources=[...new Map([...record.sources,...calls.flatMap(c=>(c.results||[]).map(x=>({url:x.url,title:x.title||x.url,snippet:x.summary||x.snippet||'',via:'deepseek_search_api'})))].filter(s=>typeof s.url==='string').map(s=>[s.url,s])).values()];
const collection=await collectReferences08({sources},{maxImages:6});
const all=(await fs.readdir(OUT)).filter(x=>/^round_\d+\.json$/.test(x));const seen=new Set();for(const f of all)for(const x of JSON.parse(await fs.readFile(path.join(OUT,f),'utf8')).downloads||[])seen.add(x.sha256);
const downloads=[];
for(const im of collection.images){if(seen.has(im.sha256))continue;seen.add(im.sha256);const m=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(im.url);if(!m)continue;const id='learn.r02.'+im.sha256.slice(0,12),filename='fitting/learning08/originals/'+id+'.'+(m[1]==='jpeg'?'jpg':m[1]);await fs.writeFile(path.join(ROOT,filename),Buffer.from(m[2],'base64'));const{url,...meta}=im;downloads.push({...meta,id,round:2,status:'downloaded',file:filename,topic:record.checkpoint.topic});}
record.directRecovery={reason:'native search yielded no downloadable photo; same round retried with bounded explicit DeepSeek Search API',calls,collection:{attempts:collection.attempts,downloadedCount:downloads.length}};record.downloads=downloads;record.sources=sources;record.research.sources=sources;record.checkpoint.sourceCount=sources.length;record.checkpoint.downloadedImageCount=downloads.length;
record.checkpoint.extraSearchAPIRequests=calls.filter(x=>x.ok).length;
for(const c of calls)if(c.ok){record.research.toolCalls.push({type:'search_api',kind:'search',status:'completed',action:{type:'search',queries:[c.query]},sourceUrls:(c.results||[]).map(x=>x.url)});if(c.requestId)record.usage.requests.push({requestId:c.requestId,phase:'explicit_reference_recovery',elapsedMs:c.elapsedMs,...c.usage});}
await fs.writeFile(p,JSON.stringify(record,null,2)+'\n');
const rounds=[];for(const f of all)rounds.push(JSON.parse(await fs.readFile(path.join(OUT,f),'utf8')));await fs.writeFile(path.join(OUT,'summary.json'),JSON.stringify(aggregateLearningRounds08(rounds,{downloads:rounds.flatMap(x=>x.downloads||[])}),null,2)+'\n');
console.log(JSON.stringify({round:2,searchAPIRequests:calls.filter(x=>x.ok).length,downloaded:downloads.length,sources:sources.length,attempts:collection.attempts.map(x=>({sourceUrl:x.sourceUrl,status:x.status,error:x.error}))}));process.exit(0);
