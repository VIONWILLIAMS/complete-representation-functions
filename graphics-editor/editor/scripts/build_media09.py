#!/usr/bin/env python3
"""Render three actual published CRF jobs into 5 s / 1080p camera studies.

Uses the same offline evaluator as the editor, never an image or language API.
Source frames stay outside the published tree. Measured adjacent-frame changes
are motion/aliasing diagnostics, not evidence of recovered 3D or absence of flicker.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
SELECTED=['01_ivory_facade','04_cold_alpine','08_three_fruits']
FPS=24
FRAMES=120
WIDTH=1920
HEIGHT=1080

def read(path):return json.loads(path.read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
def webpath(url):
    if not isinstance(url,str) or '://' in url:raise ValueError('Local published dependency required')
    p=(WEB/url.lstrip('/')).resolve()
    if not p.is_relative_to(WEB):raise ValueError('Dependency outside web root')
    return p
def run(command,timeout=600):
    result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError(f'{Path(command[0]).name} failed: '+result.stderr[-1800:])
    return result
def render(command,timeout=1800):
    # CLI progress every 12 frames is forwarded instead of hiding a long job.
    with subprocess.Popen(command,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT) as proc:
        expired=threading.Event()
        def expire():
            expired.set()
            try:proc.kill()
            except ProcessLookupError:pass
        watchdog=threading.Timer(timeout,expire);watchdog.daemon=True;watchdog.start()
        try:
            for line in proc.stdout:print(line.rstrip(),flush=True)
            code=proc.wait()
        finally:watchdog.cancel()
        if expired.is_set():raise RuntimeError('Offline frame rendering timeout')
        if code:raise RuntimeError('Offline evaluator failed')
def expected_camera(base,t):
    u=max(0,min(1,t/5));s=u*u*(3-2*u)
    return {'panX':max(-.12,min(.12,base.get('panX',0)+.056*s)),
            'panY':max(-.12,min(.12,base.get('panY',0)-.008*s)),
            'zoom':max(.8,min(1.3,base.get('zoom',1)*(1+.065*s)))}
def inspect_frames(directory,scene,source_hashes):
    trajectory=read(directory/'trajectory.json');records=trajectory.get('reports',[])
    if len(records)!=FRAMES:raise RuntimeError('Expected exactly 120 trajectory records')
    actual_pngs=sorted(directory.glob('[0-9][0-9][0-9][0-9].png'))
    if len(actual_pngs)!=FRAMES:raise RuntimeError('Expected exactly 120 actual frame PNGs')
    scale=min(WIDTH/scene['width'],HEIGHT/scene['height']);vw=round(scene['width']*scale);vh=round(scene['height']*scale)
    vx=(WIDTH-vw)//2;vy=(HEIGHT-vh)//2
    expected_viewport={'x':vx,'y':vy,'width':vw,'height':vh}
    previous=None;deltas=[];border=16;all_hashes=[];path_errors=[]
    for i,record in enumerate(records):
        if record.get('engineSourceSHA256')!=source_hashes['web/crf-generative09.js']:
            raise RuntimeError('Frame engine source hash changed during rendering')
        viewport=record.get('viewport',{})
        if viewport.get('fit')!='contain' or any(viewport.get(k)!=v for k,v in expected_viewport.items()):
            raise RuntimeError('Frame viewport does not preserve native aspect ratio')
        if record.get('frame')!=i or abs(record.get('time',-1)-i/FPS)>1e-12:
            raise RuntimeError('Incorrect frame timestamps')
        expected=expected_camera(scene.get('camera',{}),i/FPS)
        camera=record.get('camera',{})
        if any(abs(camera.get(k,float('inf'))-v)>1e-12 for k,v in expected.items()):
            path_errors.append(i)
        p=directory/f'{i:04d}.png'
        with Image.open(p) as im:
            if im.size!=(WIDTH,HEIGHT):raise RuntimeError('Incorrect source frame dimensions')
            rgba=im.convert('RGBA');pixel_hash=sha(rgba.tobytes());a=np.asarray(rgba,dtype=np.uint8)[...,:3].copy()
            pixels=np.asarray(rgba,dtype=np.uint8)
            for margin in [pixels[:vy],pixels[vy+vh:],pixels[vy:vy+vh,:vx],pixels[vy:vy+vh,vx+vw:]]:
                if margin.size and (np.any(margin[...,:3]!=0) or np.any(margin[...,3]!=255)):
                    raise RuntimeError('Video padding must be opaque black')
        if pixel_hash!=record['rgbaSHA256']:raise RuntimeError('Frame pixels do not match trajectory record')
        if sha(p.read_bytes())!=record['pngSHA256']:raise RuntimeError('Frame PNG does not match trajectory record')
        all_hashes.append(pixel_hash)
        if previous is not None:
            delta=np.abs(a.astype(np.int16)-previous.astype(np.int16))
            content=delta[vy:vy+vh,vx:vx+vw]
            edge_sum=int(content[:border].sum())+int(content[-border:].sum())+int(content[border:-border,:border].sum())+int(content[border:-border,-border:].sum())
            edge_count=(2*border*vw+2*border*(vh-2*border))*3
            deltas.append({'from':i-1,'to':i,'meanRGBByteChange':float(delta.mean()),
                           'contentMeanRGBByteChange':float(content.mean()),
                           'borderMeanRGBByteChange':edge_sum/edge_count,'maxRGBByteChange':int(delta.max()),
                           'pixelsWithAnyChannelChangeAbove32':float((delta.max(axis=2)>32).mean())})
        previous=a
    if path_errors:raise RuntimeError('Actual renderer camera differs from the frozen trajectory: '+str(path_errors))
    frame_values=[x['meanRGBByteChange'] for x in deltas]
    border_values=[x['borderMeanRGBByteChange'] for x in deltas]
    return {'sourceFrameCount':len(actual_pngs),'sourceFramesAllDecoded':True,
            'viewport':{'fit':'contain',**expected_viewport,'containerWidth':WIDTH,'containerHeight':HEIGHT,'paddingRGBA':[0,0,0,255]},
            'allSourceFramePaddingVerifiedOpaqueBlack':True,'allFramesPreserveNativeAspectRatio':True,
            'trajectoryAllFramesMatched':True,'allFramePNGAndRGBAHashesVerified':True,
            'uniqueSourceFrameHashes':len(set(all_hashes)),
            'trajectoryFirstCamera':records[0]['camera'],'trajectoryLastCamera':records[-1]['camera'],
            'lastFrameTime':records[-1]['time'],'sourceFrameRGBAHashes':all_hashes,
            'temporalDiagnostic':{'definition':'Absolute RGB byte differences between consecutive uncompressed rendered frames; contains intended camera motion, disocclusion and sampling changes. It is not a motion-compensated flicker score.',
                'borderWidthPixels':border,'borderDomain':'Edge of the native content viewport, excluding black padding.','frameMeanChangeMedian':float(np.median(frame_values)),
                'frameMeanChangeMax':max(frame_values),'borderMeanChangeMedian':float(np.median(border_values)),
                'borderMeanChangeMax':max(border_values),'worstFramePair':max(deltas,key=lambda x:x['meanRGBByteChange']),
                'worstBorderPair':max(deltas,key=lambda x:x['borderMeanRGBByteChange']),'perPair':deltas}}
def encode_video(directory,target,crf):
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(FPS),'-i',str(directory/'%04d.png'),
         '-frames:v',str(FRAMES),'-c:v','libx264','-preset','medium','-crf',str(crf),
         '-maxrate','4M','-bufsize','8M','-vf','scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709',
         '-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1',
         '-an','-movflags','+faststart',str(target)],timeout=900)
    probe=json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-count_frames',
        '-show_entries','stream=codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_read_frames,duration,color_range,color_space,color_transfer,color_primaries:format=duration,size',
        '-of','json',str(target)],timeout=120).stdout)
    stream=probe['streams'][0];duration=float(probe['format']['duration'])
    passed=stream.get('codec_name')=='h264' and stream.get('width')==WIDTH and stream.get('height')==HEIGHT and stream.get('pix_fmt')=='yuv420p' and stream.get('avg_frame_rate')=='24/1' and int(stream.get('nb_read_frames',0))==FRAMES and abs(duration-5)<.001
    if not passed:raise RuntimeError('Encoded video format or complete frame count failed: '+json.dumps(probe))
    run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(target),'-map','0:v:0','-f','null','-'],timeout=180)
    decoded=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(target),'-map','0:v:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,timeout=120)
    if decoded.returncode or len(decoded.stdout)!=WIDTH*HEIGHT*3:raise RuntimeError('First encoded frame RGB decode failed')
    actual=np.frombuffer(decoded.stdout,dtype=np.uint8).reshape(HEIGHT,WIDTH,3)
    with Image.open(directory/'0000.png') as im:reference=np.asarray(im.convert('RGB'),dtype=np.uint8)
    viewport=read(directory/'trajectory.json')['viewport'];x,y,w,h=[viewport[k] for k in ['x','y','width','height']]
    a=actual[y:y+h,x:x+w].astype(np.float32);b=reference[y:y+h,x:x+w].astype(np.float32);delta=a-b
    bx=b-float(b.mean());ay=a-float(a.mean());variance=float(np.mean(bx*bx));slope=float(np.mean(bx*ay))/variance if variance else None
    fidelity={'scope':'Lossy H.264 first decoded frame versus the exact native source frame, only inside the content viewport; black padding excluded.',
        'viewport':viewport,'meanAbsoluteRGBByteError':float(np.abs(delta).mean()),'rootMeanSquareRGBByteError':float(np.sqrt(np.mean(delta*delta))),
        'meanSignedRGBByteError':np.mean(delta,axis=(0,1)).tolist(),'maxAbsoluteRGBByteError':int(np.abs(delta).max()),
        'linearFitDecodedFromSource':{'slope':slope,'intercept':float(a.mean())-slope*float(b.mean()) if slope is not None else None},
        'sourceRGBAHash':read(directory/'trajectory.json')['reports'][0]['rgbaSHA256'],
        'newVisualQualityGateInvented':False,'physicalOrPhotorealismClaim':False}
    tags={k:stream.get(k) for k in ['color_range','color_space','color_transfer','color_primaries']}
    expected_tags={'color_range':'tv','color_space':'bt709','color_transfer':'iec61966-2-1','color_primaries':'bt709'}
    if tags!=expected_tags:raise RuntimeError('Encoded color tags differ from explicit conversion: '+json.dumps(tags))
    return {'formatVerified':True,'allEncodedFramesDecoded':True,'ffprobe':probe,'colorTags':tags,'firstFrameCodecFidelity':fidelity,'bytes':target.stat().st_size,'sha256':sha(target.read_bytes()),'encoding':{'codec':'libx264','preset':'medium','crf':crf,'maxrate':'4M','bufsize':'8M','pixelFormat':'yuv420p','colorConversion':'Full-range gamma-encoded sRGB → BT.709 YCbCr limited range; sRGB transfer retained and tagged. Frame-level setparams metadata is set after conversion as well as encoder flags.','filterDocumentation':'https://ffmpeg.org/ffmpeg-filters.html#setparams','lossless':False}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',default='web/assets/v09/generated/index.json')
    parser.add_argument('--resume',action='store_true',help='Reuse frames only when source, evaluator and requested dimensions match recorded manifest')
    parser.add_argument('--output',default='web/assets/v09/media')
    parser.add_argument('--prepare',nargs='+',choices=SELECTED,help='Pre-render and verify only these fixed cases into the private frame cache; no public media or partial report is published')
    args=parser.parse_args()
    for dependency in ['node','ffmpeg','ffprobe']:
        if not shutil.which(dependency):raise RuntimeError(dependency+' is required')
    index_path=(ROOT/args.index).resolve();index=read(index_path)
    entries={e['id']:e for e in index.get('examples',[])}
    active_ids=list(dict.fromkeys(args.prepare or SELECTED))
    missing=[i for i in active_ids if not entries.get(i,{}).get('sceneUrl') or not entries.get(i,{}).get('imageUrl')]
    if missing:raise RuntimeError('Required real published scenes unavailable: '+', '.join(missing))
    output=(ROOT/args.output).resolve()
    if not output.is_relative_to(WEB):raise ValueError('Published media output must be under web root')
    output.mkdir(parents=True,exist_ok=True)
    run_id=str(index.get('runId','actual-showcase'))
    if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in run_id):raise ValueError('Unsafe run ID')
    temporary=ROOT.parent/'crf09_media'/run_id
    source_hashes={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in [ROOT/'scripts/render_v09.cjs',WEB/'crf-generative09.js']}
    report={'schema':'crf.media_verification.v0.9','runId':run_id,'indexSHA256':sha(index_path.read_bytes()),'selectedIds':SELECTED,
        'format':{'width':WIDTH,'height':HEIGHT,'fps':FPS,'frameCount':FRAMES,'durationSeconds':5,'fit':'contain','nativeViewportFor4by3Scenes':[240,0,1440,1080],'paddingRGBA':[0,0,0,255]},
        'rendererSources':source_hashes,'scope':'Explicit image-plane Gaussian/analytic camera studies from real generated scene programs.',
        'realWorld3DReconstructionVerified':False,'G4PhysicalMultiviewGatePassed':False,
        'qualityCaveat':'Format, exact evaluator inputs, complete frame counts and temporal differences are measured. The camera represents inferred depth-layer parallax; it does not establish ground-truth hidden geometry or photorealism.',
        'results':[]}
    gallery={'schema':'crf.media_gallery.v0.9','runId':run_id,'width':WIDTH,'height':HEIGHT,'fps':FPS,'duration':5,'fit':'contain','paddingRGBA':[0,0,0,255],'scope':'inferred_image_plane_depth_parallax','examples':[]}
    for id in active_ids:
        item=entries[id];scene_path=webpath(item['sceneUrl']);scene=read(scene_path)
        if scene.get('schema')!='crf.generative_scene.v0.9':raise RuntimeError('Expected native generated scene: '+id)
        if 'appearanceModel' not in scene:raise RuntimeError('Published media scene must embed its exact model snapshot, including explicit null: '+id)
        print(json.dumps({'phase':'media_start','id':id}),flush=True)
        directory=temporary/id;directory.mkdir(parents=True,exist_ok=True)
        manifest={'sceneSHA256':sha(scene_path.read_bytes()),'sources':source_hashes,'width':WIDTH,'height':HEIGHT,'frames':FRAMES,'fps':FPS,'fit':'contain','paddingRGBA':[0,0,0,255]}
        existing=read(directory/'input.json') if (directory/'input.json').exists() else None
        reusable=args.resume and existing==manifest and (directory/'trajectory.json').exists() and len(list(directory.glob('[0-9][0-9][0-9][0-9].png')))==FRAMES
        if not reusable:
            for old in directory.glob('[0-9][0-9][0-9][0-9].png'):old.unlink()
            render(['node','scripts/render_v09.cjs','--frames',str(scene_path),str(directory),'--fps','24','--duration','5','--width',str(WIDTH),'--height',str(HEIGHT)])
            write(directory/'input.json',manifest)
        frame_check=inspect_frames(directory,scene,source_hashes)
        if sha(scene_path.read_bytes())!=manifest['sceneSHA256'] or any(sha((ROOT/name).read_bytes())!=digest for name,digest in source_hashes.items()):
            raise RuntimeError('Scene or renderer changed during frame rendering; rerun with frozen inputs')
        if args.prepare:
            write(directory/'preflight.json',{'id':id,'inputs':manifest,**frame_check,'published':False,'qualityGatePassed':False})
            print(json.dumps({'phase':'frame_cache_ready','id':id,'framesVerified':FRAMES,'published':False}),flush=True)
            continue
        target=output/(id+'.mp4');encoding=encode_video(directory,target,21)
        # Use authored scene resolution for three PNG views. No JPEG substitution.
        views_dir=output/'views'/id;views_dir.mkdir(parents=True,exist_ok=True)
        run(['node','scripts/render_v09.cjs','--views',str(scene_path),str(views_dir)],timeout=300)
        view_report=read(views_dir/'views.json');view_hashes=[r['rgbaSHA256'] for r in view_report['reports']]
        if len(set(view_hashes))!=3:raise RuntimeError('The three published views are not distinct: '+id)
        views=[]
        for view in ['left','front','right']:
            p=views_dir/(view+'.png')
            with Image.open(p) as im:
                im.load();size=list(im.size);pixel_hash=sha(im.convert('RGBA').tobytes())
            if pixel_hash!=next(r['rgbaSHA256'] for r in view_report['reports'] if r['view']==view):raise RuntimeError('Published view pixel hash mismatch')
            if view=='front' and item.get('pixelSha256') and pixel_hash!=item['pixelSha256']:raise RuntimeError('Front view no longer matches exact published generated image')
            views.append({'view':view,'url':str(p.relative_to(WEB)),'width':size[0],'height':size[1],'bytes':p.stat().st_size,'rgbaSHA256':pixel_hash,'pngSHA256':sha(p.read_bytes())})
        if sha(scene_path.read_bytes())!=manifest['sceneSHA256'] or any(sha((ROOT/name).read_bytes())!=digest for name,digest in source_hashes.items()):
            raise RuntimeError('Scene or renderer changed during media generation; rerun with the frozen files')
        result={'id':id,'title':item.get('title',id),'sceneUrl':item['sceneUrl'],'sceneSHA256':manifest['sceneSHA256'],
            'sourceGenerationStatus':item.get('status'),'sourceGenerationQualityGate':item.get('qualityGate'),
            'videoUrl':str(target.relative_to(WEB)),**encoding,**frame_check,'views':views}
        report['results'].append(result)
        gallery['examples'].append({'id':id,'title':result['title'],'sceneUrl':item['sceneUrl'],'videoUrl':result['videoUrl'],'posterUrl':next(v['url'] for v in views if v['view']=='front'),'views':views,'viewport':result['viewport'],'realWorld3DReconstructionVerified':False})
        write(ROOT/'reports/v09/media_verification.json',report)
        print(json.dumps({'phase':'media_done','id':id,'videoBytes':encoding['bytes'],'framesVerified':FRAMES}),flush=True)
    if args.prepare:
        print(json.dumps({'status':'private_frame_cache_prepared','ids':active_ids,'frameCount':len(active_ids)*FRAMES,'publicMediaPublished':False,'requiredFinalIds':SELECTED}),flush=True)
        return
    video_bytes=sum(r['bytes'] for r in report['results']);view_bytes=sum(v['bytes'] for r in report['results'] for v in r['views'])
    if video_bytes>10_000_000:
        for result in report['results']:
            target=webpath(result['videoUrl']);result.update(encode_video(temporary/result['id'],target,25))
        video_bytes=sum(r['bytes'] for r in report['results'])
    report['publishedMediaBytes']={'videos':video_bytes,'viewPNGs':view_bytes,'videoLimit':10_000_000,'viewPNGLimit':12_000_000}
    report['formatAndPixelChecksPassed']=True
    report['storageBudgetPassed']=video_bytes<=10_000_000 and view_bytes<=12_000_000
    report['status']='passed_with_scope_limits' if report['storageBudgetPassed'] else 'storage_budget_exceeded'
    write(ROOT/'reports/v09/media_verification.json',report)
    gallery['verificationUrl']=str((output/'verification.json').relative_to(WEB))
    # Public compact report excludes the per-frame bulk but retains summary and hashes.
    compact=json.loads(json.dumps(report))
    for result in compact['results']:
        result.pop('sourceFrameRGBAHashes',None);result['temporalDiagnostic'].pop('perPair',None)
    write(output/'verification.json',compact);write(output/'index.json',gallery)
    print(json.dumps({'status':report['status'],'clips':3,'frames':3*FRAMES,'views':9,'bytes':report['publishedMediaBytes'],'report':'reports/v09/media_verification.json'},ensure_ascii=False),flush=True)
    if not report['storageBudgetPassed']:raise SystemExit(2)

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(json.dumps({'error':str(exc)},ensure_ascii=False),file=sys.stderr);raise SystemExit(1)
