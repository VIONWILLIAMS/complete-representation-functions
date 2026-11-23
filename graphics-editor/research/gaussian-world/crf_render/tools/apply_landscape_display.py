#!/usr/bin/env python3
"""Adopt/reproduce the reviewed landscape-only display reconstruction.

Other collection images and original PFM/EXR files are never rewritten.
Default: compute from original PFM + AOV and then adopt. --cached-candidate
only adopts a previously generated candidate after checking hashes/parameters.
"""
import argparse,hashlib,json,os,shutil,subprocess,sys,time
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
NAME='CRF_04_Alpine_Lake'
PREFIX=ROOT/'outputs'/NAME
AUDIT=ROOT/'audit'/'landscape_display'

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def atomic_json(p,data):
    q=p.with_name(p.name+'.tmp');q.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');os.replace(q,p)
def adopt():
    parser=argparse.ArgumentParser();parser.add_argument('--cached-candidate',type=Path,help='Reviewed candidate directory; omit to recompute from raw data');v=parser.parse_args()
    AUDIT.mkdir(parents=True,exist_ok=True)
    raw=Path(str(PREFIX)+'.pfm');exr=Path(str(PREFIX)+'.exr');final=Path(str(PREFIX)+'.png');dev=Path(str(PREFIX)+'.development.json');preview=Path(str(PREFIX)+'_preview.jpg')
    required=[raw,exr,*[Path(str(PREFIX)+'_'+k+'.pfm') for k in ('albedo','normal','depth')]]
    for p in required:
        if not p.exists():raise FileNotFoundError(f'Requires completed landscape render: {p}')
    raw_before,exr_before=sha(raw),sha(exr)
    baseline_missing=[p.name for p in (final,dev) if not p.exists()]
    if baseline_missing:
        # A fresh HDR/AOV extraction need not contain any display PNG or metadata.
        # Establish the ordinary, unsuppressed display for audit before adoption.
        # This only reads original HDR/AOV and writes PNG plus development JSON.
        from develop import develop
        develop(PREFIX,exposure=0,atrous=3)
    original=AUDIT/(NAME+'_before_firefly_suppression.png');olddev=AUDIT/(NAME+'_before_firefly_suppression.development.json')
    if not original.exists():shutil.copy2(final,original)
    if not olddev.exists():shutil.copy2(dev,olddev)
    oldpreview=AUDIT/(NAME+'_before_firefly_suppression_preview.jpg')
    if preview.exists() and not oldpreview.exists():shutil.copy2(preview,oldpreview)
    # No material is globally excluded: lake glints are filtered only when local
    # AOV continuity and isolated-outlier tests permit it. Preserve the policy.
    atomic_json(AUDIT/'material_policy.json',{
      'globally_protected_materials':[], 'dielectric_water_globally_protected':False,
      'local_surface_reference':'normal/albedo/depth similarity',
      'coherent_highlights_preserved_with_at_least_neighbors':3,
      'geometry_and_material_definitions_changed':False,
    })
    candidate=v.cached_candidate.resolve() if v.cached_candidate else ROOT/'outputs'/'landscape_display_replay'
    if not v.cached_candidate:
        subprocess.run([sys.executable,str(ROOT/'tools/remove_fireflies.py'),str(PREFIX),'--output-dir',str(candidate),'--atrous','3','--exposure','0','--ratio','1.6','--absolute','0.035','--before-display',str(original)],check=True,cwd=ROOT)
    reportpath=candidate/(NAME+'_firefly_report.json');report=json.loads(reportpath.read_text());png=candidate/(NAME+'_firefly_suppressed.png')
    if report.get('raw_sha256_unchanged')!=raw_before:raise ValueError('Candidate is not based on current original PFM')
    if report.get('candidate_png_sha256')!=sha(png):raise ValueError('Candidate PNG hash differs from recorded render')
    if report.get('protected_albedos'):raise ValueError('This reviewed landscape pass has no global material protection')
    if report['parameters']['atrous_passes']!=3 or report['parameters']['luminance_ratio']!=1.6:raise ValueError('Unexpected reviewed filter parameters')
    with Image.open(png) as im:
        if im.size!=(3072,2048):raise ValueError('Unexpected native size')
        im.verify()
    # Compute the bias magnitude from raw radiance even in a raw-only extraction.
    import numpy as np
    from develop import read_pfm
    from remove_fireflies import comparison
    original_linear=read_pfm(raw)
    total_luminance=float(np.sum(original_linear@np.array([.2126,.7152,.0722],np.float32),dtype=np.float64))
    report['original_total_estimated_luminance']=total_luminance
    report['removed_fraction_of_total_estimated_luminance']=report['removed_luminance_sum']/total_luminance
    report['comparison_regions_100pct']=[{'label':'dark reflection','top_left':[100,1400],'size':[480,480]},{'label':'central reflection','top_left':[1080,1510],'size':[480,480]},{'label':'isolated sun paths','top_left':[2480,1400],'size':[480,480]}]
    report['scope_note']='Display reconstruction only. No scene geometry, procedural texture definitions, camera or original HDR changed. Lake is not globally protected; spatial support preserves coherent highlights.'
    before_image=Image.open(original).convert('RGB');after_image=Image.open(png).convert('RGB')
    comparison(before_image,after_image,[('Water / dark reflection',(100,1400)),('Water / central reflection',(1080,1510)),('Water / isolated sun paths',(2480,1400))],candidate/(NAME+'_comparison_100pct.jpg'))
    atomic_json(reportpath,report)
    # Preserve complete audit evidence and mask, including per-pixel measurements.
    for suffix in ['_firefly_report.json','_comparison_100pct.jpg','_changed_mask.png']:
        shutil.copy2(candidate/(NAME+suffix),AUDIT/(NAME+suffix))
    temp=final.with_name(final.stem+'.adopting.png');shutil.copy2(png,temp);os.replace(temp,final)
    im=Image.open(final).convert('RGB');im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
    ptemp=preview.with_name(preview.stem+'.adopting.jpg');im.save(ptemp,quality=94,subsampling=0);os.replace(ptemp,preview)
    processing={
      'method':'AOV-gated isolated radiance suppression; no global material protection; coherent highlight support; then 3-pass a-trous',
      'modified_original_pixels':report['modified_pixels'],'modified_fraction':report['modified_fraction'],
      'protected_specular_candidates':report.get('protected_specular_candidates',0),
      'protected_albedos':report['protected_albedos'],'parameters':report['parameters'],
      'removed_fraction_of_total_estimated_luminance':report['removed_fraction_of_total_estimated_luminance'],
      'display_only_biased_reconstruction':True,'raw_hdr_unchanged':True,
      'limitation':'Reduces about4.33% of the original estimated total luminance in this render. May attenuate real but undersampled sun glints and caustics; this is biased display reconstruction, not improved physical integration.',
      'report':'audit/landscape_display/'+NAME+'_firefly_report.json',
      'comparison_100pct':'audit/landscape_display/'+NAME+'_comparison_100pct.jpg',
      'changed_mask':'audit/landscape_display/'+NAME+'_changed_mask.png',
      'unsuppressed_display':'audit/landscape_display/'+original.name,
      'reproduce_command':'python3 tools/apply_landscape_display.py',
    }
    d=json.loads(dev.read_text());d.update({'png_sha256':sha(final),'preview_sha256':sha(preview),'denoiser':'AOV-gated isolated outlier suppression with local highlight support + AOV-guided a-trous local reconstruction','firefly_suppression':processing,'raw_sha256':raw_before,'generative_processing':False,'super_resolution':False})
    atomic_json(dev,d)
    # Read the latest manifest immediately before replacing ONLY its landscape item.
    manifest=ROOT/'outputs'/'collection_manifest.json'
    if manifest.exists():
        collection=json.loads(manifest.read_text());found=False
        for item in collection['images']:
            if item['id']!='landscape':continue
            if item.get('raw_pfm_sha256')!=raw_before or item.get('raw_exr_sha256')!=exr_before:raise ValueError('Manifest HDR provenance differs')
            item['png_sha256']=sha(final);item['preview_sha256']=sha(preview);item['display_processing']=processing
            item['notes']=item.get('notes','').split(' 显示重建：')[0]+f" 显示重建：仅抑制{report['modified_pixels']}个原始像素的孤立亮点，约削减4.33%原始估计总亮度；可能压低真实闪光/焦散，为有偏显示重建，原始HDR未改。"
            found=True
        if not found:raise ValueError('Manifest lacks landscape')
        atomic_json(manifest,collection)
    assert sha(raw)==raw_before and sha(exr)==exr_before,'Original HDR changed unexpectedly'
    proof={'adopted':True,'ordinary_baseline_generated':bool(baseline_missing),'baseline_missing_inputs':baseline_missing,'scope':'landscape display PNG and preview only','modified_original_pixels':report['modified_pixels'],'removed_fraction_of_total_estimated_luminance':report['removed_fraction_of_total_estimated_luminance'],'original_png_sha256':sha(original),'adopted_png_sha256':sha(final),'adopted_preview_sha256':sha(preview),'raw_pfm_sha256_before_after':raw_before,'raw_exr_sha256_before_after':exr_before,'raw_hdr_unchanged':True,'reproduce_command':processing['reproduce_command'],'candidate_source':str(candidate.relative_to(ROOT)) if candidate.is_relative_to(ROOT) else candidate.name}
    atomic_json(AUDIT/'adoption_verification.json',proof)
    print(json.dumps(proof,ensure_ascii=False,indent=2))
if __name__=='__main__':adopt()
