/** One bounded, observed-image refinement, retaining earlier candidates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {generateGaussian08} from '../server/gaussian08.mjs';
const require=createRequire(import.meta.url),{render}=require('./render_v08.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),pub=path.join(root,'web/assets/v08/examples'),reports=path.join(root,'reports/v08/generation');
const {apiKey}=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>{s+=x;if(s.includes('\n'))resolve(JSON.parse(s.split('\n')[0]));});});
const catalog=JSON.parse(await fs.readFile(path.join(root,'server/catalog08.json'),'utf8')).assets;
const instructions={
 '01_ceramic_citrus':'实际图中花瓶与橙片下方还有微小悬浮间隙。依据目录新增的真实alpha下缘点计算变换后轮廓位置，把小接触阴影贴紧下缘，增强紧贴底部的暗度但保持软边。可适度移动阴影，不能把阴影变成宽重黑椭圆；保持已经良好的构图、尺度与材质。',
 '02_dark_fruit':'实际图中苹果和梨的接触还偏硬、橙片底部略像浮起。根据新增alpha下缘坐标让接触阴影紧靠物品轮廓，暗底下应克制。保持苹果缺口被梨遮住，不改变果物材质；不能捏造新表面。',
 '03_coffee_fern':'实际图中右侧橙片是前视切面，杯子是俯视/斜俯视，视角不统一。当前二维表示不能重建橙片新视角，故删除或隐藏橙片与它的阴影，以一只咖啡杯和右上角蕨叶构成更一致的照片构图。杯体覆盖已修复，当前尺寸261×226；控制杯子约画面宽30–35%，保持有留白但不太空，叶片可以自然裁出右上边缘，别显示悬空叶柄。不宣称解决了物理重新打光。'
};
for(const [id,feedback]of Object.entries(instructions)){
 const recordFile=path.join(reports,id,'record.json'),record=JSON.parse(await fs.readFile(recordFile,'utf8'));
 const outFile=path.join(reports,id,'polish.provider.json');
 try{const prev=JSON.parse(await fs.readFile(outFile,'utf8'));if(prev.ok&&prev.scene){console.log(JSON.stringify({id,resumed:true}));continue;}}catch{}
 const scene=JSON.parse(await fs.readFile(path.join(pub,id+'.candidate.scene.json'),'utf8'));
 const image='data:image/png;base64,'+(await fs.readFile(path.join(pub,id+'.candidate.png'))).toString('base64');
 console.log(JSON.stringify({id,stage:'observed_contact_and_view_consistency'}));
 const result=await generateGaussian08({mode:'edit',search:false,currentScene:scene,image,prompt:record.prompt,feedback},{apiKey,catalog:catalog.filter(a=>record.assetIds.includes(a.id)),maxTokens:12000,timeoutMs:150000});
 await fs.writeFile(outFile,JSON.stringify(result,null,2)+'\n');
 if(result.ok&&result.scene){
  await fs.writeFile(path.join(pub,id+'.polish.scene.json'),JSON.stringify(result.scene,null,2)+'\n');
  const actual=render(result.scene,path.join(pub,id+'.polish.png'));
  record.polish={usage:result.usage,feedback,source:'independent visual review and alpha-derived support hints',selection:'pending_visual_review'};
  record.actualRenders.push(actual.report);
  await fs.writeFile(recordFile,JSON.stringify(record,null,2)+'\n');
 }
 console.log(JSON.stringify({id,ok:result.ok,requestIds:result.usage?.requests?.map(x=>x.requestId)}));
}
process.exit(0);
