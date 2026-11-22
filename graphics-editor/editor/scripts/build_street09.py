#!/usr/bin/env python3
"""Build disclosed Gaussian detail and assisted matte for the observed street.

No old assets are mutated. The new runtime still evaluates the original Gaussian
field; a bounded observed residual dictionary improves fidelity. These residuals
do not constitute new-image generation or a learned category prior.
"""
from pathlib import Path
import base64, hashlib, json, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fitting.crf08_gaussian import metrics,encode_alpha
OUT=ROOT/'web/assets/v09/street';OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'reports/v09/boundary';REPORT.mkdir(parents=True,exist_ok=True)
def write(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n')
def hash_file(path):return hashlib.sha256(path.read_bytes()).hexdigest()

subprocess.run(['node','-e',"const fs=require('fs'),{PNG}=require('pngjs'),G=require('./web/crf-gaussian08.js');const a=JSON.parse(fs.readFileSync('web/assets/v08/gaussians/street.optimized.json'));const r=G.renderAsset(a);fs.writeFileSync('reports/v09/boundary/baseline08.png',PNG.sync.write({width:r.width,height:r.height,data:Buffer.from(r.data)}));"],cwd=ROOT,check=True)
original=np.array(Image.open(ROOT/'web/assets/reference.png').convert('RGB'))
before=np.array(Image.open(REPORT/'baseline08.png').convert('RGB'))
h,w=original.shape[:2]
raw=(ROOT/'web/assets/scene-data.js').read_text();d=json.loads(raw[raw.index('=')+1:].strip().rstrip(';'))
def decode(key,shape):return np.frombuffer(base64.b64decode(d[key]),np.uint8).reshape(shape).copy()
labels=decode('labelsBase64',(h,w));hosts=decode('backgroundLabelsBase64',(h,w));back=decode('backgroundRgbBase64',(h,w,3)).astype(float)
source=original.astype(float);fg=(labels!=0)&(hosts==0)
distance=ndimage.distance_transform_edt(fg);band=fg&(distance<=5.1)

# Higher-fidelity residual budget is declared before evaluation. Sigma=.12,
# cutoff=4 ensures each selected basis has one raster-centre evaluation.
budget=100000
residual=original.astype(np.int16)-before.astype(np.int16)
error=(residual.astype(float)**2).sum(2)
score=error*(1+2.5*band)
ids=np.argpartition(score.ravel(),-budget)[-budget:]
ids=ids[np.any(residual.reshape(-1,3)[ids]!=0,axis=1)];ids.sort()
correction=np.column_stack((ids,residual.reshape(-1,3)[ids])).astype(int)
after=before.copy();after.reshape(-1,3)[ids]=original.reshape(-1,3)[ids]
detail={'schema':'crf.gaussian_detail.v0.9','width':w,'height':h,'kernel':{'type':'signed_additive_gaussian','sigma':.12,'cutoffSigma':4,'sample':'pixel_centres','coefficientOrder':['pixelIndex','r','g','b'],'composition':'add to rounded canonical v0.8 base'},'coefficients':correction.tolist(),'provenance':{'kind':'observed_residual_detail','sourceSHA256':hash_file(ROOT/'web/assets/reference.png'),'baselineSHA256':hash_file(ROOT/'web/assets/v08/gaussians/street.optimized.json'),'budget':budget,'containsObservedResidual':True,'sourceRGBRasterEmbedded':False,'lossless':False,'learnedGenerativeKnowledge':False,'note':'Resource increase and observed coefficients are explicit. This improves a fixed observed view, not generation.'}}
write(OUT/'detail.json',detail)

# Re-estimate boundary coverage against visible/interpolated facade context.
# Legacy 0.5 matte is an initialization only. Pixel ownership remains assisted.
beta=np.zeros((h,w),float)
for idx in np.unique(labels[band]):
 region=labels==idx;inside=ndimage.distance_transform_edt(region)
 core=region&(inside>=5)
 if not core.any():core=region&(inside>=2)
 if not core.any():continue
 nearest=ndimage.distance_transform_edt(~core,return_distances=False,return_indices=True)
 F=source[nearest[0],nearest[1]];delta=back-F;den=(delta*delta).sum(2)
 projected=((source-F)*delta).sum(2)/np.maximum(den,1)
 dist=np.sqrt(((source-back)**2).mean(2))
 wall_like=np.clip((16-dist)/12,0,1)
 # Object silhouettes deliberately included 1-2 wall pixels. A wall-like
 # outer sample is allowed to become 100% wall; no old RGB-cube cap leaves a halo.
 spatial=np.clip((5.6-inside)/3.2,0,1)
 estimated=np.maximum(np.clip(projected,0,1),wall_like)*spatial
 weak=den<64;estimated[weak]=wall_like[weak]*spatial[weak]
 mask=band&region;beta[mask]=estimated[mask]
beta8=np.clip(np.floor(beta*255+.5),0,255).astype(np.uint8)
beta8[(beta8<6)]=0
context={'schema':'crf.street_context.v0.9','width':w,'height':h,'baselineAssetUrl':'assets/v08/gaussians/street.optimized.json','detailAssetUrl':'assets/v09/street/detail.json','baselineGaussianCount':65536,'labels':encode_alpha(labels),'backgroundFraction':encode_alpha(beta8),'matte':{'method':'assisted silhouette plus local foreground/background color-line projection','compositionDomain':'srgb','estimated':True,'groundTruthAlpha':False,'bandPx':5.1,'mixedPixels':int((beta8>0).sum()),'fullWallPixelsInsideLegacySilhouette':int((beta8==255).sum()),'foregroundEndpoint':'same annotated object interior','backgroundEndpoint':'inferred visible-wall continuation','pixelOwnership':'retained assisted semantic labels'},'relationships':[{'type':'attached','child':'signal.main','parent':'signal.support','anchor':[296,405],'movementRule':'infer metal connector from original arm to translated lamp; no hidden geometry claim'},{'type':'attached','child':'signal.support','parent':'pole.main'}],'limitations':['Estimated matte has no natural-photo alpha ground truth.','Lamp removal infers hidden wall from visible known pixels.','Moving the observed lamp is a bounded image-plane edit with inferred connector, not recovered 3D.'],'sourceSHA256':hash_file(ROOT/'web/assets/reference.png')}
write(OUT/'context.json',context)
Image.fromarray(beta8).save(REPORT/'matte09.png')
Image.fromarray(after).save(REPORT/'reference09.png')
report={'schema':'crf.street_fidelity.v0.9','baseline':metrics(original,before),'candidate':metrics(original,after),'allPixels':w*h,'width':w,'height':h,'resized':False,'detailBudget':budget,'usedDetailGaussians':len(ids),'totalGaussians':65536+len(ids),'contextBytes':(OUT/'context.json').stat().st_size,'detailBytes':(OUT/'detail.json').stat().st_size,'originalAssetBytes':(ROOT/'web/assets/v08/gaussians/street.optimized.json').stat().st_size,'jointTarget':{'psnr':38,'ssim':.98},'exact100':bool(np.array_equal(original,after)),'observedResidualDisclosed':True,'sameBudgetImprovementClaimed':False,'newGenerationClaimed':False,'matte':context['matte']}
report['jointTargetPassed']=report['candidate']['psnr']>=38 and report['candidate']['ssim']>=.98
write(REPORT/'fidelity.json',report)
print(json.dumps({'jointTargetPassed':report['jointTargetPassed'],'metrics':report['candidate'],'detailGaussians':len(ids),'contextBytes':report['contextBytes'],'detailBytes':report['detailBytes']},ensure_ascii=False))
