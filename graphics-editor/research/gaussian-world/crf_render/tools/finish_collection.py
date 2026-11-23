"""Run and develop the finite five-scene CPU study; keep every measured value.
Existing product render can be awaited without launching another copy.
"""
import argparse,subprocess,json,time,hashlib,sys,shutil
from pathlib import Path
import numpy as np
from PIL import Image
from develop import develop,read_pfm

ROOT=Path(__file__).resolve().parents[1]
JOBS=[
 dict(id='product',prefix='CRF_03_Atelier_Product',title='03 · 玻璃与黄铜',subtitle='ATELIER / 产品摄影实验',width=2048,height=2560,spp=256,depth=16,ev=0,notes='空心玻璃瓶、程序字标、黄铜滚花与石台。玻璃使用理想介电模型；无光谱色散。'),
 dict(id='still_life',prefix='CRF_01_Warm_Still_Life',title='01 · 午后静物',subtitle='AFTERNOON / 陶瓷、木材、织物',width=2048,height=2560,spp=256,depth=12,ev=0,notes='程序化器皿、枝叶、布料褶皱；窗影由真实几何遮挡计算。植物仍采用简化叶片。'),
 dict(id='architecture',prefix='CRF_02_Sunlit_Interior',title='02 · 日光与拱门',subtitle='QUIET ROOM / 建筑光照实验',width=3072,height=2048,spp=256,depth=12,ev=.5,notes='程序化房间、拱门、木地板和家具。重点验证日照与间接光；陈设细节仍简化。'),
 dict(id='landscape',prefix='CRF_04_Alpine_Lake',title='04 · 山峰与湖面',subtitle='ALPINE / 自然景观实验',width=3072,height=2048,spp=256,depth=10,ev=0,notes='分形山体、雪线、程序树群与介电湖面。地形和植被仍有明显CG感；雾为相机距离近似。'),
 dict(id='desert',prefix='CRF_05_Wind_Dunes',title='05 · 风成沙丘',subtitle='DUNES / 地形与掠射光实验',width=3840,height=2160,spp=192,depth=6,ev=0,notes='连续曲线沙脊、不同坡面法线、数学沙纹与低角度日光；未用照片贴图。')]

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(argv,log=None):
    print('RUN',*map(str,argv),flush=True)
    if log:
        with open(log,'w') as f:subprocess.run(argv,cwd=ROOT,check=True,stdout=f,stderr=subprocess.STDOUT)
    else:subprocess.run(argv,cwd=ROOT,check=True)

def aov_images(prefix):
    for key in ['normal','albedo','depth']:
        ar=read_pfm(str(prefix)+'_'+key+'.pfm')
        if key=='albedo': ar=np.where(ar<.0031308,ar*12.92,1.055*np.maximum(ar,0)**(1/2.4)-.055)
        if key=='depth':
            vals=ar[:,:,0];mask=vals>0
            if mask.any():
                lo,hi=np.quantile(vals[mask],[.01,.99]);z=np.clip((vals-lo)/(hi-lo+1e-8),0,1)
                ar=np.repeat((1-z)[:,:,None],3,axis=2);ar[~mask]=0
        Image.fromarray(np.uint8(np.clip(ar*255+.5,0,255))).save(str(prefix)+'_'+key+'.png',optimize=True)

def process(job,wait_product=False):
    out=ROOT/'outputs'/job['prefix'];log=ROOT/'logs'/(job['prefix']+'.log')
    meta=Path(str(out)+'.json')
    if job['id']=='product' and wait_product:
        end=time.monotonic()+1800
        while not meta.exists():
            if time.monotonic()>end:raise TimeoutError('Existing product rendering did not finish in time')
            time.sleep(3)
    if not meta.exists():
        run([sys.executable,'scenes/'+job['id']+'.py','scenes/'+job['id']+'.scene'])
        snap=ROOT/'run_sources'/job['id'];snap.mkdir(parents=True,exist_ok=True)
        for p in [ROOT/'src/renderer.cpp',ROOT/'scenes/common.py',ROOT/'scenes'/(job['id']+'.py')]:shutil.copy2(p,snap/p.name)
        hashes={str(p.relative_to(ROOT)):sha(p) for p in [ROOT/'src/renderer.cpp',ROOT/'crf_render',ROOT/'scenes'/(job['id']+'.scene'),ROOT/'scenes'/(job['id']+'.py')]}
        (snap/'source_hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
        run(['./crf_render','scenes/'+job['id']+'.scene',str(out),str(job['width']),str(job['height']),str(job['spp']),'20261123',str(job['depth']),'9'],log)
    data=json.loads(meta.read_text())
    if (data['width'],data['height'],data['spp'])!=(job['width'],job['height'],job['spp']):raise ValueError('Unexpected existing output config')
    if data.get('nonfinite_pixels',0) or data.get('invalid_samples',0):raise ValueError('Nonfinite rendering')
    png=Path(str(out)+'.png')
    if not png.exists():develop(out,exposure=job['ev'],atrous=3)
    preview=Path(str(out)+'_preview.jpg')
    im=Image.open(png);im.thumbnail((1600,1600),Image.Resampling.LANCZOS);im.save(preview,quality=94,subsampling=0)
    aov_images(out)
    exr=Path(str(out)+'.exr')
    if not exr.exists():run(['ffmpeg','-v','error','-y','-i',str(out)+'.pfm','-c:v','exr','-compression','zip16','-format','float',str(exr)])
    result=dict(job,seconds=data['seconds'],primitives=data['primitives'],camera_paths=data['camera_paths'],renderer=data['renderer'],
        png=str(png.relative_to(ROOT)),preview=str(preview.relative_to(ROOT)),raw_exr=str(exr.relative_to(ROOT)),
        aov_normal=str(out.relative_to(ROOT))+'_normal.png',aov_depth=str(out.relative_to(ROOT))+'_depth.png',
        aov_albedo=str(out.relative_to(ROOT))+'_albedo.png',render_metadata=str(meta.relative_to(ROOT)),
        png_sha256=sha(png),raw_pfm_sha256=sha(str(out)+'.pfm'),raw_exr_sha256=sha(exr))
    manifest=ROOT/'outputs/collection_manifest.json'
    if manifest.exists():collection=json.loads(manifest.read_text())
    else:collection={'collection':'CRF Code-native Render Study','created_local_date':'2026-11-23','status':'actual CPU render outputs','cloud_gpu_status':'SSH connection did not reach authentication; GPU untested','external_image_assets':[],'diffusion_models_used':False,'learned_denoisers_used':False,'native_resolution':True,'images':[]}
    collection['images']=[x for x in collection['images'] if x['id']!=job['id']]+[result]
    collection['images'].sort(key=lambda x:x['prefix'])
    manifest.write_text(json.dumps(collection,ensure_ascii=False,indent=2)+'\n')
    print('READY',job['id'],data['seconds'],png,flush=True)

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--wait-product',action='store_true');a.add_argument('--only',nargs='*');v=a.parse_args()
    for j in JOBS:
        if v.only and j['id'] not in v.only:continue
        process(j,wait_product=v.wait_product)
    print('COLLECTION COMPLETE',flush=True)
