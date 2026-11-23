#!/usr/bin/env python3
"""Conservative, deterministic local firefly suppression before display filtering.

The ORIGINAL .pfm/.exr and final PNG are never overwritten. No learned model,
external image, spatial synthesis, or inpainting is used. Only classified
isolated high-radiance pixels are reduced; all other linear pixels are unchanged.
This is a biased display reconstruction, not an unbiased radiance estimate.
"""
import argparse,hashlib,json,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import median_filter
from develop import read_pfm,atrous_filter,filmic,srgb

def suppress(rgb,normal,albedo,depth,ratio=1.6,absolute=.035,radius=3,protected_albedos=()):
    lum=rgb@np.array([.2126,.7152,.0722],np.float32)
    med=median_filter(lum,size=5,mode='reflect')
    candidates=(lum>med*ratio+absolute)
    protected=np.zeros(lum.shape,bool)
    for color in protected_albedos:
        protected |= np.max(np.abs(albedo-np.asarray(color,np.float32)),axis=2)<2e-6
    protected_candidates=int(np.count_nonzero(candidates&protected))
    candidates &= ~protected
    ys,xs=np.nonzero(candidates);out=rgb.copy();mask=np.zeros(lum.shape,np.uint8)
    records=[];rejected={'few_surface_neighbors':0,'not_robust_outlier':0,'coherent_highlight':0}
    H,W=lum.shape
    for y,x in zip(ys,xs):
        y0=max(0,y-radius);y1=min(H,y+radius+1);x0=max(0,x-radius);x1=min(W,x+radius+1)
        ls=lum[y0:y1,x0:x1];ns=normal[y0:y1,x0:x1];als=albedo[y0:y1,x0:x1];ds=depth[y0:y1,x0:x1,0]
        # Encoded normals are .5*n+.5; squared threshold corresponds to ~4.6deg.
        nd=np.sum((ns-normal[y,x])**2,axis=2)
        ad=np.sum((als-albedo[y,x])**2,axis=2)
        dd=np.abs(ds-depth[y,x,0])/(.01+np.maximum(ds,depth[y,x,0]))
        same=(nd<.0016)&(ad<.003)&(dd<.01)
        same[y-y0,x-x0]=False
        # Reject silhouettes and tiny geometry where no reliable local surface exists.
        if np.count_nonzero(same)<12:
            rejected['few_surface_neighbors']+=1;continue
        neighbors=ls[same];m=float(np.median(neighbors));mad=float(np.median(np.abs(neighbors-m)))
        threshold=max(m*ratio+absolute,m+10*mad+absolute)
        current=float(lum[y,x])
        if current<=threshold:
            rejected['not_robust_outlier']+=1;continue
        coherent=int(np.count_nonzero(neighbors>max(m*1.35+.025,current*.45)))
        if coherent>=3:
            rejected['coherent_highlight']+=1;continue
        # Clamp only the outlying pixel to the robust local upper range, keep hue.
        upper=min(float(np.quantile(neighbors,.90)),m+3.5*mad+.005)
        upper=max(upper,m)
        out[y,x]*=upper/max(current,1e-8)
        mask[y,x]=255
        records.append({'x':int(x),'y':int(y),'luminance_before':current,'luminance_after':upper,'same_surface_neighbors':int(same.sum()),'median':m,'mad':mad})
    return out,mask,{'candidate_pixels':int(candidates.sum()),'protected_specular_candidates':protected_candidates,'protected_albedos':[list(c) for c in protected_albedos],'modified_pixels':len(records),'modified_fraction':len(records)/lum.size,'rejected':rejected,'max_luminance_before':float(lum.max()),'max_luminance_after':float((out@np.array([.2126,.7152,.0722],np.float32)).max()),'removed_luminance_sum':float(np.sum(lum-(out@np.array([.2126,.7152,.0722],np.float32)))),'records':records}

def image_from_linear(rgb,exposure):
    return Image.fromarray(np.uint8(np.clip(srgb(filmic(rgb*(2**exposure)))*255+.5,0,255)))

def comparison(before,after,boxes,path):
    size=480;gap=24;header=38;row_h=size+header+gap
    panel=Image.new('RGB',(size*2+gap*3,row_h*len(boxes)+gap),(245,244,241));draw=ImageDraw.Draw(panel)
    try:font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
    except OSError:font=ImageFont.load_default()
    for i,(label,(x,y)) in enumerate(boxes):
        x=max(0,min(before.width-size,int(x)));y=max(0,min(before.height-size,int(y)))
        for j,(im,tag) in enumerate([(before,'BEFORE'),(after,'AFTER')]):
            xx=gap+j*(size+gap);yy=gap+i*row_h
            draw.text((xx,yy),f'{tag} | {label} | 100% ({x},{y})',font=font,fill=(40,40,40))
            panel.paste(im.crop((x,y,x+size,y+size)),(xx,yy+header))
    panel.save(path)

def main():
    a=argparse.ArgumentParser();a.add_argument('prefix');a.add_argument('--output-dir',default='outputs/firefly_review');a.add_argument('--ratio',type=float,default=1.6);a.add_argument('--absolute',type=float,default=.035);a.add_argument('--atrous',type=int,default=3);a.add_argument('--exposure',type=float,default=0);a.add_argument('--before-display',help='Optional preserved display PNG used for before/after audit');a.add_argument('--protect-specular-scene',help='Optional scene DSL: protect primary type1/type2 materials by exact AOV albedo signature')
    v=a.parse_args();start=time.perf_counter();p=Path(v.prefix);p=p.with_suffix('') if p.suffix=='.pfm' else p
    dest=Path(v.output_dir);dest.mkdir(parents=True,exist_ok=True)
    rawpath=Path(str(p)+'.pfm');raw_hash=hashlib.sha256(rawpath.read_bytes()).hexdigest()
    rgb=read_pfm(rawpath);n=read_pfm(str(p)+'_normal.pfm');alb=read_pfm(str(p)+'_albedo.pfm');depth=read_pfm(str(p)+'_depth.pfm')
    protected=[]
    if v.protect_specular_scene:
        for line in Path(v.protect_specular_scene).read_text().splitlines():
            parts=line.split('#',1)[0].split()
            if len(parts)>=6 and parts[0]=='mat' and parts[2] in ('1','2'):
                protected.append(tuple(map(float,parts[3:6])))
    clean,mask,stats=suppress(rgb,n,alb,depth,v.ratio,v.absolute,protected_albedos=protected)
    print('isolated bright pixels:',stats['modified_pixels'],'of',mask.size,flush=True)
    # Save changed-pixel evidence before subsequent local reconstruction.
    Image.fromarray(mask).save(dest/(p.name+'_changed_mask.png'))
    developed=atrous_filter(clean,n,alb,depth,v.atrous) if v.atrous else clean
    after=image_from_linear(developed,v.exposure);outfile=dest/(p.name+'_firefly_suppressed.png');after.save(outfile,optimize=True)
    prev=after.copy();prev.thumbnail((1280,1600));prev.save(dest/(p.name+'_firefly_suppressed_preview.jpg'),quality=92)
    existing=Path(v.before_display) if v.before_display else Path(str(p)+'.png')
    before=Image.open(existing).convert('RGB') if existing.exists() else image_from_linear(atrous_filter(rgb,n,alb,depth,v.atrous),v.exposure)
    boxes=[('wall',(.38*before.width,.07*before.height)),('glass edge',(.64*before.width,.49*before.height)),('glass shadow',(.72*before.width,.69*before.height))]
    comparison(before,after,boxes,dest/(p.name+'_comparison_100pct.jpg'))
    assert hashlib.sha256(rawpath.read_bytes()).hexdigest()==raw_hash,'Original changed unexpectedly'
    stats.update({'algorithm':'AOV-gated isolated radiance winsorization before existing a-trous reconstruction','parameters':{'luminance_ratio':v.ratio,'absolute_threshold_linear':v.absolute,'radius_pixels':3,'minimum_same_surface_neighbors':12,'normal_sq_distance':.0016,'albedo_sq_distance':.003,'relative_depth_difference':.01,'mad_multiplier':10,'coherent_bright_neighbors_preserved_at':3,'atrous_passes':v.atrous},'native_width':rgb.shape[1],'native_height':rgb.shape[0],'raw_sha256_unchanged':raw_hash,'candidate_png_sha256':hashlib.sha256(outfile.read_bytes()).hexdigest(),'original_hdr_untouched':True,'original_final_png_untouched':True,'learned_models':[],'generative_processing':False,'seconds':time.perf_counter()-start,'cost':'Biased display-only local outlier suppression; could attenuate a real isolated subpixel specular glint or under-sampled caustic. Raw radiance remains available. Not suitable as an unbiased scientific measurement.'})
    (dest/(p.name+'_firefly_report.json')).write_text(json.dumps(stats,indent=2)+'\n')
    print(json.dumps({k:value for k,value in stats.items() if k!='records'},indent=2))
if __name__=='__main__':main()
