#!/usr/bin/env python3
"""Prepare explicit semantic observation layers for the 0.8 inverse solver.

The original 0.5 assisted labels and estimated background are retained with
their provenance. This does not claim automatic segmentation or observed
ground truth behind occluders. Exported learning functions are fitted later.
"""
from pathlib import Path
import base64, hashlib, json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'fitting' / 'sources08'
OUT.mkdir(parents=True, exist_ok=True)
PUBLIC = ROOT / 'web/assets/v08'
PUBLIC.mkdir(parents=True, exist_ok=True)

def decode(value, shape, dtype=np.uint8):
    return np.frombuffer(base64.b64decode(value), dtype=dtype).reshape(shape).copy()

def save_image(name, rgb, alpha=None):
    rgb = np.clip(np.floor(rgb + .5), 0, 255).astype(np.uint8)
    if alpha is not None: rgb = np.dstack((rgb, np.clip(np.floor(alpha + .5), 0, 255).astype(np.uint8)))
    path = OUT / (name + '.png')
    Image.fromarray(rgb).save(path)
    return str(path.relative_to(ROOT))

raw = (ROOT/'web/assets/scene-data.js').read_text()
d = json.loads(raw[raw.index('=')+1:].strip().rstrip(';'))
w,h = d['width'],d['height']
rgb = decode(d['rgbBase64'], (h,w,3)).astype(float)
labels = decode(d['labelsBase64'], (h,w))
back = decode(d['backgroundRgbBase64'], (h,w,3)).astype(float)
hosts = decode(d['backgroundLabelsBase64'], (h,w))
inferred = decode(d['backgroundInferredMaskBase64'], (h,w)) > 0
foreground = rgb.copy()
coverage = np.ones((h,w),float)
mix = d.get('boundaryMixture')
if mix:
    ids = decode(mix['indicesBase64'], (-1,), '<u4')
    frac = decode(mix['backgroundFractionBase64'], (-1,)).astype(float)/255
    bg = decode(mix['backgroundRgbBase64'], (-1,3)).astype(float)
    # Bound estimated background fraction so the unmixed foreground stays in
    # the RGB cube. The decomposition remains calibrated to observed pixels.
    obs = rgb.reshape(-1,3)[ids]
    cap0 = np.min(np.divide(obs,bg,out=np.ones_like(obs),where=bg>0),axis=1)
    cap1 = np.min(np.divide(255-obs,255-bg,out=np.ones_like(obs),where=bg<255),axis=1)
    f = np.minimum(frac,np.minimum(cap0,cap1)).clip(0,.97)
    nonwall = labels.ravel()[ids] != mix['hostIndex']
    ids,f,bg,obs = ids[nonwall],f[nonwall],bg[nonwall],obs[nonwall]
    foreground.reshape(-1,3)[ids] = (obs-f[:,None]*bg)/(1-f[:,None])
    coverage.ravel()[ids] = 1-f
    back.reshape(-1,3)[ids] = bg
    hosts.ravel()[ids] = mix['hostIndex']
    inferred.ravel()[ids] = True

assets=[]
objects=[]
base_indices={0,1,2,4}
recomposed=np.zeros_like(rgb)
ordered=sorted(d['objects'],key=lambda o:(0 if o['index'] in base_indices else 1, o.get('depth',0)))
for z,o in enumerate(ordered):
    idx=o['index']; observed=labels==idx
    hidden=(hosts==idx)&inferred
    mask=observed|hidden
    color=foreground.copy()
    color[hidden & ~observed]=back[hidden & ~observed]
    alpha=np.where(observed,coverage,1.0)*mask
    if idx in base_indices: alpha=mask.astype(float)
    ys,xs=np.nonzero(mask)
    x0,x1=max(0,int(xs.min())-1),min(w,int(xs.max())+2)
    y0,y1=max(0,int(ys.min())-1),min(h,int(ys.max())+2)
    # Extend edge colors into transparent pixels before fitting, while alpha
    # remains the explicitly estimated semantic coverage.
    crop=color[y0:y1,x0:x1].copy(); ac=alpha[y0:y1,x0:x1]
    if np.any(ac==0):
        nearest=ndimage.distance_transform_edt(ac==0,return_distances=False,return_indices=True)
        crop[ac==0]=crop[nearest[0][ac==0],nearest[1][ac==0]]
    name='street.'+o['id']
    path=save_image(name,crop,ac*255)
    count=int(mask.sum())
    budget=min(count,max(160,round(count/(18 if idx in base_indices else 4))))
    assets.append({'id':name,'label':o['label'],'category':'street','role':'background' if idx in base_indices else 'object','width':x1-x0,'height':y1-y0,'input':path,'budget':budget,'description':'原始街景的语义函数层。保持默认位置可复原场景；遮挡后的区域属于估计补全。','defaultPlacement':{'x':x0,'y':y0,'scaleX':1,'scaleY':1,'rotation':0,'zIndex':z},'sourceUrl':'user-provided original street photograph','sourceSHA256':hashlib.sha256((ROOT/'web/assets/reference.png').read_bytes()).hexdigest(),'assistance':'0.5 assisted semantic labels + calibrated estimated mixed-edge matte','occludedPixels':int((hidden & ~observed).sum())})
    objects.append({'id':o['id'],'label':o['label'],'assetId':name,'x':x0,'y':y0,'scaleX':1,'scaleY':1,'rotation':0,'opacity':1,'visible':True,'hue':0,'exposure':0,'zIndex':z})
    recomposed=color*alpha[...,None]+recomposed*(1-alpha[...,None])

save_image('street.semantic-baseline',recomposed)
err=np.abs(np.floor(recomposed+.5)-rgb)
baseline={'mae':float(err.mean()),'maxError':int(err.max()),'exactRGBFraction':float(np.all(err==0,axis=2).mean()),'note':'Semantic decomposition BEFORE Gaussian fitting. Inferred areas are not held-out ground truth.'}
(PUBLIC/'street.scene.json').write_text(json.dumps({'schema':'crf.gaussian_scene.v0.8','id':'street','title':'午后街角 · 分层高斯重建','width':w,'height':h,'background':[0,0,0],'objects':objects},ensure_ascii=False,indent=2)+'\n')

for kind in ['apple','pear']:
    src=ROOT/f'web/assets/v06/{kind}-reference-mask.png'
    im=Image.open(src).convert('RGBA'); a=np.asarray(im).copy()
    # These masks were explicit ROI-assisted colour segmentation in 0.6.
    # Preserve the silhouette; soften just subpixel coverage with a small
    # signed-distance transition instead of blurring RGB across background.
    mask=a[...,3]>127
    distance=ndimage.distance_transform_edt(mask)-ndimage.distance_transform_edt(~mask)
    a[...,3]=np.clip((distance+.7)/1.4,0,1)*255
    path=save_image('fruit.'+kind,a[...,:3],a[...,3])
    assets.append({'id':'fruit.'+kind,'label':'实拍苹果函数' if kind=='apple' else '实拍梨子函数','category':'still-life','role':'object','width':im.width,'height':im.height,'input':path,'budget':min(14000,int(mask.sum()//4)),'description':'从一张实拍图的可见果体拟合；保持照片内原有光照，不能转出未观察的背面。苹果右边原被梨部分遮挡。','tags':[kind,'fruit','object','warm-side-light'],'sourceUrl':'https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg','license':'CC0 1.0','author':'Yves Geissbühler'})

assets.append({'id':'landscape.alpine','label':'阿尔卑斯湖畔函数','category':'landscape','role':'reference-frame','width':800,'height':531,'input':'web/assets/cases/alpine-reference.png','budget':65536,'description':'整幅湖畔照片的高斯拟合；整体变换是参考画面变体，不代表新地貌生成。','tags':['lake','mountain','forest','reflection'],'sourceUrl':'retained 0.5 photo reference; see prior source manifest'})
(OUT/'manifest.json').write_text(json.dumps({'schema':'crf.observation_sources.v0.8','assets':assets,'decompositionBaseline':baseline},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sources':len(assets),'streetObjects':len(objects),'totalBudget':sum(x['budget']for x in assets),'decompositionBaseline':baseline},ensure_ascii=False))
