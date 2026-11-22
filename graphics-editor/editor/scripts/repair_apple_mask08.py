#!/usr/bin/env python3
"""Remove the reviewed table-colour strip from the new 0.8 apple mask only.

This is an explicit assisted alpha revision. Every RGB input byte is preserved;
no old editor/reference files are modified and no hidden apple surface is added.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'fitting/sources08/fruit.apple.png'
BEFORE=ROOT/'reports/v08/fruit.apple.mask_before.png'
REPORT=ROOT/'reports/v08/fruit.apple.mask_revision.json'
OUTPUT=ROOT/'web/assets/v08/gaussians/fruit.apple.json'
OLD=ROOT/'web/assets/v06/apple-reference-mask.png'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    old_hash=digest(OLD)
    BEFORE.parent.mkdir(parents=True,exist_ok=True)
    if not BEFORE.exists():BEFORE.write_bytes(SOURCE.read_bytes())
    original=np.asarray(Image.open(BEFORE).convert('RGBA')).copy()
    if original.shape[:2]!=(261,253):raise ValueError('Reviewed contour requires the retained 253x261 apple crop')
    result=original.copy();height,width=original.shape[:2]
    # Visible lower apple contour, reviewed against its real RGB boundary.
    # The centre reaches the bottom of this existing crop; no full-row trim.
    points=[[70,242.5],[80,247.2],[90,250.5],[100,254.0],[110,256.7],
            [125,259.7],[140,260.3],[155,258.7],[170,255.8],[185,251.4],[200,244.3]]
    spline=PchipInterpolator(np.asarray(points)[:,0],np.asarray(points)[:,1])
    yy,xx=np.mgrid[:height,:width]
    affected=(yy>=244)&(xx>=80)&(xx<=200)
    curve=spline(np.clip(xx,70,200))
    coverage=np.clip((curve-(yy+.5))/.8+.5,0,1)
    revised=np.floor(original[...,3].astype(float)*coverage+.5).astype(np.uint8)
    result[...,3][affected]=np.minimum(original[...,3][affected],revised[affected])
    Image.fromarray(result).save(SOURCE)
    # Exact corrected target for editor comparisons; original source stays in BEFORE.
    Image.fromarray(result).save(ROOT/'web/assets/v08/references/fruit.apple.png')
    changed=np.any(result!=original,axis=2);removed=(original[...,3]>0)&(result[...,3]==0)
    ys,xs=np.nonzero(changed)
    revision={
      'schema':'crf.assisted_mask_revision.v0.8','assetId':'fruit.apple','revision':'remove-bottom-table-strip-1',
      'reason':'Inherited alpha included a flat grey-brown table strip below the visible fruit, producing rectangular protrusions in dark compositions.',
      'assistance':'Human-reviewed lower silhouette control points; monotone cubic interpolation and a 0.8px coverage transition.',
      'beforeSourcePath':str(BEFORE.relative_to(ROOT)),'beforeSourceSHA256':digest(BEFORE),
      'afterSourcePath':str(SOURCE.relative_to(ROOT)),'afterSourceSHA256':digest(SOURCE),
      'originalRGB_SHA256':hashlib.sha256(original[...,:3].tobytes()).hexdigest(),
      'revisedRGB_SHA256':hashlib.sha256(result[...,:3].tobytes()).hexdigest(),
      'allRGBBytesUnchanged':bool(np.array_equal(original[...,:3],result[...,:3])),
      'alphaOnly':True,'coverageProvenance':'inferred','pixelMaskVerified':False,
      'controlPoints':points,'coordinateSize':[253,261],'affectedRegion':[80,244,201,261],
      'changedPixels':int(changed.sum()),'fullyRemovedPixels':int(removed.sum()),
      'actualChangeBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
      'oldReferencePath':str(OLD.relative_to(ROOT)),'oldReferenceSHA256':old_hash,
      'fitConfiguration':{'budget':13177,'iterations':24,'geometrySteps':90,'initialFraction':.35},
      'scope':'Observed apple front appearance only. This edit neither completes the pear-occluded right side nor infers another view.'}
    if digest(OLD)!=old_hash:raise RuntimeError('Legacy reference unexpectedly changed')
    env=dict(os.environ);env['OPENBLAS_NUM_THREADS']='1'
    command=[sys.executable,str(ROOT/'fitting/crf08_gaussian.py'),str(SOURCE),'--output',str(OUTPUT),
             '--budget','13177','--iterations','24','--geometry-steps','90','--initial-fraction','.35','--id','fruit.apple']
    completed=subprocess.run(command,cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (ROOT/'reports/v08/fitting/fruit.apple.mask_revision.log').write_text(completed.stdout)
    if completed.returncode:raise RuntimeError('Apple refit failed; inspect the fitting log')
    asset=json.loads(OUTPUT.read_text());asset['provenance']['assistedMaskRevision']=revision
    OUTPUT.write_text(json.dumps(asset,separators=(',',':')),encoding='utf8')
    fit_report=OUTPUT.with_suffix('.report.json');report=json.loads(fit_report.read_text())
    report['assistedMaskRevision']=revision;report['assetBytes']=OUTPUT.stat().st_size
    fit_report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    revision['fitMetrics']=report['metrics'];revision['legacyReferenceUnchanged']=digest(OLD)==old_hash
    REPORT.write_text(json.dumps(revision,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'completed':True,'changedPixels':revision['changedPixels'],'removedPixels':revision['fullyRemovedPixels'],
                      'allRGBBytesUnchanged':revision['allRGBBytesUnchanged'],'legacyReferenceUnchanged':revision['legacyReferenceUnchanged'],
                      'metrics':report['metrics'],'report':str(REPORT.relative_to(ROOT))},ensure_ascii=False))

if __name__=='__main__':main()
