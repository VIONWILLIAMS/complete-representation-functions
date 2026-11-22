/* CRF 0.7 image-program facade and fully procedural showcase scenes. */
(function(root,factory){
  const renderer=typeof module==='object'&&module.exports?require('./crf-radiance07.js'):root.CRFRadiance07;
  const api=factory(renderer);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CRFPhoto07=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Renderer){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const material=(color,roughness=.5,texture='none',extra={})=>({color,roughness,metalness:0,transmission:0,ior:1.5,texture:{kind:texture,scale:1,strength:.5},bump:0,...extra});
  const object=(id,label,surface,position,mat,extra={})=>({id,label,visible:true,surface,material:mat,transform:{position,rotation:extra.rotation||[0,0,0],scale:extra.scale||[1,1,1]}});
  const box=(id,label,size,p,m,e)=>object(id,label,{kind:'box',width:size[0],height:size[1],depth:size[2],...(e?.bevel?{bevel:e.bevel}:{})},p,m,e);
  const ball=(id,label,r,h,p,m,e)=>object(id,label,{kind:'ellipsoid',radius:r,height:h},p,m,e);
  const cylinder=(id,label,r,h,p,m,e)=>object(id,label,{kind:'cylinder',radius:r,height:h},p,m,e);
  const lathe=(id,label,r,h,profile,p,m,thickness=0,e)=>object(id,label,{kind:'lathe',radius:r,height:h,profile,thickness},p,m,e);
  const light=(id,position,target,size,color,intensity)=>({id,type:'area',position,target,size,color,intensity});
  function base(id,title,camera,environment,lights){return {schema:'crf.image_program.v0.7',id,title,width:960,height:720,seed:127,exposure:1,camera:{aperture:0,focusDistance:8,...camera},environment,lights,objects:[]};}
  function citrus(){
    const p=base('citrus','晴日柑橘',{position:[4.5,3.5,6.8],target:[0,.72,0],fov:34,aperture:.055,focusDistance:8.3},{top:[215,226,237],bottom:[218,206,185],strength:.32},[light('window',[-3.5,5.8,2],[0,.7,0],[3.2,3.7],[255,244,224],7),light('fill',[4,3,-2],[0,1,0],[2,3],[210,229,255],2.3)]);
    p.objects.push(box('table','浅色石台',[100,.18,100],[0,-.18,0],material([194,185,164],.62,'stone',{bump:.025,texture:{kind:'stone',scale:1.6,strength:.32}}),{scale:[4,1,4]}));
    p.objects.push(lathe('platter','白釉浅盘',2.04,.18,[.90,.99,1,.97,.92],[0,0,.05],material([229,227,216],.19,'ceramic'),.04));
    const fruitProfile=Array.from({length:25},(_,i)=>{const t=i/24;return Math.max(.13,Math.sqrt(Math.max(0,1-(t*2-1)**2))*(1+.018*Math.sin(t*8)));});
    const fruits=[{id:'orange.a',p:[-.70,.045,.67],r:.73,h:1.40,c:[234,106,13]},{id:'orange.b',p:[.80,.045,.35],r:.68,h:1.34,c:[244,145,24]},{id:'orange.c',p:[-.43,.045,-.74],r:.75,h:1.52,c:[222,121,16]}];
    for(const f of fruits){p.objects.push(lathe(f.id,'橙子',f.r,f.h,fruitProfile,f.p,material(f.c,.37,'orange',{bump:.12,texture:{kind:'orange',scale:1,strength:.64}})));p.objects.push(cylinder(f.id+'.stem','果蒂',.045,.055,[f.p[0],f.p[1]+f.h-.015,f.p[2]],material([72,67,22],.8,'wood')));}
    p.objects.push(ball('leaf','柑橘叶',.26,.035,[-.87,1.48,.72],material([40,79,27],.44,'none',{function:{op:'add',args:[{op:'const',value:.78},{op:'mul',args:[{op:'const',value:.3},{op:'sin',args:[{op:'mul',args:[{op:'x'},{op:'const',value:70}]}]}]}]}}),{scale:[.76,1,2.0],rotation:[-12,65,12]}));
    return p;
  }
  function ceramics(){
    const p=base('ceramics','釉色与玻璃',{position:[5.3,3.25,7.6],target:[0,1.15,0],fov:36,aperture:.035,focusDistance:9.2},{top:[208,225,233],bottom:[190,184,170],strength:.3},[light('key',[-4,5.5,3],[0,1,0],[3.4,4],[255,245,230],7.2),light('rim',[4,3.5,-2.4],[-.4,1.2,0],[1.6,3],[205,228,255],5)]);
    p.objects.push(box('table','石质承托面',[100,.12,100],[0,-.12,0],material([177,172,158],.58,'stone',{bump:.018,texture:{kind:'stone',scale:1.2,strength:.38}})));
    p.objects.push(box('backdrop','灰绿背景',[100,30,.18],[0,0,-3.8],material([103,112,102],.9,'stone',{texture:{kind:'stone',scale:5,strength:.15}})));
    p.objects.push(box('plinth','切面石座',[3.05,.46,2.08],[-.35,0,.04],material([214,206,184],.52,'stone',{bump:.01,texture:{kind:'stone',scale:2.2,strength:.35}}),{bevel:.015}));
    p.objects.push(lathe('vase','孔雀青釉花器',.67,2.28,[.59,.76,.95,1,.94,.72,.48,.40,.43],[-1.04,.46,-.03],material([36,93,97],.17,'ceramic',{bump:.004}),.055));
    p.objects.push(ball('glass','浅烟色玻璃球',.64,1.28,[.67,.46,.22],material([213,233,226],.03,'none',{transmission:1,ior:1.47})));
    p.objects.push(ball('brass','黄铜球',.38,.76,[1.76,0,.53],material([212,156,74],.16,'none',{metalness:.97,bump:.002})));
    p.objects.push(box('book.a','素色书册',[1.35,.14,.90],[1.39,0,-1.04],material([157,132,100],.85,'fabric',{bump:.005}),{rotation:[0,-12,0]}));
    p.objects.push(box('book.b','白色书册',[1.28,.11,.86],[1.37,.14,-1.04],material([216,211,194],.86,'fabric',{bump:.004}),{rotation:[0,-5,0]}));
    p.objects.push(lathe('small.bowl','白釉小碗',.43,.41,[.58,.77,.92,1.0],[1.36,.25,-1.04],material([232,224,207],.20,'ceramic'),.045));
    return p;
  }
  function interior(){
    const p=base('interior','窗边客厅',{position:[5.8,2.65,6.8],target:[-.55,1.35,-.55],fov:39,aperture:.015,focusDistance:9.8},{top:[196,218,238],bottom:[173,166,144],strength:.35},[light('window',[-4.12,2.10,-.3],[0,2.10,-.3],[3.9,2.85],[220,237,255],7.5),light('sun',[-6.5,4.7,1.8],[1.2,0,-.5],[.6,.6],[255,215,160],100)]);
    const plaster=material([214,207,188],.88,'stone',{bump:.012,texture:{kind:'stone',scale:3,strength:.10}}),wood=material([133,86,47],.36,'wood',{bump:.012,texture:{kind:'wood',scale:.65,strength:.78}}),linen=material([176,172,151],.87,'fabric',{bump:.02,texture:{kind:'fabric',scale:.8,strength:.5}}),darkWood=material([59,38,22],.43,'wood',{texture:{kind:'wood',scale:.8,strength:.6}});
    p.objects.push(box('floor','橡木地板',[14,.12,14],[0,-.12,0],wood));
    p.objects.push(box('back.wall','后墙',[18,4.5,.2],[0,0,-3.3],plaster));
    p.objects.push(box('ceiling','顶面',[18,.15,14],[0,4.5,2.5],material([225,222,207],.94)));
    p.objects.push(box('left.sill','窗下墙',[.18,.75,6.5],[-4,0,-.1],plaster));
    p.objects.push(box('left.head','窗上墙',[.18,1.05,6.5],[-4,3.45,-.1],plaster));
    p.objects.push(box('left.rear','窗后侧墙',[.18,2.7,1.15],[-4,.75,-2.775],plaster));
    p.objects.push(box('left.front','窗前侧墙',[.18,2.7,1.55],[-4,.75,2.375],plaster));
    const trim=material([210,209,190],.35);
    p.objects.push(box('window.sill','木窗台',[.44,.1,3.85],[-3.91,.72,-.3],trim));
    p.objects.push(box('window.header','窗上框',[.18,.08,3.85],[-3.9,3.43,-.3],trim));
    p.objects.push(box('window.mullion','窗竖框',[.15,2.75,.07],[-3.91,.75,-.3],trim));
    p.objects.push(box('window.crossbar','窗横框',[.15,.07,3.85],[-3.91,2.2,-.3],trim));
    p.objects.push(box('rug','羊毛地毯',[4.5,.026,3.7],[.0,.012,.65],material([196,185,158],.96,'fabric',{bump:.022,texture:{kind:'fabric',scale:.7,strength:.6},function:{op:'add',args:[{op:'const',value:.92},{op:'mul',args:[{op:'const',value:.08},{op:'sin',args:[{op:'mul',args:[{op:'x'},{op:'const',value:12}]}]}]}]}})));
    p.objects.push(box('sofa.base','沙发木底座',[3.35,.18,1.55],[-1.1,.13,-1.22],darkWood));
    p.objects.push(box('sofa.seat','沙发坐垫',[3.06,.32,1.33],[-1.1,.31,-1.11],linen,{bevel:.10}));
    p.objects.push(box('sofa.back','沙发靠背',[3.35,.78,.28],[-1.1,.35,-1.94],linen,{bevel:.10}));
    for(const x of[-2.67,.47])p.objects.push(box('sofa.arm.'+String(x).replace('.','_'),'沙发扶手',[.22,.65,1.55],[x,.31,-1.22],linen,{bevel:.09}));
    for(const x of[-2.35,.15])for(const z of[-1.85,-.6])p.objects.push(cylinder('sofa.leg.'+String(x).replace('.','_')+String(z).replace('.','_'),'沙发脚',.055,.17,[x,0,z],darkWood));
    p.objects.push(box('cushion.a','暖灰靠垫',[.77,.65,.20],[-1.8,.61,-1.47],material([154,147,130],.94,'fabric',{bump:.02}),{bevel:.095,rotation:[-12,-4,-8]}));
    p.objects.push(box('cushion.b','赭色靠垫',[.68,.60,.19],[-.55,.63,-1.43],material([158,87,45],.92,'fabric',{bump:.02}),{bevel:.09,rotation:[-9,3,8]}));
    const walnut=material([105,62,31],.30,'wood',{bump:.008,texture:{kind:'wood',scale:.8,strength:.6}});
    p.objects.push(cylinder('table.top','圆形胡桃木茶几',1.07,.10,[.8,.67,.92],walnut));
    for(let i=0;i<3;i++){const a=i*2*Math.PI/3;p.objects.push(cylinder('table.leg.'+i,'茶几支脚',.07,.68,[.8+Math.sin(a)*.7,0,.92+Math.cos(a)*.7],walnut));}
    p.objects.push(lathe('table.vase','小陶器',.19,.42,[.63,.82,1,.9,.55,.44],[.53,.77,.9],material([211,197,166],.54,'ceramic'),.025));
    p.objects.push(box('table.book','桌上书册',[.46,.045,.63],[1.17,.77,.95],material([207,197,178],.8),{rotation:[0,18,0]}));
    p.objects.push(cylinder('table.cup','水杯',.12,.23,[1.28,.82,1.05],material([226,229,222],.05,'none',{transmission:1,ior:1.46})));
    p.objects.push(box('picture.frame','画框',[1.55,1.88,.065],[.25,1.58,-3.15],darkWood));
    p.objects.push(box('picture.canvas','抽象画面',[1.40,1.73,.02],[.25,1.66,-3.102],material([169,156,117],.96,'none',{function:{op:'add',args:[{op:'const',value:.45},{op:'mul',args:[{op:'const',value:.7},{op:'fbm',frequency:1.4,seed:18}]}]}})));
    p.objects.push(lathe('plant.pot','陶土花盆',.43,.63,[.65,.74,.87,1],[2.37,0,-1.78],material([139,80,49],.7,'stone',{bump:.012}),.045));
    p.objects.push(cylinder('plant.stem','植物茎',.025,1.55,[2.37,.55,-1.78],material([71,64,30],.88,'wood')));
    for(let i=0;i<10;i++){const a=i*2.4,x=2.37+Math.sin(a)*.22,z=-1.78+Math.cos(a)*.22,y=.82+i*.12;p.objects.push(ball('plant.leaf.'+i,'植物叶片',.30,.045,[x,y,z],material([45+3*(i%3),76+5*(i%3),31],.47,'none',{function:{op:'add',args:[{op:'const',value:.8},{op:'mul',args:[{op:'const',value:.3},{op:'noise',frequency:12,seed:i}]}]}}),{scale:[1.1,1,1.5],rotation:[-25+8*(i%4),140*i,35+12*(i%3)]}));}
    return p;
  }
  function rainstreet(){
    const p=base('rainstreet','雨后街角',{position:[3.2,2.55,6.0],target:[-.35,1.5,-.7],fov:45,aperture:.035,focusDistance:7.5},{top:[65,83,116],bottom:[28,35,50],strength:1.5},[light('shop',[-2.7,1.65,-5.18],[-2.7,1.65,5],[2.1,2.4],[255,177,93],5.0),light('cool.window',[2.75,1.8,-5.17],[2.75,1.8,4],[2.2,2.7],[133,191,255],4.8),light('signal.red',[.16,2.58,.335],[.16,2.58,3],[.30,.32],[255,22,8],9.5),light('street.soft',[-3.8,6,1.5],[0,0,-3],[1.7,1.7],[255,217,164],16)]);
    p.exposure=1.3;
    const asphalt=material([28,34,42],.20,'asphalt',{metalness:.30,bump:.014,texture:{kind:'asphalt',scale:.6,strength:.8}}),concrete=material([75,83,88],.76,'stone',{bump:.018,texture:{kind:'stone',scale:3,strength:.35}}),steel=material([45,50,55],.27,'none',{metalness:.78});
    p.objects.push(box('road','湿润沥青',[100,.15,100],[0,-.15,-4],asphalt));
    p.objects.push(box('sidewalk','人行道',[100,.15,3.1],[0,0,-4.7],concrete));
    p.objects.push(box('building.left','左侧街楼',[60,15,2.1],[-29.8,.15,-6.5],material([98,104,100],.86,'stone',{bump:.02,texture:{kind:'stone',scale:2,strength:.3}})));
    p.objects.push(box('building.right','右侧街楼',[60,15,2.2],[30.3,.15,-6.5],material([105,115,129],.86,'stone',{bump:.02})));
    p.objects.push(box('shop.frame','橱窗外框',[2.4,2.8,.18],[-2.7,.25,-5.35],steel));
    p.objects.push(box('shop.glass','暖色橱窗',[2.18,2.48,.05],[-2.7,.40,-5.22],material([61,38,25],.12,'none',{metalness:.5,emission:[255,177,91],emissionStrength:1.4})));
    p.objects.push(box('shop.mullion','橱窗竖框',[.06,2.5,.06],[-2.7,.40,-5.15],steel));
    p.objects.push(box('shop.blue.frame','冷光店面边框',[2.45,3.0,.18],[2.75,.30,-5.35],steel));
    p.objects.push(box('shop.blue.mullion','冷光橱窗竖框',[.07,2.9,.06],[2.75,.33,-5.13],steel));
    p.objects.push(box('shop.transom','店面上框',[12,.12,.18],[.1,3.25,-5.30],steel));
    p.objects.push(box('wall.band','建筑横向接缝',[13,.055,.10],[.1,3.65,-5.31],material([26,32,37],.72)));
    for(let i=0;i<8;i++){const x=i<4?-4.2+(i%2)*1.8:1.25+(i%2)*1.8,y=3.85+Math.floor((i%4)/2)*1.7;p.objects.push(box('window.'+i,'楼上窗户',[.85,1.05,.06],[x,y,-5.34],material([24,33,43],.16,'none',{metalness:.6,emission:i%3===0?[255,197,120]:[54,91,134],emissionStrength:i%3===0?.8:.18})));}
    for(let i=0;i<6;i++)p.objects.push(box('crosswalk.'+i,'斑马线',[3.8,.007,.36],[.8,.002,2.0-i*.74],material([185,185,169],.22,'asphalt',{metalness:.12,bump:.01,texture:{kind:'asphalt',scale:1,strength:.2}})));
    p.objects.push(cylinder('signal.pole','信号灯杆',.074,3.60,[-1.05,0,.18],steel));
    p.objects.push(cylinder('signal.arm','信号灯横臂',.05,1.28,[-1.05,3.10,.18],steel,{rotation:[0,0,-90]}));
    p.objects.push(cylinder('signal.hanger','信号灯连接件',.026,.19,[.16,2.92,.18],steel));
    p.objects.push(box('signal.housing','行人信号灯外壳',[.50,1.02,.23],[.16,1.91,.18],steel,{bevel:.045}));
    p.objects.push(box('signal.lower','下方玻璃灯面',[.36,.37,.025],[.16,1.99,.31],material([32,79,80],.13,'none',{metalness:.3})));
    const human=material([255,236,188],.4,'none',{emission:[255,231,174],emissionStrength:2.4});
    p.objects.push(ball('signal.head','行人标志头部',.035,.07,[.16,2.65,.349],human,{scale:[1,1,.12]}));
    p.objects.push(box('signal.body','行人标志躯干',[.065,.12,.008],[.16,2.53,.351],human));
    p.objects.push(box('signal.leg.left','行人标志左腿',[.019,.09,.008],[.138,2.45,.351],human));
    p.objects.push(box('signal.leg.right','行人标志右腿',[.019,.09,.008],[.182,2.45,.351],human));
    p.objects.push(box('curb','近侧路缘',[100,.08,.25],[0,.01,-3.12],material([111,115,112],.55,'stone',{bump:.02})));
    return p;
  }
  const entries=[
    {id:'citrus',title:'晴日柑橘',description:'果皮函数、柔和窗光与陶瓷盘的物品近景。'},
    {id:'ceramics',title:'釉色与玻璃',description:'釉面、透射玻璃、金属与石材在同一场景中求值。'},
    {id:'interior',title:'窗边客厅',description:'窗光、家具、织物、木材与植物组成的室内场景。'},
    {id:'rainstreet',title:'雨后街角',description:'湿润地面、行人信号灯与街楼灯光的夜景构图。'}
  ];
  const factories={citrus,ceramics,interior,rainstreet};
  function createPreset(id='ceramics'){if(!factories[id])throw new Error('Unknown image scene: '+id);const program=factories[id]();Renderer.assert(program);return program;}
  return {...Renderer,presets:()=>copy(entries),createPreset};
});
