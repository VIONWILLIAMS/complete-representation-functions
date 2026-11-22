#!/usr/bin/env python3
"""Package reproducible CRF 0.7 source and actual results, without runtime secrets.

Existing archives/media are never removed. Textual API evidence is preserved with
inline input-image payloads and credential values omitted in the archive copies.
Observed CRF RGB coefficients remain untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from datetime import datetime, timezone
from urllib.parse import quote, unquote, urlsplit
import zipfile

ROOT = Path(__file__).resolve().parents[1]
# Authored web assets live separately from the generated deployment output.
# Keep their source paths in both ZIPs so the archives merge without copies.
DIST = ROOT / 'web'
OUT = DIST / 'downloads'
ARCHIVE_ROOT = 'CRF_Graphics_0_7'
LIMIT = 24 * 1024 * 1024
SOURCE_NAME = 'CRF_Graphics_0_7_Source.zip'
IMAGES_NAME = 'CRF_Graphics_0_7_Images.zip'
PUBLIC_SITE_URL = 'https://crf-street-04-lab-4d86.laterafter950.chatgpt.site'
SKIP_PARTS = {'.git', '.openai', '.sites-runtime', 'node_modules', 'build', '__pycache__', '.pytest_cache', '.cache', '.venv', 'venv'}
ARCHIVES = {'.zip', '.gz', '.bz2', '.xz', '.tgz', '.tar', '.7z', '.rar', '.pyc', '.pyo'}
TEXT_SUFFIXES = {'.json', '.jsonl', '.txt', '.tap', '.xml', '.md', '.csv', '.log'}
SCAN_TEXT_SUFFIXES = TEXT_SUFFIXES | {'.js', '.mjs', '.cjs', '.py', '.html', '.css', '.toml', '.yaml', '.yml', '.sh'}
SECRET_TOKEN = re.compile(rb'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])')
PRIVATE_KEY = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
AUTH_KEYS = {'api_key', 'apikey', 'authorization', 'x-api-key', 'deepseek_api_key'}
# Runtime thumbnails / front-view galleries in editor07.js, assets/cases.js,
# assets/v06/showcase.js; pixel_gate.py and the retained 0.4 pixel report also
# require their independently decoded candidate PNGs. Other old media stays out.
REQUIRED_DOWNLOAD_PNGS = {
    'crf_0_5_street_reference.png',
    'crf_0_5_fruit_lab_reference.png',
    'crf_0_5_orchard_reference.png',
    'crf_0_5_alpine_reference.png',
    'crf_0_6_common_reference.png',
    'crf_0_6_stilllife_reference.png',
    'crf_0_6_courtyard_reference.png',
    'crf_street_0_4_reference.png',
}
NAMES = {
    SOURCE_NAME: '0.7 完整源码、全部案例与执行证据',
    IMAGES_NAME: '0.7 实际模型图片、生成程序与执行记录',
    'CRF_Graphics_0_7_Report.md': '0.7 技术与实际验收报告',
    'CRF_Graphics_0_7_Run_Local.md': '0.7 本地运行与模型连接说明',
    'CRF_Graphics_0_7_Editor.md': '0.7 工作台操作与接口',
    'CRF_Graphics_0_7_Radiance_Schema.md': '0.7 可执行图像程序格式',
    'CRF_Graphics_0_7_DeepSeek_API.md': '0.7 DeepSeek 接入与真实搜索说明',
    'CRF_Graphics_0_7_Technical_Notes.md': '0.7 共同路径与能力边界说明',
    'crf_0_7_browser_acceptance.json': '0.7 实际浏览器与像素验收',
    'crf_0_7_unit_test_run.txt': '0.7 自动检查执行结果',
    'crf_0_7_experiments.json': '0.7 实际模型案例索引',
}
COPIES = {
    'docs/v07/REPORT.md': 'CRF_Graphics_0_7_Report.md',
    'docs/v07/RUN_LOCAL.md': 'CRF_Graphics_0_7_Run_Local.md',
    'docs/v07/EDITOR.md': 'CRF_Graphics_0_7_Editor.md',
    'docs/v07/RADIANCE_SCHEMA.md': 'CRF_Graphics_0_7_Radiance_Schema.md',
    'docs/v07/DEEPSEEK_API.md': 'CRF_Graphics_0_7_DeepSeek_API.md',
    'docs/v07/TECHNICAL_NOTES.md': 'CRF_Graphics_0_7_Technical_Notes.md',
    'reports/v07/crf_0_7_browser_acceptance.json': 'crf_0_7_browser_acceptance.json',
    'reports/v07/unit_test_run.txt': 'crf_0_7_unit_test_run.txt',
    'web/assets/v07/experiments.json': 'crf_0_7_experiments.json',
}
LEGACY_DOCUMENT_DOWNLOADS = {
    'docs/v06/REPORT.md': 'CRF_Graphics_0_6_Report.md',
    'docs/CRF_0_5_Report.md': 'CRF_Graphics_0_5_Report.md',
}
MARKDOWN_LINK = re.compile(
    r'(?P<image>!)?\[(?P<label>[^\]\n]+)\]'
    r'\((?P<target><[^>\n]+>|[^\s()\n]+)'
    r'(?P<title>\s+(?:"[^"\n]*"|\'[^\'\n]*\'))?\)')


def public_site_url(value: str) -> str:
    """Use absolute links so a separately saved Markdown file still works."""
    parsed = urlsplit(value)
    if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {'', '/'}):
        raise ValueError('The public site URL must be an HTTP(S) origin without credentials, path, query or fragment')
    return value.rstrip('/')


def export_markdown(source: Path, data: bytes, site_url: str,
                    source_paths: set[Path]) -> bytes:
    """Rewrite only download copies; repo docs keep their source-relative links.

    A source-only target must actually belong to the source archive. It links to
    that archive with its exact member path stated beside the original label,
    rather than inventing an unserved /reports, /tests or /server URL.
    """
    site_url = public_site_url(site_url)

    def published(path: str, suffix: str = '') -> str:
        return site_url + '/' + quote(path, safe='/') + suffix

    def rewrite(match: re.Match) -> str:
        target = match.group('target')
        parsed = urlsplit(target[1:-1] if target.startswith('<') else target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            return match.group(0)
        path = ((DIST / unquote(parsed.path).lstrip('/')) if parsed.path.startswith('/')
                else (source.parent / unquote(parsed.path))).resolve()
        try:
            relative = path.relative_to(ROOT).as_posix()
        except ValueError as error:
            raise ValueError('Download document link escapes the project: ' + target) from error
        if not path.is_file():
            raise ValueError('Missing download document link target: ' + relative)
        suffix = ('?' + parsed.query if parsed.query else '') + ('#' + parsed.fragment if parsed.fragment else '')
        download_name = COPIES.get(relative)
        legacy_name = LEGACY_DOCUMENT_DOWNLOADS.get(relative)
        if not download_name and legacy_name and (OUT / legacy_name).is_file():
            download_name = legacy_name
        annotation = ''
        if download_name:
            url = published('downloads/' + download_name, suffix)
        elif path.is_relative_to(DIST):
            url = published(path.relative_to(DIST).as_posix(), suffix)
        else:
            if path not in source_paths:
                raise ValueError('Linked evidence is not included in the source archive: ' + relative)
            if match.group('image'):
                raise ValueError('A download document cannot embed an image from a ZIP: ' + relative)
            url = published('downloads/' + SOURCE_NAME)
            annotation = '（源码包内：`' + relative + suffix + '`）'
        return ((match.group('image') or '') + '[' + match.group('label') + ']('
                + url + (match.group('title') or '') + ')' + annotation)

    lines = []
    fence = None
    for line in data.decode('utf-8').splitlines(keepends=True):
        boundary = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        if fence:
            lines.append(line)
            if (boundary and boundary[1][0] == fence[0] and len(boundary[1]) >= fence[1]
                    and not boundary[2].strip()):
                fence = None
            continue
        if boundary:
            fence = (boundary[1][0], len(boundary[1]))
            lines.append(line)
            continue
        # Preserve examples written in inline code as well as fenced code.
        code_spans = [(m.start(), m.end()) for m in re.finditer(r'(`+).*?\1', line)]
        lines.append(MARKDOWN_LINK.sub(
            lambda m: m.group(0) if any(a <= m.start() < b for a, b in code_spans) else rewrite(m), line))
    note = ('> 下载版链接说明：本文件的资源链接指向已发布站点。标注“源码包内”的链接下载'
            ' [完整源码包](' + published('downloads/' + SOURCE_NAME) + ')，'
            '解压后在 `CRF_Graphics_0_7/` 下按所列路径查找；'
            '离线阅读请使用包内 `' + source.relative_to(ROOT).as_posix() + '`。\n\n')
    # Retain the document title as the first line.
    insert_at = 1 if lines and lines[0].startswith('# ') else 0
    lines.insert(insert_at, '\n' + note if insert_at else note)
    return ''.join(lines).encode('utf-8')


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def entry(path: Path) -> dict:
    data = path.read_bytes()
    return {'label': NAMES.get(path.name, path.stem), 'filename': path.name,
            'url': 'downloads/' + path.name, 'size': len(data), 'sha256': sha(data)}


def credential_filename(path: Path) -> bool:
    name = path.name.lower()
    return (name == '.env' or name.startswith('.env.') or name.startswith('.dev.vars')
            or name.endswith(('.pem', '.key', '.p12', '.pfx', '.sock', '.socket'))
            or name in {'credentials.json', 'secrets.json', 'service-account.json', '.npmrc', '.netrc', '_netrc', '.pypirc', 'id_rsa', 'id_ed25519'}
            or name.endswith(('.tmp', '.part')))


def safe_archive_path(name: str) -> str:
    path = Path(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError('Unsafe archive path: ' + name)
    return path.as_posix()


def sanitize_evidence(value, stats: dict):
    if isinstance(value, list):
        return [sanitize_evidence(item, stats) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key.lower() in AUTH_KEYS and item:
                result[key] = '[runtime credential omitted]'
                stats['credentialFieldsOmitted'] += 1
            else:
                result[key] = sanitize_evidence(item, stats)
        return result
    if isinstance(value, str):
        if re.match(r'^data:image/[A-Za-z0-9.+-]+;base64,', value):
            stats['inlineImagesOmitted'] += 1
            return '[input image payload omitted; sha256=' + sha(value.encode()) + '; encodedCharacters=' + str(len(value)) + ']'
        clean, count = SECRET_TOKEN.subn(b'[runtime credential omitted]', value.encode('utf-8'))
        stats['credentialTokensOmitted'] += count
        return clean.decode('utf-8')
    return value


def checked_bytes(path: Path, stats: dict) -> bytes:
    data = path.read_bytes()
    relative = path.relative_to(ROOT)
    # Sanitization is restricted to evidence copies. Executable source and all
    # observation assets (including rgbBase64) are not rewritten.
    is_evidence = relative.parts[:2] == ('reports', 'v07') or (
        relative.parts[:2] == ('web', 'downloads') and path.name.startswith('crf_0_7_'))
    if is_evidence and path.suffix == '.json':
        value = json.loads(data)
        data = (json.dumps(sanitize_evidence(value, stats), ensure_ascii=False, indent=2) + '\n').encode()
    if path.suffix.lower() in SCAN_TEXT_SUFFIXES or path.name in {'README', '.gitignore'}:
        if SECRET_TOKEN.search(data) or PRIVATE_KEY.search(data):
            raise ValueError('Potential credential in distributable text: ' + relative.as_posix())
    return data


def source_files():
    missing = sorted(name for name in REQUIRED_DOWNLOAD_PNGS if not (OUT / name).is_file())
    if missing:
        raise ValueError('Missing runtime/reference PNGs: ' + ', '.join(missing))
    files = []
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(ROOT)
        if any(part in SKIP_PARTS for part in relative.parts) or credential_filename(path):
            continue
        if path.suffix.lower() in ARCHIVES or path.name.endswith('_Offline.html'):
            continue
        if relative.parts[0] == 'dist' or relative.parts[:2] == ('scanner', 'previews'):
            continue
        if relative.parts[:3] == ('web', 'media', 'v07'):
            continue
        if relative.parts[0] == 'reports' and path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if relative.parts[:2] == ('web', 'downloads'):
            # Keep the exact PNGs consumed by the current case catalog and
            # independent reference checks. Do not bundle all old media/archives.
            if path.name == 'manifest-v07.json':
                continue
            if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in REQUIRED_DOWNLOAD_PNGS:
                continue
        files.append(path)
    return files


def image_files():
    files = []
    for folder in [DIST / 'media/v07', DIST / 'assets/v07/generated', ROOT / 'reports/v07']:
        if not folder.exists():
            continue
        for path in folder.rglob('*'):
            if not path.is_file() or path.is_symlink() or credential_filename(path):
                continue
            if path.suffix.lower() in ARCHIVES:
                continue
            if folder == ROOT / 'reports/v07' and path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            files.append(path)
    experiments = DIST / 'assets/v07/experiments.json'
    if experiments.is_file():
        files.append(experiments)
    return sorted(set(files))


def zip_checked(name: str, files: list[Path], extras: dict[str, bytes | str]) -> dict:
    stats = {'inlineImagesOmitted': 0, 'credentialFieldsOmitted': 0, 'credentialTokensOmitted': 0}
    fd, temporary = tempfile.mkstemp(prefix='.crf07-', suffix='.part', dir=OUT)
    os.close(fd)
    target = Path(temporary)
    try:
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in files:
                relative = safe_archive_path(path.relative_to(ROOT).as_posix())
                data = checked_bytes(path, stats)
                archive.writestr(ARCHIVE_ROOT + '/' + relative, data)
            for relative, value in extras.items():
                relative = safe_archive_path(relative)
                data = value.encode() if isinstance(value, str) else value
                if SECRET_TOKEN.search(data) or PRIVATE_KEY.search(data):
                    raise ValueError('Potential credential in portable archive metadata')
                archive.writestr(ARCHIVE_ROOT + '/' + relative, data)
            provenance = {'schema': 'crf.package_provenance.v0.7', 'archive': name,
                          'createdAt': datetime.now(timezone.utc).isoformat(),
                          'sourceFiles': len(files), 'sanitization': stats,
                          'observedRgbCoefficientsPreserved': True,
                          'newWebReferenceInputBytesIncluded': False,
                          'runtimeCredentialsIncluded': False,
                          'validationIsNotPhotoQualityScoring': True}
            archive.writestr(ARCHIVE_ROOT + '/PACKAGE_' + ('SOURCE' if name == SOURCE_NAME else 'IMAGES') + '_PROVENANCE.json',
                             json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
        if target.stat().st_size >= LIMIT:
            raise ValueError(name + ' is not below 24 MiB: ' + str(target.stat().st_size))
        with zipfile.ZipFile(target) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError('ZIP CRC failed: ' + bad)
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise ValueError('Duplicate archive paths')
            for item in names:
                safe_archive_path(item)
            count = len(names)
        os.replace(target, OUT / name)
        return {'filename': name, 'entries': count, 'size': (OUT / name).stat().st_size,
                'sha256': sha((OUT / name).read_bytes()), 'crcVerified': True,
                'below24MiB': True, 'sanitization': stats}
    finally:
        if target.exists():
            target.unlink()


def copy_current_deliverables(site_url: str = PUBLIC_SITE_URL) -> list[Path]:
    files = []
    source_paths = set(source_files())
    for relative, name in COPIES.items():
        source = ROOT / relative
        if not source.is_file():
            continue
        stats = {'inlineImagesOmitted': 0, 'credentialFieldsOmitted': 0, 'credentialTokensOmitted': 0}
        data = checked_bytes(source, stats)
        if source.suffix.lower() == '.md':
            data = export_markdown(source, data, site_url, source_paths)
        target = OUT / name
        target.write_bytes(data)
        files.append(target)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-only', action='store_true', help='Rebuild only the source archive')
    parser.add_argument('--images-only', action='store_true', help='Rebuild only the actual-results archive')
    parser.add_argument('--site-url', default=PUBLIC_SITE_URL,
                        help='Public HTTP(S) origin for links in standalone Markdown downloads')
    args = parser.parse_args()
    if args.source_only and args.images_only:
        parser.error('Choose at most one archive-only option')
    OUT.mkdir(exist_ok=True)
    copies = copy_current_deliverables(public_site_url(args.site_url))
    archives = []
    if not args.images_only:
        portable_manifest = {'schema': 'crf.downloads.v0.7', 'version': '0.7.0',
                             'portableSource': True, 'files': [entry(path) for path in copies]}
        extras = {
            '.openai/hosting.json': '{}\n',
            'web/downloads/manifest-v07.json': json.dumps(portable_manifest, ensure_ascii=False, indent=2) + '\n',
            'START_HERE.md': '# CRF 图形计算编辑器 0.7\n\n运行步骤见 docs/v07/RUN_LOCAL.md。先执行 npm install，再执行 npm run dev，打开 http://127.0.0.1:4173。\n\n页面、案例与媒体的源文件在 web/；dist/ 仅存放重新构建的 client/、server/ 和构建配置，不进入源码包。浏览器 URL 仍从根路径访问，不增加 /web 前缀。\n\n本地案例和程序渲染不需要 API。模型对话需要自行提供运行时密钥。源码不包含原站项目身份或密钥；.openai/hosting.json 是可移植空配置。\n\nImages.zip 与 Source.zip 使用相同顶层目录 CRF_Graphics_0_7，解压到同一位置并合并 web/、reports/，即可加入本次实际图片、程序和执行记录。既有照片案例的观测数据、全部编辑器与生成引擎已保留。源码含七个旧案例的正面参考缩略图，以及独立 Street 像素验收所需参考 PNG。额外历史视角图与预制视频继续由原版媒体包提供。\n',
        }
        archives.append(zip_checked(SOURCE_NAME, source_files(), extras))
    if not args.source_only:
        archives.append(zip_checked(IMAGES_NAME, image_files(), {
            'IMAGES_README.md': '# CRF 0.7 实际模型结果\n\n包含本次实际生成的图片、对应场景程序与经清理的执行证据。初稿和反馈后并列，不自动判定质量高低。\n\n与 Source.zip 解压到同一位置，合并 CRF_Graphics_0_7 内的 web/、reports/ 文件夹。实际媒体位于 web/media/v07/，生成程序位于 web/assets/v07/generated/，编辑器中的“模型实测对比”读取 web/assets/v07/experiments.json。网页 URL 仍为 assets/v07/experiments.json，不增加 /web 前缀。未完成的轮次不会用其他图片代替。\n\n网络参考图片的输入字节不分发；来源、获取状态、实际提交记录和模型候选文本保留。照片级真实性需要独立评估，打包校验仅验证文件完整性。\n',
        }))
    selected = [OUT / name for name in NAMES if (OUT / name).is_file()]
    for path in selected:
        if path.stat().st_size <= 0 or path.stat().st_size >= LIMIT:
            raise ValueError('Invalid deliverable size: ' + path.name)
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as archive:
                if archive.testzip():
                    raise ValueError('Existing archive CRC check failed: ' + path.name)
    manifest = {'schema': 'crf.downloads.v0.7', 'version': '0.7.0',
                'generatedAt': datetime.now(timezone.utc).isoformat(),
                'archiveByteLimit': LIMIT, 'archivesVerifiedThisRun': archives,
                'files': [entry(path) for path in selected]}
    (OUT / 'manifest-v07.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(selected), 'archives': archives,
                      'manifest': 'web/downloads/manifest-v07.json',
                      'note': 'Only existing files are listed. Re-run after media or reports change.'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
