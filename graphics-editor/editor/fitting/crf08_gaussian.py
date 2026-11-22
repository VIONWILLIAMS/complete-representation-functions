#!/usr/bin/env python3
"""CRF 0.8: sparse, residual-adaptive image-plane Gaussian reconstruction.

The exported asset contains fitted Gaussian parameters and optional semantic
coverage; no source RGB raster or lossless residual is embedded. This is an
image representation, not a trained text-to-image prior. RGB is sRGB-encoded
0..255 throughout. Signed basis coefficients are not alpha splats.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, sparse
from scipy.sparse.linalg import lsmr

SCHEMA = "crf.gaussian_asset.v0.8"
CUTOFF = 4.0

_NATIVE_SOURCE = r'''#include <cmath>
#include <algorithm>
extern "C" double evaluate(const double* params,int count,int width,int height,
const double* target,const double* alpha,const double* base,double* pred,double* grad){
 const int np=width*height;
 for(int i=0;i<np;i++)for(int k=0;k<3;k++)pred[i*3+k]=base[k];
 for(int j=0;j<count;j++){
  const double* p=params+j*8;double c=cos(p[4]),s=sin(p[4]);
  double rx=4*sqrt(p[2]*p[2]*c*c+p[3]*p[3]*s*s),ry=4*sqrt(p[2]*p[2]*s*s+p[3]*p[3]*c*c);
  int x0=std::max(0,(int)ceil(p[0]-rx-.5)),x1=std::min(width-1,(int)floor(p[0]+rx-.5));
  int y0=std::max(0,(int)ceil(p[1]-ry-.5)),y1=std::min(height-1,(int)floor(p[1]+ry-.5));
  for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
   double dx=x+.5-p[0],dy=y+.5-p[1],u=(c*dx+s*dy)/p[2],v=(-s*dx+c*dy)/p[3],q=u*u+v*v;
   if(q>16)continue;double w=exp(-.5*q);int i=(y*width+x)*3;
   for(int k=0;k<3;k++)pred[i+k]+=w*p[5+k];
  }
 }
 double loss=0;for(int i=0;i<np;i++)for(int k=0;k<3;k++){double d=pred[3*i+k]-target[3*i+k];loss+=d*d*alpha[i];}
 if(!grad)return loss/(np*3);
 #pragma omp parallel for num_threads(2)
 for(int j=0;j<count;j++){
  const double* p=params+j*8;double* gg=grad+j*8;for(int k=0;k<8;k++)gg[k]=0;
  double c=cos(p[4]),s=sin(p[4]);
  double rx=4*sqrt(p[2]*p[2]*c*c+p[3]*p[3]*s*s),ry=4*sqrt(p[2]*p[2]*s*s+p[3]*p[3]*c*c);
  int x0=std::max(0,(int)ceil(p[0]-rx-.5)),x1=std::min(width-1,(int)floor(p[0]+rx-.5));
  int y0=std::max(0,(int)ceil(p[1]-ry-.5)),y1=std::min(height-1,(int)floor(p[1]+ry-.5));
  for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
   double dx=x+.5-p[0],dy=y+.5-p[1],u=(c*dx+s*dy)/p[2],v=(-s*dx+c*dy)/p[3],q=u*u+v*v;
   if(q>16)continue;double w=exp(-.5*q),dot=0;int i=y*width+x;
   for(int k=0;k<3;k++){double e=(pred[i*3+k]-target[i*3+k])*alpha[i];gg[5+k]+=e*w;dot+=e*p[5+k];}
   dot*=w;gg[0]+=dot*(u*c/p[2]-v*s/p[3]);gg[1]+=dot*(u*s/p[2]+v*c/p[3]);
   gg[2]+=dot*u*u;gg[3]+=dot*v*v;gg[4]+=dot*u*v*(p[2]/p[3]-p[3]/p[2]);
  }
 }
 return loss/(np*3);
}'''


def refine_geometry(params, rgb, alpha, base, steps=60, progress=None):
    """Analytic geometry gradients + Adam; best whole-state checkpoint retained.

    C++ accelerates only this transparent numerical loop. Gaussian formulas and
    derivatives are explicitly defined above; rendering never calls a model.
    If the optional compiler is unavailable, export the sparse-solver result.
    """
    directory=Path(tempfile.gettempdir())/"crf08-native"
    directory.mkdir(exist_ok=True)
    digest=hashlib.sha256(_NATIVE_SOURCE.encode()).hexdigest()[:16]
    source=directory/(digest+"-"+str(os.getpid())+".cpp");binary=directory/(digest+".so")
    if not binary.exists():
        compiler=shutil.which("g++") or shutil.which("clang++")
        if not compiler:
            return params,{"available":False,"reason":"optional_native_compiler_unavailable"}
        source.write_text(_NATIVE_SOURCE)
        pending=directory/(digest+"-"+str(os.getpid())+".so")
        compiled=subprocess.run([compiler,"-O3","-ffast-math","-shared","-fPIC","-fopenmp",str(source),"-o",str(pending)],capture_output=True)
        if compiled.returncode:
            compiled=subprocess.run([compiler,"-O3","-ffast-math","-shared","-fPIC",str(source),"-o",str(pending)],capture_output=True)
        if compiled.returncode:
            return params,{"available":False,"reason":"optional_native_compiler_failed"}
        pending.replace(binary)
        source.unlink(missing_ok=True)
    lib=ctypes.CDLL(str(binary));fun=lib.evaluate
    ptr=np.ctypeslib.ndpointer(dtype=np.float64,flags="C_CONTIGUOUS")
    fun.argtypes=[ptr,ctypes.c_int,ctypes.c_int,ctypes.c_int,ptr,ptr,ptr,ptr,ptr]
    fun.restype=ctypes.c_double
    p=np.ascontiguousarray(params,np.float64);target=np.ascontiguousarray(rgb,np.float64)
    weights=np.ascontiguousarray(alpha/255.0,np.float64);base=np.ascontiguousarray(base,np.float64)
    pred=np.empty_like(target);grad=np.zeros_like(p);m=np.zeros_like(p);v=np.zeros_like(p)
    best=p.copy();best_loss=math.inf;history=[]
    rates=np.array([.06,.06,.018,.018,.025,.7,.7,.7],np.float64)
    height,width=rgb.shape[:2]
    for step in range(steps+1):
        loss=fun(p,len(p),width,height,target,weights,base,pred,grad)
        if loss<best_loss:best_loss=loss;best=p.copy()
        if step%10==0 or step==steps:
            row={"step":step,"floatMSE":float(loss),"bestFloatMSE":float(best_loss)};history.append(row)
            if progress:progress(step,pred,loss)
        if step==steps:break
        m=.9*m+.1*grad;v=.999*v+.001*grad*grad
        change=rates*(m/(1-.9**(step+1)))/(np.sqrt(v/(1-.999**(step+1)))+1e-8)
        change*=max(.1,1-step/max(1,steps))
        p[:,0:2]-=change[:,0:2]
        p[:,2:4]*=np.exp(-change[:,2:4])
        p[:,4:]-=change[:,4:]
        p[:,0]=np.clip(p[:,0],-.5,width+.5);p[:,1]=np.clip(p[:,1],-.5,height+.5)
        p[:,2:4]=np.clip(p[:,2:4],.3,max(width,height));p[:,5:]=np.clip(p[:,5:],-4000,4000)
    return best,{"available":True,"steps":steps,"bestFloatMSE":best_loss,"history":history,"parameters":"centre_x,centre_y,log_sigma_x,log_sigma_y,theta,rgb_coefficients"}


def metrics(reference, prediction, mask=None):
    a = np.asarray(reference, dtype=np.float64)[..., :3]
    b = np.clip(np.floor(np.asarray(prediction, dtype=np.float64)[..., :3] + .5), 0, 255)
    diff = a - b
    selected = np.ones(a.shape[:2], bool) if mask is None else np.asarray(mask) > 0
    d = diff[selected]
    mse = float(np.mean(d*d)) if d.size else 0.0
    exact = np.all(diff == 0, axis=2)
    # Fixed Gaussian-window SSIM over decoded sRGB, per channel, population variance.
    mu_a = ndimage.gaussian_filter(a, (1.5, 1.5, 0), truncate=3.5)
    mu_b = ndimage.gaussian_filter(b, (1.5, 1.5, 0), truncate=3.5)
    va = np.maximum(0, ndimage.gaussian_filter(a*a, (1.5, 1.5, 0), truncate=3.5)-mu_a*mu_a)
    vb = np.maximum(0, ndimage.gaussian_filter(b*b, (1.5, 1.5, 0), truncate=3.5)-mu_b*mu_b)
    cov = ndimage.gaussian_filter(a*b, (1.5, 1.5, 0), truncate=3.5)-mu_a*mu_b
    smap = ((2*mu_a*mu_b+6.5025)*(2*cov+58.5225))/((mu_a*mu_a+mu_b*mu_b+6.5025)*(va+vb+58.5225))
    return {"mae": float(np.mean(np.abs(d))) if d.size else 0.0,
            "rmse": math.sqrt(mse), "psnr": 10*math.log10(255*255/mse) if mse else None,
            "ssim": float(smap[selected].mean()) if d.size else 1.0,
            "maxError": int(np.max(np.abs(d))) if d.size else 0,
            "exactRGBFraction": float(exact[selected].mean()) if d.size else 1.0,
            "evaluatedPixels": int(selected.sum()), "rounding": "floor(x+0.5), clamp 0..255"}


def encode_alpha(alpha):
    a = np.asarray(alpha, np.uint8).ravel()
    if np.all(a == 255):
        return None
    starts = np.r_[0, np.flatnonzero(a[1:] != a[:-1])+1]
    counts = np.diff(np.r_[starts, a.size])
    runs = np.column_stack((a[starts].astype(int), counts)).ravel().tolist()
    return {"encoding": "rle8", "runs": runs}


def decode_alpha(asset):
    count = asset["width"] * asset["height"]
    encoded = asset.get("alpha")
    if encoded is None:
        return np.full((asset["height"], asset["width"]), 255, np.uint8)
    runs = np.asarray(encoded["runs"], dtype=np.int64).reshape(-1, 2)
    a = np.repeat(runs[:, 0], runs[:, 1])
    if a.size != count:
        raise ValueError("alpha coverage size mismatch")
    return a.reshape(asset["height"], asset["width"]).astype(np.uint8)


def support(g, width, height):
    x, y, sx, sy, theta = map(float, g[:5])
    c, s = math.cos(theta), math.sin(theta)
    rx = CUTOFF * math.sqrt(sx*sx*c*c + sy*sy*s*s)
    ry = CUTOFF * math.sqrt(sx*sx*s*s + sy*sy*c*c)
    x0, x1 = max(0, math.ceil(x-rx-.5)), min(width-1, math.floor(x+rx-.5))
    y0, y1 = max(0, math.ceil(y-ry-.5)), min(height-1, math.floor(y+ry-.5))
    if x1 < x0 or y1 < y0:
        return np.empty(0, np.int32), np.empty(0, np.float64)
    yy, xx = np.mgrid[y0:y1+1, x0:x1+1]
    dx, dy = xx+.5-x, yy+.5-y
    q = ((c*dx+s*dy)/sx)**2 + ((-s*dx+c*dy)/sy)**2
    keep = q <= CUTOFF*CUTOFF
    return (yy[keep]*width+xx[keep]).astype(np.int32), np.exp(-.5*q[keep])


def dictionary(gaussians, width, height):
    rows, weights, indptr = [], [], [0]
    for g in gaussians:
        r, w = support(g, width, height)
        rows.append(r); weights.append(w.astype(np.float32))
        indptr.append(indptr[-1]+len(r))
    if not rows:
        return sparse.csc_matrix((width*height, 0), dtype=np.float64)
    return sparse.csc_matrix((np.concatenate(weights), np.concatenate(rows), np.asarray(indptr)), shape=(width*height, len(gaussians)))


def render_asset(asset):
    width, height = int(asset["width"]), int(asset["height"])
    output = np.tile(np.asarray(asset["base"], np.float64), (height*width, 1))
    for g in asset["splats"]:
        rows, w = support(g, width, height)
        output[rows] += w[:, None]*np.asarray(g[5:8], np.float64)
    rgb = np.clip(np.floor(output.reshape(height, width, 3)+.5), 0, 255).astype(np.uint8)
    return np.dstack((rgb, decode_alpha(asset)))


def grid_gaussians(width, height, count, alpha):
    # Cover the visible domain, including the half-cell margins.
    fraction = max(.08, float(np.mean(alpha > 0)))
    spacing = max(.8, math.sqrt(width*height*fraction/max(1, count)))
    nx, ny = max(1, int(math.ceil(width/spacing))), max(1, int(math.ceil(height/spacing)))
    dx, dy = width/nx, height/ny
    gs=[]
    for iy in range(ny):
        for ix in range(nx):
            x,y=(ix+.5)*dx,(iy+.5)*dy
            if alpha[min(height-1, int(y)), min(width-1, int(x))] > 0:
                gs.append([x,y,max(.42, dx*.56),max(.42, dy*.56),0.0])
    if len(gs)>count:
        gs=[gs[i] for i in np.linspace(0,len(gs)-1,count,dtype=int)]
    return np.asarray(gs, np.float64)


def adaptive_gaussians(residual, alpha, count, previous_spacing):
    """Residual peaks determine centres; local least-squares chooses covariance."""
    height,width=residual.shape[:2]
    energy = np.mean(residual**2, axis=2)*(alpha/255.0)
    stride=max(1, int(math.sqrt(max(1, int((alpha>0).sum()))/max(1,count))))
    candidates=[]
    # One strongest unexplained point per cell, then globally prioritize energy.
    for y in range(0,height,stride):
        for x in range(0,width,stride):
            cell=energy[y:y+stride,x:x+stride]
            k=int(cell.argmax()); yy=y+k//cell.shape[1];xx=x+k%cell.shape[1]
            if energy[yy,xx] > .001:
                candidates.append((float(energy[yy,xx]),xx+.5,yy+.5))
    candidates.sort(reverse=True)
    # Additional highest residual positions if cells yield fewer than budget.
    if len(candidates)<count:
        used={(c[1],c[2]) for c in candidates}
        flat=np.argsort(energy.ravel())[::-1]
        for k in flat[:min(energy.size,count*4)]:
            x,y=float(k%width)+.5,float(k//width)+.5
            if (x,y) not in used and energy.flat[k]>.001:
                candidates.append((float(energy.flat[k]),x,y)); used.add((x,y))
            if len(candidates)>=count: break
    gx=ndimage.sobel(np.mean(residual,axis=2),axis=1)
    gy=ndimage.sobel(np.mean(residual,axis=2),axis=0)
    rflat=residual.reshape(-1,3)
    aflat=alpha.ravel()/255.0
    gs=[]
    # Geometry chosen by residual reduction, not source-value replay.
    scales=[.55, .85, max(1.1, previous_spacing*.48)]
    for _,x,y in candidates[:count]:
        theta=math.atan2(gy[int(y),int(x)],gx[int(y),int(x)])+math.pi/2
        best_score=-1;best=None
        for sx,sy,angle in [(s,s,0.) for s in scales]+[(max(1.,previous_spacing*.62),.55,theta)]:
            g=[x,y,sx,sy,angle]
            rows,w=support(g,width,height)
            ww=w*aflat[rows]
            den=float(np.dot(w,ww))+1e-9
            co=(ww[:,None]*rflat[rows]).sum(axis=0)/den
            score=float(np.dot(co,co)*den)
            if score>best_score:best_score=score;best=g
        gs.append(best)
    return np.asarray(gs,np.float64).reshape(-1,5)


def fit_image(rgba, budget=4096, iterations=24, asset_id="observation", progress=None, geometry_steps=60, initial_fraction=.35):
    started=time.perf_counter()
    rgba=np.asarray(rgba,np.uint8)
    rgb=rgba[...,:3].astype(np.float64)
    height,width=rgb.shape[:2]
    alpha=rgba[...,3] if rgba.shape[2]==4 else np.full((height,width),255,np.uint8)
    if not np.any(alpha):raise ValueError("Image has no visible pixels")
    budget=max(16,min(int(budget), min(262144, int((alpha>0).sum()))))
    weights=np.sqrt(alpha.ravel()/255.0)
    base=np.average(rgb.reshape(-1,3),axis=0,weights=weights**2)
    target=rgb.reshape(-1,3)-base
    first=max(16,int(budget*initial_fraction))
    geometry=grid_gaussians(width,height,first,alpha)
    matrix=dictionary(geometry,width,height)
    # Sample initialization establishes an auditable fixed-grid baseline.
    sampled=rgb[np.minimum(height-1,geometry[:,1].astype(int)),np.minimum(width-1,geometry[:,0].astype(int))]-base
    normalization=np.asarray(matrix.sum(axis=1)).ravel()
    centre_indices=np.minimum(height-1,geometry[:,1].astype(int))*width+np.minimum(width-1,geometry[:,0].astype(int))
    coefficients=sampled/np.maximum(.2,normalization[centre_indices,None])
    history=[]
    def record(phase, pred):
        m=metrics(rgb,pred.reshape(height,width,3),alpha)
        row={"phase":phase,"count":len(geometry),"elapsedSeconds":round(time.perf_counter()-started,3),**m}
        history.append(row)
        if progress:progress(row)
        return row
    current=matrix@coefficients+base
    record("grid_sample_initialization",current)
    best_error=math.inf;best_coeff=None
    for stage in range(3):
        weighted=matrix.multiply(weights[:,None]).tocsc()
        # Solve delta against the current render. Coefficients are unrestricted
        # signed RGB; small regularization prevents explosive hidden-region fits.
        residual=(target-matrix@coefficients)*weights[:,None]
        for channel in range(3):
            update=lsmr(weighted,residual[:,channel],damp=.015,atol=1e-5,btol=1e-5,maxiter=iterations)[0]
            coefficients[:,channel]+=update
        current=matrix@coefficients+base
        row=record("fixed_geometry_least_squares" if stage==0 else "adaptive_geometry_least_squares",current)
        error=float(np.mean(((rgb.reshape(-1,3)-current)*weights[:,None])**2))
        if error<best_error:
            best_error=error;best_coeff=coefficients.copy()
        else:
            coefficients=best_coeff.copy(); current=matrix@coefficients+base
        if stage==2 or len(geometry)>=budget:break
        remaining=budget-len(geometry)
        add=remaining if stage==1 else max(1,int(remaining*.65))
        spacing=math.sqrt(max(1,int((alpha>0).sum()))/len(geometry))
        extra=adaptive_gaussians((rgb.reshape(-1,3)-current).reshape(height,width,3),alpha,add,spacing)
        if not len(extra):break
        geometry=np.vstack((geometry,extra));coefficients=np.vstack((coefficients,np.zeros((len(extra),3))))
        # The old solution plus zero coefficients is preserved exactly.
        best_coeff=coefficients.copy()
        matrix=sparse.hstack((matrix,dictionary(extra,width,height)),format="csc")
    splats=np.column_stack((geometry,coefficients))
    geometry_report={"available":False,"steps":0}
    if geometry_steps:
        splats,geometry_report=refine_geometry(splats,rgb,alpha,base,geometry_steps,
            lambda step,pred,loss:record("geometry_gradient_"+str(step),pred))
        geometry=splats[:,:5];coefficients=splats[:,5:]
    asset={"schema":SCHEMA,"id":asset_id,"width":width,"height":height,
           "base":[round(float(c),6) for c in base],
           "splats":np.round(splats,6).tolist(),
           "kernel":{"type":"signed_additive_gaussian","cutoffSigma":4,"sample":"pixel_centres","colorSpace":"srgb_encoded_0_255"},
           "provenance":{"kind":"observed","algorithm":"crf08-residual-adaptive-lsmr-adam-v2","budget":budget,"sourceRGBEmbedded":False,"losslessResidualEmbedded":False},
           "fit":{"iterationsPerStage":iterations,"initialFraction":initial_fraction,"geometryOptimization":geometry_report,"history":history,"seconds":round(time.perf_counter()-started,3),"bestCheckpointRule":"lowest_weighted_float_mse"}}
    encoded=encode_alpha(alpha)
    if encoded:asset["alpha"]=encoded
    return asset


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=Path)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--budget",type=int,default=16384)
    parser.add_argument("--iterations",type=int,default=24)
    parser.add_argument("--geometry-steps",type=int,default=60)
    parser.add_argument("--initial-fraction",type=float,default=.35)
    parser.add_argument("--max-side",type=int,default=0)
    parser.add_argument("--id",default=None)
    args=parser.parse_args()
    image=Image.open(args.input).convert("RGBA")
    original_size=image.size
    if args.max_side and max(image.size)>args.max_side:
        image.thumbnail((args.max_side,args.max_side),Image.Resampling.LANCZOS)
    rgba=np.asarray(image)
    asset=fit_image(rgba,args.budget,args.iterations,args.id or args.input.stem,lambda p:print(json.dumps(p),flush=True),args.geometry_steps,args.initial_fraction)
    asset["provenance"].update({"sourceSHA256":hashlib.sha256(args.input.read_bytes()).hexdigest(),"originalSize":list(original_size),"fittedSize":list(image.size)})
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(asset,separators=(",",":")),encoding="utf8")
    reconstructed=render_asset(asset)
    Image.fromarray(reconstructed).save(args.output.with_suffix(".png"))
    final=metrics(rgba,reconstructed,rgba[...,3])
    error=np.abs(rgba[...,:3].astype(float)-reconstructed[...,:3].astype(float)).mean(axis=2)
    heat=np.stack((np.clip(error*8,0,255),np.clip(error*2,0,255),np.zeros_like(error)),axis=-1).astype(np.uint8)
    Image.fromarray(heat).save(args.output.with_name(args.output.stem+".error.png"))
    report={"assetId":asset["id"],"source":str(args.input),"sourceSHA256":asset["provenance"]["sourceSHA256"],"width":image.width,"height":image.height,"gaussians":len(asset["splats"]),"assetBytes":args.output.stat().st_size,"sourceRGBEmbedded":False,"losslessResidualEmbedded":False,"renderedFromExportOnly":True,"metrics":final,"fit":asset["fit"],"targets":{"pilot":{"psnr":32,"ssim":.95},"highFidelity":{"psnr":38,"ssim":.98}},"passedPilot":(final["psnr"] is None or final["psnr"]>=32) and final["ssim"]>=.95,"passedHighFidelity":(final["psnr"] is None or final["psnr"]>=38) and final["ssim"]>=.98}
    args.output.with_name(args.output.stem+".report.json").write_text(json.dumps(report,indent=2),encoding="utf8")
    print(json.dumps({"complete":True,"output":str(args.output),**{k:report[k] for k in ["gaussians","assetBytes","metrics","passedPilot","passedHighFidelity"]}}),flush=True)


if __name__=="__main__":main()
