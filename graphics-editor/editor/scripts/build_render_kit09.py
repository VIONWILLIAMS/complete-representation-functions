#!/usr/bin/env python3
"""Package actual published 0.9 editor jobs and independently rerender every one.

No npm installation is necessary in the kit. The canonical renderer uses Node
built-ins. PNG comparison here uses Pillow only in the packaging/QA environment.
Failed index entries remain explicit in the verification report.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web'
def read(path):return json.loads(path.read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def webpath(url):
    if not isinstance(url,str) or '://' in url:raise ValueError('Local relative URL required')
    path=(WEB/url.lstrip('/')).resolve()
    if not path.is_relative_to(WEB):raise ValueError('Web dependency escapes root')
    return path
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',default='web/assets/v09/generated/index.json')
    parser.add_argument('--output',default='web/downloads/CRF_0_9_Render_Kit.zip')
    parser.add_argument('--skip-verification',action='store_true',help='Packaging only, visibly marks independent verification as not run')
    args=parser.parse_args()
    index_path=(ROOT/args.index).resolve();index=read(index_path)
    examples=index.get('examples',index.get('results',[]))
    if not examples:raise RuntimeError('Actual generated index is empty; not packaging placeholder core examples')
    renderable=[e for e in examples if e.get('sceneUrl') and e.get('imageUrl')]
    if not renderable:raise RuntimeError('No actual published generated scene/image pair exists')
    files={}
    def add(path,arc=None):
        path=Path(path);name=arc or str(path.relative_to(ROOT));data=path.read_bytes()
        if path.suffix.lower() in ['.json','.js','.cjs','.mjs','.md','.txt','.py'] and re.search(rb'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}',data):raise ValueError('Possible credential in export: '+name)
        files[name]=data
    for name in ['web/crf-generative09.js','web/crf-boundary09.js','web/crf-gaussian08.js',
                 'scripts/render_v09.cjs','scripts/render_candidates09.cjs','tests/test_media09.cjs','docs/v09/GENERATIVE_CORE.md']:
        add(ROOT/name)
    add(index_path,'web/assets/v09/generated/index.json')
    if (WEB/'assets/v09/shared-appearance.json').exists():add(WEB/'assets/v09/shared-appearance.json')
    context=read(WEB/'assets/v09/street/context.json')
    for url in ['assets/v09/street/context.json',context['baselineAssetUrl'],context['detailAssetUrl']]:add(webpath(url))
    for e in examples:
        if not re.fullmatch(r'[-a-zA-Z0-9_.]+',str(e.get('id',''))):raise ValueError('Unsafe example ID')
        for key in ['sceneUrl','imageUrl','thumbnailUrl','reportUrl']:
            if e.get(key):add(webpath(e[key]))
        if e.get('sceneUrl'):
            scene=read(webpath(e['sceneUrl']))
            if scene.get('schema')=='crf.generative_scene.v0.9' and 'appearanceModel' not in scene:
                raise ValueError('Generated scene must embed its exact model snapshot: '+e['id'])
    candidate_index={'schema':'crf.candidate_index.v0.9','runId':index.get('runId'),'scope':'All actual recorded candidates; original PNGs omitted because exact scene/model programs reproduce them. JPEGs are previews, not pixel fidelity targets.','candidates':[]}
    for e in examples:
        if not re.fullmatch(r'[-a-zA-Z0-9_.]+',str(index.get('runId',''))):raise ValueError('Unsafe generation run ID')
        directory=ROOT/'reports/v09/generation'/index['runId']/e['id']
        if not (directory/'record.json').exists():
            if e in renderable:raise ValueError('Renderable case missing actual candidate record: '+e['id'])
            continue
        record=read(directory/'record.json')
        for name in ['record.json','task_evidence.json']:
            if (directory/name).exists():add(directory/name)
        for candidate in record.get('candidates',[]):
            number=candidate['index']
            if not isinstance(number,int) or not 0<=number<=9:raise ValueError('Invalid candidate index')
            scene_path=directory/f'candidate_{number:02d}.scene.json';jpeg_path=directory/f'candidate_{number:02d}.jpg'
            scene=read(scene_path)
            if 'appearanceModel' not in scene:raise ValueError('Candidate lacks an exact model snapshot')
            add(scene_path);add(jpeg_path)
            candidate_index['candidates'].append({'id':e['id']+f'_candidate_{number:02d}','caseId':e['id'],'candidateIndex':number,'selectedByTask':record.get('selection',{}).get('index')==number,'scenePath':str(scene_path.relative_to(ROOT)),'jpegPath':str(jpeg_path.relative_to(ROOT)),'expectedPixelSha256':candidate.get('render',{}).get('pixelSha256')})
    files['CANDIDATES.json']=(json.dumps(candidate_index,indent=2,ensure_ascii=False)+'\n').encode()
    for name in ['web/downloads/CRF_0_9_Report.md','docs/v09/PROVIDER_API.md','docs/v09/VIDEO_COLOUR.md','web/crf-video09.js','reports/v09/experiment_summary.json','reports/v09/water_capability_diagnostic.json','reports/v09/visual_review.md','reports/v09/media_verification.json','reports/v09/shared_learning.json','reports/v09/generative_core_verification.json','reports/v09/terminal_status.json','reports/v09/boundary/fidelity.json','reports/v09/boundary/controlled_metrics.json','reports/v09/boundary/controlled_validation.json','reports/v09/boundary/runtime.json','web/assets/v09/acceptance.json']:
        if (ROOT/name).exists():add(ROOT/name)
    for path in sorted((ROOT/'reports/v09/browser').glob('*.json')):add(path)
    files['scenes/street_original.json']=(json.dumps({'schema':'crf.editor_project.v0.9','kind':'street','street':{'schema':'crf.street_edit.v0.9','wallColor':None,'wallStrength':.78,'signalVisible':True,'signalOffsetX':0,'signalOffsetY':0,'revision':0},'camera':'front','time':0},indent=2)+'\n').encode()
    for title,patch in [('street_blue',{'wallColor':[72,142,181]}),('street_signal_removed',{'signalVisible':False})]:
        obj=json.loads(files['scenes/street_original.json']);obj['street'].update(patch);files['scenes/'+title+'.json']=(json.dumps(obj,indent=2)+'\n').encode()
    first=renderable[0]['sceneUrl']
    files['package.json']=(json.dumps({'name':'crf-0-9-render-kit','version':'0.9.0-candidate','private':True,'engines':{'node':'>=20'},'description':'Zero-install CRF explicit functions and learned Gaussian fields; independent quality gates disclosed'},indent=2)+'\n').encode()
    files['README.md']=f'''# CRF 图形计算编辑器 0.9 · 离线重绘包

包含真实 DeepSeek 编辑器任务的场景程序、每个场景的精确共享模型快照、成图、来源/调用记录、原街景高斯依赖，以及与编辑器相同的求值器。没有 API 密钥，也不需要联网调用模型即可重绘。

**当前为开发候选。可执行和像素一致性不代表照片级质量验收通过。** 查看索引中每个任务的状态及包内验收记录。失败任务仍保留在索引和统计中。

## 运行要求

Node.js 20 或更新版本。PNG 编码只使用 Node 内置 zlib，不需要 npm install。

```sh
node scripts/render_v09.cjs web/{first} output.png
node scripts/render_v09.cjs --all web/assets/v09/generated/index.json outputs
node scripts/render_v09.cjs scenes/street_original.json street.png
node scripts/render_v09.cjs scenes/street_blue.json street-blue.png
node scripts/render_v09.cjs scenes/street_signal_removed.json street-removed.png
node scripts/render_candidates09.cjs CANDIDATES.json candidate_outputs
```

`web/assets/v09/generated/index.json` 保留全部真实任务。每个生成场景可以由另一个 LLM 修改语义对象、颜色、形态、位置、灯光和相机，然后重新执行。新对象类别需要实际实现对应函数，不可仅写一个名称来假定生成能力存在。

`CANDIDATES.json` 另保留全部实际候选的重绘索引。候选目录包含各自的精确场景／模型快照、JPEG预览、`record.json` 和 `task_evidence.json`；为控制包体，不重复存放候选PNG。上述候选重绘命令会检查实际渲染RGBA是否与原任务记录的哈希一致。预览JPEG为有损图，不作为像素一致性的目标。

## 左、中、右和 5 秒运镜

```sh
node scripts/render_v09.cjs --views web/{first} views
node scripts/render_v09.cjs --frames web/{first} frames --fps 24 --duration 5 --width 1920 --height 1080
ffmpeg -framerate 24 -i frames/%04d.png -frames:v 120 -vf "scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709" -c:v libx264 -preset medium -crf 21 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc iec61966-2-1 -movflags +faststart video.mp4
node --test tests/test_media09.cjs
```

逐帧模式输出120张实际渲染 PNG 与 `trajectory.json`，共5秒、24 FPS。视频容器为1920×1080；本版4:3场景以1440×1080原生求值，置于x=240、y=0，左右填充不透明纯黑，保留物体比例，不拉伸或裁切内容。每帧报告记录实际viewport。相机路径与编辑器一致：`u=t/5; s=u*u*(3-2*u); panX+=.056*s; panY-=.008*s; zoom*=1+.065*s`，左右视图偏移±.042，保留原场景相机。帧 i 的时间为 i/24秒。ffmpeg 仅是可选的外部视频编码器，图片求值器不依赖它。

生成场景的视角是声明范围内的图像平面深度视差与解析推断，未验证为真实世界多视角重建。原街景视角变化是二维图像平面裁切，不能算3D。街景非正面裁切使用确定性CPU双线性采样，浏览器Canvas插值可能有细微差异；正面原尺寸的像素核验单独进行。

MP4使用有损H.264编码，不宣称与源帧逐像素一致。编码显式执行全范围RGB到有限范围BT.709 YCbCr转换，并保留sRGB传递函数标记；`setparams`把颜色信息写入实际帧属性。媒体报告包含ffprobe颜色标签和解码首帧相对源帧内容区的MAE/RMSE，避免仅以帧数作为验收。

## 表示与数据

- 新生成：解析图像平面结构、共享线性照明、采样高斯场、真实学习的高斯系数均值/PCA。渲染器不读取原始照片或贴图。
- 原街景：0.8观测高斯场加显式披露的观测细节系数；严格复现依赖这些已知信息。删除后的墙面由可见语境推断，隐藏真实背景未知。
- 每个生成程序内嵌其确切 `appearanceModel`，优先于工作台后续更新的共享模型，避免重新打开时悄悄改变画面。

`MANIFEST.json` 记录文件大小与SHA-256；`VERIFICATION.json` 记录独立目录解包后的逐项RGB/RGBA核验，失败不会被省略。包内没有Git元数据、运行凭据或训练原图。
'''.encode()
    verification={'schema':'crf.render_kit_verification.v0.9','status':'not_run','indexRunId':index.get('runId'),'totalIndexEntries':len(examples),'renderableCount':len(renderable),'candidateCount':len(candidate_index['candidates']),'failedOrNonRenderable':[{'id':e['id'],'status':e.get('status'),'error':e.get('error')} for e in examples if e not in renderable],'results':[],'runtime':'Node built-ins; no dependency installation','qualityGateNotEstablishedByThisCheck':True}
    if not args.skip_verification:
        with tempfile.TemporaryDirectory(prefix='crf09-independent-') as folder:
            temporary=Path(folder);independent=temporary/'unpacked';stage=temporary/'candidate.zip'
            with zipfile.ZipFile(stage,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
                for name,data in files.items():z.writestr(name,data)
            with zipfile.ZipFile(stage) as z:
                if z.testzip() is not None:raise RuntimeError('Independent candidate archive corrupt')
                z.extractall(independent)
            verification['independentMethod']='ZIP containing all eventual executable/data/image files unpacked into a fresh temporary directory; final ZIP adds only verification/manifest metadata after this run'
            verification['testedPayloadFilesSHA256']={name:sha(data) for name,data in files.items()}
            output=independent/'verification_output'
            # One fresh Node process loading only files from the independent kit.
            proc=subprocess.run(['node','scripts/render_v09.cjs','--all','web/assets/v09/generated/index.json',str(output)],cwd=independent,capture_output=True,text=True,timeout=900)
            if proc.returncode:raise RuntimeError('Independent renderer failed: '+proc.stderr[-1200:])
            reports={r['id']:r for r in read(output/'all-render-reports.json') if r.get('status')=='rendered'}
            for e in renderable:
                with Image.open(independent/('web/'+e['imageUrl'].lstrip('/'))) as im:expected=im.convert('RGBA');expected_bytes=expected.tobytes();size=expected.size
                with Image.open(output/(e['id']+'.png')) as im:actual=im.convert('RGBA');actual_bytes=actual.tobytes();actual_size=actual.size
                pixel_match=expected_bytes==actual_bytes and size==actual_size
                index_match=e.get('pixelSha256') in [None,sha(expected_bytes)]
                verification['results'].append({'id':e['id'],'expectedSize':list(size),'actualSize':list(actual_size),'expectedRGBASHA256':sha(expected_bytes),'actualRGBASHA256':sha(actual_bytes),'expectedRGBSHA256':sha(expected.convert('RGB').tobytes()),'actualRGBSHA256':sha(actual.convert('RGB').tobytes()),'exactRGBAMatch':pixel_match,'indexHashMatchesPublishedImage':index_match,'elapsedMs':reports[e['id']]['elapsedMs']})
            # The retained street also renders using only packaged Gaussian/context dependencies.
            street=subprocess.run(['node','scripts/render_v09.cjs','scenes/street_original.json',str(output/'street.png')],cwd=independent,capture_output=True,text=True,timeout=120)
            if street.returncode:raise RuntimeError('Independent street renderer failed: '+street.stderr[-1000:])
            verification['street']=json.loads(street.stdout.strip().splitlines()[-1])
            if candidate_index['candidates']:
                candidate_run=subprocess.run(['node','scripts/render_candidates09.cjs','CANDIDATES.json',str(output/'candidates')],cwd=independent,capture_output=True,text=True,timeout=900)
                if candidate_run.returncode:raise RuntimeError('Independent candidate renderer failed: '+candidate_run.stderr[-1000:])
                candidate_reports=read(output/'candidates/candidate-render-reports.json')
                verification['candidates']=[{'id':r['id'],'actualRGBASHA256':r['rgbaSHA256'],'recordedPixelSHA256':r['recordedPixelSHA256'],'exactRecordedRGBAMatch':r['exactRecordedRGBAMatch'],'elapsedMs':r['elapsedMs']} for r in candidate_reports]
        verification['allRenderableScenesIdentical']=all(r['exactRGBAMatch'] and r['indexHashMatchesPublishedImage'] for r in verification['results'])
        verification['allCandidateRecordsIdentical']=bool(verification.get('candidates')) and all(r['exactRecordedRGBAMatch'] is True for r in verification.get('candidates',[]))
        verification['status']='passed' if verification['allRenderableScenesIdentical'] and verification['allCandidateRecordsIdentical'] else 'failed'
    files['VERIFICATION.json']=(json.dumps(verification,indent=2,ensure_ascii=False)+'\n').encode()
    manifest={name:{'bytes':len(data),'sha256':sha(data)} for name,data in files.items()}
    files['MANIFEST.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    output=(ROOT/args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in files.items():z.writestr(name,data)
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None:raise RuntimeError('ZIP integrity check failed')
    verification['archive']={'file':str(output.relative_to(ROOT)),'bytes':output.stat().st_size,'sha256':sha(output.read_bytes()),'fileCount':len(files)}
    write(ROOT/'reports/v09/render_kit_verification.json',verification)
    print(json.dumps({'status':verification['status'],'renderable':len(renderable),'indexEntries':len(examples),'archive':verification['archive']},ensure_ascii=False))
    if verification['status']=='failed':raise SystemExit(2)

if __name__=='__main__':main()
