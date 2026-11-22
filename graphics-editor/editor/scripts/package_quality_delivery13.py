#!/usr/bin/env python3
"""Create a reproducible source-free rendering kit from verified projects."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile

ROOT=Path(__file__).resolve().parents[1]
README='''# CRF 真实场景函数重建 · 可重算交付包

日期：2026-11-22（北京时间）。本包保存三份完整函数工程、纯 JavaScript 计算内核、原尺寸输出和测量证据。它不包含原始参考照片；PNG 是从已拟合的连续函数计算得到的。

## 不安装依赖，重新算一张图

需要 Node.js 22 或以上。进入此目录运行：

```bash
node render.cjs projects/alpine_hd.crf.json alpine-recomputed.png
node render.cjs projects/street.crf.json street-recomputed.png
node render.cjs projects/orchard.crf.json orchard-recomputed.png
```

曝光和函数重采样：

```bash
node render.cjs projects/alpine_hd.crf.json alpine-brighter.png --exposure 0.25
node render.cjs projects/alpine_hd.crf.json alpine-1_5x.png --scale 1.5
```

RGBA 摘要可与 `evidence/runtime-verification.json` 核对。重新编码的PNG容器字节可能不同，但原生RGBA像素应完全相同。4,000,000输出像素上限保持不变：1280×850的完整2×请求会被明确拒绝。1.5×只是重新采样已有函数，不新增原始观察未保留的信息。

## 在编辑器中继续

从GitHub分支 `feat/crf-1.1-learnable-object-functions` 启动：

```bash
cd graphics-editor/editor
npm ci
npm run dev:quality
```

打开本机质量工作台，点击“打开工程”，选择本包 `projects/` 内的 `.crf.json`。工程保存了计算所需的完整数值参数，不依赖原始图片。独立的 `CRF_Detail_Review.html` 另外提供三场景切换、真实参考对照和PNG/工程导出。

## 结果及适用范围

- 山林湖泊：1280×850，37.7409 dB，SSIM 0.987625，MAE 1.65679/255。
- 街景：667×1000，48.3425 dB，SSIM 0.992669，MAE 0.58542/255。
- 水果：800×600，48.6574 dB，SSIM 0.991161，MAE 0.57572/255。

这些是三个已知真实观察的函数重建测量，不是“真实度百分比”或任意新场景生成能力。材质、光照与倒影仍编码在原观察外观中，曝光控制不是物理重光照。最终像素由显式二维高斯函数计算，没有原RGB贴回或隐藏残差图。

本轮Python/JavaScript、保存/重开及独立进程重算逐字节一致。离线预览程序的Worker和交互竞态已通过单元检查；当前执行环境未完成新预览的实际浏览器交互验收。GPU未参与运行。

完整源码、原始观察、冻结合同、拟合历史与旧版本兼容资料保留在GitHub原开发分支。这里只打包可独立重算的最小交付，正式CRF整体研究计划仍有未完成项。
'''

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    audit=json.loads((ROOT/'reports/quality13/independent-photo-audit.json').read_text())
    runtime=json.loads((ROOT/'reports/quality13/runtime/verification.json').read_text())
    if not audit['passed'] or runtime['status']!='passed': raise ValueError('Independent acceptance must pass first')
    files={'README.md':README.encode(),'render.cjs':(ROOT/'scripts/render_quality_pack13.cjs').read_bytes(),
           'crf-quality12.js':(ROOT/'web/crf-quality12.js').read_bytes(),
           'evidence/independent-photo-audit.json':(ROOT/'reports/quality13/independent-photo-audit.json').read_bytes(),
           'evidence/runtime-verification.json':(ROOT/'reports/quality13/runtime/verification.json').read_bytes(),
           'evidence/quality-contract.json':(ROOT/'contracts/quality13.json').read_bytes()}
    for scene in audit['scenes']:
        sid=scene['id']
        files['projects/'+sid+'.crf.json']=(ROOT/'quality-packs'/f'{sid}.crf.json').read_bytes()
        files['renders/'+sid+'.png']=(ROOT/'reports/quality13/runtime'/f'{sid}.png').read_bytes()
    manifest=[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(files.items())]
    files['MANIFEST.json']=(json.dumps({'referencePhotographsIncluded':False,'files':manifest},indent=2)+'\n').encode()
    a.output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(a.output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo('CRF_Detail_Delivery/'+name,date_time=(2026,11,22,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data,compresslevel=9)
    with zipfile.ZipFile(a.output) as z:
        if z.testzip() is not None: raise ValueError('ZIP integrity failure')
        for entry in manifest:
            actual=z.read('CRF_Detail_Delivery/'+entry['path'])
            if hashlib.sha256(actual).hexdigest()!=entry['sha256']: raise ValueError('ZIP member mismatch')
    print(json.dumps({'path':str(a.output),'bytes':a.output.stat().st_size,'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),
                      'members':len(files),'allMembersVerified':True,'sourcePhotographIncluded':False}))

if __name__=='__main__':main()
