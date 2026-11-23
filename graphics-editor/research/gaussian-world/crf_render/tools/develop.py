"""Transparent image development: PFM linear light -> optional local filter -> filmic -> sRGB PNG.
This is not a generative model. No new objects, photographic pixels or assets are added.
Native dimensions are preserved. The original .pfm is never modified.
"""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image

def read_pfm(path):
    with open(path,'rb') as f:
        mode=f.readline().decode().strip()
        if mode not in ('PF','Pf'):raise ValueError('Invalid PFM '+str(path))
        dim=f.readline().decode()
        while dim.startswith('#'):dim=f.readline().decode()
        w,h=map(int,dim.split());scale=float(f.readline())
        ar=np.fromfile(f,dtype='<f4' if scale<0 else '>f4')
    ar=ar.reshape(h,w,3 if mode=='PF' else 1)[::-1].copy()*abs(scale)
    if not np.isfinite(ar).all():raise ValueError('Non-finite input radiance')
    return ar

def filmic(x):
    # Common compact filmic curve (not a complete ACES colour-management pipeline).
    return np.clip(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14),0,1)

def srgb(x):
    return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055)

def guided_filter(rgb,normal,albedo,depth,strength=.55):
    # One local 3x3 cross-bilateral pass. Shader auxiliaries protect silhouette/texture edges.
    h,w=rgb.shape[:2]
    pads=[np.pad(a,((1,1),(1,1),(0,0)),mode='edge') for a in (rgb,normal,albedo,depth)]
    base=np.log1p(rgb);acc=rgb.copy();weights=np.ones((h,w),np.float32)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if not dx and not dy:continue
            r,n,a,d=[p[1+dy:1+dy+h,1+dx:1+dx+w] for p in pads]
            color=np.sum((np.log1p(r)-base)**2,axis=2)
            na=np.sum((normal-n)**2,axis=2)
            aa=np.sum((albedo-a)**2,axis=2)
            dd=(np.abs(depth[:,:,0]-d[:,:,0])/(.01+np.maximum(depth[:,:,0],d[:,:,0])))**2
            weight=np.exp(-color/.16-na/.008-aa/.02-dd/.0008-(dx*dx+dy*dy)/2.4)
            acc+=r*weight[:,:,None];weights+=weight
    return rgb*(1-strength)+acc/weights[:,:,None]*strength

def atrous_filter(rgb,normal,albedo,depth,passes=3):
    # Deterministic edge-aware a-trous reconstruction, not a learned denoiser.
    # AOVs preserve material boundaries, geometry and pixel-scale texture.
    from scipy.ndimage import gaussian_filter
    base=np.log1p(rgb)
    sm=gaussian_filter(base,sigma=(1.3,1.3,0))
    variance=np.mean(gaussian_filter((base-sm)**2,sigma=(1.5,1.5,0)),axis=2)
    h,w=rgb.shape[:2];filtered=rgb.copy()
    for iteration in range(passes):
        step=2**iteration
        pads=[np.pad(a,((step,step),(step,step),(0,0)),mode='edge') for a in (filtered,normal,albedo,depth)]
        vpad=np.pad(variance,((step,step),(step,step)),mode='edge')
        acc=filtered*4;weight_sum=np.full((h,w),4,np.float32)
        base=np.log1p(filtered)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if not dx and not dy:continue
                ys=step+dy*step;xs=step+dx*step
                r,n,a,d=[p[ys:ys+h,xs:xs+w] for p in pads]
                vv=vpad[ys:ys+h,xs:xs+w]
                color=np.mean((np.log1p(r)-base)**2,axis=2)
                nd=np.sum((normal-n)**2,axis=2)
                ad=np.sum((albedo-a)**2,axis=2)
                dd=(np.abs(depth[:,:,0]-d[:,:,0])/(.02+np.maximum(depth[:,:,0],d[:,:,0])))**2
                sigma=.001+3.5*(variance+vv)/(2**iteration)
                k=2.0 if dx==0 or dy==0 else 1.0
                weights=k*np.exp(-color/sigma-nd/.012-ad/.004-dd/(.00015*step*step))
                acc+=r*weights[:,:,None];weight_sum+=weights
        filtered=acc/weight_sum[:,:,None]
    return filtered

def develop(prefix,output=None,exposure=0,denoise=0,preview_width=None,atrous=0):
    p=Path(prefix);p=p.with_suffix('') if p.suffix=='.pfm' else p
    raw=read_pfm(str(p)+'.pfm');rgb=np.maximum(raw,0)
    if denoise:
        normal=read_pfm(str(p)+'_normal.pfm');alb=read_pfm(str(p)+'_albedo.pfm');dep=read_pfm(str(p)+'_depth.pfm')
        rgb=guided_filter(rgb,normal,alb,dep,strength=denoise)
    if atrous:
        normal=read_pfm(str(p)+'_normal.pfm');alb=read_pfm(str(p)+'_albedo.pfm');dep=read_pfm(str(p)+'_depth.pfm')
        rgb=atrous_filter(rgb,normal,alb,dep,passes=atrous)
    mapped=srgb(filmic(rgb*(2**exposure)))
    out=Path(output or str(p)+'.png');out.parent.mkdir(parents=True,exist_ok=True)
    im=Image.fromarray(np.uint8(np.clip(mapped*255+.5,0,255)))
    if preview_width and im.width>preview_width:
        im.resize((preview_width,round(im.height*preview_width/im.width)),Image.Resampling.LANCZOS).save(out)
    else:im.save(out,optimize=True)
    meta={'source_linear_pfm':p.name+'.pfm','native_width':raw.shape[1],'native_height':raw.shape[0],
          'output_width':Image.open(out).width,'output_height':Image.open(out).height,
          'exposure_stops':exposure,'tone_curve':'compact filmic fitted curve; sRGB transfer',
          'denoiser':'AOV-guided a-trous local reconstruction' if atrous else ('3x3 AOV-guided local cross-bilateral' if denoise else 'none'),'denoiser_strength':denoise,'atrous_passes':atrous,
          'generative_processing':False,'super_resolution':False,
          'raw_sha256':hashlib.sha256(Path(str(p)+'.pfm').read_bytes()).hexdigest(),
          'png_sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
    out.with_suffix('.development.json').write_text(json.dumps(meta,indent=2)+'\n')
    print(str(out),im.size,'radiance max',float(raw.max()),'p99',float(np.quantile(raw,.99)))
    return out

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('prefix');a.add_argument('--output');a.add_argument('--exposure',type=float,default=0)
    a.add_argument('--denoise',type=float,default=0);a.add_argument('--preview-width',type=int);a.add_argument('--atrous',type=int,default=0)
    v=a.parse_args();develop(v.prefix,v.output,v.exposure,v.denoise,v.preview_width,v.atrous)
