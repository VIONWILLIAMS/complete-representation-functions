#!/usr/bin/env python3
"""Independent image-level quality audit and exact reference/result boards.

Reads PNGs and the frozen contract only; does not import the fitter or renderer.
Diagnostic crops/heatmaps are evidence artifacts, never rendering inputs.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/quality12/review'
OUT.mkdir(parents=True, exist_ok=True)
contract_bytes = (ROOT / 'contracts/quality12.json').read_bytes()
contract = json.loads(contract_bytes)
reference_path = ROOT / contract['reference']['path']
result_path = ROOT / 'reports/quality12/alpine/reconstruction.png'
reference = Image.open(reference_path).convert('RGB')
result = Image.open(result_path).convert('RGB')
assert reference.size == result.size == (800, 531)
assert hashlib.sha256(reference_path.read_bytes()).hexdigest() == contract['reference']['fileSha256']
a, b = np.asarray(reference, dtype=np.float64), np.asarray(result, dtype=np.float64)
mu_a = gaussian_filter(a, sigma=(1.5, 1.5, 0), truncate=3.5, mode='reflect')
mu_b = gaussian_filter(b, sigma=(1.5, 1.5, 0), truncate=3.5, mode='reflect')
var_a = gaussian_filter(a*a, sigma=(1.5, 1.5, 0), truncate=3.5, mode='reflect') - mu_a*mu_a
var_b = gaussian_filter(b*b, sigma=(1.5, 1.5, 0), truncate=3.5, mode='reflect') - mu_b*mu_b
cov = gaussian_filter(a*b, sigma=(1.5, 1.5, 0), truncate=3.5, mode='reflect') - mu_a*mu_b
ssim_map = ((2*mu_a*mu_b + 6.5025)*(2*cov + 58.5225) /
            ((mu_a*mu_a + mu_b*mu_b + 6.5025)*(var_a + var_b + 58.5225)))
diff = a-b
def metrics(box):
    x0,y0,x1,y1=box
    d=diff[y0:y1,x0:x1];mse=float(np.mean(d*d))
    return {'psnr':10*math.log10(255**2/mse) if mse else None,
            'ssim':float(ssim_map[y0:y1,x0:x1].mean()),
            'mae':float(np.abs(d).mean()),'maxChannelError':int(np.abs(d).max())}
observed={'fullFrame':metrics((0,0,800,531)),'rois':[]}
for roi in contract['rois']:
    x0,y0,x1,y1=roi['bounds']
    box=(math.floor(x0*800),math.floor(y0*531),math.ceil(x1*800),math.ceil(y1*531))
    m=metrics(box)
    observed['rois'].append({'id':roi['id'],'bounds':box,**m,
                             'passed':m['ssim']>=roi['ssimMin'] and m['mae']<=roi['maeMax']})
full=observed['fullFrame'];gate=contract['fullFrame']
passed=full['psnr']>=gate['psnrMin'] and full['ssim']>=gate['ssimMin'] and full['mae']<=gate['maeMax'] and all(r['passed'] for r in observed['rois'])
reported=json.loads((ROOT / 'web/assets/quality12/alpine.quality.json').read_text())
assert all(abs(full[key]-reported['metrics'][key])<1e-12 for key in ['psnr','ssim','mae'])
for actual, saved in zip(observed['rois'], reported['rois']):
    assert actual['id']==saved['id']
    assert all(abs(actual[key]-saved['metrics'][key])<1e-12 for key in ['psnr','ssim','mae'])

font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(font_path,21)
small=ImageFont.truetype(font_path,16)
color='#edf0eb';muted='#a9b3aa';bg='#121813'
board=Image.new('RGB',(1640,650),bg);d=ImageDraw.Draw(board)
d.text((16,14),'Real reference | canonical 800 x 531',font=font,fill=color)
d.text((840,14),'Computed from declared Gaussian parameters',font=font,fill=color)
board.paste(reference,(12,60));board.paste(result,(828,60))
d.text((16,609),'Same pixel scale. PSNR %.4f dB  |  SSIM %.6f  |  MAE %.4f / 255'%
       (full['psnr'],full['ssim'],full['mae']),font=font,fill=color)
board.save(OUT/'reference-vs-computed.png')

names={'mountain_forest':'Mountain / forest','water':'Water / reflections','shore_buildings':'Shore / buildings'}
heights=[]
for row in observed['rois']:
    box=row['bounds'];scale=1 if row['id']=='water' else 2
    heights.append((box[3]-box[1])*scale+92)
detail=Image.new('RGB',(1540,sum(heights)+96),bg);draw=ImageDraw.Draw(detail)
draw.text((20,12),'REFERENCE',font=font,fill=color);draw.text((790,12),'COMPUTED RESULT',font=font,fill=color)
y=55
for row,height in zip(observed['rois'],heights):
    box=row['bounds'];scale=1 if row['id']=='water' else 2
    label=names[row['id']]+'  |  pixels '+str(tuple(box))+'  |  '+str(scale)+'x display'
    draw.text((20,y),label,font=small,fill=color)
    draw.text((790,y),'SSIM %.5f  |  MAE %.3f'%(row['ssim'],row['mae']),font=small,fill=color)
    for source,x in [(reference,20),(result,790)]:
        crop=source.crop(box)
        if scale!=1:crop=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
        detail.paste(crop,(x,y+34))
    y+=height
draw.text((20,y),'2x in this diagnostic board is nearest-neighbor display of both native crops; no detail is invented.',font=small,fill=muted)
detail.save(OUT/'fixed-detail-comparison.png')
error=np.minimum(255,np.abs(diff)*4).astype(np.uint8)
Image.fromarray(error).save(OUT/'absolute-error-times4.png')

audit={'schema':'crf.independent_image_quality_audit.v1','passed':passed,
       'method':'Independent NumPy/SciPy image calculation; no project fitter/evaluator imported',
       'contractSHA256':hashlib.sha256(contract_bytes).hexdigest(),
       'referenceSHA256':hashlib.sha256(reference_path.read_bytes()).hexdigest(),
       'reconstructionSHA256':hashlib.sha256(result_path.read_bytes()).hexdigest(),
       'metricsMatchSealedReport':True,**observed,
       'artifacts':['reference-vs-computed.png','fixed-detail-comparison.png','absolute-error-times4.png'],
       'diagnosticImageScope':'Comparison/crop/error images are reports only, never runtime rendering inputs'}
(OUT/'independent-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({'passed':passed,**observed},indent=2))
if not passed:raise SystemExit(2)
