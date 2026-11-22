#!/usr/bin/env python3
"""Build the portable editor, source archive and verified static download list."""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'web'
OUT = DIST / 'downloads'

LABELS = {
    'crf_street_0_4_offline.html': '离线编辑器 · 单文件 HTML',
    'crf_street_0_4_source.zip': '完整源码、数据与复现实验 · ZIP',
    'crf_street_0_4_3s.mp4': '三秒视频 · 24 fps MP4',
    'crf_street_0_4_editor_3s.webm': '编辑器实际逐帧导出 · 3 秒 WebM',
    'crf_street_0_4_reference.png': '原视角 · 高斯渲染 PNG',
    'crf_street_0_4_wall_blue.png': '墙面换色 · PNG',
    'crf_street_0_4_green.png': '行人绿灯 · PNG',
    'crf_street_0_4_left.png': '左侧假设视角 · PNG',
    'crf_street_0_4_right.png': '右侧假设视角 · PNG',
    'crf_street_0_4_elevated.png': '抬高假设视角 · PNG',
    'crf_street_0_4_prototype.png': '基础原型替换 · PNG',
    'CRF_Street_0_4_Report.md': '技术说明与实际验收报告',
    'crf_street_0_4_pixel_report.json': '冻结检查器 · 像素验收 JSON',
    'crf_street_0_4_verification.json': '13 项独立交付检查 · JSON',
    'crf_street_0_4_browser_verification.json': '浏览器实际输出检查 · JSON',
    'crf_street_0_4_scan_report.json': '全像素扫描、语义与成本报告',
    'crf_street_0_4_states.json': '示例场景与三秒轨迹 · JSON',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def offline(site_url):
    html = (DIST / 'index.html').read_text()
    css = (DIST / 'editor.css').read_text()
    html, count = re.subn(r'<link\b[^>]*href=["\']editor\.css["\'][^>]*>',
                         lambda _: '<style>' + css + '</style>', html)
    if count != 1:
        raise ValueError('Expected one editor.css stylesheet link')
    data_url = 'data:image/png;base64,' + base64.b64encode((DIST / 'assets/reference.png').read_bytes()).decode()
    manifest = {'schema': 'crf.downloads.v0.4', 'files': [
        {'label': label, 'filename': name, 'url': site_url.rstrip('/') + '/downloads/' + name}
        for name, label in LABELS.items()]}
    boot = 'globalThis.CRF_SCENE_DATA.referenceImageDataURL=' + json.dumps(data_url) + ';\n'
    boot += 'globalThis.CRF_DOWNLOAD_MANIFEST=' + json.dumps(manifest, ensure_ascii=False) + ';\n'
    for asset in ['assets/scene-data.js', 'crf-core.js', 'crf-renderer.js', 'crf-video.js', 'editor.js']:
        code = (DIST / asset).read_text().replace('</script', '<\\/script')
        if asset == 'assets/scene-data.js':
            code += '\n' + boot
        pattern = r'<script\s+src=["\']' + re.escape(asset) + r'["\']\s*>\s*</script>'
        html, count = re.subn(pattern, lambda _: '<script>\n' + code + '\n</script>', html)
        if count != 1:
            raise ValueError('Expected one script tag for ' + asset)
    html = re.sub(r'<title>.*?</title>', '<title>CRF Studio 0.4 · 离线编辑器</title>', html)
    (OUT / 'crf_street_0_4_offline.html').write_text(html)

def source_zip():
    destination = OUT / 'crf_street_0_4_source.zip'
    excluded = {'.git', 'node_modules', 'build', 'dist', '__pycache__', '.openai'}
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=7) as z:
        for file in sorted(ROOT.rglob('*')):
            if not file.is_file():
                continue
            rel = file.relative_to(ROOT)
            if any(part in excluded for part in rel.parts):
                continue
            if file.suffix in {'.pyc', '.gz'} or file.name in {'crf_street_0_4_source.zip', 'crf_street_0_4_offline.html', 'manifest.json'}:
                continue
            z.write(file, 'CRF_Street_0_4/' + rel.as_posix())
        z.writestr('CRF_Street_0_4/web/downloads/manifest.json', json.dumps({
            'schema': 'crf.downloads.v0.4', 'files': [
                {'label': LABELS.get(p.name, p.name), 'filename': p.name, 'url': 'downloads/' + p.name,
                 'size': p.stat().st_size, 'sha256': sha(p)}
                for p in sorted(OUT.iterdir()) if p.is_file() and p.name not in {'manifest.json','crf_street_0_4_source.zip','crf_street_0_4_offline.html'}
            ]}, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(destination) as z:
        bad = z.testzip()
        if bad:
            raise ValueError('ZIP CRC failure: ' + bad)
        return len(z.namelist())

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--site-url', required=True)
    args = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for source, target in [
        ('reports/pixel_gate/pixel_report.json', 'crf_street_0_4_pixel_report.json'),
        ('reports/verification.json', 'crf_street_0_4_verification.json'),
        ('reports/browser_verification.json', 'crf_street_0_4_browser_verification.json'),
        ('reports/scan_report.json', 'crf_street_0_4_scan_report.json')]:
        shutil.copy2(ROOT / source, OUT / target)
    offline(args.site_url)
    count = source_zip()
    entries = []
    for name, label in LABELS.items():
        file = OUT / name
        if not file.is_file() or file.stat().st_size == 0:
            raise ValueError('Missing deliverable: ' + name)
        entries.append({'label': label, 'filename': name, 'url': 'downloads/' + name,
                        'size': file.stat().st_size, 'sha256': sha(file)})
    manifest = {'schema': 'crf.downloads.v0.4', 'version': '0.4.0',
                'sourceArchiveFileCount': count, 'files': entries}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(entries), 'sourceArchiveEntries': count,
                      'totalBytes': sum(x['size'] for x in entries),
                      'offlineBytes': (OUT / 'crf_street_0_4_offline.html').stat().st_size}, indent=2))

if __name__ == '__main__':
    main()
