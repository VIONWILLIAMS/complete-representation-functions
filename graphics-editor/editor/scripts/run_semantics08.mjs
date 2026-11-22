/** Actual visual semantic learning over successfully downloaded references. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {learnSemanticDescriptors08} from '../server/learning08.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),OUT=path.join(ROOT,'reports/v08/learning');
const {apiKey}=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>{s+=v;if(s.includes('\n'))resolve(JSON.parse(s.split('\n')[0]));});});
const files=(await fs.readdir(OUT)).filter(f=>/^round_\d+\.json$/.test(f)).sort();
for(const filename of files){
 const round=JSON.parse(await fs.readFile(path.join(OUT,filename),'utf8'));
 const images=round.downloads||[];if(!images.length)continue;
 const target=path.join(OUT,`semantics_${String(round.round).padStart(2,'0')}.json`);
 let old;try{old=JSON.parse(await fs.readFile(target,'utf8'));}catch{}
 const done=new Set((old?.items||[]).map(x=>x.id)),missing=images.filter(x=>!done.has(x.id));
 if(!missing.length){console.log(JSON.stringify({round:round.round,resumed:true,images:images.length}));continue;}
 const items=[...(old?.items||[])],batches=[...(old?.batches||[])];
 for(let j=0;j<missing.length;j+=6){
  const group=missing.slice(j,j+6),inputs=[];
  for(const image of group){
   const data=execFileSync('python',['-c',"from PIL import Image,ImageOps;import io,sys; im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB');im.thumbnail((512,512));b=io.BytesIO();im.save(b,format='JPEG',quality=88);sys.stdout.buffer.write(b.getvalue())",path.join(ROOT,image.file)],{maxBuffer:4000000});
   inputs.push({id:image.id,url:'data:image/jpeg;base64,'+data.toString('base64'),sourceUrl:image.sourceUrl,sha256:image.sha256});
  }
  console.log(JSON.stringify({round:round.round,status:'visual_semantics',images:inputs.length}));
  let result;
  for(let retry=0;retry<2;retry++){
   result=await learnSemanticDescriptors08({round:round.round,topic:round.checkpoint.topic,images:inputs},{apiKey,timeoutMs:150000,maxTokens:12000});
   if(result.ok)break;
   console.log(JSON.stringify({round:round.round,status:'retry_semantics',code:result.error?.code}));
  }
  if(result.ok)items.push(...result.items);
  batches.push(result);
  await fs.writeFile(target,JSON.stringify({schema:'crf.visual_semantics.v0.8',round:round.round,items,batches,actualInputImageCount:items.length},null,2)+'\n');
  console.log(JSON.stringify({round:round.round,ok:result.ok,items:items.length,usage:result.usage?.total_tokens,labels:result.items?.map(x=>x.label),error:result.error}));
 }
}
console.log(JSON.stringify({complete:true,stage:'visual_semantics'}));process.exit(0);
