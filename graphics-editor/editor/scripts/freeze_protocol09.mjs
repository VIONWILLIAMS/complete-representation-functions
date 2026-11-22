/** Freeze prompts before provider trials. Refuses to overwrite an existing protocol. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='输出1024×768，使用CRF原生二维函数与共享高斯外观，保持共同光照、合理比例、材质细节和接触关系。';
const showcase=[
 ['01_ivory_facade','米白墙面与晨间行人灯','architecture',90101,'米白色粗糙灰泥建筑立面，三扇相同尺度的竖窗横向排列。左侧有一根深色立柱与连接的正面行人信号灯。清晨暖侧光投下长阴影，底部露出一小段路面。',[{type:'count',subject:'window',value:3},{type:'count',subject:'pole',value:1},{type:'count',subject:'signal',value:1}]],
 ['02_ochre_corner','赭石墙面的四扇窗','architecture',90102,'赭石色墙面，四扇窗按两行两列排列，右侧一根墨绿立柱承接行人信号灯。午后光从左上方射入，墙面有细颗粒，窗内深暗，构图整洁但保留真实磨损。',[{type:'count',subject:'window',value:4},{type:'count',subject:'pole',value:1},{type:'count',subject:'signal',value:1}]],
 ['03_blue_wall','青灰立面与斜向光影','architecture',90103,'青灰建筑墙面，只有两扇间隔较大的方窗，并排位于上半部，底部深灰路面。画面不要立柱和信号灯。柔和偏暖的斜向阳光照亮墙面一部分，另一部分保留层次。',[{type:'count',subject:'window',value:2},{type:'count',subject:'pole',value:0},{type:'count',subject:'signal',value:0}]],
 ['04_cold_alpine','冷色晨雾中的高山湖','landscape',90104,'高山湖泊的清晨风景，远处两层山脊，冷蓝天空与轻薄晨雾。左近岸两棵高针叶树，右侧近岸一块灰色岩石，湖面保留细波纹与地貌倒影。',[{type:'count',subject:'tree',value:2},{type:'count',subject:'rock',value:1}]],
 ['05_warm_coast','暖色海岸与三块礁石','landscape',90105,'温暖傍晚的海岸，海平线较低，柔和浅橙天空，前景三块大小不同的海岸岩石。海面细小波纹，远处海岬有雾化层次。不要树木、建筑或水果。',[{type:'count',subject:'rock',value:3},{type:'count',subject:'tree',value:0}]],
 ['06_misty_forest','六棵树的林间晨雾','landscape',90106,'安静的雾中森林，共六棵可辨认的针叶树，按前中后景错落分布，树冠尺度随距离变化。地面为暗绿林地，晨光从左上透入，空气湿润，有真实深浅层次。',[{type:'count',subject:'tree',value:6}]],
 ['07_evening_lake','暮色湖岸与远山','landscape',90107,'暮色中的山湖，远处两层不同高度的山脊，暖灰天空与深蓝绿湖面。右岸两棵树，左前方两块岩石。画面光线克制，水面与岸线连接自然，避免装饰插画感。',[{type:'count',subject:'tree',value:2},{type:'count',subject:'rock',value:2}]],
 ['08_three_fruits','自然窗光中的三种果物','still_life',90108,'浅暖灰背景与低反光木色承托面，一只红苹果在左，一只黄绿色梨在中间稍后，一只橙子在右前方。只出现这三个果物。自然左侧窗光，果皮细节、接触阴影与比例要协调。',[{type:'count',subject:'apple',value:1},{type:'count',subject:'pear',value:1},{type:'count',subject:'orange',value:1},{type:'left_of',subject:'apple',target:'orange'}]],
 ['09_celadon_citrus','青釉花瓶与两只柑橘','still_life',90109,'青绿色陶瓷花瓶居中稍后，两只完整橙子在前方左右错落，不出现苹果和梨。浅石灰色背景，温暖柔侧光，花瓶底部和橙子与承托面接触。釉面高光克制。',[{type:'count',subject:'vase',value:1},{type:'count',subject:'orange',value:2},{type:'count',subject:'apple',value:0},{type:'count',subject:'pear',value:0}]],
 ['10_dark_pears','深青背景的梨与苹果','still_life',90110,'深青灰背景，棕灰色桌面，两只黄绿色梨一高一矮，左前方一只深红苹果，不出现橙子或花瓶。偏暖低位侧光，暗部保持颜色层次，所有果物自然接地。',[{type:'count',subject:'pear',value:2},{type:'count',subject:'apple',value:1},{type:'count',subject:'orange',value:0},{type:'count',subject:'vase',value:0}]]
].map(([id,title,category,seed,prompt,expectedConstraints])=>({id,title,category,seed,prompt:prompt+base,expectedConstraints,width:1024,height:768,taskType:'unseen_semantic_program_generation',frozenBeforeProviderGeneration:true}));
const terminal={
 architecture:[
  '浅沙色墙面，五扇竖窗排成一行，左侧立柱连接一个行人灯，偏冷晨光。',
  '浅橄榄色墙面，六扇窗三行两列，右侧一根立柱与行人灯，柔和阴天。',
  '奶油色墙面，两扇上小下大的窗纵向排列，无立柱和信号灯，低位暖侧光。',
  '深蓝灰墙面，三扇方窗呈三角布局，右侧一根立柱，不要信号灯，午后侧光。',
  '砖红色抹灰立面，四扇窗横向排列，无立柱和信号灯，清冷漫射光。',
  '浅绿色立面，左侧两扇窄窗，右侧一扇宽窗，中央立柱连接信号灯，金色傍晚。',
  '暖白色墙面，一扇较大的方窗偏左，右侧一根立柱连接行人灯，地面占下方四分之一。',
  '灰紫色粗糙墙面，五扇窗按上三下二排列，无交通设施，微暖阴天。',
  '棕黄色墙面，六扇窗两行三列，左边一根深灰立柱与行人灯，深长斜影。',
  '浅蓝色墙面，一扇窄高窗位于右上，无立柱和信号灯，左侧留大面积受光墙面。',
  '石灰白立面，四扇窗两行两列，只有左侧一根立柱没有信号灯，中等侧光。',
  '暗青色墙面，两个窄窗偏左并排，右侧行人灯与立柱连接，光从右上照入。',
  '暖灰墙面，三扇窗沿斜向阶梯式排列，无立柱和灯，柔光保留颗粒。',
  '红棕墙面，左右各一扇宽窗，中央立柱和连接行人灯，低角度阳光。',
  '浅灰绿色立面，八扇小窗两行四列，无交通设施，均匀漫射光。',
  '淡黄色墙面，两扇竖窗上下排列，右侧一根立柱与行人灯，地面占下方五分之一。',
  '中性灰立面，三扇宽窗横排，左边立柱与小行人灯，偏冷侧光。',
  '浅褐色墙面，一扇方窗居中，无立柱和信号灯，右侧阳光左侧暗影。',
  '柔和青蓝墙面，六扇窗三列两行，右侧立柱与行人灯，日落前暖光。',
  '灰白色墙面，四扇不等宽窗排成一行，无立柱和信号灯，轻微冷色环境光。'
 ],
 landscape:[
  '清晨海岸，前景一块深灰岩石，远处低海岬，淡粉天空，没有树。',
  '晴天高山湖，近岸三棵树与两块岩石，远处三层山脊，冷暖清晰。',
  '雾中森林，八棵针叶树前后错落，林地暗褐，微暖晨光。',
  '蓝调时刻的海岸，前景四块岩石，蓝灰天空，海水较暗，无树。',
  '傍晚高山湖，左岸一棵高树，右岸三块岩石，远山暖灰。',
  '低雾森林，五棵树，前景一块岩石，绿色地面与柔和侧光。',
  '金色海岸，近处两块巨大岩石，一块小岩石，天空明亮，无树。',
  '冷色山湖，四棵针叶树分散两岸，远处两层山脊，轻雾。',
  '阴天森林，七棵树，树干深暗、树冠暗绿，地面浅棕。',
  '浅青色海面，远处平缓山脊，右前方两块岩石，没有树，日间柔光。',
  '高山湖的暖晨光，左岸两棵矮树，前景一块宽岩石，天空浅蓝。',
  '安静林地，四棵高树形成纵向节奏，地面两块岩石，略带薄雾。',
  '深蓝海岸暮色，远处两层海岬，前景五块不同尺度岩石，无树。',
  '浅雾山湖，右岸三棵树，一块大岩石在左前，光从右侧来。',
  '浓淡分层的森林，九棵树，较亮空气背景，近处树冠轮廓清楚。',
  '柔和灰天的海岸，两块岩石居左，一块岩石居右，水平海线，无树。',
  '湖面占较大面积的山湖，两棵树在右侧，四块小岩石在前岸，暖侧光。',
  '青绿色森林，六棵不同高矮的树，两块前景岩石，光从左上照来。',
  '傍晚海面，前景一块宽大圆钝岩石，天空暖粉，远处暗蓝海岬，无树。',
  '清冷山湖，近岸五棵针叶树，前景不放岩石，远处三层山脊。'
 ],
 still_life:[
  '一只绿色苹果与一只黄色梨并排，苹果在右，浅暖灰背景，自然右侧光。',
  '三只橙子呈三角摆放，蓝灰背景，木色桌面，柔和侧光，不放其他物品。',
  '一只深蓝花瓶与一只红苹果，花瓶在左稍后，浅褐背景。',
  '两只红苹果与一只橙子，橙子在中间靠前，深绿背景。',
  '一只黄梨居中，左侧一只橙子，右侧一只绿苹果，灰色背景与侧光。',
  '两只白色陶瓷花瓶一高一矮，没有水果，深灰桌面，暖窗光。',
  '三只梨从左到右逐渐增高，浅蓝灰背景，木色桌面。',
  '一只棕色花瓶在后，一只橙子在左前，一只梨在右前，柔光。',
  '两只绿苹果并排，前方一只红苹果，暗暖灰背景，不放其他物品。',
  '一只青釉花瓶居右，一只黄梨居左，低反光灰桌面。',
  '四只橙子错落摆放，浅绿背景，自然左侧光，不放其他物品。',
  '一只红苹果在中间，两只梨分居左右，深蓝背景。',
  '一只灰白花瓶偏左，右前方两只苹果一红一绿，暖灰背景。',
  '一只梨与两只橙子，梨稍后，浅棕背景，光从右侧来。',
  '一只深绿花瓶居中，左右各一只橙子，深灰背景，暖侧光。',
  '两只黄色梨与两只红苹果，前后分层，浅灰桌面和蓝灰背景。',
  '只有一只红苹果在画面偏右，左侧留白，柔和青灰背景。',
  '一只蓝色花瓶和一只白色花瓶并排，前方一只橙子，自然窗光。',
  '一只绿苹果、一只黄梨、两只橙子，棕灰桌面，暗青背景。',
  '两只梨左右并排，后方一只矮白花瓶，浅粉灰背景，柔和侧光。'
 ]
};
const terminalPrompts=Object.entries(terminal).flatMap(([category,prompts])=>prompts.map((prompt,i)=>({id:category+'_'+String(i+1).padStart(2,'0'),category,prompt:prompt+base,seeds:[104729,130363,155921],width:1024,height:768})));
const protocol={schema:'crf.evaluation_protocol.v0.9',id:'crf09-frozen-protocol-v1',frozenAt:new Date().toISOString(),purpose:'Fixed showcase tasks and unrun terminal evaluation; never substitute curated examples for the complete denominator.',showcase,terminal:{status:'not_run',requiresGate:{gate:'P3',status:'passed',independentEvidence:'nonempty list of actual evidence'},promptCount:60,seedsPerPrompt:3,taskCount:180,prompts:terminalPrompts},budget:{maxCandidates:3,maxQualityFeedback:2,learningPolicy:'auto_for_showcase_frozen_for_terminal'},quality:{perCategory:true,atomicSemanticRate:.95,wholePromptRate:.90,relativePreference:.65,absoluteFourOfFiveRate:.80,severeDefectRateMax:.05,humanReviewRequired:true},labels:{showcase:'preselected demonstration tasks; not the terminal benchmark',terminal:'must remain unused for training and tuning until P3 permits the terminal run'},comparisonPolicy:'First, final and every candidate retained; failed or empty tasks remain in denominator; no benchmark scores fabricated.'};
const file=path.join(root,'benchmarks/v09/protocol.json');await fs.mkdir(path.dirname(file),{recursive:true});const text=JSON.stringify(protocol,null,2)+'\n';await fs.writeFile(file,text,{flag:'wx'});const sha=createHash('sha256').update(text).digest('hex');await fs.writeFile(file+'.sha256',sha+'\n',{flag:'wx'});console.log(JSON.stringify({file:path.relative(root,file),sha256:sha,showcase:showcase.length,terminalPrompts:terminalPrompts.length,terminalTasks:180,status:'frozen_unrun'}));
