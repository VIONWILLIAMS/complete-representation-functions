#!/usr/bin/env python3
"""Publish the actually fitted function catalogue, never unexecuted candidates."""
from pathlib import Path
import json,shutil
import numpy as np
ROOT=Path(__file__).resolve().parents[1]; WEB=ROOT/'web';OUT=WEB/'assets/v08';G=OUT/'gaussians'
OUT.mkdir(parents=True,exist_ok=True);G.mkdir(exist_ok=True)
def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def obj(id,assetId,x=0,y=0,scale=1,z=0,label=None):return dict(id=id,label=label or id,assetId=assetId,x=x,y=y,scaleX=scale,scaleY=scale,rotation=0,opacity=1,visible=True,hue=0,exposure=0,zIndex=z)
def scene(id,title,w,h,objects,bg=[232,232,225]):return dict(schema='crf.gaussian_scene.v0.8',id=id,title=title,width=w,height=h,background=bg,objects=objects)
def rle(a):
 a=np.asarray(a,dtype=np.uint8).ravel(); starts=np.r_[0,np.flatnonzero(a[1:]!=a[:-1])+1];return {'encoding':'rle8','runs':np.column_stack([a[starts],np.diff(np.r_[starts,len(a)])]).ravel().tolist()}
assets=[]
for a in json.loads((ROOT/'fitting/sources08/manifest.json').read_text())['assets']:
 p=G/(a['id']+'.json')
 if not p.exists():continue
 image=p.with_suffix('.png');report=p.with_suffix('.report.json')
 source=OUT/'references'/(a['id']+'.png');source.parent.mkdir(exist_ok=True)
 shutil.copy2(ROOT/a['input'],source)
 a={**a,'assetUrl':str(p.relative_to(WEB)),'referenceUrl':str(source.relative_to(WEB)),'thumbnailUrl':str(image.relative_to(WEB)),'reconstructionUrl':str(image.relative_to(WEB)),'reportUrl':str(report.relative_to(WEB))}
 a.pop('input',None);assets.append(a)
if (G/'street.optimized.json').exists():
 assets.append({'id':'street.reference','label':'街景完整图高斯拟合','width':667,'height':1000,'category':'street','role':'reference-frame','description':'完整照片经65,536个二维高斯数值拟合。用于重建基准，不作为新主体生成的证明。','assetUrl':'assets/v08/gaussians/street.optimized.json','referenceUrl':'assets/reference.png','thumbnailUrl':'assets/v08/gaussians/street.optimized.png','reportUrl':'assets/v08/gaussians/street.optimized.report.json'})
synthetic=[
 {'id':'studio.paper','width':960,'height':640,'base':[221,217,207],'splats':[[190,80,700,520,0,30,29,26],[940,580,700,300,0,-20,-20,-19]]},
 {'id':'studio.slate','width':960,'height':640,'base':[33,40,44],'splats':[[210,90,570,400,0,20,23,23],[900,640,600,360,0,-17,-19,-20]]},
 {'id':'studio.shadow','width':320,'height':100,'base':[23,20,16],'splats':[]},
 {'id':'atmosphere.haze','width':960,'height':640,'base':[216,228,230],'splats':[]}
]
y,x=np.mgrid[:100,:320];synthetic[-2]['alpha']=rle(np.rint(145*np.exp(-.5*(((x-160)/44)**2+((y-50)/10)**2))))
y,x=np.mgrid[:640,:960];synthetic[-1]['alpha']=rle(np.rint(42*np.exp(-.5*(((x-480)/470)**2+((y-350)/82)**2))))
for a in synthetic:
 a.update(schema='crf.gaussian_asset.v0.8',provenance={'kind':'analytic-code','sourceRGBEmbedded':False,'algorithm':'explicit Gaussian illumination / contact coverage'})
 write(G/(a['id']+'.json'),a)
 assets.append({'id':a['id'],'label':{'studio.paper':'浅色摄影承托面','studio.slate':'深灰摄影承托面','studio.shadow':'柔和接触阴影','atmosphere.haze':'解析高斯薄雾层'}[a['id']],'width':a['width'],'height':a['height'],'category':'studio','role':'background' if a['id']in['studio.paper','studio.slate'] else 'overlay','description':'代码直接定义的高斯场。阴影的可见中心在(160,50)，近似可见宽220、高60；必须贴合主体底部。薄雾中心在(480,350)，仅为二维覆盖效果。','assetUrl':'assets/v08/gaussians/'+a['id']+'.json'})
ss=scene('still.life','果物静物 · 共享函数编排',960,640,[obj('table','studio.paper'),obj('shadow.apple','studio.shadow',155,503,.95,1),obj('shadow.pear','studio.shadow',405,508,.9,1),obj('apple','fruit.apple',220,290,1,2,'苹果'),obj('pear','fruit.pear',445,137,1,3,'梨子')])
write(OUT/'still-life.scene.json',ss)
write(OUT/'street-full.scene.json',scene('street.full','街景 · 完整图高斯拟合',667,1000,[obj('photo','street.reference')]))
write(OUT/'alpine.scene.json',scene('alpine','阿尔卑斯湖畔 · 高斯拟合',800,531,[obj('lake','landscape.alpine')]))
scenes=[{'id':'street','title':'午后街角 · 18个语义对象','sceneUrl':'assets/v08/street.scene.json','referenceUrl':'assets/reference.png','thumbnailUrl':'assets/v08/gaussians/street.optimized.png','subtitle':'红绿灯案例 · 可编辑分层重建'},
 {'id':'street.full','title':'街景 · 完整图拟合基准','sceneUrl':'assets/v08/street-full.scene.json','referenceUrl':'assets/reference.png','thumbnailUrl':'assets/v08/gaussians/street.optimized.png','reportUrl':'assets/v08/gaussians/street.optimized.report.json','subtitle':'65,536高斯 · 原生667×1000'},
 {'id':'still.life','title':'苹果与梨 · 物品函数','sceneUrl':'assets/v08/still-life.scene.json','thumbnailUrl':'assets/v08/renders/still-life.png','subtitle':'物品层 · 代码构图与阴影'},
 {'id':'alpine','title':'湖畔 · 高斯观测重建','sceneUrl':'assets/v08/alpine.scene.json','referenceUrl':'assets/cases/alpine-reference.png','thumbnailUrl':'assets/v08/gaussians/landscape.alpine.png','reportUrl':'assets/v08/gaussians/landscape.alpine.report.json','subtitle':'自然纹理 · 原生800×531'}]
semantics={}
for f in sorted((ROOT/'reports/v08/learning').glob('semantics_*.json')):
 for a in json.loads(f.read_text()).get('items',[]):semantics[a['id']]=a
fp=ROOT/'reports/v08/learning/fits.json'
if fp.exists():
 d=json.loads(fp.read_text())
 for a in d.get('fits',[]):
  if a.get('status')!='fitted':continue
  id=a['assetId'];sem=semantics.get(id,{})
  file=WEB/'assets/v08/learned'/(id+'.json')
  if not file.exists():continue
  data=json.loads(file.read_text())
  assets.append({'id':id,'label':sem.get('label',a.get('label',id)),'width':data['width'],'height':data['height'],'category':sem.get('category','reference'),'role':'reference-frame','description':sem.get('description','实际检索照片的高斯拟合')+'；这是整幅参考画面，不是已分离的物品；直接整体变换须标为观测变体。','tags':sem.get('tags',[]),'limitations':'仅可见外观，不能推导未见表面。','sourceUrl':a.get('sourceUrl'),'assetUrl':'assets/v08/learned/'+id+'.json','referenceUrl':'assets/v08/references/'+id+'.png','thumbnailUrl':'assets/v08/learned/'+id+'.png','reportUrl':'assets/v08/learned/'+id+'.report.json','semanticObservation':bool(sem)})
cuts=ROOT/'reports/v08/learning/cutouts.json'
if cuts.exists():assets.extend(a for a in json.loads(cuts.read_text()).get('assets',[])if a.get('compositionEligible')is True)
for a in assets:
 if not (a['id'].endswith('.object') or a['id'].startswith('fruit.')):continue
 data=json.loads((WEB/a['assetUrl']).read_text()); alpha=data.get('alpha',{})
 if alpha.get('encoding')!='rle8':continue
 runs=np.array(alpha['runs'],dtype=np.int64).reshape(-1,2)
 mask=np.repeat(runs[:,0],runs[:,1]).reshape(data['height'],data['width'])>=128
 yy,xx=np.nonzero(mask)
 if not len(xx):continue
 bbox=[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]
 bottom=yy>=yy.max()-3
 support=[round(float(np.median(xx[bottom]))+.5,2),int(yy.max()+1)]
 a['imageSpaceSupportHint']={'visibleBounds':bbox,'lowerSilhouettePoint':support,'alphaThreshold':128,'groundContactVerified':False}
 a['description']=a.get('description','')+f'；从覆盖度计算的可见边界为{bbox}，下缘点{support}（资产局部像素坐标）。图像下缘不等于已知物理接地点，但前视静物的接触阴影不应与此下缘留空。'
catalog={'schema':'crf.function_catalog.v0.8','version':'0.8.0','assets':assets,'scenes':scenes}
write(OUT/'catalog.json',catalog)
server=[{k:v for k,v in a.items()if k in ['id','label','width','height','description','role','category','tags','defaultPlacement','limitations']}for a in assets]
write(ROOT/'server/catalog08.json',{'assets':server})
if not (OUT/'examples.json').exists():write(OUT/'examples.json',{'examples':[]})
print(json.dumps({'assets':len(assets),'scenes':len(scenes),'visuallyDescribed':len(semantics)},ensure_ascii=False))
