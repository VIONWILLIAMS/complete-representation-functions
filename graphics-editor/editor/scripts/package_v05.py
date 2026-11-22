#!/usr/bin/env python3
"""Deliver verified source, examples, and a four-case portable editor.

The source and media archives share one CRF_Graphics_0_5 root; unzip both in the
same destination to obtain the complete offline gallery. The single HTML embeds
all editable cases + independent PNG references; pre-rendered gallery links are
online. Its data payload is JSON compressed with gzip, not executable input.
"""
from pathlib import Path
import argparse, base64, gzip, hashlib, json, re, zipfile

ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'web';OUT=DIST/'downloads'
ARCHIVE_ROOT='CRF_Graphics_0_5'
NAMES={
 'CRF_Graphics_0_5_Offline.html':'四案例离线编辑器 · 单文件 HTML',
 'CRF_Graphics_0_5_Source.zip':'完整源码、观测数据与验收 · ZIP',
 'CRF_Graphics_0_5_Showcase.zip':'多角度图片与五秒视频 · ZIP',
 'CRF_Graphics_0_5_Report.md':'0.5 技术说明与验收报告',
 'CRF_Graphics_0_5_LLM_Guide.md':'LLM 函数操作与复现说明',
 'crf_0_5_street_5s.mp4':'午后街角 · 5 秒运镜 MP4',
 'crf_0_5_fruit_lab_5s.mp4':'程序水果 · 5 秒运镜 MP4',
 'crf_0_5_editor_5s.webm':'浏览器实际逐帧导出 · 5 秒 WebM',
 'crf_0_5_edge_comparison.png':'0.4 / 0.5 边缘与补墙对比',
 'crf_0_5_cases_overview.png':'四案例展示总览',
 'crf_0_5_acceptance.json':'三张实拍与程序水果验收 JSON',
 'crf_0_5_browser_verification.json':'实际浏览器验收 JSON',
 'crf_0_5_pixel_report.json':'冻结检查器 · Street 逐像素报告',
 'crf_0_5_boundary_context.json':'边缘范围、纹理与接缝诊断',
 'crf_0_5_video_verification.json':'视频时长、帧数与解码验证',
 'crf_0_5_states.json':'四案例与编辑状态 JSON',
}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def assignment(path):
 text=path.read_text();pos=text.index('=');return json.loads(text[pos+1:].strip().removesuffix(';'))
def entries(paths):
 return [{'label':NAMES.get(p.name,p.stem),'filename':p.name,'url':'downloads/'+p.name,'size':p.stat().st_size,'sha256':sha(p)} for p in paths]

def offline(site_url):
 cases=assignment(DIST/'assets/cases.js');globals_={'CRF_CASES':cases}
 for case in cases:
  data=assignment(DIST/case['dataUrl'])
  data['referenceImageDataURL']='data:image/png;base64,'+base64.b64encode((DIST/case['referenceUrl']).read_bytes()).decode()
  globals_[case['global']]=data
  case['thumbnail']=data['referenceImageDataURL']
  for item in case.get('gallery',[]):item['url']=site_url.rstrip('/')+'/'+item['url']
  if case.get('video'):
   case['video']['url']=site_url.rstrip('/')+'/'+case['video']['url']
   case['video']['poster']=data['referenceImageDataURL']
 globals_['CRF_DOWNLOAD_MANIFEST']={'schema':'crf.downloads.v0.5','files':[{'label':label,'filename':name,'url':site_url.rstrip('/')+'/downloads/'+name} for name,label in NAMES.items()]}
 payload=base64.b64encode(gzip.compress(json.dumps(globals_,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0)).decode()
 html=(DIST/'index.html').read_text()
 html=re.sub(r'<link\b[^>]*href="editor.css"[^>]*>',lambda m:'<style>\n'+(DIST/'editor.css').read_text()+'\n</style>',html)
 for name in ['assets/scene-data.js','assets/cases.js']:
  html=html.replace('<script src="'+name+'"></script>','')
 for name in ['crf-fruit.js','crf-core.js','crf-renderer.js','crf-video.js']:
  code=(DIST/name).read_text().replace('</script','<\\/script')
  html=html.replace('<script src="'+name+'"></script>','<script>\n'+code+'\n</script>')
 boot='''<script id="crf-packed-data" type="application/octet-stream">'''+payload+'''</script>
<script>
(async function(){
 try {
  if(typeof DecompressionStream==='undefined') throw new Error('此浏览器不支持离线数据解压，请使用较新的浏览器或完整工程目录。');
  const text=document.getElementById('crf-packed-data').textContent.trim();
  const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const data=JSON.parse(decoded);for(const key of Object.keys(data))window[key]=data[key];
  document.getElementById('crf-packed-data').remove();
'''+(DIST/'editor.js').read_text().replace('</script','<\\/script')+'''
 } catch(error) {document.getElementById('canvasLoading').textContent=error.message;}
})();
</script>'''
 html=html.replace('<script src="editor.js"></script>',boot)
 html=html.replace('<title>CRF 图形计算编辑器 · 0.5</title>','<title>CRF 图形计算编辑器 · 0.5 · 离线版</title>')
 html=html.replace('当前修改请用“导出场景 JSON”保存。这里提供已发布的完整工程和验收示例。','四个案例的编辑、PNG 与浏览器支持的逐帧视频导出可离线运行。预制图库、视频播放和下载清单使用在线地址。当前修改请导出场景 JSON 保存。')
 (OUT/'CRF_Graphics_0_5_Offline.html').write_text(html)
 return len(html.encode())

def zipfiles(name,files,extra=None):
 target=OUT/name
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for f in files:z.write(f,ARCHIVE_ROOT+'/'+f.relative_to(ROOT).as_posix())
  for path,text in (extra or {}).items():z.writestr(ARCHIVE_ROOT+'/'+path,text)
 with zipfile.ZipFile(target) as z:
  if z.testzip():raise ValueError('ZIP CRC failed')
  return len(z.infolist())

def main():
 p=argparse.ArgumentParser();p.add_argument('--site-url',required=True);args=p.parse_args();OUT.mkdir(exist_ok=True)
 copies={'reports/v05/acceptance.json':'crf_0_5_acceptance.json','reports/v05/browser_verification.json':'crf_0_5_browser_verification.json','reports/v05/pixel_gate/pixel_report.json':'crf_0_5_pixel_report.json','reports/v05/boundary_context.json':'crf_0_5_boundary_context.json','reports/v05/video_verification.json':'crf_0_5_video_verification.json','docs/CRF_0_5_Report.md':'CRF_Graphics_0_5_Report.md','docs/LLM_0_5.md':'CRF_Graphics_0_5_LLM_Guide.md'}
 for source,target in copies.items():(OUT/target).write_bytes((ROOT/source).read_bytes())
 offline_bytes=offline(args.site_url)
 files=sorted(p for p in OUT.glob('crf_0_5_*') if p.is_file() and p.suffix in {'.png','.mp4','.webm'})
 media_count=zipfiles('CRF_Graphics_0_5_Showcase.zip',files,{'SHOWCASE_README.txt':'将此压缩包与 Source.zip 解压到同一个目录，合并 CRF_Graphics_0_5 文件夹，即可获得完整预制图库。所有视频和图片也可以直接打开。\n'})
 source_files=[]
 for f in sorted(ROOT.rglob('*')):
  if not f.is_file():continue
  rel=f.relative_to(ROOT)
  if any(x in {'.git','.openai','node_modules','build','dist','__pycache__'} for x in rel.parts):continue
  if f.suffix in {'.zip','.gz','.pyc'} or f.name.endswith('_Offline.html'):continue
  if rel.parts[:2]==('scanner','previews'):continue
  if rel.parts[0]=='reports' and f.suffix=='.png':continue
  if rel.parts[:2]==('web','downloads'):
   if f.name=='manifest.json' or f.suffix in {'.png','.mp4','.webm'} or '0_4' in f.name:continue
  if rel.parts[:2]==('docs','legacy'):continue
  source_files.append(f)
 source_count=zipfiles('CRF_Graphics_0_5_Source.zip',source_files,{
  'web/downloads/manifest.json':json.dumps({'schema':'crf.downloads.v0.5','files':entries(files)},ensure_ascii=False,indent=2),
  'OFFLINE_README.txt':'打开 web/index.html 可使用四个案例。预制图库和视频位于配套 Showcase.zip；两个包解压到同一目录可合并。完整源码、参考PNG、数值数据、原始两张CC0图片、扫描/渲染/验收脚本均在本包。需要本地HTTP时运行 python3 -m http.server 4173 --directory web。\n'})
 selected=[OUT/name for name in NAMES]
 selected += [p for p in files if p not in selected]
 for f in selected:
  if not f.is_file() or not f.stat().st_size:raise ValueError('Missing deliverable '+str(f))
  if f.stat().st_size>24*1024*1024:raise ValueError('Deliverable exceeds safe static-asset budget '+str(f))
 manifest={'schema':'crf.downloads.v0.5','version':'0.5.0','files':entries(selected),'sourceArchiveEntries':source_count,'showcaseArchiveEntries':media_count,'offlineEditorCases':4}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'files':len(selected),'sourceArchiveEntries':source_count,'showcaseArchiveEntries':media_count,'offlineBytes':offline_bytes,'sourceZipBytes':(OUT/'CRF_Graphics_0_5_Source.zip').stat().st_size,'showcaseZipBytes':(OUT/'CRF_Graphics_0_5_Showcase.zip').stat().st_size},indent=2))
if __name__=='__main__':main()
