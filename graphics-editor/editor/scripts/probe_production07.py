#!/usr/bin/env python3
"""Verify the deployed private site using its authorized service bearer in memory.

The bearer is entered through a non-echoing terminal prompt, never argv or a file.
The DeepSeek key remains in the deployed runtime; this probe does not receive it.
"""
import getpass
import hashlib
import json
import argparse
from pathlib import Path
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
import requests

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url')
parser.add_argument('--skip-downloads', action='store_true', help='Skip the two full ZIP transfers when diagnosing the API.')
parser.add_argument('--skip-model', action='store_true', help='Verify static files without another paid model request.')
args = parser.parse_args()
base = args.url.rstrip('/')
if urlparse(base).scheme != 'https' or not urlparse(base).hostname.endswith('.chatgpt.site'):
    raise SystemExit('Expected the exact deployed HTTPS Sites URL.')
token = getpass.getpass('Private Site service credential: ')
headers = {'OAI-Sites-Authorization': 'Bearer ' + token}
results = {'schema': 'crf.production_smoke.v0.7', 'url': base,
           'recordedAt': datetime.now(timezone.utc).isoformat(), 'checks': []}


def get(relative):
    response = requests.get(base + relative, headers=headers, timeout=90, allow_redirects=False)
    if response.status_code != 200:
        raise RuntimeError(relative + ' returned ' + str(response.status_code) + ': ' + response.text[:180].replace(token, '[redacted]'))
    return response


status = get('/api/crf/status').json()
assert status['version'] == '0.7.0' and status['configured'] is True
results['checks'].append({'name': 'runtime configuration', 'pass': True, 'status': status})
home = get('/')
home_text = home.content.decode('utf-8')
assert 'CRF 图形计算编辑器' in home_text and 'editor07.js' in home_text
results['checks'].append({'name': 'static HTML through ASSETS', 'pass': True})
script = get('/crf-radiance07.js')
expected = hashlib.sha256((root / 'web/crf-radiance07.js').read_bytes()).hexdigest()
assert hashlib.sha256(script.content).hexdigest() == expected
results['checks'].append({'name': 'deployed renderer SHA-256', 'pass': True, 'sha256': expected})
experiments = get('/assets/v07/experiments.json').json()
assert len(experiments['experiments']) == 4
results['checks'].append({'name': 'four actual model comparisons', 'pass': True})
manifest = get('/downloads/manifest-v07.json').json()
for item in manifest['files']:
    if args.skip_downloads or not item['filename'].endswith('.zip'):
        continue
    received = get('/' + item['url'])
    actual = hashlib.sha256(received.content).hexdigest()
    assert len(received.content) == item['size'] and actual == item['sha256']
    results['checks'].append({'name': 'download ' + item['filename'], 'pass': True,
                              'bytes': len(received.content), 'sha256': actual})
print(json.dumps({'stage': 'static and downloads', 'checks': len(results['checks']), 'ok': True}), flush=True)
out = root / 'build/v07_production'
out.mkdir(parents=True, exist_ok=True)
if args.skip_model:
    (out / 'production_static.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    raise SystemExit(0)

program = json.loads((root / 'web/assets/v07/generated/citrus_refined.crf.json').read_text())
started = time.time()
payload = {'mode': 'edit', 'engine': 'radiance07', 'search': False,
           'prompt': '保持所有几何、相机、灯光和物体ID。仅将白色盘子的材质颜色换为淡蓝色[160,195,220]，保留其他材质函数与参数。返回可执行的完整场景程序。',
           'currentScene': program}
response = requests.post(base + '/api/crf/generate', headers={**headers, 'Content-Type': 'application/json', 'Origin': base},
                         json=payload, timeout=220, allow_redirects=False)
body = response.json()
results['liveEdit'] = {'httpStatus': response.status_code, 'elapsedMs': round((time.time()-started)*1000),
                       'ok': body.get('ok'), 'response': body}
(out / 'production_smoke.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'stage': 'live edit response', 'httpStatus': response.status_code,
                  'ok': body.get('ok'), 'error': body.get('error'),
                  'elapsedMs': results['liveEdit']['elapsedMs']}, ensure_ascii=False), flush=True)
assert response.status_code == 200 and body.get('ok') is True
assert body.get('program', {}).get('schema') == 'crf.image_program.v0.7'
def changed_paths(before, after, path=''):
    if isinstance(before, dict) and isinstance(after, dict):
        paths = []
        for key in sorted(set(before) | set(after)):
            if key not in before or key not in after:
                paths.append(path + '/' + key)
            else:
                paths.extend(changed_paths(before[key], after[key], path + '/' + key))
        return paths
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [p for i, (a, b) in enumerate(zip(before, after)) for p in changed_paths(a, b, path + '/' + str(i))]
    return [] if before == after else [path]
candidate = body['program']
diff = changed_paths(program, candidate)
plate_indices = [i for i, obj in enumerate(program['objects']) if obj['id'].startswith('plate_')]
allowed = {f'/objects/{i}/material/color/{channel}' for i in plate_indices for channel in range(3)} | {'/title'}
unexpected = [path for path in diff if path not in allowed]
plate_colors_match = all(candidate['objects'][i]['material']['color'] == [160, 195, 220] for i in plate_indices)
results['semanticEdit'] = {'requestedPlateColor': [160, 195, 220], 'plateObjectCount': len(plate_indices),
                           'changedPaths': diff, 'unexpectedChangedPaths': unexpected,
                           'allPlateColorsMatch': plate_colors_match,
                           'pass': bool(plate_indices) and plate_colors_match and not unexpected}
results['checks'].append({'name': 'actual DeepSeek edit through production runtime', 'pass': True,
                          'model': body.get('model'), 'requests': body.get('usage', {}).get('requests', [])})
(out / 'production_smoke.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
(out / 'plate_edit.crf.json').write_text(json.dumps(body['program'], ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'stage': 'semantic edit verification', **results['semanticEdit']}, ensure_ascii=False), flush=True)
assert results['semanticEdit']['pass'], 'The API returned a program, but the requested isolated color edit did not pass.'
print(json.dumps({'stage': 'production complete', 'checks': len(results['checks']), 'ok': True,
                  'httpStatus': response.status_code, 'model': body.get('model'),
                  'objects': len(body['program']['objects']), 'elapsedMs': results['liveEdit']['elapsedMs']}), flush=True)
token = ''
