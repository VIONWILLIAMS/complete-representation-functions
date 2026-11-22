#!/usr/bin/env python3
"""Package actual CRF 0.6 source/media/evidence; no generated verification results."""
from pathlib import Path
import argparse, base64, hashlib, json, re, zipfile

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'web'; OUT=DIST/'downloads'; ARCHIVE_ROOT='CRF_Graphics_0_6'
NAMES={
 'CRF_Graphics_0_6_Offline.html':'0.6 单文件离线编辑器',
 'CRF_Graphics_0_6_Source.zip':'0.6 完整源码与验收工程',
 'CRF_Graphics_0_6_Showcase.zip':'0.6 多视角图片与五秒视频',
 'CRF_Graphics_0_6_Report.md':'0.6 技术与验收报告',
 'CRF_Graphics_0_6_LLM_Guide.md':'LLM 场景程序操作指南',
 'crf_0_6_programs.json':'可独立重放的场景程序集合',
 'crf_0_6_tools.json':'AI 工具能力清单',
 'crf_0_6_observation_fit.json':'真实照片拟合与留出像素误差',
 'crf_0_6_tests.json':'程序、拟合、共同路径测试结果',
 'crf_0_6_browser_verification.json':'实际浏览器与画布验收',
 'crf_0_6_video_verification.json':'视频时长、帧数与解码验收',
 'crf_0_6_common_5s.mp4':'共同场景 · 五秒运镜 MP4',
 'crf_0_6_courtyard_5s.mp4':'程序庭院 · 五秒运镜 MP4',
 'crf_0_6_editor_5s.webm':'编辑器实际导出 · 五秒 WebM',
 'crf_0_6_overview.png':'0.6 场景与共享编辑总览',
 'crf_0_6_observation_board.png':'输入照片、轮廓和拟合外观对照',
 'crf_0_6_editor.jpg':'编辑器实际操作截图',
}
COPIES={
 'docs/v06/REPORT.md':'CRF_Graphics_0_6_Report.md',
 'docs/v06/LLM_GUIDE.md':'CRF_Graphics_0_6_LLM_Guide.md',
 'reports/v06/observation_fit.json':'crf_0_6_observation_fit.json',
 'reports/v06/tests.json':'crf_0_6_tests.json',
 'reports/v06/browser_verification.json':'crf_0_6_browser_verification.json',
 'reports/v06/video_verification.json':'crf_0_6_video_verification.json',
}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def assigned(path):return json.loads(path.read_text().split('=',1)[1].strip().removesuffix(';'))
def data_url(p):return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
def entry(p):return {'label':NAMES.get(p.name,p.stem),'filename':p.name,'url':'downloads/'+p.name,'size':p.stat().st_size,'sha256':sha(p)}

def offline(site_url):
    html=(DIST/'index.html').read_text()
    html=re.sub(r'<link\b[^>]*href="editor06.css"[^>]*>',lambda _: '<style>\n'+(DIST/'editor06.css').read_text()+'\n</style>',html)
    observed=assigned(DIST/'assets/v06/observed-fruit.js')
    for a in observed['assets']:a['referenceUrl']=data_url(DIST/a['referenceUrl'])
    showcase=assigned(DIST/'assets/v06/showcase.js')
    for case in showcase['cases']:
        for item in case.get('images',[]):item['url']=data_url(DIST/item['url'])
        if case.get('video'):
            case['video']['poster']=data_url(DIST/case['video']['poster'])
            case['video']['url']=site_url.rstrip('/')+'/'+case['video']['url']
    replacement={
        'assets/v06/observed-fruit.js':'globalThis.CRF_OBSERVED_FRUIT='+json.dumps(observed,ensure_ascii=False,separators=(',',':'))+';',
        'assets/v06/showcase.js':'globalThis.CRF06_SHOWCASE='+json.dumps(showcase,ensure_ascii=False,separators=(',',':'))+';',
    }
    def script(match):
        name=match.group(1)
        code=replacement.get(name)
        if code is None:code=(DIST/name).read_text()
        return '<script>\n'+code.replace('</script','<\\/script')+'\n</script>'
    html=re.sub(r'<script\s+src="([^"]+)"\s*></script>',script,html)
    # The offline app renders/edits/exports without a network. Pre-encoded video
    # playback and downloads are deliberately online; the media ZIP is portable.
    manifest={'schema':'crf.downloads.v0.6','files':[{'label':v,'filename':k,'url':site_url.rstrip('/')+'/downloads/'+k} for k,v in NAMES.items()]}
    boot='<script>globalThis.CRF06_OFFLINE=true;globalThis.CRF06_DOWNLOAD_MANIFEST='+json.dumps(manifest,ensure_ascii=False)+';</script>'
    html=html.replace('<body>','<body>\n'+boot)
    html=html.replace('href="editor05.html"','href="'+site_url.rstrip('/')+'/editor05.html"')
    html=html.replace('href="verify-v06.html"','href="'+site_url.rstrip('/')+'/verify-v06.html"')
    html=html.replace('<title>CRF 图形计算编辑器 · 0.6</title>','<title>CRF 图形计算编辑器 · 0.6 · 离线版</title>')
    notice='<p class="note">单文件版：三类场景的函数编辑、图像拟合、图片与浏览器视频导出可离线运行，展示照片已内嵌。预制视频、历史编辑器和工程下载使用在线地址；完整本地视频见 Showcase.zip。</p>'
    html=html.replace('<div id="downloadsList"',notice+'<div id="downloadsList"')
    (OUT/'CRF_Graphics_0_6_Offline.html').write_text(html)

def zip_files(name,files,extra=None):
    target=OUT/name
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for f in files:z.write(f,ARCHIVE_ROOT+'/'+f.relative_to(ROOT).as_posix())
        for name,value in (extra or {}).items():z.writestr(ARCHIVE_ROOT+'/'+name,value)
    with zipfile.ZipFile(target) as z:
        bad=z.testzip()
        if bad:raise ValueError('CRC failed: '+bad)
        for item in z.infolist():
            if item.filename.startswith('/') or '..' in Path(item.filename).parts:raise ValueError('Unsafe archive path')
        return len(z.infolist())

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--site-url',required=True);args=parser.parse_args();OUT.mkdir(exist_ok=True)
    for source,target in COPIES.items():(OUT/target).write_bytes((ROOT/source).read_bytes())
    offline(args.site_url)
    media=sorted(p for p in OUT.glob('crf_0_6_*') if p.is_file() and p.suffix in {'.png','.jpg','.mp4','.webm'})
    media_count=zip_files('CRF_Graphics_0_6_Showcase.zip',media,{'SHOWCASE_README.txt':'与 Source.zip 解压到同一位置并合并 CRF_Graphics_0_6 文件夹，可离线查看全部图片与视频。每个视频为真实场景逐帧渲染。\n'})
    sources=[]
    for f in sorted(ROOT.rglob('*')):
        if not f.is_file():continue
        rel=f.relative_to(ROOT)
        if any(s in {'.git','.openai','node_modules','build','dist','__pycache__'} for s in rel.parts):continue
        if f.suffix in {'.zip','.gz','.pyc'} or f.name.endswith('_Offline.html'):continue
        if rel.parts[:2]==('scanner','previews'):continue
        if rel.parts[0]=='reports' and f.suffix not in {'.json','.txt','.tap','.xml','.md'}:continue
        if rel.parts[:2]==('web','downloads'):
            if f.suffix in {'.png','.jpg','.mp4','.webm'} or not (f.name.startswith('crf_0_6_') or f.name.startswith('CRF_Graphics_0_6_')):continue
        sources.append(f)
    portable_manifest={'schema':'crf.downloads.v0.6','files':[entry(p) for p in media]}
    source_count=zip_files('CRF_Graphics_0_6_Source.zip',sources,{
        'web/downloads/manifest-v06.json':json.dumps(portable_manifest,ensure_ascii=False,indent=2),
        'OFFLINE_README.txt':'0.6 入口为 web/index.html。可直接打开，也可使用任意本地静态服务。现场函数编辑和渲染不依赖网络。预制媒体由 Showcase.zip 提供，两个压缩包解压到同一位置。editor05.html 保留历史 0.5 实验。Node 命令行渲染需要 npm install --ignore-scripts。详见 README.md。\n'
    })
    selected=[OUT/name for name in NAMES]
    selected += [p for p in media if p not in selected]
    for p in selected:
        if not p.is_file() or not p.stat().st_size:raise ValueError('Missing actual deliverable '+str(p))
        if p.stat().st_size>24*1024*1024:raise ValueError('File exceeds 24 MiB static-asset budget '+str(p))
    manifest={'schema':'crf.downloads.v0.6','version':'0.6.0','sourceArchiveEntries':source_count,'showcaseArchiveEntries':media_count,'files':[entry(p) for p in selected]}
    (OUT/'manifest-v06.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'files':len(selected),'sourceArchiveEntries':source_count,'showcaseArchiveEntries':media_count,'offlineBytes':(OUT/'CRF_Graphics_0_6_Offline.html').stat().st_size,'sourceZipBytes':(OUT/'CRF_Graphics_0_6_Source.zip').stat().st_size,'showcaseZipBytes':(OUT/'CRF_Graphics_0_6_Showcase.zip').stat().st_size},indent=2))
if __name__=='__main__':main()
