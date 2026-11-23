"""Build an offline, source-backed gallery from completed render records.

Embeds downsampled browsing JPEGs only; never rescales or edits the source PNG.
No network resources, generated imagery, UI framework, or placeholders are used.
"""
import argparse, base64, io, json, shutil
from pathlib import Path
from urllib.parse import quote
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def resolve_file(value, manifest_path):
    if not value:
        return None
    value = Path(str(value))
    candidates = [value] if value.is_absolute() else [
        ROOT/value, manifest_path.parent/value, manifest_path.parent/value.name,
        ROOT/'images'/value.name, ROOT/'aov_previews'/value.name,
        manifest_path.parent.parent/'images'/value.name,
        manifest_path.parent.parent/'aov_previews'/value.name,
        ROOT/value.name,
    ]
    return next((p.resolve() for p in candidates if p.is_file()), None)

def embedded_jpeg(path, max_edge=1400, quality=88):
    with Image.open(path) as source:
        image = source.convert('RGB')
        image.thumbnail((max_edge,max_edge),Image.Resampling.LANCZOS)
        data=io.BytesIO();image.save(data,format='JPEG',quality=quality,optimize=True,subsampling=0)
    return 'data:image/jpeg;base64,'+base64.b64encode(data.getvalue()).decode('ascii')

def build(manifest_path, output_path, copy_originals=False, preview_edge=1400):
    manifest_path=Path(manifest_path).resolve();output_path=Path(output_path).resolve()
    if not manifest_path.exists() and manifest_path==ROOT/'outputs/collection_manifest.json':
        portable=ROOT/'measurements/collection_manifest.json'
        if portable.exists():manifest_path=portable
    manifest=json.loads(manifest_path.read_text())
    records=manifest.get('images',[])
    if not records:
        raise ValueError('The collection manifest has no completed images. No placeholder gallery was produced.')
    output_path.parent.mkdir(parents=True,exist_ok=True)
    images=[];seen=set()
    for index,row in enumerate(records):
        identifier=str(row.get('id',index+1))
        if identifier in seen:raise ValueError('Duplicate image id: '+identifier)
        seen.add(identifier)
        original=resolve_file(row.get('png'),manifest_path)
        preview=resolve_file(row.get('preview'),manifest_path) or original
        if not preview:raise FileNotFoundError('No readable image for '+identifier)
        with Image.open(original or preview) as image:
            actual_size=image.size
        width=int(row.get('width') or actual_size[0]);height=int(row.get('height') or actual_size[1])
        if original and actual_size!=(width,height):
            raise ValueError(f'{identifier}: original PNG size {actual_size} differs from manifest {(width,height)}')
        normal=resolve_file(row.get('aov_normal'),manifest_path)
        depth=resolve_file(row.get('aov_depth'),manifest_path)
        raw=resolve_file(row.get('raw_exr'),manifest_path)
        notes=row.get('notes') or []
        if isinstance(notes,str):notes=[notes]
        if isinstance(notes,dict):notes=[str(k)+'：'+str(v) for k,v in notes.items()]
        href=None
        if original:
            href='images/'+quote(original.name)
            if copy_originals:
                destination=output_path.parent/'images'/original.name
                destination.parent.mkdir(parents=True,exist_ok=True)
                if destination.resolve()!=original:shutil.copy2(original,destination)
        images.append({
            'id':identifier,'title':str(row.get('title',identifier)),
            'subtitle':str(row.get('subtitle','程序化场景 · CPU 路径追踪')),
            'width':width,'height':height,'spp':row.get('spp'),
            'seconds':row.get('seconds'),'notes':[str(x) for x in notes],
            'preview':embedded_jpeg(preview,preview_edge),
            'thumb':embedded_jpeg(preview,240,80),
            'normal':embedded_jpeg(normal,preview_edge) if normal else None,
            'depth':embedded_jpeg(depth,preview_edge) if depth else None,
            'download':href,'filename':original.name if original else None,
            'raw_available':bool(raw),
        })
    payload={'title':str(manifest.get('title','CRF · 代码渲染样片')),
             'date':str(manifest.get('created_local_date',manifest.get('date','2026-11-23'))),
             'images':images}
    encoded=json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    output_path.write_text(TEMPLATE.replace('__GALLERY_JSON__',encoded),encoding='utf-8')
    print(json.dumps({'gallery':str(output_path),'images':len(images),'bytes':output_path.stat().st_size,
                      'embedded_previews':True,'originals_copied':copy_originals},ensure_ascii=False))
    return output_path

TEMPLATE=r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>CRF · 代码渲染样片</title>
<style>
:root{--paper:#f4f3ee;--card:#fff;--ink:#202c2a;--muted:#66716c;--line:#dce2db;--green:#2d6257;--pale:#eaf0e8;--gold:#aa8254;--radius:20px}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}button,a,input{touch-action:manipulation}button{font:inherit}a{color:var(--green);text-underline-offset:4px}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #a6c9bc;outline-offset:4px}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.4}.shell{width:min(1500px,calc(100% - 64px));margin:0 auto}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:25px 0;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:12px;letter-spacing:1.7px;font-size:12px;font-weight:700}.logo{width:32px;height:32px;border-radius:50%;background:var(--green);display:grid;place-items:center;color:white;font-family:Georgia,serif;font-size:19px;letter-spacing:0}.top-right{display:flex;gap:16px;align-items:center;font-size:11px;letter-spacing:.8px;color:var(--muted)}.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid #cbd8ce;padding:5px 12px;border-radius:999px;font-size:11px;letter-spacing:.5px;background:#f5f9f3;color:var(--green);font-weight:650}.dot{width:6px;height:6px;background:#729f7c;border-radius:50%}.hero{padding:45px 0 32px;display:grid;grid-template-columns:1.6fr 1fr;gap:55px;align-items:end}.eyebrow{font-size:10px;letter-spacing:3px;color:var(--gold);font-weight:700;margin:0 0 14px}.hero h1{font-family:Georgia,"Songti SC","Noto Serif CJK SC",serif;font-size:clamp(32px,4vw,57px);letter-spacing:-1.4px;line-height:1.25;font-weight:500;margin:0 0 15px}.hero h1 em{font-style:normal;color:var(--green)}.hero p{max-width:610px;margin:0;color:var(--muted);font-size:13px;line-height:1.9}.hero-note{border-left:1px solid #c9d6ca;padding:0 0 0 24px}.hero-note strong{font-size:12px;display:block;margin-bottom:9px;color:var(--green)}.hero-note p{font-size:12px;max-width:400px}.tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}.tag{font-size:10px;padding:4px 9px;background:#eaece5;color:#5c685d;border-radius:5px}.scene-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:0 0 20px}.scene-tab{display:flex;text-align:left;gap:10px;align-items:center;padding:9px;background:#fcfcf8;border:1px solid var(--line);border-radius:13px;color:var(--ink);min-width:0;transition:background .2s,border-color .2s,transform .2s}.scene-tab:hover{background:#fff;transform:translateY(-2px)}.scene-tab[aria-selected=true]{border-color:var(--green);background:#edf3ec;box-shadow:inset 0 0 0 1px var(--green)}.scene-tab img{width:55px;height:59px;object-fit:cover;border-radius:7px;flex-shrink:0}.scene-tab .tab-text{min-width:0}.scene-tab .idx{display:block;color:var(--gold);font-size:9px;letter-spacing:1.5px;margin-bottom:2px}.scene-tab .label{display:block;font-size:12px;line-height:1.45;font-weight:650;overflow:hidden;text-overflow:ellipsis}.scene-tab .size{display:block;color:var(--muted);font-size:9px;margin-top:3px}.viewer-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}.viewer{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}.toolbar{min-height:57px;display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--line)}.segmented{display:inline-flex;gap:4px;padding:3px;border-radius:8px;background:#eff1eb}.mode{border:0;background:none;border-radius:6px;font-size:11px;color:var(--muted);padding:6px 11px;white-space:nowrap}.mode[aria-pressed=true]{background:#fff;color:var(--green);box-shadow:0 1px 3px #122d1810;font-weight:700}.compare-check{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:7px;cursor:pointer}.compare-check input{accent-color:var(--green)}.stage{height:min(69vh,760px);min-height:380px;background:#e8e8e0;display:grid;grid-template-columns:minmax(0,1fr);gap:1px;position:relative;padding:14px}.stage.compare{grid-template-columns:1fr 1fr;gap:12px}.panel{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;min-height:0}.panel img{display:block;max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 7px 22px #17271a17}.panel-label{position:absolute;top:8px;left:8px;font-size:10px;line-height:1;padding:7px 9px;border-radius:5px;color:#244f45;background:#ffffffdf;backdrop-filter:blur(5px)}#comparisonPanel{display:none}.stage.compare #comparisonPanel{display:flex}.stage-caption{display:flex;justify-content:space-between;gap:20px;padding:12px 18px;color:var(--muted);font-size:10px;line-height:1.7}.stage-caption .count{white-space:nowrap;color:var(--gold);font-variant-numeric:tabular-nums}.details{background:var(--card);padding:25px 23px;border:1px solid var(--line);border-radius:var(--radius)}.detail-topline{font-size:9px;color:var(--gold);letter-spacing:2px;margin-bottom:10px}.details h2{font-size:22px;line-height:1.4;margin:0 0 8px;font-weight:550;letter-spacing:-.5px}.subtitle{font-size:12px;line-height:1.8;color:var(--muted);margin:0 0 23px}.specs{margin:0;padding:0;border-top:1px solid var(--line)}.spec-row{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #edf0ea;padding:12px 0;font-size:11px}.spec-row dt{color:var(--muted)}.spec-row dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;font-weight:550}.spec-row dd small{display:block;color:#7b867f;font-size:9px;font-weight:400}.download{display:flex;justify-content:center;align-items:center;gap:10px;background:var(--green);color:white;text-decoration:none;padding:11px 13px;border-radius:9px;font-size:12px;margin:22px 0 8px}.download[aria-disabled=true]{opacity:.4;pointer-events:none}.file-note{color:#7a847b;font-size:9px;text-align:center;margin:0;line-height:1.8}.observe{margin-top:23px;border-top:1px solid var(--line);padding-top:18px}.observe h3{font-size:11px;font-weight:700;margin:0 0 10px;letter-spacing:.6px}.observe ul{padding:0;margin:0;list-style:none}.observe li{font-size:11px;color:var(--muted);position:relative;padding-left:13px;margin:0 0 10px;line-height:1.85}.observe li:before{content:"";position:absolute;left:0;top:8px;width:4px;height:4px;background:#a5b7a7;border-radius:50%}.evidence{display:grid;grid-template-columns:1.25fr 1fr;gap:32px;margin:38px 0 0;padding-top:30px;border-top:1px solid var(--line)}.section-label{font-size:10px;color:var(--gold);letter-spacing:2px;margin-bottom:12px}.evidence h3{font-size:20px;letter-spacing:-.5px;margin:0 0 15px;font-weight:550}.pipeline{font-size:12px;padding:17px 18px;border:1px solid var(--line);background:#fbfcf8;border-radius:11px;line-height:2;color:#3f5c50}.evidence p{font-size:12px;line-height:1.95;color:var(--muted);margin:13px 0 0}.status-list{margin:0;border-top:1px solid var(--line)}.status{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line);font-size:12px}.status small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.status b{font-size:10px;font-weight:600;background:#e5eee2;color:#356047;padding:3px 9px;border-radius:5px;white-space:nowrap}.status b.pending{background:#efe9dd;color:#8a6d41}.footnotes{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin:32px 0;padding:24px;background:#e9ede4;border-radius:14px}.footnotes h4{margin:0 0 8px;font-size:12px;font-weight:650}.footnotes p{margin:0;color:#687566;font-size:11px;line-height:1.9}.footer{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:20px 0 30px;color:#7b867d;font-size:10px;letter-spacing:.4px}.no-script{padding:20px;color:#7c301b} @media(min-width:1600px){.shell{width:min(1570px,calc(100% - 96px))}.viewer-layout{grid-template-columns:minmax(0,1fr) 330px}}@media(max-width:1100px){.shell{width:calc(100% - 38px)}.hero{gap:26px}.scene-tab img{width:44px;height:51px}.scene-tab .label{font-size:11px}.scene-tab .size{font-size:8px}.viewer-layout{grid-template-columns:minmax(0,1fr) 265px}.details{padding:21px 18px}}@media(max-width:850px){.hero{grid-template-columns:1fr;gap:22px;padding-top:30px}.hero-note{display:none}.scene-tabs{display:flex;overflow:auto;padding-bottom:5px;scroll-snap-type:x mandatory;gap:8px}.scene-tab{min-width:170px;scroll-snap-align:start}.viewer-layout{grid-template-columns:1fr}.stage{height:65vh;min-height:340px}.details{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}.detail-head{grid-column:1}.specs{grid-column:2;grid-row:1/5}.download{grid-column:1;margin-top:10px}.file-note{grid-column:1}.observe{grid-column:1/-1}.observe ul{display:flex;gap:22px;flex-wrap:wrap}.observe li{max-width:calc(50% - 14px)}.evidence{grid-template-columns:1fr;gap:26px}.footnotes{gap:20px}.top-right .date{display:none}}@media(max-width:560px){.shell{width:calc(100% - 28px)}.top{padding:17px 0}.brand{font-size:10px;letter-spacing:1px}.top-right{gap:0}.pill{font-size:9px;padding:4px 8px}.hero h1{font-size:36px}.hero p{font-size:12px}.scene-tab{min-width:155px}.toolbar{padding:10px 11px;gap:8px}.mode{font-size:10px;padding:6px 8px}.compare-check{font-size:10px}.stage{min-height:310px;height:59vh;padding:9px}.stage.compare{grid-template-columns:1fr;grid-template-rows:1fr 1fr;height:80vh;gap:9px}.stage-caption{padding:11px 13px;gap:12px;font-size:9px}.details{display:block;padding:21px}.details h2{font-size:24px}.specs{margin-top:18px}.observe ul{display:block}.observe li{max-width:none}.footnotes{grid-template-columns:1fr;gap:22px;padding:21px}.evidence{margin-top:27px}.top-right .pill .dot{display:none}.footer{font-size:9px}.panel-label{font-size:9px;top:5px;left:5px}}
</style>
</head>
<body>
<div class="shell">
<header class="top"><div class="brand"><span class="logo">C</span>CRF / RENDER STUDIES</div><div class="top-right"><span class="date" id="date"></span><span class="pill"><span class="dot"></span>CPU 实际渲染</span></div></header>
<section class="hero"><div><p class="eyebrow">CODE · LIGHT · MATERIAL</p><h1>用代码，<em>计算一束光。</em></h1><p>从几何、材质到光的传播，图像由可复现的程序逐像素计算。这里展示本轮实际运行的不同题材样片，以及它们背后的参数和辅助数据。</p><div class="tags"><span class="tag">原生分辨率</span><span class="tag">程序化几何与纹理</span><span class="tag">无外部图像资产</span><span class="tag">源码可复现</span></div></div><aside class="hero-note"><strong>查看图片，也查看生成依据。</strong><p>这些是合成渲染，不是真实摄影。切换法线和深度可以观察场景结构；清晰度与写实程度分别评价，不用分辨率代替画质结论。</p></aside></section>
<nav class="scene-tabs" id="tabs" role="tablist" aria-label="选择场景"></nav>
<main class="viewer-layout">
<section class="viewer" aria-label="图片查看器">
<div class="toolbar"><div class="segmented" role="group" aria-label="查看通道"><button class="mode" data-mode="beauty" aria-pressed="true">成图</button><button class="mode" data-mode="normal" aria-pressed="false">表面法线</button><button class="mode" data-mode="depth" aria-pressed="false">场景深度</button></div><label class="compare-check"><input type="checkbox" id="compare">并排对照</label></div>
<div class="stage" id="stage" role="tabpanel" aria-labelledby="tab-0"><div class="panel"><img id="mainImage" alt="" decoding="async"><span class="panel-label" id="mainLabel">成图预览</span></div><div class="panel" id="comparisonPanel"><img id="compareImage" alt="" decoding="async"><span class="panel-label" id="compareLabel">表面法线</span></div></div>
<div class="stage-caption"><span id="channelHint">此处为缩小的浏览预览。原尺寸 PNG 可在完整交付包中打开。</span><span class="count" id="counter"></span></div>
</section>
<aside class="details" aria-live="polite"><div class="detail-head"><div class="detail-topline" id="sceneIndex"></div><h2 id="sceneTitle"></h2><p class="subtitle" id="sceneSubtitle"></p></div><dl class="specs"><div class="spec-row"><dt>原图尺寸</dt><dd id="dimensions"></dd></div><div class="spec-row"><dt>每像素采样</dt><dd id="samples"></dd></div><div class="spec-row"><dt>本次运行耗时</dt><dd id="duration"></dd></div><div class="spec-row"><dt>实际计算后端</dt><dd>C++ / CPU</dd></div><div class="spec-row"><dt>原始线性数据</dt><dd id="rawStatus"></dd></div></dl><a class="download" id="download" download>打开原尺寸 PNG <span aria-hidden="true">↗</span></a><p class="file-note">原图链接需要完整包中的 images 文件夹。<br>单独打开本 HTML 仍可浏览全部内嵌预览。</p><div class="observe"><h3>值得观察</h3><ul id="notes"></ul></div></aside>
</main>
<section class="evidence"><div><div class="section-label">THE COMPUTATION</div><h3>每张图，都有一条可检查的计算链路。</h3><div class="pipeline">Python 场景程序 → 几何、材质与光源<br>C++ 路径追踪 → 线性 PFM / EXR<br>传统局部重建、曝光与色调映射 → PNG</div><p>法线和深度来自场景求交计算。浏览页没有调用图像生成接口，也不把参考照片作为场景贴图。原始数据、参数、源码快照和运行日志随交付文件提供。</p></div><div><div class="section-label">IMPLEMENTATION STATUS</div><div class="status-list"><div class="status"><span>CPU 渲染与场景程序<small>本页图片来自实际运行结果</small></span><b>已运行</b></div><div class="status"><span>传统滤波与成像<small>无学习型降噪、无 AI 超分辨率</small></span><b>已运行</b></div><div class="status"><span>CUDA 计算后端<small>NVCC 13.0.88 / sm_120 交叉编译通过；GPU 未执行，远端 12.8 未验证</small></span><b class="pending">待实机验证</b></div><div class="status"><span>云端 96GB GPU 性能<small>尚无可核实的 GPU 渲染与测量</small></span><b class="pending">未验证</b></div><div class="status"><span>Colab / tmate 连接<small>CLI 0.8.0 已安装；OAuth 未完成并已关闭，尚缺 tmate 实际连接地址</small></span><b class="pending">待连接</b></div></div></div></section>
<section class="footnotes"><div><h4>高清与真实感分开评价</h4><p>标注尺寸为实际渲染尺寸。更多像素改善细节承载能力；更多采样主要降低噪声。过于规律的纹理或简化的几何仍需要修改程序。</p></div><div><h4>本轮是独立实验</h4><p>这些文件没有覆盖既有 CRF 1.2 项目。它们验证多题材代码渲染与可复现交付；还不是接入编辑器的完整自主优化系统。</p></div><div><h4>保留明确的技术边界</h4><p>使用近似 RGB 光学与简化介质处理，部分场景的雾为距离近似。没有配准摄影参考，因此不声称“95%真实度”。</p></div></section>
<footer class="footer"><span>CRF · CODE-NATIVE RENDER STUDY / 2026</span><span>离线预览 · 无外部字体、图片或网络依赖</span></footer>
<noscript><p class="no-script">查看场景切换需要启用 JavaScript。所有图片预览都内嵌在此文件中，无需联网。</p></noscript>
</div>
<script type="application/json" id="galleryData">__GALLERY_JSON__</script>
<script>
(()=>{'use strict';
const data=JSON.parse(document.getElementById('galleryData').textContent),images=data.images;
const byId=id=>document.getElementById(id);let current=0,mode='beauty',compare=false;
const labels={beauty:'成图预览',normal:'表面法线',depth:'场景深度'};
document.title=data.title;byId('date').textContent=data.date;
const tabs=byId('tabs');tabs.style.gridTemplateColumns='repeat('+images.length+',1fr)';
images.forEach((item,i)=>{const btn=document.createElement('button');btn.className='scene-tab';btn.type='button';btn.setAttribute('role','tab');btn.id='tab-'+i;btn.setAttribute('aria-controls','stage');btn.setAttribute('aria-selected',String(i===0));btn.tabIndex=i===0?0:-1;
const thumb=document.createElement('img');thumb.src=item.thumb;thumb.alt='';thumb.loading='lazy';
const text=document.createElement('span');text.className='tab-text';const num=document.createElement('span');num.className='idx';num.textContent='STUDY '+String(i+1).padStart(2,'0');const title=document.createElement('span');title.className='label';title.textContent=item.title;const size=document.createElement('span');size.className='size';size.textContent=item.width+' × '+item.height;
text.append(num,title,size);btn.append(thumb,text);btn.addEventListener('click',()=>select(i));btn.addEventListener('keydown',event=>{let dest=null;if(event.key==='ArrowRight')dest=(i+1)%images.length;if(event.key==='ArrowLeft')dest=(i+images.length-1)%images.length;if(event.key==='Home')dest=0;if(event.key==='End')dest=images.length-1;if(dest!==null){event.preventDefault();select(dest);tabs.children[dest].focus();}});tabs.append(btn);});
function durationText(seconds){if(typeof seconds!=='number'||!Number.isFinite(seconds))return '未记录';if(seconds<60)return seconds.toFixed(1)+' 秒';const total=Math.round(seconds),min=Math.floor(total/60),sec=total%60;return min+' 分 '+sec+' 秒';}
function select(i){current=i;mode='beauty';compare=false;byId('compare').checked=false;Array.from(tabs.children).forEach((btn,j)=>{btn.setAttribute('aria-selected',String(j===i));btn.tabIndex=j===i?0:-1;});
const item=images[i];byId('stage').setAttribute('aria-labelledby','tab-'+i);byId('sceneIndex').textContent='STUDY '+String(i+1).padStart(2,'0')+' / '+String(images.length).padStart(2,'0');byId('sceneTitle').textContent=item.title;byId('sceneSubtitle').textContent=item.subtitle;
byId('dimensions').textContent=item.width+' × '+item.height;const mp=document.createElement('small');mp.textContent=(item.width*item.height/1e6).toFixed(2)+' 百万像素 · 原生渲染';byId('dimensions').append(mp);
byId('samples').textContent=typeof item.spp==='number'?item.spp.toLocaleString()+' spp':'未记录';byId('duration').textContent=durationText(item.seconds);byId('rawStatus').textContent=item.raw_available?'PFM / EXR':'PFM（见原始数据包）';
const download=byId('download');download.setAttribute('aria-disabled',String(!item.download));if(item.download){download.href=item.download;download.setAttribute('download',item.filename||'');}else download.removeAttribute('href');
const notes=byId('notes');notes.replaceChildren();const noteItems=item.notes.length?item.notes:['查看光照、材质与轮廓之间的关系，并通过法线 / 深度通道核对几何。'];noteItems.forEach(note=>{const li=document.createElement('li');li.textContent=note;notes.append(li);});
byId('compare').disabled=!(item.normal||item.depth);document.querySelectorAll('.mode').forEach(btn=>{btn.disabled=btn.dataset.mode!=='beauty'&&!item[btn.dataset.mode];});update();}
function update(){const item=images[current];const chosen=mode==='beauty'?item.preview:item[mode];byId('stage').classList.toggle('compare',compare);byId('mainImage').src=compare?item.preview:chosen;byId('mainImage').alt=item.title+' — '+(compare?'成图预览':labels[mode]);byId('mainLabel').textContent=compare?'成图预览':labels[mode];
if(compare){byId('compareImage').src=chosen;byId('compareImage').alt=item.title+' — '+labels[mode];byId('compareLabel').textContent=labels[mode];}byId('counter').textContent=String(current+1).padStart(2,'0')+' / '+String(images.length).padStart(2,'0');
document.querySelectorAll('.mode').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.mode===mode)));
byId('channelHint').textContent=mode==='beauty'?'此处为缩小的浏览预览。原尺寸 PNG 可在完整交付包中打开。':mode==='normal'?'法线颜色编码几何表面的朝向，直接来自渲染求交；不是图像模型估计。':'深度显示相机与几何表面的距离，直接来自场景求交；显示已作可视化映射。';}
document.querySelectorAll('.mode').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.mode;if(mode==='beauty'){compare=false;byId('compare').checked=false;}update();}));
byId('compare').addEventListener('change',event=>{compare=event.target.checked;if(compare&&mode==='beauty')mode=images[current].normal?'normal':'depth';update();});
select(0);
})();
</script>
</body></html>
'''

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',default=str(ROOT/'outputs/collection_manifest.json'))
    parser.add_argument('--output',default=str(ROOT/'delivery/CRF_Render_Gallery.html'))
    parser.add_argument('--copy-originals',action='store_true')
    parser.add_argument('--preview-edge',type=int,default=1400)
    args=parser.parse_args()
    build(args.manifest,args.output,args.copy_originals,args.preview_edge)
