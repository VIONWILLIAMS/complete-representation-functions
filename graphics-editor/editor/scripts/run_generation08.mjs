/** DeepSeek semantic functions -> the same editor Gaussian renderer -> visual feedback. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {generateGaussian08} from '../server/gaussian08.mjs';
const require=createRequire(import.meta.url),{render}=require('./render_v08.cjs');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),WEB=path.join(ROOT,'web'),OUT=path.join(ROOT,'reports/v08/generation'),PUBLIC=path.join(WEB,'assets/v08/examples');
await fs.mkdir(OUT,{recursive:true});await fs.mkdir(PUBLIC,{recursive:true});
const {apiKey}=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>{s+=v;if(s.includes('\n'))resolve(JSON.parse(s.split('\n')[0]));});});
const catalogue=JSON.parse(await fs.readFile(path.join(ROOT,'server/catalog08.json'),'utf8')).assets;
const street=JSON.parse(await fs.readFile(path.join(WEB,'assets/v08/street.scene.json'),'utf8'));
const orange='learn.r01.c6657129fc5c.object',vase='learn.r03.097cfbf071e3.object',coffee='learn.r04.c2f1cb0642a5.object',latte='learn.r04.ba8ec1aa482e.object',fern='learn.r05.67fd559a57f5.object';
const specs=[
 {id:'01_ceramic_citrus',title:'青釉与柑橘',scope:'new_composition_of_observed_objects',ids:['studio.paper','studio.shadow',vase,orange],prompt:'生成一张960×640精致静物摄影构图：青蓝釉花瓶稍靠左，一枚横切橙子半在右前方，浅灰暖白承托面。必须组合已学的独立物体函数，不用整张参考照片做背景，不要复制同一个大图。保留釉面、橙肉纤维的自然细节；使用观察到的前视外观，物品底部同一承托水平。充分留白但主体不能太小，总占画面约60%。柔和小接触阴影准确放在底部；阴影是可见中心(160,50)的320×100函数，注意大部分是透明填充。颜色克制，物体不要扁拉、悬空或重叠穿插。'},
 {id:'02_dark_fruit',title:'深色果物静物',scope:'new_composition_of_observed_objects',ids:['studio.slate','studio.shadow','fruit.apple','fruit.pear',orange],prompt:'生成一张960×640深灰底的苹果、梨与半橙静物照片构图。只组合独立高斯物品函数。红苹果和黄梨接近，橙子切面稍靠右前；大小符合真实果物比例，梨略高。照片内已有光照，不要用极端曝光或色相把质感抹掉。利用小而柔和的接触阴影让底部接地，不出现阴影矩形边界。已观察苹果右侧有缺口，安排梨适当遮挡该侧。画面主体组占中间约65%，精致、细节丰富、暗背景与亮果物形成自然对比。'},
 {id:'03_coffee_fern',title:'咖啡与蕨叶',scope:'new_composition_of_observed_objects',ids:['studio.paper','studio.shadow',coffee,fern,orange],prompt:'生成一张960×640自然光俯拍静物照片：左侧一只完整白色咖啡杯，右上角一枝蕨叶伸入画面，右下有一片橙子切面形成色彩点缀。用已学独立物体高斯函数，不能使用完整照片矩形贴图。咖啡图本身是俯拍视角，应保持原姿态；叶片不能穿过杯体；不要把茎插进咖啡。杯体约画面宽30%，橙片约15%，以背景留白维持安静构图。保证物体有合理尺度和柔和贴近的投影。叶片自带景深虚化，避免过度放大。'},
 {id:'04_street_teal',title:'青绿墙面的午后街角',scope:'semantic_edit_of_observation',ids:catalogue.filter(a=>a.id.startsWith('street.')&&a.id!=='street.reference').map(a=>a.id),currentScene:street,editableObjectIds:['wall.main'],prompt:'仅把主墙面改为自然柔和的青绿色调，保留原有阴影、墙面颗粒与亮暗关系。主墙面色相可以旋转约70–90度，但不能过曝。红绿灯、立柱、支架、全部窗户和斑马线的位置、尺寸、颜色、标签与全部其他参数原样保留。完整返回现有18对象场景。此结果标为真实参考场景的语义编辑，不声称新拍摄或新3D视角。'},
 {id:'05_street_context_fill',title:'移除行人灯后的街角',scope:'semantic_edit_with_inferred_background',ids:catalogue.filter(a=>a.id.startsWith('street.')&&a.id!=='street.reference').map(a=>a.id),currentScene:street,editableObjectIds:['signal.main'],prompt:'把正面行人信号灯 signal.main 隐藏，保留立柱、横臂与吊架、侧向灯背和所有其他对象完全不变。背景由已建立的墙面高斯函数显露，不能用任何新的矩形遮挡或纯色盖住。不要修改墙面或者场景光照。保持原始667×1000画幅。描述中说明被遮挡墙面是估计补全而非观测真值。'},
 {id:'06_alpine_haze',title:'湖畔薄雾光色实验',scope:'reference_conditioned_atmosphere_variant',ids:['landscape.alpine','atmosphere.haze'],prompt:'在原800×531阿尔卑斯湖畔高斯函数上，生成一幅克制的晨雾光色变体：保留山体、树林、湖岸线与倒影全部空间结构；叠加少量解析高斯薄雾，使远岸稍柔和，近处水纹仍然清楚。薄雾函数原960×640，位置需映射到场景；不要明显遮白，不要旋转地平线。轻微曝光调整可以，但不要把它描述成新的地貌、全新世界或新相机角度。'}
];
const results=[];
async function run(spec){
 const folder=path.join(OUT,spec.id);await fs.mkdir(folder,{recursive:true});
 const recordPath=path.join(folder,'record.json');try{const old=JSON.parse(await fs.readFile(recordPath,'utf8'));if(old.complete){results.push(old);console.log(JSON.stringify({id:spec.id,resumed:true}));return;}}catch{}
 const available=catalogue.filter(a=>spec.ids.includes(a.id));
 const options={apiKey,catalog:available,timeoutMs:150000,maxTokens:14000};
 let currentImage;
 if(spec.currentScene)currentImage='data:image/png;base64,'+(await fs.readFile(path.join(WEB,'assets/v08/renders/street.png'))).toString('base64');
 const input={prompt:spec.prompt,mode:spec.currentScene?'edit':'generate',search:false,...(spec.currentScene?{currentScene:spec.currentScene,image:currentImage,editableObjectIds:spec.editableObjectIds}:{})};
 console.log(JSON.stringify({id:spec.id,stage:'semantic_program_generation'}));
 const initial=await generateGaussian08(input,options);await fs.writeFile(path.join(folder,'initial.provider.json'),JSON.stringify(initial,null,2)+'\n');
 if(!initial.ok||!initial.scene){const failed={id:spec.id,complete:false,stage:'initial',response:initial};results.push(failed);console.log(JSON.stringify({id:spec.id,error:initial.error||initial.message}));return;}
 await fs.writeFile(path.join(PUBLIC,spec.id+'.initial.scene.json'),JSON.stringify(initial.scene,null,2)+'\n');
 const firstPath=path.join(PUBLIC,spec.id+'.initial.png'),first=render(initial.scene,firstPath);
 console.log(JSON.stringify({id:spec.id,stage:'actual_visual_critique',initialCalls:initial.usage.providerCalls}));
 const image='data:image/png;base64,'+(await fs.readFile(firstPath)).toString('base64');
 const critique=await generateGaussian08({mode:'critique',search:false,currentScene:initial.scene,image,prompt:'核对实际渲染图与目标：'+spec.prompt+'。指出最关键的可见缺陷：边缘、物体落点、阴影、真实纹理、透视与自然光照。只评价实际可见图，不能将像素拟合分数当照片真实感。只给共享高斯场景参数可做的具体建议；如果没有明显问题，不要强行改变。'},options);
 await fs.writeFile(path.join(folder,'critique.provider.json'),JSON.stringify(critique,null,2)+'\n');
 let candidate=null,second=null;
 if(critique.ok){
  console.log(JSON.stringify({id:spec.id,stage:'feedback_revision'}));
  candidate=await generateGaussian08({mode:'edit',search:false,currentScene:initial.scene,image,prompt:'依据实际图片反馈打磨当前作品，维持原始语义目标：'+spec.prompt,feedback:[critique.message,...(critique.qualityNotes||[])].join('\n'),...(spec.editableObjectIds?{editableObjectIds:spec.editableObjectIds}:{})},options);
  await fs.writeFile(path.join(folder,'candidate.provider.json'),JSON.stringify(candidate,null,2)+'\n');
  if(candidate.ok&&candidate.scene){await fs.writeFile(path.join(PUBLIC,spec.id+'.candidate.scene.json'),JSON.stringify(candidate.scene,null,2)+'\n');second=render(candidate.scene,path.join(PUBLIC,spec.id+'.candidate.png'));}
 }
 const chosen=second?candidate:initial,chosenPath=path.join(PUBLIC,spec.id+(second?'.candidate':'.initial')+'.png');
 await fs.copyFile(chosenPath,path.join(PUBLIC,spec.id+'.png'));await fs.writeFile(path.join(PUBLIC,spec.id+'.scene.json'),JSON.stringify(chosen.scene,null,2)+'\n');
 const record={id:spec.id,title:spec.title,scope:spec.scope,prompt:spec.prompt,complete:true,assetIds:spec.ids,initial:initial.usage,critique:critique.usage,candidate:candidate?.usage||null,actualRenders:[first.report,...(second?[second.report]:[])],selection:{chosen:second?'candidate':'initial',status:'pending_visual_review',reason:'Both actual images retained; numerical validity does not establish realism.'},modelWeightsUpdated:false};
 await fs.writeFile(recordPath,JSON.stringify(record,null,2)+'\n');results.push(record);
 console.log(JSON.stringify({id:spec.id,complete:true,renderedCandidates:record.actualRenders.length,requests:[...(initial.usage?.requests||[]),...(critique.usage?.requests||[]),...(candidate?.usage?.requests||[])].map(x=>x.requestId)}));
}
let cursor=0;async function work(){while(cursor<specs.length){const spec=specs[cursor++];await run(spec);}}
await Promise.all([work(),work()]);
results.sort((a,b)=>a.id.localeCompare(b.id));await fs.writeFile(path.join(OUT,'summary.json'),JSON.stringify({schema:'crf.generation_trials.v0.8',results},null,2)+'\n');
const examples=results.filter(r=>r.complete).map(r=>({id:r.id,title:r.title,sceneUrl:'assets/v08/examples/'+r.id+'.scene.json',thumbnailUrl:'assets/v08/examples/'+r.id+'.png',prompt:r.prompt,scope:r.scope,subtitle:r.scope.startsWith('new_')?'DeepSeek · 学习物体重新构图':'DeepSeek · 参考语义编辑',reportUrl:'assets/v08/examples/'+r.id+'.record.json'}));
for(const r of results.filter(r=>r.complete))await fs.writeFile(path.join(PUBLIC,r.id+'.record.json'),JSON.stringify(r,null,2)+'\n');
await fs.writeFile(path.join(WEB,'assets/v08/examples.json'),JSON.stringify({examples},null,2)+'\n');
console.log(JSON.stringify({complete:true,images:examples.length}));process.exit(0);
