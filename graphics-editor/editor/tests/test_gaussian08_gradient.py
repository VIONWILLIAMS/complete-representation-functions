"""Analytic geometry derivative checks against central finite differences."""
import ctypes
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'fitting'))
import crf08_gaussian as g


class GradientChecks(unittest.TestCase):
    def test_geometry_and_colour_derivatives(self):
        h,w=13,17
        yy,xx=np.mgrid[:h,:w]
        target=np.ascontiguousarray(np.stack((xx*8,yy*12,(xx+yy)*5),axis=2),dtype=np.float64)
        alpha=np.full((h,w),255,dtype=np.uint8)
        base=np.array([50.,70.,90.])
        p=np.array([[7.31,6.27,2.13,1.47,.31,40.,-20.,30.]],dtype=np.float64)
        g.refine_geometry(p,target,alpha,base,steps=0)
        digest=hashlib.sha256(g._NATIVE_SOURCE.encode()).hexdigest()[:16]
        lib=ctypes.CDLL(str(Path(tempfile.gettempdir())/'crf08-native'/(digest+'.so')))
        ptr=np.ctypeslib.ndpointer(dtype=np.float64,flags='C_CONTIGUOUS')
        fun=lib.evaluate;fun.argtypes=[ptr,ctypes.c_int,ctypes.c_int,ctypes.c_int,ptr,ptr,ptr,ptr,ptr];fun.restype=ctypes.c_double
        pred=np.empty_like(target);grad=np.empty_like(p);weights=np.ones((h,w),dtype=np.float64)
        fun(p,1,w,h,target,weights,base,pred,grad)
        analytic=grad.copy()*2/(w*h*3)
        eps=1e-5
        for j in range(8):
            plus=p.copy();minus=p.copy()
            if j in (2,3):plus[0,j]*=np.exp(eps);minus[0,j]*=np.exp(-eps)
            else:plus[0,j]+=eps;minus[0,j]-=eps
            fp=fun(plus,1,w,h,target,weights,base,pred,grad)
            fm=fun(minus,1,w,h,target,weights,base,pred,grad)
            finite=(fp-fm)/(2*eps)
            self.assertAlmostEqual(finite,analytic[0,j],delta=max(1e-5,abs(finite)*1e-4),msg=f'parameter {j}')


if __name__=='__main__':unittest.main()
