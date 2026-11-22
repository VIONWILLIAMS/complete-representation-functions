#!/usr/bin/env python3
"""Make a compact offline reproduction kit for the six frozen image programs."""
import json,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';OUT=WEB/'downloads';OUT.mkdir(exist_ok=True)
def read(p):return json.loads(p.read_text())
cat=read(WEB/'assets/v08/catalog.json');examples=read(WEB/'assets/v08/examples.json')['examples'];required=set();files={}
def add(p,arc=None):
 p=Path(p);files[arc or str(p.relative_to(ROOT))]=p.read_bytes()
for e in examples:
 scene=read(WEB/e['sceneUrl']);required.update(o['assetId']for o in scene['objects'])
 add(WEB/e['sceneUrl'],'scenes/'+e['id']+'.json');add(WEB/e['thumbnailUrl'],'images/'+e['id']+'.png');add(WEB/e['reportUrl'],'reports/'+e['id']+'.json')
required.add('street.reference')
assets=[a for a in cat['assets']if a['id']in required]
for a in assets:add(WEB/a['assetUrl'])
files['web/assets/v08/catalog.json']=(json.dumps({'assets':assets,'scenes':[]},ensure_ascii=False,indent=2)+'\n').encode()
for name in ['web/crf-gaussian08.js','scripts/render_v08.cjs','fitting/crf08_gaussian.py','docs/v08/FORMAT_0_8.md','docs/v08/PROVIDER_API.md','docs/v08/SOURCES.md','reports/v08/gaussian_acceptance.json','reports/v08/semantic_edit_acceptance.json','reports/v08/generation/summary.json','web/assets/reference.png']:
 add(ROOT/name)
files['scenes/street_full_benchmark.json']=(json.dumps({'schema':'crf.gaussian_scene.v0.8','id':'street.full','width':667,'height':1000,'background':[0,0,0],'objects':[{'id':'reference','assetId':'street.reference','x':0,'y':0}]} )+'\n').encode()
files['package.json']=(json.dumps({'name':'crf-0-8-render-kit','version':'0.8.0','private':True,'engines':{'node':'>=20'},'dependencies':{'pngjs':'7.0.0'}},indent=2)+'\n').encode()
files['README.md']='''# CRF 0.8 · 六组作品离线重绘包

这里包含六份实际 DeepSeek 场景程序、它们引用的高斯函数、共享渲染器、结果 PNG、拟合与调用记录。它是独立渲染实验包，不包含托管编辑器的全部界面和历史媒体；完整编辑器及原有案例在已发布的网站中保留。

## 无需调用模型即可重绘

```sh
npm install
node scripts/render_v08.cjs scenes/01_ceramic_citrus.json output.png
node scripts/render_v08.cjs scenes/street_full_benchmark.json street.png web/assets/reference.png
```

场景 JSON 可直接由另一个 LLM 修改。更改对象 x/y、scaleX/scaleY、hue、exposure、opacity、visible 或 zIndex，再用同一命令计算像素。新增 assetId 必须先有对应高斯函数；不能把目录中没有的物体名称当成已实现的图像生成能力。

RGB 由二维高斯系数求值，渲染时不读取参考图片；第三个参数只用于误差比较。alpha 为单独保存的观测覆盖率。不同来源的光照尚未统一分解，新构图仍可能有拼合感。

`MANIFEST.json` 提供每个文件的 SHA-256。六张成品位于 images/，完整程序位于 scenes/。不含 API 密钥。独立图像拟合脚本需要 Python、NumPy、SciPy、Pillow；使用方式见脚本 --help。

原始667×1000街景的高斯基准 PSNR43.45dB、SSIM0.9755，未达100%一致。这是重建指标，不是新构图的真实感分数。
'''.encode()
manifest={p:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}for p,b in files.items()}
files['MANIFEST.json']=(json.dumps(manifest,indent=2)+'\n').encode()
path=OUT/'CRF_0_8_Render_Kit.zip'
with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
 for p,b in files.items():z.writestr(p,b)
with zipfile.ZipFile(path)as z:
 if z.testzip()is not None:raise RuntimeError('ZIP integrity failed')
print(json.dumps({'path':str(path),'bytes':path.stat().st_size,'files':len(files),'gaussianAssets':len(assets),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
