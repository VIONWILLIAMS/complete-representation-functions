#!/usr/bin/env python3
"""CRF 0.10 per-observation Gaussian parameter solving; no model training.

Uses the audited 0.8 sparse-solver utilities, with a different rendering model:
linear light, Gaussian pixel-footprint integration, structure-aware positions,
iteratively reweighted colour solving, and matching analytic geometry gradients.
Exported functions contain no source RGB raster or lossless residual raster.
"""
from __future__ import annotations
import argparse, ctypes, hashlib, heapq, json, math, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage, sparse
from scipy.sparse.linalg import lsmr

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'fitting'))
import crf08_gaussian as legacy

SCHEMA='crf.gaussian_asset.v0.10'
PIXEL_VARIANCE=1/12
SOURCE_SHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

def linear(x):
    x=np.asarray(x,np.float64)/255
    return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)

def srgb(x):
    x=np.asarray(x,np.float64)
    return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055)

def rgb8(x): return np.clip(np.floor(srgb(x)*255+.5),0,255).astype(np.uint8)

def derivative(x):
    return np.where(x<=.0031308,12.92,1.055/2.4*np.maximum(x,1e-8)**(1/2.4-1))

def support(g,width,height,pixel_variance=PIXEL_VARIANCE):
    x,y,sx,sy,theta=map(float,g[:5]);co,si=math.cos(theta),math.sin(theta)
    ex,ey=math.sqrt(sx*sx+pixel_variance),math.sqrt(sy*sy+pixel_variance)
    gain=sx*sy/(ex*ey)
    rx,ry=4*math.hypot(ex*co,ey*si),4*math.hypot(ex*si,ey*co)
    x0,x1=max(0,math.ceil(x-rx-.5)),min(width-1,math.floor(x+rx-.5))
    y0,y1=max(0,math.ceil(y-ry-.5)),min(height-1,math.floor(y+ry-.5))
    if x1<x0 or y1<y0:return np.empty(0,np.int32),np.empty(0,np.float64)
    yy,xx=np.mgrid[y0:y1+1,x0:x1+1];dx,dy=xx+.5-x,yy+.5-y
    q=((co*dx+si*dy)/ex)**2+((-si*dx+co*dy)/ey)**2;keep=q<=16
    return (yy[keep]*width+xx[keep]).astype(np.int32),gain*np.exp(-.5*q[keep])

def dictionary(gaussians,width,height):
    rows,values,indptr=[],[],[0]
    for g in gaussians:
        r,v=support(g,width,height);rows.append(r);values.append(v.astype(np.float32));indptr.append(indptr[-1]+len(r))
    if not rows:return sparse.csc_matrix((width*height,0))
    return sparse.csc_matrix((np.concatenate(values),np.concatenate(rows),np.asarray(indptr)),shape=(width*height,len(gaussians)))

def structure_initialization(rgb,alpha,count):
    """Allocate cells by observed variance, not a learned initializer network."""
    h,w=rgb.shape[:2];lum=rgb@np.array([.2126,.7152,.0722])
    gx,gy=ndimage.sobel(lum,axis=1),ndimage.sobel(lum,axis=0)
    xx=ndimage.gaussian_filter(gx*gx,1.2);yy=ndimage.gaussian_filter(gy*gy,1.2);xy=ndimage.gaussian_filter(gx*gy,1.2)
    values=np.dstack((rgb,rgb*rgb,alpha/255))
    integral=np.pad(values.cumsum(0).cumsum(1),((1,0),(1,0),(0,0)))
    def region(x0,y0,x1,y1):return integral[y1,x1]-integral[y0,x1]-integral[y1,x0]+integral[y0,x0]
    def score(box):
        x0,y0,x1,y1=box;n=(x1-x0)*(y1-y0);s=region(*box);mu=s[:3]/n
        return float(np.maximum(0,s[3:6]-n*mu*mu).sum()*min(1,s[6]/max(1,n))+.00005*n)
    heap=[(-score((0,0,w,h)),0,(0,0,w,h))];serial=1;leaves=[]
    while heap and len(heap)+len(leaves)<count:
        _,_,box=heapq.heappop(heap);x0,y0,x1,y1=box
        if x1-x0<2 and y1-y0<2:leaves.append(box);continue
        if x1-x0>=y1-y0 and x1-x0>=2:
            mid=(x0+x1)//2;children=[(x0,y0,mid,y1),(mid,y0,x1,y1)]
        else:
            mid=(y0+y1)//2;children=[(x0,y0,x1,mid),(x0,mid,x1,y1)]
        for b in children:heapq.heappush(heap,(-score(b),serial,b));serial+=1
    leaves.extend(x[2]for x in heap);gs=[]
    for x0,y0,x1,y1 in leaves:
        if not np.any(alpha[y0:y1,x0:x1]):continue
        x,y=(x0+x1)/2,(y0+y1)/2;ix,iy=min(w-1,int(x)),min(h-1,int(y))
        a,b,c=xx[iy,ix],xy[iy,ix],yy[iy,ix];coherence=math.hypot(a-c,2*b)/(a+c+1e-8)
        if coherence>.25:
            theta=.5*math.atan2(2*b,a-c)+math.pi/2
            long=max(.45,math.sqrt((x1-x0)*(y1-y0))*.68);short=max(.3,long*(1-.55*coherence))
            gs.append([x,y,long,short,theta])
        else:gs.append([x,y,max(.4,(x1-x0)*.56),max(.4,(y1-y0)*.56),0])
    return np.asarray(gs,np.float64).reshape(-1,5)

# Reuse the explicit native loop layout, replacing only its mathematical kernel.
# Its numerical derivatives are verified independently in test_gaussian10.py.
_NATIVE_SOURCE=legacy._NATIVE_SOURCE
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('extern "C" double evaluate', '''inline double gamma10(double x){return x<=.0031308?12.92*x:1.055*pow(std::max(0.,x),1./2.4)-.055;}
inline double derivative10(double x){return x<=.0031308?12.92:1.055/2.4*pow(std::max(1e-8,x),1./2.4-1.);}
extern "C" double evaluate''')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('double c=cos(p[4]),s=sin(p[4]);','double c=cos(p[4]),s=sin(p[4]),sx=sqrt(p[2]*p[2]+1./12.),sy=sqrt(p[3]*p[3]+1./12.),gain=p[2]*p[3]/(sx*sy),fx=p[2]*p[2]/(sx*sx),fy=p[3]*p[3]/(sy*sy);')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('p[2]*p[2]*c*c+p[3]*p[3]*s*s','sx*sx*c*c+sy*sy*s*s').replace('p[2]*p[2]*s*s+p[3]*p[3]*c*c','sx*sx*s*s+sy*sy*c*c')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('/p[2]','/sx').replace('/p[3]','/sy').replace('p[2]/sy-p[3]/sx','sx/sy-sy/sx')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('double w=exp(-.5*q)','double w=gain*exp(-.5*q)')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('double d=pred[3*i+k]-target[3*i+k]','double d=gamma10(pred[3*i+k])-gamma10(target[3*i+k])')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('double e=(pred[i*3+k]-target[i*3+k])*alpha[i]','double e=(gamma10(pred[i*3+k])-gamma10(target[i*3+k]))*derivative10(pred[i*3+k])*alpha[i]')
_NATIVE_SOURCE=_NATIVE_SOURCE.replace('gg[2]+=dot*u*u;gg[3]+=dot*v*v;','gg[2]+=dot*(1-fx+u*u*fx);gg[3]+=dot*(1-fy+v*v*fy);')

def native_evaluator():
    directory=Path(tempfile.gettempdir())/'crf10-native';directory.mkdir(exist_ok=True)
    digest=hashlib.sha256(_NATIVE_SOURCE.encode()).hexdigest()[:16];binary=directory/(digest+'.so')
    if not binary.exists():
        compiler=shutil.which('g++')or shutil.which('clang++')
        if not compiler:raise RuntimeError('C++ compiler unavailable for analytic geometry optimizer')
        source=directory/(digest+f'-{os.getpid()}.cpp');pending=source.with_suffix('.so');source.write_text(_NATIVE_SOURCE)
        r=subprocess.run([compiler,'-O3','-shared','-fPIC','-fopenmp',str(source),'-o',str(pending)],capture_output=True)
        if r.returncode:r=subprocess.run([compiler,'-O3','-shared','-fPIC',str(source),'-o',str(pending)],capture_output=True)
        if r.returncode:raise RuntimeError('Native geometry compiler failed')
        pending.replace(binary);source.unlink()
    lib=ctypes.CDLL(str(binary));fun=lib.evaluate;ptr=np.ctypeslib.ndpointer(dtype=np.float64,flags='C_CONTIGUOUS')
    fun.argtypes=[ptr,ctypes.c_int,ctypes.c_int,ctypes.c_int,ptr,ptr,ptr,ptr,ptr];fun.restype=ctypes.c_double
    return fun

def refine_geometry(params,target,alpha,base,steps,progress=None):
    fun=native_evaluator();p=np.ascontiguousarray(params,np.float64);target=np.ascontiguousarray(target,np.float64);weights=np.ascontiguousarray(alpha/255,np.float64);base=np.ascontiguousarray(base,np.float64)
    pred=np.empty_like(target);grad=np.zeros_like(p);m=np.zeros_like(p);v=np.zeros_like(p);h,w=target.shape[:2]
    best=p.copy();best_loss=math.inf;history=[];rates=np.array([.045,.045,.012,.012,.02,.003,.003,.003])
    for step in range(steps+1):
        loss=fun(p,len(p),w,h,target,weights,base,pred,grad)
        if loss<best_loss:best_loss=loss;best=p.copy()
        if step%10==0 or step==steps:
            history.append({'step':step,'perceptualMSE':float(loss),'bestPerceptualMSE':float(best_loss)})
            if progress:progress(step,pred.copy(),loss)
        if step==steps:break
        m=.9*m+.1*grad;v=.999*v+.001*grad*grad
        change=rates*(m/(1-.9**(step+1)))/(np.sqrt(v/(1-.999**(step+1)))+1e-9)*max(.15,1-step/max(1,steps))
        p[:,:2]-=change[:,:2];p[:,2:4]*=np.exp(-change[:,2:4]);p[:,4:]-=change[:,4:]
        p[:,0]=np.clip(p[:,0],-.5,w+.5);p[:,1]=np.clip(p[:,1],-.5,h+.5);p[:,2:4]=np.clip(p[:,2:4],.15,max(w,h));p[:,5:]=np.clip(p[:,5:],-16,16)
    return best,{'steps':steps,'history':history,'bestPerceptualMSE':float(best_loss),'parameters':'centre_xy,log_sigma_xy,rotation,linear_rgb_coefficients','pixelFootprintGradient':True}

def render_asset(asset):
    w,h=asset['width'],asset['height'];pred=np.tile(np.asarray(asset['base'],np.float64),(w*h,1))
    for g in asset['splats']:
        rows,weights=support(g,w,h);pred[rows]+=weights[:,None]*np.asarray(g[5:8])
    field=pred.reshape(h,w,3)
    rgb=np.clip(np.floor(field*255+.5),0,255).astype(np.uint8)if asset.get('kernel',{}).get('colorSpace')=='srgb_encoded_0_1'else rgb8(field)
    return np.dstack((rgb,legacy.decode_alpha(asset)))

def fit_image(rgba,budget=8192,iterations=20,asset_id='observation',progress=None,geometry_steps=30):
    started=time.perf_counter();rgba=np.asarray(rgba,np.uint8);target=linear(rgba[...,:3]);h,w=target.shape[:2]
    alpha=rgba[...,3]if rgba.shape[2]==4 else np.full((h,w),255,np.uint8)
    if not np.any(alpha):raise ValueError('No visible pixels')
    budget=max(16,min(int(budget),262144,int((alpha>0).sum())));vis=alpha.ravel()/255
    base=np.average(target.reshape(-1,3),axis=0,weights=vis)
    n0=max(16,int(budget*.35));uniform=legacy.grid_gaussians(w,h,max(8,int(n0*.7)),alpha);structured=structure_initialization(target,alpha,max(8,n0-len(uniform)));geometry=np.vstack((uniform,structured));matrix=dictionary(geometry,w,h)
    coeff=np.zeros((len(geometry),3));history=[];flat=target.reshape(-1,3)
    def record(phase,pred):
        row={'phase':phase,'count':len(geometry),'elapsedSeconds':round(time.perf_counter()-started,3),**legacy.metrics(rgba,rgb8(pred.reshape(h,w,3)),alpha)};history.append(row)
        if progress:progress(row)
    record('uniform_coverage_and_structure_initialization',matrix@coeff+base)
    for stage in range(3):
        for irls in range(3):
            current=matrix@coeff+base;old_error=float(np.sum((srgb(current)-srgb(flat))**2*vis[:,None]));old=coeff.copy()
            for channel in range(3):
                # Gauss-Newton in displayed sRGB; parameters remain linear radiance.
                root_weight=np.sqrt(vis);jacobian=np.clip(derivative(current[:,channel]),.4,12.92)
                weighted=matrix.multiply((root_weight*jacobian)[:,None]).tocsc()
                residual=(srgb(flat[:,channel])-srgb(current[:,channel]))*root_weight
                update=lsmr(weighted,residual,damp=.02,atol=2e-6,btol=2e-6,maxiter=iterations)[0]
                coeff[:,channel]+=update
            current=matrix@coeff+base;new_error=float(np.sum((srgb(current)-srgb(flat))**2*vis[:,None]))
            if new_error>old_error:
                # A backtracked update is accepted only against actual image loss.
                proposal=coeff.copy();coeff=old.copy()
                for fraction in [.5,.25,.125,.0625]:
                    candidate=old+(proposal-old)*fraction;pred=matrix@candidate+base
                    error=float(np.sum((srgb(pred)-srgb(flat))**2*vis[:,None]))
                    if error<old_error:coeff=candidate;break
                current=matrix@coeff+base
        record('linear_light_irls_'+str(stage),current)
        if stage==2 or len(geometry)>=budget:break
        add=budget-len(geometry)if stage==1 else max(1,int((budget-len(geometry))*.65));spacing=math.sqrt(max(1,np.count_nonzero(alpha))/len(geometry))
        extra=legacy.adaptive_gaussians((srgb(flat)-srgb(current)).reshape(h,w,3)*255,alpha,add,spacing)
        if not len(extra):break
        geometry=np.vstack((geometry,extra));coeff=np.vstack((coeff,np.zeros((len(extra),3))));matrix=sparse.hstack((matrix,dictionary(extra,w,h)),format='csc')
    splats=np.column_stack((geometry,coeff));georeport={'steps':0}
    if geometry_steps:
        splats,georeport=refine_geometry(splats,target,alpha,base,geometry_steps,lambda step,pred,loss:record('footprint_geometry_'+str(step),pred))
    asset={'schema':SCHEMA,'id':asset_id,'width':w,'height':h,'base':np.round(base,9).tolist(),'splats':np.round(splats,9).tolist(),
      'kernel':{'type':'signed_additive_anisotropic_gaussian','cutoffSigma':4,'sample':'gaussian_pixel_box_approximation','pixelVariance':PIXEL_VARIANCE,'colorSpace':'linear_srgb'},
      'provenance':{'kind':'observed_gaussian_reconstruction','algorithm':'crf10-structure-irls-pixel-footprint-adam','sourceRGBEmbedded':False,'losslessResidualEmbedded':False,'neuralModelTraining':False,'pretrainedInitializerUsed':False,'optimizationScope':'this_observation_only','budget':budget,'illumination':'inherited_from_observation'},
      'fit':{'iterationsPerStage':iterations,'irlsIterationsPerStage':3,'geometryOptimization':georeport,'history':history,'seconds':round(time.perf_counter()-started,3),'bestCheckpointRule':'lowest_observed_srgb_mse','initializer':'uniform_coverage_plus_variance_partition_and_structure_tensor_no_neural_network'}}
    encoded=legacy.encode_alpha(alpha)
    if encoded:asset['alpha']=encoded
    return asset

def polish_asset(asset,rgba,iterations=40,rounds=3,progress=None):
    """Optional, measured same-budget colour repair after geometry optimization.

    Column-normalized Gauss-Newton improves sparse solver conditioning. Every
    update is accepted against displayed image error, or is backtracked/rejected.
    This routine does not claim to beat another optimizer or allocate more points.
    """
    started=time.perf_counter();asset=json.loads(json.dumps(asset));rgba=np.asarray(rgba,np.uint8)
    if asset.get('kernel',{}).get('colorSpace','linear_srgb')!='linear_srgb':raise ValueError('Polishing expects a linear-light basis')
    h,w=rgba.shape[:2]
    if (w,h)!=(asset['width'],asset['height']):raise ValueError('Polishing source dimensions differ')
    target=linear(rgba[...,:3]).reshape(-1,3);alpha=rgba[...,3]if rgba.shape[2]==4 else np.full((h,w),255,np.uint8)
    visibility=alpha.ravel()/255;root_weight=np.sqrt(visibility);base=np.asarray(asset['base']);p=np.asarray(asset['splats']);matrix=dictionary(p,w,h);co=p[:,5:].copy();history=[]
    before=legacy.metrics(rgba,render_asset(asset),alpha)
    def error(c):return float(np.sum((srgb(matrix@c+base)-srgb(target))**2*visibility[:,None]))
    for step in range(rounds):
        current=matrix@co+base;old=co.copy();old_error=error(co)
        for channel in range(3):
            jac=np.clip(derivative(current[:,channel]),.4,12.92);weighted=matrix.multiply((root_weight*jac)[:,None]).tocsc()
            norm=np.maximum(1e-6,np.sqrt(np.asarray(weighted.power(2).sum(axis=0)).ravel()));normalized=weighted.multiply((1/norm)[None,:])
            residual=(srgb(target[:,channel])-srgb(current[:,channel]))*root_weight
            co[:,channel]+=lsmr(normalized,residual,damp=.01,atol=1e-6,btol=1e-6,maxiter=iterations)[0]/norm
        proposal=co.copy();co=old.copy()
        for fraction in [1,.5,.25,.125,.0625]:
            candidate=np.clip(old+(proposal-old)*fraction,-16,16)
            if error(candidate)<=old_error:co=candidate;break
        row={'phase':'post_geometry_preconditioned_colour_solve','round':step+1,'count':len(p),'elapsedSeconds':round(time.perf_counter()-started,3),**legacy.metrics(rgba,rgb8((matrix@co+base).reshape(h,w,3)),alpha)};history.append(row)
        if progress:progress(row)
    p[:,5:]=co;asset['splats']=np.round(p,9).tolist();seconds=time.perf_counter()-started
    asset.setdefault('fit',{})['polishing']={'method':'column_normalized_gauss_newton_actual_loss_backtracking','rounds':rounds,'iterationsPerRound':iterations,'seconds':round(seconds,3),'beforeMetrics':before,'history':history,'sameGaussianBudget':True}
    asset['fit']['seconds']=round(asset['fit'].get('seconds',0)+seconds,3)
    asset.setdefault('provenance',{})['colourPolishSourceSHA256']=SOURCE_SHA256
    return asset

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--budget',type=int,default=8192);p.add_argument('--iterations',type=int,default=20);p.add_argument('--geometry-steps',type=int,default=30);p.add_argument('--max-side',type=int,default=0);p.add_argument('--id');p.add_argument('--compare-v08',action='store_true');p.add_argument('--polish-asset',type=Path);p.add_argument('--polish-rounds',type=int,default=3);args=p.parse_args()
    image=Image.open(args.input).convert('RGBA');original=list(image.size)
    if args.max_side and max(image.size)>args.max_side:image.thumbnail((args.max_side,args.max_side),Image.Resampling.LANCZOS)
    rgba=np.asarray(image);progress=lambda row:print(json.dumps(row),flush=True)
    asset=polish_asset(json.loads(args.polish_asset.read_text()),rgba,args.iterations,args.polish_rounds,progress)if args.polish_asset else fit_image(rgba,args.budget,args.iterations,args.id or args.input.stem,progress,args.geometry_steps)
    if not args.polish_asset:asset['provenance']['fitSourceSHA256']=SOURCE_SHA256
    asset['provenance'].update({'sourceSHA256':hashlib.sha256(args.input.read_bytes()).hexdigest(),'originalSize':original,'fittedSize':list(image.size)})
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(asset,separators=(',',':')))
    output=render_asset(json.loads(args.output.read_text()));Image.fromarray(output).save(args.output.with_suffix('.png'))
    report={'schema':'crf.gaussian_fit_report.v0.10','assetId':asset['id'],'width':image.width,'height':image.height,'gaussians':len(asset['splats']),'assetBytes':args.output.stat().st_size,'sourceSHA256':asset['provenance']['sourceSHA256'],'metrics':legacy.metrics(rgba,output,rgba[...,3]),'fit':asset['fit'],'renderedFromExportOnly':True,'modelTraining':False,'qualityScope':'reference_observation_reconstruction_not_new_image_generation'}
    if args.compare_v08:
        old=legacy.fit_image(rgba,args.budget,args.iterations,'same-budget-v08',geometry_steps=args.geometry_steps);report['v08SameBudget']={'gaussians':len(old['splats']),'metrics':legacy.metrics(rgba,legacy.render_asset(old),rgba[...,3]),'seconds':old['fit']['seconds']};Image.fromarray(legacy.render_asset(old)).save(args.output.with_name(args.output.stem+'.v08.png'))
    args.output.with_name(args.output.stem+'.report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'complete':True,'output':str(args.output),'metrics':report['metrics']}),flush=True)

if __name__=='__main__':main()
