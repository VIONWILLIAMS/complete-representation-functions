#!/usr/bin/env python3
"""Resume CRF 0.8 full-frame Gaussian fitting of actually downloaded references.

This script deliberately does not call a whole-frame representation an object
function. Semantic extraction is a separate, provenance-preserving operation.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time

# Bound BLAS thread use before importing NumPy; multiple independent images run
# concurrently, while the native Gaussian-gradient kernel uses two threads.
os.environ["OPENBLAS_NUM_THREADS"]="1"
os.environ["OMP_NUM_THREADS"]="2"
import numpy as np
from PIL import Image,ImageOps

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'fitting'))
from crf08_gaussian import fit_image,render_asset,metrics

# Manually reviewed visible contours on the original 1100x627 reference images.
# They correct two observed GrabCut failures, not a general segmentation model.
REVIEWED_CONTOURS={
 'learn.r04.c2f1cb0642a5':[
  [530,124],[560,125],[600,133],[640,149],[680,177],[710,211],[735,257],[744,296],[745,325],[742,349],
  [763,378],[817,401],[845,424],[856,450],[850,482],[832,516],[810,542],
  [790,550],[742,535],[693,519],[661,551],[616,575],[569,585],[524,586],
  [475,578],[430,560],[395,537],[370,500],[348,454],[332,405],[321,358],
  [318,321],[321,281],[332,244],[349,211],[375,183],[400,164],[425,149],[450,137],[475,130],[500,126]],
 'learn.r04.ba8ec1aa482e':[
  [617,120],[656,121],[694,127],[739,140],[777,162],[805,196],[818,238],
  [826,286],[837,341],[844,394],[836,440],[816,478],[776,512],[724,539],
  [669,553],[615,555],[562,544],[518,520],[481,484],[458,439],[449,382],
  [450,332],[451,280],[454,242],[470,202],[504,162],[553,136]]}


def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    pending=path.with_name(path.name+'.pending')
    pending.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
    pending.replace(path)


def sha(data):return hashlib.sha256(data).hexdigest()


def fingerprint(image):
    gray=np.asarray(image.convert('L').resize((9,8),Image.Resampling.LANCZOS),dtype=np.int16)
    bits=(gray[:,1:]>gray[:,:-1]).ravel();integer=0
    for bit in bits:integer=(integer<<1)|int(bit)
    small=np.asarray(image.convert('RGB').resize((16,16),Image.Resampling.LANCZOS),dtype=np.uint8)
    return f'{integer:016x}',small


def read_reference(item,max_side):
    path=(ROOT/item['file']).resolve()
    if not path.is_relative_to(ROOT/'fitting'/'learning08'/'originals'):
        raise ValueError('Reference must be in the downloaded-originals directory')
    raw=path.read_bytes()
    with Image.open(path) as im:
        original=list(im.size)
        corrected=ImageOps.exif_transpose(im).convert('RGBA')
        oriented=list(corrected.size)
        corrected.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
        rgba=np.asarray(corrected).copy()
    dh,small=fingerprint(corrected)
    return {'rgba':rgba,'originalSize':original,'orientedSize':oriented,'fittedSize':list(corrected.size),
            'sourceSHA256':sha(raw),'normalizedRGBA_SHA256':sha(rgba.tobytes()),'dHash64':dh,'small':small}


def fit_one(job):
    item,info,config=job
    started=time.perf_counter();identifier=item['id']
    destination=ROOT/'web'/'assets'/'v08'/'learned'/identifier
    ref=ROOT/'web'/'assets'/'v08'/'references'/(identifier+'.jpg')
    reference_png=ROOT/'web'/'assets'/'v08'/'references'/(identifier+'.png')
    destination.parent.mkdir(parents=True,exist_ok=True);ref.parent.mkdir(parents=True,exist_ok=True)
    rgba=info['rgba'];height,width=rgba.shape[:2]
    # At least eight pixels per Gaussian; never silently take the per-pixel path.
    budget=min(config['budget'],max(16,width*height//8))
    if width*height<128:raise ValueError('Reference is too small for a non-per-pixel fit')
    progress=[]
    asset=fit_image(rgba,budget=budget,iterations=config['iterations'],asset_id=identifier,
                    progress=lambda row:progress.append(row),geometry_steps=config['geometrySteps'])
    asset['provenance'].update({k:info[k] for k in ['originalSize','orientedSize','fittedSize','sourceSHA256','normalizedRGBA_SHA256','dHash64']})
    scope=item.get('representationScope','full_frame')
    asset['provenance'].update({'sourceUrl':item.get('sourceUrl'),'imageUrl':item.get('imageUrl'),'title':item.get('title'),
                               'referenceRound':item.get('round'),'representationScope':scope,
                               'semanticObjectExtraction':scope=='semantic_object','resize':'EXIF transpose then Lanczos thumbnail',
                               'licenseStatus':item.get('licenseStatus','source terms require verification')})
    if item.get('segmentation'):asset['provenance']['segmentation']=item['segmentation']
    if item.get('semantics'):asset['semantics']=item['semantics']
    asset_path=destination.with_suffix(destination.suffix+'.json')
    # Preserve dotted IDs rather than treating their trailing hash as a suffix.
    asset_path=Path(str(destination)+'.json');image_path=Path(str(destination)+'.png')
    report_path=Path(str(destination)+'.report.json')
    asset_path.write_text(json.dumps(asset,separators=(',',':'),ensure_ascii=False),encoding='utf8')
    output=render_asset(asset)
    Image.fromarray(output).save(image_path)
    # Reference JPEG is for comparison only. Renderer receives exported kernels.
    reference_rgb=Image.new('RGB',(width,height),(255,255,255));reference_rgba=Image.fromarray(rgba)
    reference_rgb.paste(reference_rgba,mask=reference_rgba.getchannel('A'));reference_rgb.save(ref,quality=94)
    reference_rgba.save(reference_png)
    quality=metrics(rgba,output,rgba[...,3])
    record={
      'id':identifier,'assetId':identifier,'status':'fitted','round':item.get('round'),'topic':item.get('topic'),
      'sourceUrl':item.get('sourceUrl'),'imageUrl':item.get('imageUrl'),'title':item.get('title'),
      'sourceFile':item['file'],'sourceSHA256':info['sourceSHA256'],'normalizedRGBA_SHA256':info['normalizedRGBA_SHA256'],
      'dHash64':info['dHash64'],'originalSize':info['originalSize'],'orientedSize':info['orientedSize'],'fittedSize':info['fittedSize'],
      'assetURL':'assets/v08/learned/'+identifier+'.json','renderURL':'assets/v08/learned/'+identifier+'.png',
      'reportURL':'assets/v08/learned/'+identifier+'.report.json','referenceURL':'assets/v08/references/'+identifier+'.png',
      'referenceThumbnailURL':'assets/v08/references/'+identifier+'.jpg',
      'representationScope':scope,'semanticObjectExtraction':scope=='semantic_object','gaussians':len(asset['splats']),
      'pixelToGaussianRatio':width*height/max(1,len(asset['splats'])),'assetBytes':asset_path.stat().st_size,
      'sourceRGBEmbedded':False,'losslessResidualEmbedded':False,'independentlyRenderedFromExportOnly':True,
      'metrics':quality,'fitConfig':config,'fit':asset['fit'],'elapsedSeconds':round(time.perf_counter()-started,3),
      'passedPilot':(quality['psnr'] is None or quality['psnr']>=32) and quality['ssim']>=.95,
      'passedHighFidelity':(quality['psnr'] is None or quality['psnr']>=38) and quality['ssim']>=.98,
      'licenseStatus':item.get('licenseStatus','source terms require verification'),
      'notes':['Metrics compare the declared resized/cropped RGB observation, not the original full-resolution download.',
               'Object alpha is an inferred segmentation, not ground-truth matting.' if scope=='semantic_object' else 'This full-frame Gaussian function is not an automatically segmented object function.',
               'Near-duplicate detection is a conservative heuristic; sources remain separately recorded.']}
    if item.get('segmentation'):record['segmentation']=item['segmentation']
    if item.get('semantics'):record['semantics']=item['semantics']
    if item.get('sourceId'):record['sourceId']=item['sourceId']
    write_json(report_path,record)
    return record


def extract_object(item,semantic,max_side):
    import cv2
    info=read_reference(item,max_side)
    rgba=info['rgba'];height,width=rgba.shape[:2];bbox=semantic.get('bbox',[])
    if len(bbox)!=4 or any(not isinstance(x,(int,float)) or not math.isfinite(x) for x in bbox):
        raise ValueError('Semantic object requires a finite normalized bounding box')
    x0,y0,x1,y1=bbox
    if not(0<=x0<x1<=1 and 0<=y0<y1<=1):raise ValueError('Invalid normalized bounding box')
    # Expand the language-model proposal so a slightly inaccurate box does not
    # become a hard object boundary. The outer image boundary remains known BG.
    x0=max(1,math.floor(x0*width)-max(5,round(width*.04)))
    x1=min(width-1,math.ceil(x1*width)+max(5,round(width*.04)))
    y0=max(1,math.floor(y0*height)-max(5,round(height*.04)))
    y1=min(height-1,math.ceil(y1*height)+max(5,round(height*.04)))
    if x1-x0<5 or y1-y0<5:raise ValueError('Proposed object is too small')
    rgb=np.ascontiguousarray(rgba[...,:3])
    labels=np.zeros((height,width),np.uint8);bg=np.zeros((1,65),np.float64);fg=np.zeros((1,65),np.float64)
    cv2.setRNGSeed(8)
    cv2.grabCut(rgb,labels,(x0,y0,x1-x0,y1-y0),bg,fg,6,cv2.GC_INIT_WITH_RECT)
    binary=np.uint8((labels==cv2.GC_FGD)|(labels==cv2.GC_PR_FGD))
    count,components,stats,_=cv2.connectedComponentsWithStats(binary,8)
    if count<=1:raise ValueError('GrabCut found no object foreground')
    # Keep components attached to the principal object. Separate background specks
    # are dropped; this deliberately does not infer a whole 3D object.
    largest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));binary=np.uint8(components==largest)
    refinements=[]
    # These two reviewed examples have explicit, auditable corrections; they are
    # not presented as automatic general-purpose instance segmentation.
    from scipy import ndimage
    if item['id']=='learn.r03.097cfbf071e3':
        chroma=rgb[...,2].astype(float)-rgb[...,0].astype(float)
        qualified=(binary>0)&(chroma>7)
        qualified=ndimage.binary_closing(qualified,iterations=1)
        qualified=ndimage.binary_fill_holes(qualified)
        binary=np.uint8(qualified)
        refinements.append('Visually reviewed blue-vase chroma constraint B-R>7 removes the neutral floor shadow; holes filled inside the body.')
    reviewed_coverage=None
    if item['id'] in REVIEWED_CONTOURS:
        from scipy.interpolate import splprep,splev
        from PIL import ImageDraw
        points=np.asarray(REVIEWED_CONTOURS[item['id']],float)
        points=np.vstack((points,points[0]))
        curve,_=splprep(points.T,s=0,per=True,k=3)
        px,py=splev(np.linspace(0,1,1200,endpoint=False),curve)
        oversample=4
        enlarged=Image.new('L',(width*oversample,height*oversample),0)
        coords=list(zip(px/1100*width*oversample,py/627*height*oversample))
        ImageDraw.Draw(enlarged).polygon(coords,fill=255)
        reviewed_coverage=np.asarray(enlarged.resize((width,height),Image.Resampling.LANCZOS),dtype=float)/255
        binary=np.uint8(reviewed_coverage>.5)
        refinements.append('Manually reviewed closed cubic contour on the original reference restores the complete visible cup body; four-times supersampled coverage replaces the failed GrabCut boundary.')
    area=int(binary.sum())
    if area<64 or area/(width*height)>.9:raise ValueError('Segmentation is empty or covers nearly the full frame')
    coverage=reviewed_coverage if reviewed_coverage is not None else ndimage.gaussian_filter(binary.astype(float),sigma=.55)
    coverage[coverage<.015]=0;coverage[coverage>.985]=1
    alpha=np.round(coverage*255).astype(np.uint8)
    ys,xs=np.nonzero(alpha);left=max(0,int(xs.min())-3);top=max(0,int(ys.min())-3)
    right=min(width,int(xs.max())+4);bottom=min(height,int(ys.max())+4)
    # Remove background-colour contamination from the soft edge by extending
    # nearest foreground-interior colours, only where inferred coverage is low.
    interior=ndimage.binary_erosion(binary,iterations=1)
    if np.any(interior):
        _,indices=ndimage.distance_transform_edt(~interior,return_indices=True)
        extended=rgb[indices[0],indices[1]]
        edge=coverage<.8;rgb=rgb.copy();rgb[edge]=extended[edge]
    crop=np.dstack((rgb,alpha))[top:bottom,left:right].copy()
    source_id=item['id'];identifier=source_id+'.object'
    extracted=ROOT/'fitting'/'learning08'/'extracted'/(identifier+'.png')
    extracted.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(crop).save(extracted)
    info['rgba']=crop;info['fittedSize']=[crop.shape[1],crop.shape[0]]
    info['normalizedRGBA_SHA256']=sha(crop.tobytes());info['dHash64'],info['small']=fingerprint(Image.fromarray(crop))
    updated={**item,'id':identifier,'sourceId':source_id,'representationScope':'semantic_object','semantics':semantic,
             'segmentation':{'method':'DeepSeek vision bbox + seeded OpenCV GrabCut + 0.55px coverage smoothing',
                             'normalizedBBox':bbox,'proposalPixels':[x0,y0,x1,y1],'cropPixels':[left,top,right,bottom],
                             'workingSize':[width,height],'foregroundPixels':area,'pixelMaskVerified':False,
                             'reviewedCorrections':refinements,
                             'reviewedContour':{'coordinateSize':[1100,627],'points':REVIEWED_CONTOURS[item['id']],'interpolation':'periodic cubic spline','coverageSamplesPerAxis':4} if item['id'] in REVIEWED_CONTOURS else None,
                             'coverageProvenance':'inferred','edgeColour':'nearest foreground-interior extension where alpha < 0.8',
                             'extractedFile':str(extracted.relative_to(ROOT))}}
    return updated,info


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--max-side',type=int,default=512)
    parser.add_argument('--budget',type=int,default=8192)
    parser.add_argument('--geometry-steps',type=int,default=70)
    parser.add_argument('--iterations',type=int,default=24)
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--force',action='store_true')
    parser.add_argument('--objects',action='store_true',help='Fit separately segmented objects from completed semantic reports')
    parser.add_argument('--only',default='',help='Comma-separated source IDs to refresh, preserving other manifest entries')
    args=parser.parse_args()
    config={'maxSide':args.max_side,'budget':args.budget,'geometrySteps':args.geometry_steps,'iterations':args.iterations,
            'algorithm':'crf08-residual-adaptive-lsmr-adam-v2','initialFraction':.35,
            'mode':'semantic_object' if args.objects else 'full_frame'}
    directory=ROOT/'reports'/'v08'/'learning';manifest=directory/('object_fits.json' if args.objects else 'fits.json')
    documents=[]
    for path in sorted(directory.glob('round_*.json')):
        try:documents.append(json.loads(path.read_text()))
        except (OSError,ValueError):continue
    items=[]
    for document in documents:
        for original in document.get('downloads',[]):
            item=dict(original)
            if item.get('status')!='downloaded' or not item.get('file'):continue
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}',item.get('id','')):continue
            item.setdefault('round',document.get('round'));items.append(item)
    if args.limit:items=items[:args.limit]
    selected_ids={x.strip() for x in args.only.split(',') if x.strip()}
    if selected_ids:items=[item for item in items if item['id'] in selected_ids]
    semantics={}
    if args.objects:
        for path in sorted(directory.glob('semantics_*.json')):
            try:
                for record in json.loads(path.read_text()).get('items',[]):
                    if record.get('role')=='object':semantics[record['id']]=record
            except (ValueError,OSError,KeyError):continue
        items=[item for item in items if item['id'] in semantics]
    previous={}
    if manifest.exists():
        try:previous={r['id']:r for r in json.loads(manifest.read_text()).get('fits',[])}
        except (ValueError,KeyError):pass
    retained={k:v for k,v in previous.items() if k.removesuffix('.object') not in selected_ids} if selected_ids else {}
    outcomes=dict(retained);aliases=[];seen=[];jobs=[]
    prepared_items=[]
    for source_item in items:
        item=source_item
        try:
            if args.objects:item,info=extract_object(item,semantics[item['id']],args.max_side)
            else:info=read_reference(item,args.max_side)
        except Exception as error:
            outcomes[item['id']]={'id':item['id'],'status':'failed','round':item.get('round'),'error':str(error),'sourceFile':item['file'],'sourceUrl':item.get('sourceUrl')};prepared_items.append(item);continue
        prepared_items.append(item)
        duplicate=None
        for canonical,other in seen:
            distance=(int(info['dHash64'],16)^int(other['dHash64'],16)).bit_count()
            rmse=float(np.sqrt(np.mean((info['small'].astype(float)-other['small'].astype(float))**2)))
            a=info['fittedSize'];b=other['fittedSize'];aspect=abs(a[0]/a[1]-b[0]/b[1])
            if info['sourceSHA256']==other['sourceSHA256']:duplicate=(canonical,'same_source_bytes',distance,rmse)
            elif info['normalizedRGBA_SHA256']==other['normalizedRGBA_SHA256']:duplicate=(canonical,'same_normalized_pixels',distance,rmse)
            elif distance<=2 and rmse<=8 and aspect<.025:duplicate=(canonical,'near_duplicate_dhash_and_colour',distance,rmse)
            if duplicate:break
        if duplicate:
            canonical,reason,distance,rmse=duplicate
            record={'id':item['id'],'status':'duplicate','canonicalAssetId':canonical['id'],'round':item.get('round'),
                    'sourceUrl':item.get('sourceUrl'),'imageUrl':item.get('imageUrl'),'sourceFile':item['file'],
                    'sourceSHA256':info['sourceSHA256'],'dHash64':info['dHash64'],'reason':reason,'dHashDistance':distance,'thumbnailRGB_RMSE':rmse}
            outcomes[item['id']]=record;aliases.append(record);continue
        seen.append((item,info))
        report=ROOT/'web'/'assets'/'v08'/'learned'/(item['id']+'.report.json')
        old=previous.get(item['id'])
        if report.exists():
            try:old=json.loads(report.read_text())
            except (OSError,ValueError):pass
        asset=ROOT/'web'/'assets'/'v08'/'learned'/(item['id']+'.json')
        old_config={**old.get('fitConfig',{}),'mode':old.get('fitConfig',{}).get('mode','full_frame')} if old else None
        if not args.force and old and old.get('status')=='fitted' and old_config==config and old.get('sourceSHA256')==info['sourceSHA256'] and old.get('normalizedRGBA_SHA256')==info['normalizedRGBA_SHA256'] and asset.exists():
            # Persist the exact fitted observation, not a JPEG re-encoding, for
            # pixel comparison in the editor. This migration does not refit.
            exact_ref=ROOT/'web'/'assets'/'v08'/'references'/(item['id']+'.png')
            exact_ref.parent.mkdir(parents=True,exist_ok=True)
            Image.fromarray(info['rgba']).save(exact_ref)
            old['referenceURL']='assets/v08/references/'+item['id']+'.png'
            old['referenceThumbnailURL']='assets/v08/references/'+item['id']+'.jpg'
            write_json(report,old)
            outcomes[item['id']]=old
        else:jobs.append((item,info,config))
    items=prepared_items
    def persist():
        records=list(retained.values())+[outcomes[item['id']] for item in items if item['id'] in outcomes]
        records.sort(key=lambda r:(r.get('round',0),r['id']))
        active_count=len(items)+len(retained)
        write_json(manifest,{'schema':'crf.learning_fits.v0.8','configuration':config,'sourceRounds':len(documents),
                            'downloadCount':active_count,'fittedCount':sum(r['status']=='fitted' for r in records),
                            'duplicateCount':sum(r['status']=='duplicate' for r in records),'failedCount':sum(r['status']=='failed' for r in records),
                            'pendingCount':active_count-len(records),'fits':records,'aliases':aliases,
                            'metricScope':'declared EXIF-corrected Lanczos resized RGB observations; source resolution is separately recorded'})
        if args.objects:
            entries=[]
            for r in records:
                if r.get('status')!='fitted':continue
                semantic=r.get('semantics',{})
                exclusions=[]
                if r['id']=='learn.r04.8fa1d7612d73.object':exclusions.append('透明玻璃壶被分割漏掉，当前仅保留失败样例，不参与自动新场景组合。')
                if min(r['fittedSize'])<70:exclusions.append('物体有效像素过少，不建议放大用于照片级组合。')
                if r.get('metrics',{}).get('psnr',100)<34:exclusions.append('当前RGB拟合质量不足，保留误差证据后继续改进。')
                if r['id']=='learn.r04.c2f1cb0642a5.object':exclusions.append('当前为俯视咖啡杯，组合时必须保留对应的俯拍视角。')
                eligible=not any('失败' in note or '不足' in note or '过少' in note for note in exclusions)
                entries.append({'id':r['id'],'label':semantic.get('label',r['id']),
                    'width':r['fittedSize'][0],'height':r['fittedSize'][1],
                    'assetUrl':r['assetURL'],'referenceUrl':r['referenceURL'],'thumbnailUrl':r['renderURL'],'reportUrl':r['reportURL'],
                    'category':semantic.get('category','observed object'),'role':'object','tags':semantic.get('tags',[]),
                    'description':semantic.get('description','Observed appearance fitted into a Gaussian function.'),
                    'sourceUrl':r.get('sourceUrl'),'sourceId':r.get('sourceId'),'round':r.get('round'),
                    'compositionEligible':eligible,'visualReviewNotes':exclusions,
                    'limitations':list(semantic.get('limitations',[]))+exclusions+[
                        '由模型框选和GrabCut推断alpha，未以真值分割验收。',
                        '光照与高光来自该观测视角；缩放和二维变换不生成未观察到的背面。'],
                    'pixelMaskVerified':False,'representationScope':'semantic_object','metrics':r.get('metrics'),
                    'gaussians':r.get('gaussians'),'provenance':'reference-learned-object'})
            write_json(directory/'cutouts.json',{'schema':'crf.learned_object_catalog.v0.8','assets':entries,
                'method':'DeepSeek vision proposals + GrabCut inferred coverage + independently fitted Gaussian RGB functions'})
    persist()
    print(json.dumps({'queued':len(jobs),'downloaded':len(items),'resumed':sum(r.get('status')=='fitted' for r in outcomes.values()),'duplicates':len(aliases)},ensure_ascii=False),flush=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=max(1,min(3,args.workers))) as pool:
        pending={pool.submit(fit_one,job):job[0] for job in jobs}
        for future in concurrent.futures.as_completed(pending):
            item=pending[future]
            try:record=future.result()
            except Exception as error:record={'id':item['id'],'status':'failed','round':item.get('round'),'sourceUrl':item.get('sourceUrl'),'sourceFile':item['file'],'error':str(error)}
            outcomes[item['id']]=record;persist()
            print(json.dumps({k:record.get(k) for k in ['id','status','gaussians','fittedSize','metrics','elapsedSeconds','error']},ensure_ascii=False),flush=True)
    persist();print(json.dumps({'complete':True,'manifest':str(manifest),'processed':len(outcomes)},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
