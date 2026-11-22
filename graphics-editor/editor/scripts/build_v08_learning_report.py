#!/usr/bin/env python3
"""Rebuild the publishable CRF 0.8 learning ledger from recorded evidence.

Read-only inputs: round checkpoints, their prior attempts and direct recoveries,
visual-semantics batches, and the two separately measured fitting manifests.
Outputs: public learning.json, attribution SOURCES.md, README snapshot block.
No provider calls, no image decoding and no credentials are required.
"""
from __future__ import annotations
import hashlib
import json
import math
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qs

ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/'reports/v08/learning'
OUTPUT=ROOT/'web/assets/v08/learning.json'
DOCS=ROOT/'docs/v08'
INPUT_DIGESTS=[]

def read(path,default=None):
    if not path.exists():return default
    data=path.read_bytes()
    INPUT_DIGESTS.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    return json.loads(data)

def clean(value,limit=5000):
    return re.sub(r'sk-[A-Za-z0-9_-]{12,}','[credential removed]',str(value or ''))[:limit]

def safe_url(value):
    try:
        u=urlsplit(str(value or ''))
        if u.scheme not in ('http','https') or not u.netloc or u.username or u.password:return None
        return urlunsplit((u.scheme,u.netloc,u.path,u.query,u.fragment))
    except ValueError:return None

def canonical_url(value):
    u=safe_url(value)
    if not u:return None
    p=urlsplit(u)
    return urlunsplit((p.scheme,p.netloc.lower(),p.path,p.query,''))

def subset(value,keys):return {k:value[k] for k in keys if k in value}

def source_record(source):
    u=safe_url(source.get('url') or source.get('sourceUrl'))
    if not u:return None
    return {'url':u,'canonicalUrl':canonical_url(u),'title':clean(source.get('title'),300),
            'via':clean(source.get('via') or 'recorded_source',80)}

def request_record(value,kind,round_number,ordinal=0):
    request_id=clean(value.get('requestId'),200) or None
    fields=['phase','model','elapsedMs','prompt_tokens','completion_tokens','total_tokens','reasoning_tokens',
            'reasoningEnabled','reasoningObserved','renderedImageProvided','referenceImagesProvided','finishReason','server_tool_use']
    item={'kind':kind,'round':round_number,'requestId':request_id,**subset(value,fields)}
    # Ordinal is a local evidence locator, never a fabricated upstream request ID.
    if not request_id:item['localEvidenceOrdinal']=ordinal
    return item

def tool_call(value):
    action=value.get('action') or {}
    return {'id':clean(value.get('id'),160),'type':clean(value.get('type'),80),'kind':clean(value.get('kind'),80),
            'status':clean(value.get('status'),80),'action':{'type':clean(action.get('type'),80),
            'queries':[clean(q,1500) for q in action.get('queries',[]) if isinstance(q,str)]},
            'sourceUrls':[u for u in map(safe_url,value.get('sourceUrls',[])) if u]}

def collection_attempt(value):
    result={**subset(value,['status','bytes','mime','width','height','sha256']),
            'sourceUrl':safe_url(value.get('sourceUrl')),'title':clean(value.get('title'),300)}
    if value.get('imageUrl'):result['imageUrl']=safe_url(value['imageUrl'])
    if value.get('error'):result['error']=clean(value['error'],300)
    if value.get('metadataError'):result['metadataError']=clean(value['metadataError'],300)
    if value.get('license'):result['license']=license_record(value['license'])
    result['imageAttempts']=[{'url':safe_url(x.get('url')),'status':clean(x.get('status'),80),
                              **({'error':clean(x['error'],300)} if x.get('error') else {})} for x in value.get('imageAttempts',[])]
    return result

def license_record(value):
    if not isinstance(value,dict):return None
    result={k:clean(value.get(k),2000) for k in ['name','artist','credit','usageTerms','attributionRequired','source'] if value.get(k) is not None}
    if value.get('url'):result['url']=safe_url(value['url'])
    return result

def semantics_record(value):
    result=subset(value,['id','label','category','role','bbox','palette','lightDirection','description','tags','limitations'])
    for key in ['label','category','lightDirection','description']:
        if key in result:result[key]=clean(result[key],4000)
    for key in ['tags','limitations']:
        if key in result:result[key]=[clean(x,1500) for x in result[key]]
    return result

def image_variant(record):
    u=safe_url(record.get('imageUrl'))
    if not u:return {'kind':'unknown','uncroppedCaptureVerified':False}
    parsed=urlsplit(u);q=parse_qs(parsed.query)
    if q.get('fit')==['crop'] or 'crop' in q or 'rect' in q:
        return {'kind':'source_og_crop','widthParameter':q.get('w',[None])[0],'heightParameter':q.get('h',[None])[0],
                'uncroppedCaptureVerified':False,'note':'Downloaded observation used the source OG crop, not the full original composition.'}
    if parsed.hostname=='images.pexels.com' and 'w' in q and 'h' not in q:
        return {'kind':'proportional_source_resize','widthParameter':q['w'][0],'uncroppedCaptureVerified':False,
                'note':'No crop/forced-height URL parameter; photographer-original composition is not independently verified.'}
    if parsed.hostname=='thumb.wikimedia.org' or '/thumb/' in parsed.path:
        return {'kind':'public_thumbnail','uncroppedCaptureVerified':False}
    return {'kind':'source_raster_or_unknown','uncroppedCaptureVerified':False}

def download_record(value):
    r={**subset(value,['id','round','status','sha256','bytes','mime','file','topic']),
       'sourceUrl':safe_url(value.get('sourceUrl')),'imageUrl':safe_url(value.get('imageUrl')),
       'title':clean(value.get('title'),350),'downloadedSize':[value.get('width'),value.get('height')],
       'variant':image_variant(value),'licenseStatus':clean(value.get('licenseStatus') or 'source terms require verification',300)}
    if value.get('license'):r['license']=license_record(value['license'])
    if isinstance(value.get('original'),dict):r['sourceReportedOriginal']=subset(value['original'],['url','width','height','bytes'])
    file=ROOT/str(value.get('file') or '')
    if file.is_file() and file.is_relative_to(ROOT):
        data=file.read_bytes();digest=hashlib.sha256(data).hexdigest()
        r['integrity']={'filePresent':True,'bytes':len(data),'sha256Verified':digest==value.get('sha256')}
    else:r['integrity']={'filePresent':False,'sha256Verified':False}
    return r

def fit_record(value,scope,semantic_map):
    identity=value.get('assetId') or value.get('id')
    source_id=value.get('sourceId') or (identity[:-7] if str(identity).endswith('.object') else identity)
    r={**subset(value,['id','assetId','status','round','topic','title','sourceFile','sourceSHA256',
         'normalizedRGBA_SHA256','dHash64','originalSize','orientedSize','fittedSize','pixelToGaussianRatio',
         'assetBytes','sourceRGBEmbedded','losslessResidualEmbedded','independentlyRenderedFromExportOnly',
         'metrics','fitConfig','elapsedSeconds','passedPilot','passedHighFidelity','licenseStatus','notes',
         'canonicalAssetId','reason','error','dHashDistance','thumbnailRGB_RMSE']),
       'sourceId':source_id,'representationScope':scope,'sourceUrl':safe_url(value.get('sourceUrl')),
       'imageUrl':safe_url(value.get('imageUrl'))}
    r['assetId']=identity
    r['gaussianCount']=value.get('gaussians') or value.get('gaussianCount') or 0
    for key in ['assetURL','renderURL','reportURL','referenceURL','referenceThumbnailURL']:
        if value.get(key):r[key]=clean(value[key],1000)
    sem=value.get('semantics') or semantic_map.get(source_id)
    if sem:
        r['semantics']=semantics_record(sem);r['label']=clean(sem.get('label'),200);r['tags']=[clean(x,100) for x in sem.get('tags',[])];r['description']=clean(sem.get('description'),4000)
    else:r['label']=clean(value.get('title') or identity,300)
    r['semanticObjectExtraction']=scope=='semantic_object'
    if value.get('segmentation'):
        seg=value['segmentation'];r['segmentation']=subset(seg,['method','normalizedBBox','proposalPixels','cropPixels','workingSize','foregroundPixels','pixelMaskVerified','reviewedCorrections','reviewedContour','coverageProvenance','edgeColour','extractedFile'])
    fit=value.get('fit') or {}
    r['optimizer']=subset(fit,['iterationsPerStage','initialFraction','seconds','bestCheckpointRule'])
    geo=fit.get('geometryOptimization') or {}
    r['optimizer']['geometryOptimization']=subset(geo,['available','steps','bestFloatMSE','parameters','reason'])
    r['optimizationHistory']=fit.get('history',[])
    return r

def stats(values):
    values=[float(v) for v in values if isinstance(v,(int,float)) and math.isfinite(v)]
    return {'count':len(values),'min':min(values) if values else None,'median':statistics.median(values) if values else None,'max':max(values) if values else None}

def fit_summary(value):
    """Public cards and cross-references; the complete record lives once in fits."""
    return subset(value,['id','assetId','sourceId','round','status','representationScope','label','tags','description',
        'sourceUrl','sourceSHA256','gaussianCount','metrics','passedPilot','passedHighFidelity','assetURL','renderURL',
        'reportURL','referenceURL','referenceThumbnailURL','compositionEligible','visualReviewNotes','imageSpaceSupportHint',
        'error','reason','canonicalAssetId'])

def md(value):return clean(value,300).replace('|','\\|').replace('\n',' ')

def author(record):
    lic=record.get('license') or {}
    if lic.get('artist'):return lic['artist'],'recorded_license_metadata'
    title=record.get('title') or ''
    for pattern in [r'Photo by (.*?) on Pexels',r'Photo de (.*?) sur Pexels',r'Foto de (.*?) no Pexels',r'Pexels 上由 (.*?) 拍攝',r'Pexels 上的 (.*?) 拍摄']:
        match=re.search(pattern,title,re.I)
        if match:return match.group(1),'source_title'
    return '作者未在下载记录中单独核验','unverified'

def main():
    round_docs=[read(p) for p in sorted(INPUT.glob('round_*.json'))]
    semantic_docs=[read(p) for p in sorted(INPUT.glob('semantics_*.json'))]
    frame_doc=read(INPUT/'fits.json',{'fits':[]});object_doc=read(INPUT/'object_fits.json',{'fits':[]})
    catalog_doc=read(ROOT/'web/assets/v08/catalog.json',{'assets':[]})
    catalog_assets=catalog_doc.get('assets',[])
    if isinstance(catalog_assets,dict):catalog_assets=list(catalog_assets.values())
    catalog_map={x['id']:x for x in catalog_assets}
    semantic_map={};semantic_requests={};semantic_batches=[]
    for doc in semantic_docs:
        round_no=doc.get('round')
        for item in doc.get('items',[]):semantic_map[item['id']]=semantics_record(item)
        for batch_index,batch in enumerate(doc.get('batches',[])):
            rows=[]
            for ordinal,request in enumerate((batch.get('usage') or {}).get('requests',[])):
                r=request_record(request,'visual_semantics',round_no,ordinal)
                key=r['requestId'] or f'{round_no}:semantics:{batch_index}:{ordinal}'
                semantic_requests[key]=r;rows.append(r)
            semantic_batches.append({'round':round_no,'batch':batch_index,'ok':batch.get('ok') is True,
                'error':subset(batch.get('error') or {},['code','message']),
                'submittedImages':[{**subset(x,['id','sha256','submittedToVision']),'sourceUrl':safe_url(x.get('sourceUrl'))} for x in batch.get('images',[])],
                'sharedFeatures':[clean(x,1500) for x in batch.get('sharedFeatures',[])],
                'missingEvidence':[clean(x,1500) for x in batch.get('missingEvidence',[])],
                'requests':rows,'modelWeightsUpdated':False,'pixelFitPerformed':False})
    native_requests={};direct_requests=[];source_map={};downloads={};rounds=[];all_source_attempts=[]
    for doc in round_docs:
        n=doc.get('round') or (doc.get('checkpoint') or {}).get('round')
        variants=[('prior_attempt',i,x) for i,x in enumerate(doc.get('previousAttempts',[]))]+[('latest_round_snapshot',len(doc.get('previousAttempts',[])),doc)]
        attempts=[];round_source={};round_requests={}
        for label,ordinal,data in variants:
            cp=data.get('checkpoint') or {};research=data.get('research') or {};collection=data.get('collection') or {}
            src=[]
            for source in data.get('sources',[]) or research.get('sources',[]):
                s=source_record(source)
                if s:
                    source_map.setdefault(s['canonicalUrl'],s);round_source.setdefault(s['canonicalUrl'],s);src.append(s)
            rows=[]
            for request_index,request in enumerate((data.get('usage') or {}).get('requests',[])):
                r=request_record(request,'native_search_provider',n,request_index)
                key=r['requestId'] or f'{n}:{label}:{ordinal}:{request_index}'
                if key not in round_requests:rows.append(r)
                native_requests[key]=r;round_requests[key]=r
            collected=[collection_attempt(x) for x in collection.get('attempts',[])];all_source_attempts.extend(collected)
            attempts.append({'kind':label,'ordinal':ordinal,'checkpoint':subset(cp,['status','completedAt','runId','queries','requestIds','sourceCount','newSourceCount','candidateCount']),
                 'recordedDownloadCount':collection.get('downloadedCount',cp.get('downloadedImageCount',0)),
                 'snapshotListsMayBeCumulative':True,'requestsScope':'new request IDs first appearing in this round snapshot',
                 'sourceEvidenceScope':'recorded source snapshot; exact tool-call source URLs are listed separately',
                 'sources':src,'requests':rows,'collectionAttempts':collected,
                 'toolCalls':[tool_call(x) for x in research.get('toolCalls',[])],
                 'semanticPlan':data.get('semanticPlan'),'warnings':[clean(x,1500) for x in data.get('warnings',[])]})
            for item in data.get('downloads',[]):
                if item.get('status')=='downloaded' and re.fullmatch('[a-fA-F0-9]{64}',item.get('sha256','')):
                    downloads[item['sha256']]=download_record(item)
        recovery=doc.get('directRecovery') or {}
        direct=[]
        for i,call in enumerate(recovery.get('calls',[])):
            entry={'kind':'direct_search_api','round':n,'localEvidenceOrdinal':i,'requestId':clean(call.get('requestId'),200) or None,
                   'query':clean(call.get('query'),2000),'ok':call.get('ok') is True,'elapsedMs':call.get('elapsedMs'),
                   'resultCount':len(call.get('results',[])),'tokenUsageReported':False,
                   'results':[s for s in (source_record({**v,'via':'direct_search_api'}) for v in call.get('results',[])) if s]}
            direct_requests.append(entry);direct.append(entry)
            for value in call.get('results',[]):
                s=source_record({**value,'via':'direct_search_api'})
                if s:source_map.setdefault(s['canonicalUrl'],s);round_source.setdefault(s['canonicalUrl'],s)
        if recovery:
            collected=[collection_attempt(x) for x in (recovery.get('collection') or {}).get('attempts',[])];all_source_attempts.extend(collected)
            attempts.append({'kind':'direct_search_recovery','reason':clean(recovery.get('reason'),1500),'requests':direct,
                             'recordedDownloadCount':sum(x.get('status')=='downloaded' for x in collected),'collectionAttempts':collected})
        cp=doc.get('checkpoint') or {}
        rdls=[r for r in downloads.values() if r.get('round')==n]
        rounds.append({'round':n,'query':clean(doc.get('query') or cp.get('topic'),300),'topic':clean(cp.get('topic'),300),
                       'subtopic':clean(cp.get('subtopic'),2000),'status':cp.get('status'),'ok':doc.get('ok') is True,
                       'checkpoint':{**subset(cp,['sessionId','round','topic','subtopic','status','completedAt','runId']),
                         'sourceCount':len(round_source),'downloadedImageCount':len(rdls),'fittedFunctionCount':0,
                         'requestIds':[x['requestId'] for x in round_requests.values() if x.get('requestId')],
                         'nativeProviderRequests':len(round_requests),'directSearchRequests':len(direct)},
                       'attemptCount':len(attempts),'attempts':attempts,'sources':list(round_source.values())})
    download_list=sorted(downloads.values(),key=lambda x:(x.get('round',0),x.get('id','')))
    ids={x['id'] for x in download_list}
    frames=[fit_record(x,'full_frame',semantic_map) for x in frame_doc.get('fits',[])]
    objects=[fit_record(x,'semantic_object',semantic_map) for x in object_doc.get('fits',[])]
    known_frame={x.get('sourceId') for x in frames}
    for d in download_list:
        if d['id'] not in known_frame:frames.append({'id':d['id'],'assetId':d['id'],'sourceId':d['id'],'round':d.get('round'),'status':'pending','representationScope':'full_frame','sourceUrl':d['sourceUrl'],'sourceSHA256':d['sha256'],'label':semantic_map.get(d['id'],{}).get('label') or d['title']})
    fits=frames+objects;assets=[r for r in fits if r.get('status')=='fitted']
    for fit in fits:
        meta=catalog_map.get(fit.get('assetId'),{})
        fit.update(subset(meta,['compositionEligible','visualReviewNotes','imageSpaceSupportHint']))
        if fit.get('status')=='fitted':
            fit['artifactPresence']={k:bool(fit.get(k) and (ROOT/'web'/fit[k]).is_file()) for k in ['assetURL','renderURL','reportURL','referenceURL']}
    for r in rounds:
        n=r['round'];rf=[x for x in fits if x.get('round')==n];r['fits']=[fit_summary(x) for x in rf]
        r['checkpoint']['fittedFunctionCount']=sum(x.get('status')=='fitted' for x in rf)
        r['checkpoint']['fullFrameFits']=sum(x.get('status')=='fitted' and x['representationScope']=='full_frame' for x in rf)
        r['checkpoint']['objectFits']=sum(x.get('status')=='fitted' and x['representationScope']=='semantic_object' for x in rf)
        r['checkpoint']['visuallyDescribedImages']=sum(x['id'] in semantic_map for x in download_list if x.get('round')==n)
        r['semanticBatches']=[b for b in semantic_batches if b['round']==n]
    downloaded_ids=set(ids);full_success=[x for x in frames if x.get('status')=='fitted'];object_success=[x for x in objects if x.get('status')=='fitted']
    manual=[x for x in object_success if (x.get('segmentation') or {}).get('reviewedCorrections')]
    object_candidates={k:v for k,v in semantic_map.items() if k in downloaded_ids and v.get('role')=='object'}
    recorded_object_sources={x.get('sourceId') for x in objects}
    unextracted=[{'sourceId':k,'label':v.get('label'),'role':v.get('role'),'bbox':v.get('bbox'),
                  'status':'candidate_not_extracted','reason':'Visual semantics proposed an object or object group; this source has no object-fitting record.'}
                 for k,v in object_candidates.items() if k not in recorded_object_sources]
    variants={kind:sum(d['variant']['kind']==kind for d in download_list) for kind in sorted({d['variant']['kind'] for d in download_list})}
    counts={'requestedRounds':10,'completedSearchRounds':len({r['round'] for r in rounds if r['status']=='searched'}),
        'recordedRoundAttempts':sum(r['attemptCount'] for r in rounds),'nativeSearchProviderRequests':len(native_requests),
        'directSearchAPIRequests':len(direct_requests),'totalSearchProviderRequests':len(native_requests)+len(direct_requests),
        'semanticProviderRequests':len(semantic_requests),'totalProviderRequests':len(native_requests)+len(direct_requests)+len(semantic_requests),
        'learningProviderRequests':len(native_requests)+len(direct_requests)+len(semantic_requests),
        'distinctSourcePages':len(source_map),'downloadedDistinctImages':len(download_list),
        'visuallyDescribedImages':len(downloaded_ids.intersection(semantic_map)),
        'pendingSemanticImages':len(downloaded_ids.difference(semantic_map)),
        'fullFrameFittedFunctions':len(full_success),'objectFittedFunctions':len(object_success),'fittedFunctions':len(assets),
        'pendingFullFrameFits':sum(x.get('status')=='pending' for x in frames),
        'failedFullFrameFits':sum(x.get('status')=='failed' for x in frames),'duplicateFullFrameObservations':sum(x.get('status')=='duplicate' for x in frames),
        'failedObjectFits':sum(x.get('status')=='failed' for x in objects),'pendingObjectFits':object_doc.get('pendingCount',0),
        'semanticObjectCandidates':len(object_candidates),'candidateNotExtracted':len(unextracted),
        'compositionEligibleObjectFunctions':sum(x.get('compositionEligible') is True for x in object_success),
        'catalogAssets':len(catalog_assets),
        'verifiedDownloadFiles':sum(x['integrity']['sha256Verified'] for x in download_list),
        'missingOrMismatchedDownloadFiles':sum(not x['integrity']['sha256Verified'] for x in download_list),
        'missingFitArtifacts':sum(not present for x in assets for present in x.get('artifactPresence',{}).values()),
        'manuallyCorrectedObjectFunctions':len(manual),'collectionAttempts':len(all_source_attempts),
        'failedCollectionAttempts':sum(x.get('status')!='downloaded' for x in all_source_attempts),'downloadVariants':variants}
    quality={}
    for scope,rows in [('full_frame',full_success),('semantic_object',object_success)]:
        quality[scope]={'fittedCount':len(rows),'pilotPassed':sum(x.get('passedPilot') is True for x in rows),
            'highFidelityPassed':sum(x.get('passedHighFidelity') is True for x in rows),
            'psnr':stats((x.get('metrics') or {}).get('psnr') for x in rows),
            'ssim':stats((x.get('metrics') or {}).get('ssim') for x in rows),
            'mae':stats((x.get('metrics') or {}).get('mae') for x in rows),
            'lowQualityFitsRetained':True}
    errors={}
    for x in all_source_attempts:
        if x.get('error'):errors[x['error']]=errors.get(x['error'],0)+1
    now=datetime.now(timezone.utc).isoformat()
    record={'schema':'crf.learning_evidence.v0.8','version':'0.8.0','generatedAt':now,
       'counts':counts,'summary':{'roundsCompleted':counts['completedSearchRounds'],'uniqueSources':counts['distinctSourcePages'],
           'downloadedImages':counts['downloadedDistinctImages'],'visuallyDescribedImages':counts['visuallyDescribedImages'],
           'fittedAssets':counts['fittedFunctions'],'text':f"{counts['completedSearchRounds']} 轮真实检索，{counts['nativeSearchProviderRequests']} 次原生模型检索请求 + {counts['directSearchAPIRequests']} 次直接搜索接口；{counts['downloadedDistinctImages']} 份不同下载字节，{counts['visuallyDescribedImages']} 张实际视觉描述，{len(full_success)} 个整图函数 + {len(object_success)} 个对象函数。"},
       'rounds':rounds,'sources':list(source_map.values()),'downloads':download_list,'semantics':[semantic_map[k] for k in sorted(semantic_map)],
       'semanticBatches':semantic_batches,'assets':[fit_summary(x) for x in assets],'fits':fits,
       'fullFrameFits':[fit_summary(x) for x in frames],'objectFits':[fit_summary(x) for x in objects],
       'unextractedObjectCandidates':unextracted,
       'quality':quality,'manuallyCorrectedObjects':[{'assetId':x['assetId'],'sourceId':x['sourceId'],'label':x.get('label'),'segmentation':x['segmentation']} for x in manual],
       'sourceFailureCounts':errors,'requests':{'nativeSearch':list(native_requests.values()),'directSearch':direct_requests,'semantic':list(semantic_requests.values())},
       'usage':{'knownSearchTokens':sum(int(x.get('total_tokens') or 0) for x in native_requests.values()),
                'knownSemanticTokens':sum(int(x.get('total_tokens') or 0) for x in semantic_requests.values()),
                'directSearchTokenUsage':None,'reasoningTextPersisted':False},
       'providerCountScope':'Learning only: native research, direct source search and visual semantics. Excludes scene composition, critique, revision and later polish requests.',
       'modelWeightsUpdated':False,'sourceRGBEmbeddedInFunctions':False,
       'metricScope':'Declared EXIF-corrected resized/cropped observations. Downloaded dimensions are not necessarily photographer-original dimensions. Object metrics use inferred alpha, not a ground-truth segmentation.',
       'countingNotes':['Ten logical rounds are separate from native model requests, direct Search API calls and source-download attempts.',
          'Download count is distinct SHA-256 byte sequences, not an independently verified count of unique photographic works.',
          'The first collection includes OG crops; crop parameters are preserved per observation. New proportional downloads are not retroactively substituted.',
          'All fitted functions are listed even when pilot or high-fidelity gates fail. Full-frame functions are not counted as segmented objects.',
          'pendingObjectFits refers to jobs already recorded by the object-fitting manifest. candidateNotExtracted separately counts visual object proposals that were never extracted or fitted.',
          'An object proposal may contain a group or a bowl with fruit; the label object does not certify isolated single-object geometry.',
          'Source lists in round snapshots can accumulate earlier and direct-search discoveries. Per-tool source URLs and direct-search result lists preserve their narrower provenance.',
          'The provider-request total covers learning only; image composition and critique requests are recorded by the generation evidence.',
          'Two cup contours and one vase chroma constraint were manually reviewed; inferred alpha remains unverified against ground truth.',
          'No upstream request ID is invented for direct Search API responses that supplied none.'],
       'fullObservationPipelineComplete':counts['completedSearchRounds']==10 and counts['pendingSemanticImages']==0 and counts['pendingFullFrameFits']==0 and counts['failedFullFrameFits']==0,
       'objectExtractionComplete':not unextracted and counts['failedObjectFits']==0 and counts['pendingObjectFits']==0,
       'complete':counts['completedSearchRounds']==10 and counts['pendingSemanticImages']==0 and counts['pendingFullFrameFits']==0 and counts['failedFullFrameFits']==0 and not unextracted and counts['failedObjectFits']==0 and counts['pendingObjectFits']==0,
       'completionScope':'Recorded observation-learning and proposed-object extraction stages only; completion never implies that image-quality gates passed.',
       'inputs':INPUT_DIGESTS}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    text=json.dumps(record,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    assert 'data:image/' not in text and 'reasoning_content' not in text and not re.search(r'sk-[A-Za-z0-9_-]{12,}',text)
    pending=OUTPUT.with_name(OUTPUT.name+'.pending');pending.write_text(text);pending.replace(OUTPUT)
    write_sources(record)
    update_readme(record)
    print(json.dumps({'output':str(OUTPUT.relative_to(ROOT)),'counts':counts,'complete':record['complete'],'quality':quality},ensure_ascii=False))

def write_sources(record):
    c=record['counts'];lines=['# CRF 0.8 参考来源与处理记录','',
      '本表从真实下载与学习记录生成。来源 URL 是照片详情页，SHA-256 标识实际下载字节；不会将搜索命中、未下载照片或原图的重复裁切伪装成新的独立作品。',
      '',f"构建快照：{c['completedSearchRounds']} 个逻辑检索轮次，{c['nativeSearchProviderRequests']} 次原生模型检索请求、{c['directSearchAPIRequests']} 次直接 Search API 请求；{c['downloadedDistinctImages']} 份按字节哈希去重的图像，{c['visuallyDescribedImages']} 张已实际提交视觉描述。",'',
      f"另有 {c['semanticProviderRequests']} 次真实图像语义请求，合计 {c['learningProviderRequests']} 次**学习阶段**提供方请求。该数字不包含后续构图、图像评阅、修订或打磨调用；这些调用以生成案例的独立记录为准。",'',
      '完整 SHA-256、来源页、检索请求、失败尝试、图像尺寸、视觉语义及拟合指标见 [learning.json](../../web/assets/v08/learning.json)。各来源的许可仍需以详情页和保留的许可字段为准；平台名称本身不是逐图许可证核验。',
      '', '## 下载、裁切与拟合的区别','',
      f"当前下载变体分布：`{json.dumps(c['downloadVariants'],ensure_ascii=False)}`。`source_og_crop` 表示实际使用了来源页 OG 裁切图；它保留原请求，不称作摄影者未裁切原片。表内尺寸是已下载图的解码尺寸。随后拟合的缩放/裁切尺寸在每个函数报告中单独记录。",'',
      'Commons 文件可通过公开 imageinfo API 提取许可与作者；只有实际记录存在时才在表中标作已记录。Pexels 作者名优先从实际搜索返回的照片标题摘取，并标明这一来源。无法确认的作者和许可保持未核验状态。', '',
      '## 实际收集的参考','',
      '| 轮次 / 图像 ID | 语义标签 | 作者与记录依据 | 来源 / 许可记录 | 下载尺寸与变体 | SHA-256 前缀 |',
      '| --- | --- | --- | --- | --- | --- |']
    semantics={x['id']:x for x in record['semantics']}
    for d in record['downloads']:
        name,basis=author(d);lic=d.get('license') or {};license_text=lic.get('name') or '逐图许可待核验'
        label=semantics.get(d['id'],{}).get('label') or d.get('title') or '语义提取待完成'
        source=f"[照片详情]({d['sourceUrl']})" if d.get('sourceUrl') else '来源未提供'
        size=' × '.join(str(x) for x in d['downloadedSize'])
        lines.append(f"| {d.get('round')} · `{d['id']}` | {md(label)} | {md(name)}（{basis}） | {source}；{md(license_text)} | {size}；`{d['variant']['kind']}` | `{d['sha256'][:16]}` |")
    lines += ['', '## 对象分割的人工辅助','',
       '以下对象不能被描述为完全自动学习得到的精确 alpha。它们先由视觉估计框与 GrabCut 提取，再经过记录中的人工审阅修正；边缘仍属于推断覆盖率。','']
    for obj in record['manuallyCorrectedObjects']:
        lines.append(f"- `{obj['assetId']}`（{md(obj.get('label'))}）："+'；'.join(md(x) for x in obj['segmentation'].get('reviewedCorrections',[])))
    lines += ['', '## 失败与质量结果','',
       f"保留 {c['failedCollectionAttempts']} 条未成功来源尝试，错误分布为 `{json.dumps(record['sourceFailureCounts'],ensure_ascii=False)}`。返回 401/403 的来源停止使用；补齐检索记录为同一逻辑轮的追加尝试。",'',
       f"全图已拟合 {c['fullFrameFittedFunctions']} 个，对象已拟合 {c['objectFittedFunctions']} 个；拟合成功不等于质量门槛通过。所有低质量结果仍保留在 ledger 中。全图待拟合 {c['pendingFullFrameFits']}，待视觉描述 {c['pendingSemanticImages']}。",'',
       f"视觉语义共提出 {c['semanticObjectCandidates']} 个对象或对象组候选，其中 {c['candidateNotExtracted']} 个尚未提取。对象拟合清单中的 pending={c['pendingObjectFits']} 只指已经登记的作业，不会把尚未进入提取阶段的候选算成完成。目录中明确允许用于组合的对象函数有 {c['compositionEligibleObjectFunctions']} 个；此许可不代表其物理接地或轮廓已由真值验证。",'',
       f"构建时重新检查了 {c['verifiedDownloadFiles']} 份下载文件的 SHA-256；缺失或哈希不符 {c['missingOrMismatchedDownloadFiles']} 份，已拟合资产所需文件缺失 {c['missingFitArtifacts']} 个。",'',
       '尚未提取的候选：'+'；'.join(f"`{x['sourceId']}`（{md(x['label'])}）" for x in record['unextractedObjectCandidates']) if record['unextractedObjectCandidates'] else '所有已提出的对象候选均有提取记录。','',
       '原始红绿灯街景来自用户提供的参考照片；旧版已保留案例沿用既有来源记录，不混入本次网络学习的下载计数。', '',
       '## 重建本文件','',
       '```sh','python scripts/build_v08_learning_report.py','```','',
       '脚本不调用模型、不下载图片，只从已有证据重新生成发布快照、来源表与 README 数量。']
    DOCS.mkdir(parents=True,exist_ok=True);(DOCS/'SOURCES.md').write_text('\n'.join(lines)+'\n')

def update_readme(record):
    p=DOCS/'README_0_8.md'
    if not p.exists():return
    s=p.read_text();c=record['counts']
    block='\n'.join(['<!-- LEARNING_SNAPSHOT_START -->','## 当前发布快照','',
       f"本段由证据构建脚本生成：**{c['completedSearchRounds']} 轮真实检索**，对应 **{c['nativeSearchProviderRequests']} 次原生模型检索请求 + {c['directSearchAPIRequests']} 次直接 Search API 请求**，并非把重试凑成新轮次。",'',
       f"现有 **{c['downloadedDistinctImages']} 份按 SHA-256 去重的下载图像**，**{c['visuallyDescribedImages']} 张真实图像语义描述**，**{c['fullFrameFittedFunctions']} 个整图高斯函数 + {c['objectFittedFunctions']} 个对象函数**。待视觉描述 {c['pendingSemanticImages']} 张，待整图拟合 {c['pendingFullFrameFits']} 张；这些待完成项不会计入已完成数量。",'',
       f"视觉提出 {c['semanticObjectCandidates']} 个对象或对象组候选，其中 **{c['candidateNotExtracted']} 个尚未提取**。对象拟合作业 pending={c['pendingObjectFits']} 不含这些未开始候选。目录当前允许用于组合的对象函数为 {c['compositionEligibleObjectFunctions']} 个；这不是对遮挡、接触或物理光照的验收。",'',
       f"图像语义阶段另调用 {c['semanticProviderRequests']} 次模型；**{c['learningProviderRequests']} 次请求总数仅涵盖学习阶段**，不包含生成案例的构图、评阅、修订与后续打磨。生成案例每轮实际请求以各案例记录为准。",'',
       f"已记录 {c['manuallyCorrectedObjectFunctions']} 个经过人工审阅修正的对象函数。下载中有 {c['downloadVariants'].get('source_og_crop',0)} 张采用来源页 OG 裁切，因此不能统称为未裁切原片。所有未达质量门槛的拟合结果仍公开保留。",'',
       '参见 [来源与处理记录](SOURCES.md) 和 [完整学习 ledger](../../web/assets/v08/learning.json)。运行 `python scripts/build_v08_learning_report.py` 可根据最新检查点更新本段。','<!-- LEARNING_SNAPSHOT_END -->'])
    if '<!-- LEARNING_SNAPSHOT_START -->' in s:s=re.sub(r'<!-- LEARNING_SNAPSHOT_START -->[\s\S]*?<!-- LEARNING_SNAPSHOT_END -->',lambda _:block,s)
    else:s=s.replace('## 从哪里使用',block+'\n\n## 从哪里使用',1)
    p.write_text(s)

if __name__=='__main__':main()
