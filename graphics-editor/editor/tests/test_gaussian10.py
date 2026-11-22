"""Independent derivatives and exported-function parity for CRF 0.10."""
import json,math,subprocess,sys,unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import fit_gaussian10 as g

class Gaussian10Tests(unittest.TestCase):
    def test_native_footprint_gradients(self):
        h,w=11,13;yy,xx=np.mgrid[:h,:w]
        target=np.ascontiguousarray(np.stack((.12+xx*.008,.08+yy*.015,.04+(xx+yy)*.005),axis=2))
        weights=np.ones((h,w),np.float64);base=np.array([.10,.15,.12]);p=np.array([[6.31,5.27,2.13,1.47,.31,.14,-.02,.09]])
        pred=np.empty_like(target);grad=np.empty_like(p);fun=g.native_evaluator();loss=fun(p,1,w,h,target,weights,base,pred,grad)
        expected=np.tile(base,(h*w,1));rows,values=g.support(p[0],w,h);expected[rows]+=values[:,None]*p[0,5:]
        np.testing.assert_allclose(pred,expected.reshape(h,w,3),rtol=1e-12,atol=1e-12)
        analytic=grad.copy()*2/(h*w*3);eps=1e-5
        for j in range(8):
            a,b=p.copy(),p.copy()
            if j in (2,3):a[0,j]*=math.exp(eps);b[0,j]*=math.exp(-eps)
            else:a[0,j]+=eps;b[0,j]-=eps
            fa=fun(a,1,w,h,target,weights,base,pred,grad);fb=fun(b,1,w,h,target,weights,base,pred,grad)
            self.assertAlmostEqual((fa-fb)/(2*eps),analytic[0,j],delta=max(1e-8,abs(analytic[0,j])*1e-4),msg=str(j))

    def test_python_js_export_parity(self):
        asset={'schema':g.SCHEMA,'width':37,'height':23,'base':[.11,.12,.13],'splats':[[13.34,10.6,3.3,.8,.31,.4,-.03,.12],[23.3,15.2,.4,2.3,-.77,-.025,.06,.2]]}
        for profile in ['linear_srgb','srgb_encoded_0_1']:
            asset['kernel']={'colorSpace':profile};asset['alpha']={'encoding':'rle8','runs':[64,37*23]}
            result=subprocess.run(['node','-e',"const c=require('./web/crf-gaussian10.js');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(Buffer.from(c.render(JSON.parse(s)).data)));"],input=json.dumps(asset).encode(),cwd=ROOT,capture_output=True,check=True)
            expected=g.render_asset(asset);actual=np.frombuffer(result.stdout,np.uint8).reshape(expected.shape)
            np.testing.assert_array_equal(actual,expected)

    def test_per_observation_solver_retains_improvement(self):
        yy,xx=np.mgrid[:24,:32];rgba=np.dstack((80+xx*3,40+yy*4,60+np.sin(xx*.6)*15+yy*2,np.full_like(xx,255))).astype(np.uint8)
        asset=g.fit_image(rgba,budget=64,iterations=10,geometry_steps=5)
        self.assertFalse(asset['provenance']['neuralModelTraining'])
        self.assertFalse(asset['provenance']['sourceRGBEmbedded'])
        out=g.render_asset(asset)
        self.assertLess(g.legacy.metrics(rgba,out)['mae'],4)

    def test_colour_repair_reduces_error_without_more_gaussians(self):
        yy,xx=np.mgrid[:24,:32];rgba=np.dstack((80+xx*3,40+yy*4,60+np.sin(xx*.6)*15+yy*2,np.full_like(xx,255))).astype(np.uint8)
        asset=g.fit_image(rgba,budget=64,iterations=10,geometry_steps=0)
        for p in asset['splats']:p[5]+=.015
        before=g.legacy.metrics(rgba,g.render_asset(asset))['rmse']
        repaired=g.polish_asset(asset,rgba,iterations=20,rounds=2)
        self.assertEqual(len(asset['splats']),len(repaired['splats']))
        np.testing.assert_array_equal(np.asarray(asset['splats'])[:,:5],np.asarray(repaired['splats'])[:,:5])
        self.assertLess(g.legacy.metrics(rgba,g.render_asset(repaired))['rmse'],before)

if __name__=='__main__':unittest.main()
