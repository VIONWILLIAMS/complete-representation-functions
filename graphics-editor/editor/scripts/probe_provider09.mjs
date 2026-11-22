import readline from 'node:readline';
import fs from 'node:fs/promises';
import {PROVIDER_BASE_URL,DEFAULT_MODEL} from '../server/deepseek07.mjs';
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let key='';for await(const line of rl){key=JSON.parse(line).apiKey||'';rl.close();break;}
const started=Date.now();
const response=await fetch(PROVIDER_BASE_URL+'/chat/completions',{method:'POST',signal:AbortSignal.timeout(90000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:DEFAULT_MODEL,thinking:{type:'enabled'},reasoning_effort:'high',max_tokens:600,response_format:{type:'json_object'},messages:[{role:'user',content:'Return only JSON {"ready":true,"task":"CRF 0.9 semantic scene compiler"}. This is a connection probe.'}]})});
const raw=await response.json();key='';
const record={schema:'crf.provider_probe.v0.9',at:new Date().toISOString(),httpStatus:response.status,ok:response.ok&&raw.choices?.[0]?.finish_reason==='stop',model:raw.model,requestId:raw.id,elapsedMs:Date.now()-started,usage:raw.usage||{},reasoningObserved:!!raw.choices?.[0]?.message?.reasoning_content,finishReason:raw.choices?.[0]?.finish_reason,content:raw.choices?.[0]?.message?.content,error:response.ok?undefined:{code:raw.error?.code,type:raw.error?.type}};
await fs.mkdir('reports/v09',{recursive:true});await fs.writeFile('reports/v09/provider_probe.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
