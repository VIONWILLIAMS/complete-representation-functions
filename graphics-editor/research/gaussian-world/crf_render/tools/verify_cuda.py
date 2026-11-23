#!/usr/bin/env python3
"""Check actual CUDA outputs on the GPU host; never assumes execution occurred."""
from pathlib import Path
import sys,json
import numpy as np
folder=Path(sys.argv[1])
def read(name):
 p=folder/(name+'.pfm')
 with p.open('rb') as f:
  assert f.readline().strip()==b'PF'
  w,h=map(int,f.readline().split());scale=float(f.readline())
  a=np.fromfile(f,'<f4' if scale<0 else '>f4').reshape(h,w,3)[::-1]
 assert np.isfinite(a).all(),f'Non-finite image {name}'
 meta=json.loads((folder/(name+'.json')).read_text())
 assert meta.get('renderer')=='CRF CUDA software-BVH prototype'
 assert meta.get('invalid_samples')==0,f'Invalid paths {name}'
 return a,meta
lam,lmeta=read('check_lambert_cuda');beer,bmeta=read('check_beer_cuda')
le=float(np.max(np.abs(lam-np.array([.2,.4,.8]))));be=float(np.max(np.abs(beer-np.array([.25,.49,.81]))))
assert le<1e-4,f'MIS Lambert energy check failed: {le}'
assert be<1e-4,f'Beer absorption check failed: {be}'
report={'actual_gpu_execution_confirmed_by_local_outputs':True,'gpu_name':lmeta['gpu_name'],'lambert_max_error':le,'beer_max_error':be,'status':'PASS','scope':'Basic energy checks only; does not establish production-grade correctness or CPU/GPU bit identity'}
(folder/'cuda_verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
