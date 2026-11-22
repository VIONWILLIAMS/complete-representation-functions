/** Actual ten-round provider search and source-image acquisition.
 * Feed one JSON object {apiKey} through hidden stdin. No secret is written.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {researchGaussian08,aggregateLearningRounds08} from '../server/learning08.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'reports/v08/learning'), IMAGES=path.join(ROOT,'fitting/learning08/originals');
await fs.mkdir(OUT,{recursive:true});await fs.mkdir(IMAGES,{recursive:true});
const input=await new Promise((resolve,reject)=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{s+=chunk;if(s.includes('\n'))resolve(JSON.parse(s.split('\n')[0]));});process.stdin.on('error',reject);});
const apiKey=input.apiKey;
if(typeof apiKey!=='string'||apiKey.length<12)throw new Error('Missing runtime credential');
const repairEmpty=process.argv.includes('--repair-empty');
const themes=[
 ['橙子与柑橘的单体实拍','4–6张不同橙子、整果和切面照片，优先干净背景，用于轮廓、果皮、瓣片材质学习'],
 ['苹果与梨的实拍形态','4–6张不同真实苹果和梨，侧光、果柄清楚，观察实例差异，不能重复第一轮柑橘'],
 ['陶瓷杯与花瓶的实拍','4–6张不同陶瓷杯或花瓶的具体照片，简单背景，关注口沿、釉面、柔光'],
 ['咖啡与餐桌静物实拍','4–6张不同咖啡杯、木桌或餐桌照片，关注接触阴影、承托面、光照一致性'],
 ['植物近景与自然物品实拍','4–6张蘑菇、蕨叶或花朵的近景照片，清晰主体与叶脉、菌褶、细节'],
 ['真实交通灯与街角实拍','4–6张不同交通灯、行人灯或街角，关注灯体、立柱、支架衔接和遮挡'],
 ['墙面与建筑窗户的实拍','4–6张阳光投射墙面、窗框或建筑立面的照片，关注材质、直线、阴影与光照'],
 ['高山湖泊与水面反射实拍','4–6张不同阿尔卑斯湖泊或山水照片，关注远近层次、岸线和水面反射'],
 ['海岸岩石与海浪实拍','4–6张不同海岸、礁石、沙滩的照片，关注岩面、波纹和自然空间层次'],
 ['树林与自然光影实拍','4–6张不同森林、树叶和林间光影照片，补充植物材质与深浅背景，避免以上已收集作品']
];
const rounds=[],downloads=[],seenHashes=new Set(),seenUrls=new Set();
for(let n=1;n<=10;n++){
 const roundFile=path.join(OUT,`round_${String(n).padStart(2,'0')}.json`);
 let saved;try{saved=JSON.parse(await fs.readFile(roundFile,'utf8'));}catch{}
 if(saved?.checkpoint?.status==='searched'&&(!repairEmpty||(saved.downloads||[]).length>0)){
  rounds.push(saved);for(const s of saved.sources||[])seenUrls.add(s.url);
  for(const x of saved.downloads||[]){if(!seenHashes.has(x.sha256)){downloads.push(x);seenHashes.add(x.sha256);}}
  console.log(JSON.stringify({round:n,resumed:true,downloaded:saved.downloads?.length||0}));continue;
 }
 const [topic,subtopic]=themes[n-1];
 console.log(JSON.stringify({round:n,status:'searching',topic}));
 let result;
 for(let attempt=0;attempt<2;attempt++){
  result=await researchGaussian08({sessionId:'crf08-ten-rounds',round:n,topic,subtopic:subtopic+(repairEmpty?'。本轮前次来源无法访问，实际改用 site:pexels.com/photo/ 或 site:commons.wikimedia.org/wiki/File: 搜索，找到至少4张可下载作品；不要再次提供 Unsplash。':''),priorSummary:rounds.slice(-2).map(r=>r.semanticPlan?.summary||'').join('\n').slice(0,4000),excludeSourceUrls:[...seenUrls,...(saved?.sources||[]).map(s=>s.url)].slice(-100),collectImages:true,maxImages:6},{apiKey,timeoutMs:90000,researchMaxTokens:3800});
  if(result.ok&&result.checkpoint?.status==='searched')break;
  console.log(JSON.stringify({round:n,attempt:attempt+1,status:'retry',error:result.error?.code}));
 }
 const local=[];
 for(const item of result.images||[]){
  if(seenHashes.has(item.sha256))continue;
  const match=/^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(item.url||'');if(!match)continue;
  const extension=match[1]==='jpeg'?'jpg':match[1],id=`learn.r${String(n).padStart(2,'0')}.${item.sha256.slice(0,12)}`;
  const name=id+'.'+extension,target=path.join(IMAGES,name);await fs.writeFile(target,Buffer.from(match[2],'base64'));
  const {url,...metadata}=item;
  const record={...metadata,id,round:n,status:'downloaded',file:path.relative(ROOT,target),licenseStatus:'source terms require attribution/verification',topic};
  local.push(record);downloads.push(record);seenHashes.add(item.sha256);
 }
 const {images,...clean}=result;clean.downloads=local;clean.checkpoint.downloadedImageCount=local.length;
 if(saved){
  clean.previousAttempts=[...(saved.previousAttempts||[]),{checkpoint:saved.checkpoint,sources:saved.sources,usage:saved.usage,collection:saved.collection,semanticPlan:saved.semanticPlan}];
  clean.sources=[...new Map([...(saved.sources||[]),...clean.sources].map(s=>[s.url,s])).values()];clean.research.sources=clean.sources;
  clean.usage.requests=[...(saved.usage?.requests||[]),...(clean.usage?.requests||[])];clean.usage.providerCalls=clean.usage.requests.length;for(const field of ['prompt_tokens','completion_tokens','total_tokens'])clean.usage[field]=clean.usage.requests.reduce((s,r)=>s+(r[field]||0),0);
  clean.checkpoint.requestIds=clean.usage.requests.map(r=>r.requestId);clean.checkpoint.sourceCount=clean.sources.length;
 }
 await fs.writeFile(roundFile,JSON.stringify(clean,null,2)+'\n');
 rounds.push(clean);for(const s of clean.sources||[])seenUrls.add(s.url);
 const summary=aggregateLearningRounds08(rounds,{downloads});await fs.writeFile(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({round:n,status:clean.checkpoint.status,sources:clean.sources.length,candidates:clean.imageCandidates.length,downloaded:local.length,downloadedTotal:downloads.length,usage:clean.usage?.total_tokens,requests:clean.checkpoint.requestIds}));
}
console.log(JSON.stringify({complete:true,...aggregateLearningRounds08(rounds,{downloads}).counts}));
process.exit(0);
