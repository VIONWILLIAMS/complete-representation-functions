#!/usr/bin/env python3
"""Fixed v0.8 metric implementation applied only to frozen hidden ROIs."""
from pathlib import Path
import json,sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from fitting.crf08_gaussian import metrics
directory=ROOT/'reports/v09/boundary';report=json.loads((directory/'controlled_validation.json').read_text())
for item in report['tests']:
 if not item['id'].startswith('heldout_'):continue
 name=item['id'].removeprefix('heldout_');base=directory/'controlled'
 truth=np.array(Image.open(base/(name+'-truth.png')).convert('RGB'))
 result=np.array(Image.open(base/(name+'-completed.png')).convert('RGB'))
 mask=np.array(Image.open(base/(name+'-mask.png')).convert('L'))>0
 item['allHiddenROIMetrics']=metrics(truth,result,mask)
 item['thresholdSSIM']=.95;item['jointMAE_SSIM_Pass']=item['pass'] and item['allHiddenROIMetrics']['ssim']>=.95
report['hiddenWallJointGatePassed']=all(x['jointMAE_SSIM_Pass'] for x in report['tests'] if x['id'].startswith('heldout_'))
report['naturalHiddenWallAccuracy']=None
report['metricScope']='Every hidden pixel, fixed Gaussian-window RGB SSIM. Unchanged visible pixels are excluded from aggregation.'
(directory/'controlled_validation.json').write_text(json.dumps(report,indent=2)+'\n')
(directory/'controlled_metrics.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'hiddenWallJointGatePassed':report['hiddenWallJointGatePassed'],'cases':[{k:x[k] for k in ('id','allHiddenROIMetrics','jointMAE_SSIM_Pass')}for x in report['tests'] if x['id'].startswith('heldout_')]},indent=2))
