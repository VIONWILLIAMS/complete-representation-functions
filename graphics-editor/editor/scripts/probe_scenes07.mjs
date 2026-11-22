/** Execute the real production handler with a runtime-only credential.
 * The Python launcher reads the credential with getpass and writes it to stdin.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import worker from '../server/worker07.mjs';
import {compose} from '../server/deepseek07.mjs';
import {collectReferences07} from '../server/references07.mjs';
import Photo from '../web/crf-photo07.js';
const root=path.resolve(import.meta.dirname,'..');
const [mode='generate',list='ceramics,interior,rainstreet,citrus']=process.argv.slice(2);
let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
const config=JSON.parse(stdin);stdin='';
const prompts={
 ceramics:'生成一张窗边静物的摄影风格图片：灰绿色细腻墙面前，一座浅色石台上摆一只孔雀青釉花器和透明烟色玻璃球，旁边有一个小黄铜球、两本错落的书。侧面大窗柔光，构图紧凑，真实接触阴影和材质反射，画面没有文字。请实际搜索Pexels或Unsplash的公开照片页，分析所提供参考图的真实形态、材质、光线。用完整代码场景表达，适量细节，避免低多边形轮廓，地面和背景铺满画面。',
 interior:'生成一张真实自然采光客厅的室内摄影：米灰色亚麻沙发、两个靠垫、圆形胡桃木茶几、陶杯与书，木地板和浅色地毯，左侧窗户照入柔和日光，墙角一盆绿植。相机处于人眼高度，看不到墙顶外的空洞，家具尺度正常，接触真实，窗框与墙正确连接。请实际搜索Pexels或Unsplash的公开室内照片页，从图像中提取可用形态、织物纹理、木纹、光照与构图；代码表达完整场景。',
 rainstreet:'生成一张雨后夜晚街角的摄影风格图片：前景湿润沥青和斑马线，一根细黑色金属杆连接红色行人信号灯，后方是有窗框和亮窗的街楼与暖色店铺。地面反射有轻微微表面起伏，蓝色夜空与暖色灯光平衡。信号灯、横臂和竖杆必须连接，画面避免不明发光方块。请实际搜索Pexels或Unsplash公开夜街照片页，从参考图提取材质、比例与光线，再编写完整代码场景。',
 citrus:'生成一张高质量摄影风格静物：三个大小略有差别的橙子，带一片真实细长绿叶，放在白色浅釉盘上，下面是细腻木桌。斜侧窗光，柔和真实阴影，果皮细小毛孔有尺度层次，轮廓平滑，构图近景，不出现整齐塑料球感。请搜索Pexels或Unsplash公开橙子静物照片页，从所给参考图中提取形态和细节函数，用代码构造整张图。'
};
const secondRound={
 citrus:'只修改当前程序，保留身份、种子、对象ID与既有材质函数，不换preset。实际图第三果被前两果遮住，盘沿实心圆片封住整盘，橙皮频率过高。请把plate_inner_basin和plate_rim_glaze设visible:false，plate_wall_outer保留单一有内壁盘体、thickness=0.03，内底y=0.03。orange_large.position=[-0.40,0.031,0.10] rotation=[0,23,0]；orange_medium=[0.25,0.031,-0.28] rotation=[0,-17,0]；orange_small=[0.28,0.031,0.40] rotation=[0,42,0]，保持半径高度。必须三只清晰可见。camera.position=[1.45,1.60,2.40],target=[0,0.29,0.02],fov42,focusDistance3.08,aperture0.01。三果texture.kind保持orange，scale分别1.0、1.1、1.2，strength0.55，roughness分别0.48、0.50、0.52，bump0.065；保留AST但调制均值接近0.95。大果顶y=0.691：stalk_large.position=[-0.40,0.685,0.10],rotation=[0,0,0],height=0.028；leaf_blade.position=[-0.22,0.70,0.10],radius=0.14,height=0.02,scale=[1.4,1,0.48],rotation=[0,0,0]；leaf_midrib.position=[-0.40,0.711,0.10],radius0.005,height0.32,rotation=[0,0,-90]；leaf_tip.visible=false。table_top宽深20，back_wall宽20高8、位置保持[0,0,-2.28]。window_fill.intensity=0.5，rim_back.intensity=1.5，exposure1.0。检查果体和盘底的接触，叶根与果蒂相接，不增加假阴影。JSON数字必须写0.03而不是.03，不能有表达式或注释，不能输出两个JSON对象。',
 ceramics:'仅修改当前程序，不换preset。实际图左上大灰白板正是window_glass：它在z=0.46,y=1.9至5.1，悬在花器前上方，并非侧墙窗，挡住主光和制造噪声。window_glass、window_frame_left、window_frame_top设visible:false；构图为画外窗光下静物，保留window_main/window_fill面积灯，不再创建玻璃板或可见灯板。floor_base顶面y=0.08；stone_base.position.y=0.08,height=0.80，顶面0.88，与stone_slab底0.88相接。台面顶仍1.04，物品底部均据此，保留已正确的书册接触。back_wall宽20高8、位置[0,0,-1.55]；floor_base宽深30。celadon_body、foot、neck、rim transmission=0、emissionStrength=0、roughness约0.22至0.30、bump不超过0.004。body.thickness=0.012；neck.radius=0.17,profile=[0.20,0.18,0.17,0.17,0.19,0.23,0.28],thickness=0.008；rim.radius=0.066,profile=[0.72,0.78,0.85,0.88],thickness=0.006。保留body底1.085、neck底1.70、rim底2.04。smoke_glass_ball.radius=0.24,height=0.48,position=[0.05,1.04,-0.38],scale=[1,1,1],color=[210,220,216],transmission=1,ior=1.45,roughness=0.035,bump=0，去掉玻璃噪声颜色function，保留其他对象材质函数。brass_ball.radius=0.11,height=0.22,position=[0.50,1.04,-0.03],roughness=0.24,metalness=1。camera.position=[2.4,2.05,3.2],target=[0.10,1.50,-0.25],fov32,focusDistance4.18,aperture0.01。window_main保持当前位置/尺寸和强度6，window_fill强度1.2。移除挡光物后不要暴增灯光。禁止假阴影、发光球和照片贴图。返回唯一完整合法JSON，数字不能省略前导0、不能有算式或注释。'
};
await fs.mkdir(path.join(root,'reports/v07'),{recursive:true});
await fs.mkdir(path.join(root,'web/assets/v07/generated'),{recursive:true});
async function run(id){
 const prompt=prompts[id];if(!prompt)throw new Error('Unknown case '+id);
 let input;
 if(mode==='generate'||mode==='compose')input={prompt,mode:'generate',engine:'radiance07',search:true};
 else if(['refine','refine2','refine3'].includes(mode)){
  const inputPhase=mode==='refine3'?'refined2':mode==='refine2'?'refined':'initial';
  const initial=JSON.parse(await fs.readFile(path.join(root,`reports/v07/api_${id}_${inputPhase}.json`),'utf8'));
  const currentScene=initial.response.program;if(!currentScene)throw new Error('Initial program missing '+id);
  const bytes=await fs.readFile(path.join(root,`build/v07_live/${id}_${inputPhase}.png`));
  const observations=id==='interior'?'实际首帧可见：后墙下半部是大片灰色空洞，天花和窗外有不明白色灯板，窗和地板过曝，茶几腿悬浮、上端穿进台面，绿植被裁掉。检查发现你按中心坐标放置了部件，但执行器一律底部y=0：墙高3且底部应该y=0，不能放y=1.5；桌脚高0.44应从地面顶面起而不是y=.22。用这个规则检查所有盒/圆柱，确保墙与地板连续、沙发坐垫靠背接触、灯不在镜头中。主光强度46太大，降至约5–9并减少补光，使材质可见。保持原构图意图，补入盆栽、真实连接和接触。':id==='rainstreet'?'实际图可见：建筑、窗户、路灯和信号杆都悬空；斑马线完全看不见；信号灯背对镜头；白色发光方块飘在背景，地面过曝。具体程序问题：执行器所有物体位置是底部，不是中心，building_left高9应position.y=地面顶面，不是4.5；signal_pole_vertical高3.1应从地面起，不是y=1.55；ground_asphalt顶面.06而斑马线顶面.024，全部埋入地面！请统一地面顶面y=0并把白线放y=.002。相机在+Z，灯面必须在灯壳的+Z前方而不是-0.73后方。信号红色面积光应放在实际红灯的高度约2.7，而不是y1.06。所有面积灯是可见实体，必须置于实体窗/灯位置或镜头外，取消空中白灯板，大幅降低42强度主光到约4–8。街楼应该落地并充满背后构图，增加行人标志，连接横杆和灯壳。':'';
  const second=id==='interior'?'第二轮实际图中，墙体和桌脚已修好，保留这些改进。仍有巨大的白色天花灯板和窗前白板。请从lights数组删除ceiling_bounce、back_corner_fill、sky_fill；把唯一窗光window_sun移到真实窗外position[-4.12,1.6,-1.05]、target[-3.12,1.6,-1.05]、size[1.9,1.25]、intensity6。光源在墙外、窗口范围内，不能飘在屋里。适当用environment.strength .4维持暗部；保持自然日光层次。把planter及植物整体向左移约0.5以完整入镜，保持茎叶连接。物体材质仍偏平，适度加强低对比木纹与织物，不要增加多余物体或变更主题。':'';
  const stillLife=id==='citrus'?'实际首帧：果皮和盘子严重过曝，像黄色球，第三个橙子被挡住，叶子像竖着的塑料片，果梗埋入果肉，背景能看到桌边。请把window_key强度38降到6，fill降到1.3，rim降到2.5；适当降低果皮亮度而保留微表面毛孔和多项函数。所有对象以底部为y0，orange_large底.11高.66，梗底应该接近.77而不是.438。盘子用一个有薄壁的lathe形成浅盘，不要三块厚圆饼叠在一起，明确盘内底部和果体底部接触。把三个橙子错落摆开、让后方小橙子可见；叶片用扁薄椭球横向延伸且连接果梗，不是竖片。扩大桌面铺满背景或补完整摄影背景。':id==='ceramics'?'实际首帧：两块巨大白色灯板遮挡了主体，几乎整个画面过曝，后墙悬空，石台没有支撑，花器和书嵌进石台。请删掉table_bounce，window_main改为position[-3,5,2]、target[0,1,0]、size[2.2,2.2]、intensity6，fill置于[3,4,-1]向主体、size[1.5,1.5]、intensity2；确保灯板在镜头之外。back_wall底部应y0不是2.6，铺满背景。stone_slab底.88高.16顶1.04，放在它上面的所有物体都需要从y1.04起；为台面增加合理实体支撑，或者改成落地的石座。删除所有soft_contact_shadow_*和brass_ball_contact这些假阴影几何，让渲染器计算真实阴影。统一花瓶底座、身体、瓶颈、口沿的接触；书本各层也按底+高相接。可将camera调整[3,2.2,4] target[0,1.45,0] fov34形成紧凑静物构图，确保玻璃球和黄铜球可见，孔雀青釉颜色正确。':'';
  const third='当前第二轮实际图明显退化：虽没有空中灯板，但整个室内过暗，玻璃导致很多亮斑噪声。请保留所有已连接家具和墙面，修正采光：将window_glass.visible设false，作为打开的窗口；将window_sun置于[-3.8,1.6,-1.05]、target[0,1,-1.05]、size[1.8,1.25]、intensity9。添加一个在相机后方的柔和补光studio_fill，position[3,3,5] target[0,1,-.8] size[3,2] color[240,235,225] intensity2.5，它在相机后方不能直接入镜。environment.strength=.55，exposure=1.05。不要恢复天花灯板或改变家具布局。目标为光线充足但不过曝、可辨木纹与布面的自然室内。质量判断必须以附图为准，不保证第三轮一定改善。';
  input={prompt:'请查看附上的实际渲染图，根据原始目标逐项修正可见问题。优先修正构图、真实尺度、缺失连接、物体悬浮、材质塑料感、光影过暗或过曝、背景空洞。保留这个场景和稳定对象ID，返回修正后的完整程序。只进行有视觉依据的改进，不要声称质量已达标。'+(mode==='refine3'?third:mode==='refine2'?(secondRound[id]||second):observations+stillLife),originalPrompt:prompt,mode:'edit',engine:'radiance07',search:false,currentScene,image:'data:image/png;base64,'+bytes.toString('base64')};
 }else throw new Error('Unknown mode');
 const started=Date.now();
 let response,status;
 if(mode==='compose'){
  const previous=JSON.parse(await fs.readFile(path.join(root,`reports/v07/api_${id}_initial.json`),'utf8'));
  await fs.writeFile(path.join(root,`reports/v07/attempt2_api_${id}_initial.json`),JSON.stringify(previous,null,2)+'\n');
  const collected=await collectReferences07(previous.response.research,{maxImages:6});
  input.referenceImages=collected.images;input.search=false;
  const {images,...collection}=collected;
  response=await compose(input,{apiKey:config.apiKey,validateProgram:Photo.validate,researchResult:{...previous.response.research,referenceCollection:collection},onProviderResponse:async value=>{await fs.writeFile(path.join(root,`reports/v07/diagnostic_${id}_${value.phase}_${value.requestId}.json`),JSON.stringify(value,null,2)+'\n');}});
  status=response.ok?200:response.httpStatus||502;
 }else{
  const http=await worker.fetch(new Request('https://crf.test/api/crf/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),{DEEPSEEK_API_KEY:config.apiKey,DEEPSEEK_MODEL:'deepseek-flash'});
  status=http.status;response=await http.json();
 }
 const phase=mode==='refine3'?'refined3':mode==='refine2'?'refined2':mode==='refine'?'refined':'initial';
 const record={schema:'crf.api_acceptance.v0.7',recordedAt:new Date().toISOString(),id,phase,prompt,endpoint:mode==='compose'?'provider.compose (reusing recorded search)':'/api/crf/generate',httpStatus:status,elapsedMs:Date.now()-started,inputImageProvided:!!input.image,response};
 await fs.writeFile(path.join(root,`reports/v07/api_${id}_${phase}.json`),JSON.stringify(record,null,2)+'\n');
 if(response.program)await fs.writeFile(path.join(root,`web/assets/v07/generated/${id}_${phase}.crf.json`),JSON.stringify(response.program,null,2)+'\n');
 console.log(JSON.stringify({id,phase,httpStatus:status,ok:response.ok,elapsedMs:record.elapsedMs,objects:response.program?.objects?.length,searched:response.research?.searched,referenceImagesSubmitted:response.research?.referenceImagesSubmitted,renderedImageProvided:response.vision?.renderedImageProvided,repair:response.repair,requests:response.usage?.requests?.map(x=>({id:x.requestId,phase:x.phase,tokens:x.total_tokens})),error:response.error}));
}
const ids=list.split(',');
for(let i=0;i<ids.length;i+=2)await Promise.all(ids.slice(i,i+2).map(run));
config.apiKey='';
