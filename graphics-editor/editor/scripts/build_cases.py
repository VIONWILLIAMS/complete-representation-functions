#!/usr/bin/env python3
"""Build two independently sourced, explicitly annotated RGB observation cases.

This is a reproducible example adapter, not a universal automatic segmentation
model. Canonical references are resized once, before scanning and acceptance.
Their original downloaded bytes are retained with hashes and attribution.
"""
from pathlib import Path
import base64
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import binary_fill_holes, binary_closing, binary_dilation, distance_transform_edt, gaussian_filter, label

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scanner.scene_scan import scan_pixels, boundary_bindings

SOURCES = {
    'orchard': {
        'title': 'Apple and pear', 'author': 'Yves Geissbühler',
        'url': 'https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg',
        'downloadUrl': 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Apple_and_pear.jpg',
        'license': 'CC0 1.0', 'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'sourceDimensions': [3648, 2736], 'sourceDate': '2013-03-19',
    },
    'alpine': {
        'title': 'Lautersee 2026', 'author': 'Taubenflieger68',
        'url': 'https://commons.wikimedia.org/wiki/File:Lautersee_2026.jpg',
        'downloadUrl': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Lautersee_2026.jpg/1280px-Lautersee_2026.jpg',
        'license': 'CC0 1.0', 'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'sourceDimensions': [9528, 6328], 'downloadedDimensions': [1280, 850],
        'sourceDate': '2026-10-10',
    },
}

def sha(b): return hashlib.sha256(b).hexdigest()
def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')
def polygon(size, points):
    im = Image.new('L', size)
    ImageDraw.Draw(im).polygon(points, fill=255)
    return np.asarray(im) > 0

def largest(mask):
    labs, n = label(mask)
    if not n: return mask
    counts = np.bincount(labs.ravel()); counts[0] = 0
    return labs == counts.argmax()

def orchard_labels(rgb):
    h, w = rgb.shape[:2]; yy, xx = np.mgrid[:h,:w]
    base = np.zeros((h,w), dtype=np.uint8)
    table = polygon((w,h), [(0,423),(147,394),(303,422),(612,441),(800,521),(800,600),(0,600)])
    base[table] = 1
    rgbf = rgb.astype(float)
    red = (rgbf[...,0] > rgbf[...,1]*1.38) & (rgbf[...,0] > rgbf[...,2]*1.38) & (xx>125)&(xx<395)&(yy>194)&(yy<477)
    apple = binary_fill_holes(binary_closing(largest(red), iterations=2))
    stem = polygon((w,h),[(190,211),(199,203),(212,207),(238,236),(233,243),(211,228),(193,220)])
    apple |= stem
    yellow = (rgbf[...,0] > rgbf[...,2]*1.45) & (rgbf[...,1] > rgbf[...,2]*1.35) & (rgbf[...,1] > rgbf[...,0]*.68) & (xx>364)&(xx<630)&(yy>20)&(yy<505)
    pear = binary_fill_holes(binary_closing(largest(yellow), iterations=2))
    # Delineate the stalk from source geometry; its brown colors are not yellow.
    pear |= polygon((w,h),[(458,32),(468,25),(478,29),(478,46),(475,64),(486,95),(466,96),(462,63),(454,40)])
    labels = base.copy(); labels[apple]=2; labels[pear]=3
    defs=[('wall.main','纹理墙面','wall',0,[0,0]),('table.main','桌面与已观测阴影','table',35,[0,.55]),
          ('apple.photo','苹果·实拍表面','fruit_photo',130,[0,0]),('pear.photo','梨子·实拍表面','fruit_photo',150,[0,0])]
    return labels, base, defs, 'Source-color seeds and explicit silhouette/stalk annotations; baked shadows remain on table.'

def alpine_labels(rgb):
    h,w=rgb.shape[:2]
    ridge=[(0,8),(39,0),(80,9),(143,27),(197,49),(253,94),(310,130),(328,112),(356,151),(387,123),(421,136),(443,157),(467,204),(490,222),(511,245),(553,262),(598,254),(636,257),(680,240),(733,227),(777,215),(800,207)]
    mountain=polygon((w,h), ridge+[(800,351),(0,351)])
    forest=polygon((w,h),[(0,168),(45,175),(89,187),(137,210),(183,209),(236,218),(290,244),(344,270),(398,262),(445,258),(491,277),(548,274),(594,258),(639,258),(686,242),(736,230),(800,214),(800,356),(0,356)])
    shore=polygon((w,h),[(0,343),(67,348),(120,346),(190,346),(250,346),(320,342),(390,344),(470,342),(540,346),(613,347),(690,347),(755,351),(800,349),(800,361),(0,360)])
    yy,xx=np.mgrid[:h,:w]
    base=np.zeros((h,w),np.uint8);base[yy>=354]=4
    labels=base.copy();labels[mountain]=1;labels[forest]=2;labels[shore]=3
    buildings=polygon((w,h),[(648,325),(660,321),(679,325),(696,324),(700,329),(719,326),(736,328),(741,343),(648,342)])
    labels[buildings]=5
    # Inferred visibility host: sky behind mountain/trees, nearby shore behind buildings.
    base[buildings]=3
    defs=[('sky.main','天空与云层','sky',-80,[0,0]),('mountain.main','远山与岩壁','mountain',-20,[0,0]),
          ('forest.main','树林与山坡','forest',35,[0,0]),('shore.main','湖岸','shore',50,[0,0]),
          ('lake.main','湖水与倒影','water',100,[0,.65]),('buildings.main','湖畔建筑','building',65,[0,0])]
    return labels,base,defs,'Assistant-authored landscape contours; forest/mountain depths are hypotheses, not measured geometry. Water reflections are observed radiance.'

def background(rgb, labels, base):
    """Reproducible same-host interpolation + observed microtexture continuation."""
    out=rgb.copy(); inferred=labels!=base; h,w=labels.shape
    for host in np.unique(base):
        holes=(base==host)&inferred
        if not holes.any(): continue
        known=(labels==host)&~binary_dilation(inferred,iterations=3)
        if not known.any(): known=labels==host
        if not known.any(): raise ValueError('No donor for inferred host')
        ids=distance_transform_edt(~known,return_distances=False,return_indices=True)
        # Fill low frequencies before filtering; only true same-host observations enter.
        nearest=rgb[ids[0],ids[1]].astype(float)
        low=gaussian_filter(nearest,sigma=(9,9,0))
        donor_low=gaussian_filter(rgb.astype(float)*known[...,None],sigma=(3,3,0))/np.maximum(gaussian_filter(known.astype(float),3)[...,None],1e-9)
        residual=rgb.astype(float)-donor_low
        yy,xx=np.mgrid[:h,:w]
        # Deterministic staggered lookup avoids a single repeated edge color.
        sy=np.clip(ids[0]+((xx*13+yy*7)%19)-9,0,h-1)
        sx=np.clip(ids[1]+((xx*5+yy*11)%17)-8,0,w-1)
        valid=known[sy,sx];sy=np.where(valid,sy,ids[0]);sx=np.where(valid,sx,ids[1])
        texture=np.clip(residual[sy,sx],-12,12)
        candidate=np.clip(np.rint(low+texture),0,255).astype(np.uint8)
        out[holes]=candidate[holes]
    return out,inferred.astype(np.uint8)

def build(case):
    source=ROOT/'assets/source_photos'/f'{case}.jpg'
    image=ImageOps.exif_transpose(Image.open(source)).convert('RGB')
    image.thumbnail((800,600),Image.Resampling.LANCZOS)
    dest=ROOT/'web/assets/cases';dest.mkdir(parents=True,exist_ok=True)
    reference=dest/f'{case}-reference.png';image.save(reference)
    rgb=np.asarray(image);h,w=rgb.shape[:2]
    labels,base,defs,note=(orchard_labels if case=='orchard' else alpine_labels)(rgb)
    bg,inferred=background(rgb,labels,base)
    # Both adapters reserve label0 for their distant host (wall or sky).
    mixture,_=boundary_bindings(rgb,labels,base,bg)
    stats=scan_pixels(reference,labels);measured={x['index']:x for x in stats['segments']}
    objects=[]
    for i,(oid,title,kind,depth,slope) in enumerate(defs):
        m=measured[i]
        objects.append({'id':oid,'index':i,'label':title,'kind':kind,'group':'实拍语义层','parent':None,'bbox':m['bbox'],'pivot':m['pivot'],
                        'depth':depth,'depthSlope':slope,'normal':[0,0,1],'statistics':m['statistics'],
                        'provenance':{'rgb':'canonical_reference_RGB8','segmentation':'explicit_example_adapter','depth':'single_view_hypothesis'}})
    source_meta={**SOURCES[case],'downloadedFileSha256':sha(source.read_bytes()),'canonicalDimensions':[w,h],
                 'canonicalFileSha256':sha(reference.read_bytes()),'canonicalRgbSha256':sha(rgb.tobytes()),
                 'normalization':'EXIF transpose; RGB8; Lanczos thumbnail bounded by 800x600; frozen before scan'}
    data={'schema':'crf.scene.v0.5','width':w,'height':h,'referenceSha256':sha(reference.read_bytes()),
          'rgbBase64':b64(rgb),'labelsBase64':b64(labels),'backgroundRgbBase64':b64(bg),
          'backgroundInferredMaskBase64':b64(inferred),'backgroundLabelsBase64':b64(base),'boundaryMixture':mixture,
          'objects':objects,'relations':[],'source':source_meta,
          'metadata':{'caseId':case,'segmentationNote':note,'physicalDepthRecovered':False,'denseObservationCoefficients':True,'inferredPixels':int(inferred.sum())},
          'statistics':{'observedPixels':w*h,'objectCount':len(objects)}}
    (dest/f'{case}-data.js').write_text('globalThis.CRF_'+case.upper()+'_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
    palette=np.array([[98,180,218],[169,133,90],[222,90,80],[198,195,54],[78,130,194],[228,138,108]],np.uint8)
    preview=(rgb*.55+palette[labels]*.45).astype(np.uint8)
    reportdir=ROOT/'reports/cases';reportdir.mkdir(parents=True,exist_ok=True)
    Image.fromarray(preview).save(reportdir/f'{case}_semantic_overlay.png')
    Image.fromarray(bg).save(reportdir/f'{case}_inferred_background.png')
    (reportdir/f'{case}_scan.json').write_text(json.dumps({**stats,'caseId':case,'source':source_meta,'note':note,'objects':objects},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'case':case,'width':w,'height':h,'objects':len(objects),'inferred':int(inferred.sum()),'referenceSha256':source_meta['canonicalFileSha256']}))
    return source_meta

if __name__=='__main__':
    sources={name:build(name) for name in SOURCES}
    (ROOT/'assets/source_photos/sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
