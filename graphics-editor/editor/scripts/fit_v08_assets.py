#!/usr/bin/env python3
"""Fit all explicit semantic observations and retain independently renderable functions."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import json,os,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'fitting/sources08/manifest.json').read_text())
OUT=ROOT/'web/assets/v08/gaussians';OUT.mkdir(parents=True,exist_ok=True)
LOG=ROOT/'reports/v08/fitting';LOG.mkdir(parents=True,exist_ok=True)
def run(item):
    target=OUT/(item['id']+'.json')
    if target.exists() and target.with_suffix('.report.json').exists():return {'id':item['id'],'resumed':True}
    cmd=[sys.executable,str(ROOT/'fitting/crf08_gaussian.py'),str(ROOT/item['input']),'--output',str(target),'--budget',str(item['budget']),'--iterations','24','--geometry-steps','90','--id',item['id']]
    env=dict(os.environ);env['OPENBLAS_NUM_THREADS']='1'
    p=subprocess.run(cmd,cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (LOG/(item['id']+'.log')).write_text(p.stdout)
    if p.returncode:raise RuntimeError(item['id']+' failed; inspect fitting log')
    report=json.loads(target.with_suffix('.report.json').read_text())
    return {'id':item['id'],'gaussians':report['gaussians'],'metrics':report['metrics'],'seconds':report['fit']['seconds']}
with ThreadPoolExecutor(max_workers=3)as pool:
    futures=[pool.submit(run,a)for a in manifest['assets']]
    for future in as_completed(futures):print(json.dumps(future.result()),flush=True)
print(json.dumps({'complete':True,'count':len(manifest['assets'])}),flush=True)
