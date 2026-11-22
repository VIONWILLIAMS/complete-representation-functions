"""Measure declared, testable 0.5 contracts; hidden wall remains unobserved."""
import json,base64,subprocess
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter

ROOT=Path(__file__).resolve().parents[1]
def parse(text):return json.loads(text.split('CRF_SCENE_DATA = ',1)[1].rstrip().removesuffix(';'))
def arr(data,key,c=1):return np.frombuffer(base64.b64decode(data[key]),dtype=np.uint8).reshape((data['height'],data['width'],c) if c>1 else (data['height'],data['width']))
def texture(data):
 a=arr(data,'backgroundRgbBase64',3).astype(float)@np.array([.2126,.7152,.0722])
 r=a-gaussian_filter(a,1.1)
 return float(r[415:437,285:314].std())
def seam(data):
 a=arr(data,'backgroundRgbBase64',3).astype(float)@np.array([.2126,.7152,.0722])
 cols=a[445:451,282:318]
 contrast=(a[441:444,282:318].mean(axis=0)+a[452:455,282:318].mean(axis=0))/2-cols.min(axis=0)
 return {'meanContrastRGBLevels':float(contrast.mean()),'minimumContrastRGBLevels':float(contrast.min()),'minimumYRange':[int(cols.argmin(axis=0).min()+445),int(cols.argmin(axis=0).max()+445)]}
def main():
 data=parse((ROOT/'web/assets/scene-data.js').read_text())
 old=None
 try:old=parse(subprocess.check_output(['git','show','07e06ae516479cfd69a96624f3a553af242cdd30:dist/assets/scene-data.js'],cwd=ROOT,text=True))
 except subprocess.CalledProcessError:pass
 metrics={'schema':'crf.boundary_context_qa.v0.5','inferredTextureStdRGB':texture(data),'inferredSeam':seam(data),'boundaryMixturePixels':data['boundaryMixture']['count'],'sourceBaselineAcceptance':'tests/test_core.cjs and frozen pixel gate','hiddenGroundTruthAvailable':False,'metricsMeaning':'Texture energy and seam continuity are structural checks, not truth or photographic similarity scores.'}
 if old:metrics['v04SameTextureStdRGB']=texture(old);metrics['v04SameSeam']=seam(old)
 assert metrics['inferredTextureStdRGB']>1.0,'Inferred plaster should retain non-flat texture'
 assert metrics['inferredSeam']['minimumContrastRGBLevels']>20,'Seam must remain darker across full removed signal'
 assert metrics['inferredSeam']['minimumYRange'][1]-metrics['inferredSeam']['minimumYRange'][0]<=1,'Seam should be continuous within raster phase'
 out=ROOT/'reports/v05/boundary_context.json';out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps(metrics,indent=2)+'\n');print(json.dumps(metrics,indent=2))
if __name__=='__main__':main()
