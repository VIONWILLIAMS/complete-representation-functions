#!/usr/bin/env python3
"""Independent photo measurements of actual JavaScript output, not fitter claims."""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_SHA = 'f262a18ad60ae4f77bed9608b28aecac2c1201d109a7709b82668a1d0a1b193b'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def measurement(reference, prediction, boxes):
    a, b = np.asarray(reference, np.float64), np.asarray(prediction, np.float64)
    if a.shape != b.shape or a.ndim != 3 or a.shape[2] != 3:
        raise ValueError('Source/output descriptors differ')
    filt = lambda x: gaussian_filter(x, (1.5, 1.5, 0), truncate=3.5, mode='reflect')
    ma, mb = filt(a), filt(b)
    va, vb = np.maximum(0, filt(a*a)-ma*ma), np.maximum(0, filt(b*b)-mb*mb)
    cov = filt(a*b)-ma*mb
    ssim = ((2*ma*mb+6.5025)*(2*cov+58.5225))/((ma*ma+mb*mb+6.5025)*(va+vb+58.5225))
    delta = np.abs(a-b)
    def region(box):
        x0,y0,x1,y1 = box
        d = delta[y0:y1,x0:x1]
        if d.size == 0:
            raise ValueError('Empty ROI')
        mse = float(np.mean(d*d))
        return {'psnr': 10*math.log10(65025/mse) if mse else None, 'ssim': float(ssim[y0:y1,x0:x1].mean()),
                'mae': float(d.mean()), 'rmse': math.sqrt(mse), 'maxError': int(d.max()),
                'p99ChannelError': float(np.percentile(d,99)),
                'fractionPixelsAnyChannelAbove16': float(np.mean(np.max(d,axis=2)>16)),
                'fractionPixelsAnyChannelAbove32': float(np.mean(np.max(d,axis=2)>32)),
                'evaluatedPixels': int(d.shape[0]*d.shape[1])}
    h,w = a.shape[:2]
    return region((0,0,w,h)), [{'id': i, 'pixelBounds': box, 'metrics': region(box)} for i,box in boxes]

def main():
    contract_path=ROOT/'contracts/quality13.json'
    if digest(contract_path) != CONTRACT_SHA:
        raise ValueError('Frozen contract changed')
    contract=json.loads(contract_path.read_text()); gate=contract['globalGate']; roi_gate=contract['roiGate']
    rows=[]
    for scene in contract['scenes']:
        source=ROOT/scene['referencePath']; output=ROOT/'reports/quality13/runtime'/f"{scene['id']}.png"
        if digest(source) != scene['fileSHA256']:
            raise ValueError('Reference SHA mismatch: '+scene['id'])
        a=Image.open(source).convert('RGB'); b=Image.open(output).convert('RGB')
        if a.size != (scene['width'],scene['height']) or a.size != b.size:
            raise ValueError('Evaluation must retain the exact declared dimensions')
        boxes=[]
        for r in scene['rois']:
            x0,y0,x1,y1=r['bounds']
            boxes.append((r['id'],[math.floor(x0*a.width),math.floor(y0*a.height),math.ceil(x1*a.width),math.ceil(y1*a.height)]))
        metrics,rois=measurement(a,b,boxes)
        for r in rois:
            r['passed']=r['metrics']['ssim']>=roi_gate['ssimMin'] and r['metrics']['mae']<=roi_gate['maeMax']
        checks={'psnr':metrics['psnr'] is None or metrics['psnr']>=gate['psnrMin'],
                'ssim':metrics['ssim']>=gate['ssimMin'],'mae':metrics['mae']<=gate['maeMax'],
                'p99':metrics['p99ChannelError']<=gate['p99ChannelErrorMax'],
                'tail':metrics['fractionPixelsAnyChannelAbove32']<=gate['fractionPixelsAnyChannelAbove32Max'],
                'rois':all(r['passed'] for r in rois)}
        rows.append({'id':scene['id'],'width':a.width,'height':a.height,'referenceSHA256':digest(source),'outputSHA256':digest(output),
                     'metrics':metrics,'rois':rois,'checks':checks,'passed':all(checks.values())})
        print(json.dumps({'id':scene['id'],'metrics':metrics,'passed':all(checks.values())}))
    report={'schema':'crf.detail_independent_photo_audit.v1','contractSHA256':CONTRACT_SHA,'verifierSHA256':digest(Path(__file__)),
            'referenceResizedForEvaluation':False,'runtime':'Actual JavaScript parameter output PNG',
            'scope':'Three finite observation-conditioned reconstructions; no novel-scene generation, human blind review or photorealism percentage.',
            'scenes':rows,'passed':all(r['passed'] for r in rows)}
    out=ROOT/'reports/quality13/independent-photo-audit.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return 0 if report['passed'] else 2

if __name__ == '__main__':
    raise SystemExit(main())
