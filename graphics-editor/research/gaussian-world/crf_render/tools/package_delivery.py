"""Package the actual renders with source and auditable metadata, excluding credentials and scratch work."""
import json,zipfile,hashlib,sys,subprocess,shutil
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'delivery';DEST.mkdir(exist_ok=True)

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def source_files():
    files=[ROOT/x for x in ['README.md','Makefile','requirements.txt','build_cuda.sh']]
    for folder,exts in [('src',{'.cpp','.cu','.cuh'}),('scenes',{'.py','.txt'}),('tools',{'.py','.sh'}),('docs',{'.md'}),('run_sources',{'.cpp','.py','.json'})]:
        files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in exts and '__pycache__' not in p.parts)
    for f in ['scenes/check_lambert.scene','scenes/check_beer.scene','run_sources/product/product.scene','logs/renderer_verification.json','logs/cuda_preparation_status.json','logs/cloud_connection_status.json','logs/colab_connection_status.json','logs/controlled_parameter_check.json','logs/firefly_filter_checks.json','logs/cuda_compile_status.json','logs/colab_probe_static_review.json','logs/cuda_nvcc12_8_glibc2_41_failure.log','logs/cuda_nvcc13_0_initial_link_failure.log','logs/cuda_nvcc13_0_sm120_success.log']:
        if (ROOT/f).exists():files.append(ROOT/f)
    replay_check=ROOT/'logs/raw_only_replay_verification.json'
    if replay_check.exists():files.append(replay_check)
    environment=ROOT/'logs/execution_environment.json'
    if environment.exists():files.append(environment)
    return sorted(set(files))

def writezip(path,entries):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
        for src,name in entries:z.write(src,name)
    with zipfile.ZipFile(path) as z:
        bad=z.testzip()
        if bad:raise ValueError('Corrupt ZIP entry '+bad)
    print(path.name,path.stat().st_size,sha(path),flush=True)

def sourcezip():
    p=DEST/'CRF_CodeNative_Render_Source.zip';writezip(p,[(f,str(f.relative_to(ROOT))) for f in source_files()]);return p

def contact_sheet(items):
    cw,ch=1000,820;gap=28;W=cw*3+gap*4;H=ch*2+gap*3+140
    canvas=Image.new('RGB',(W,H),'#f4f2ec');d=ImageDraw.Draw(canvas)
    fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(fontpath,44);body=ImageFont.truetype(fontpath,25);small=ImageFont.truetype(fontpath,20)
    d.text((gap,32),'CRF / CODE-NATIVE RENDER STUDY',font=title,fill='#20352e')
    d.text((gap,93),'Five procedural scenes. One original path tracer. Native high-resolution pixels.',font=body,fill='#677168')
    for i,item in enumerate(items):
        x=gap+(i%3)*(cw+gap);y=140+gap+(i//3)*(ch+gap)
        image=Image.open(ROOT/item['png']).convert('RGB');image.thumbnail((cw,ch-75),Image.Resampling.LANCZOS)
        canvas.paste(image,(x+(cw-image.width)//2,y+(ch-75-image.height)//2))
        d.text((x,y+ch-61),item['subtitle'].split('/')[0].strip(),font=body,fill='#20352e')
        d.text((x,y+ch-27),f"{item['width']} x {item['height']}  |  {item['spp']} spp  |  CPU",font=small,fill='#677168')
    x=gap+2*(cw+gap);y=140+gap+(ch+gap)
    d.text((x+55,y+140),'BUILT FROM CODE',font=title,fill='#20352e')
    lines=['C++17 / Python','Procedural geometry + materials','Path tracing / MIS / optical transport','No downloaded visual assets','No image-generation model','Original HDR + normal + depth retained','CUDA prototype: not yet run on GPU']
    for j,t in enumerate(lines):d.text((x+55,y+235+j*58),t,font=body,fill='#677168')
    path=DEST/'CRF_Collection_Contact_Sheet.jpg';canvas.save(path,quality=94,subsampling=0);return path

def check_completed_cpu_record(im):
    """The gallery's CPU/native-resolution claims must match actual run records."""
    prefix=ROOT/'outputs'/im['prefix']
    measurement=json.loads(Path(str(prefix)+'.json').read_text())
    development=json.loads(Path(str(prefix)+'.development.json').read_text())
    renderer=str(measurement.get('renderer',''))
    if 'CPU' not in renderer or 'CUDA' in renderer or 'GPU' in renderer:
        raise ValueError(f"{im['id']}: this CPU collection cannot label renderer {renderer!r} as CPU")
    if im.get('renderer')!=renderer:
        raise ValueError(f"{im['id']}: manifest renderer differs from actual run")
    for key in ['width','height','spp','camera_paths']:
        if im[key]!=measurement[key]:
            raise ValueError(f"{im['id']}: manifest {key} differs from actual run")
    if measurement.get('nonfinite_pixels')!=0:
        raise ValueError(f"{im['id']}: non-finite pixel check not passed")
    if development.get('generative_processing') is not False or development.get('super_resolution') is not False:
        raise ValueError(f"{im['id']}: development does not verify non-generative/native output")
    for key,value in [('native_width',im['width']),('native_height',im['height']),('output_width',im['width']),('output_height',im['height'])]:
        if development.get(key)!=value:
            raise ValueError(f"{im['id']}: development {key} is not the claimed native size")
    for key in ['png','preview','raw_exr','aov_normal','aov_albedo','aov_depth']:
        p=(ROOT/im[key]).resolve()
        if not p.is_relative_to(ROOT) or not p.is_file():
            raise FileNotFoundError(f"{im['id']}: missing or outside-project deliverable {key}")
    p=ROOT/im['png']
    with Image.open(p) as f:
        if f.size!=(im['width'],im['height']):raise ValueError('Native size mismatch')
        f.verify()
    digest=sha(p)
    if digest!=im['png_sha256'] or digest!=development.get('png_sha256'):
        raise ValueError(f"{im['id']}: PNG checksum differs from manifest or development record")

def final():
    mf=ROOT/'outputs/collection_manifest.json';data=json.loads(mf.read_text());items=data['images']
    if len(items)!=5:raise ValueError('Five completed scenes required')
    for im in items:check_completed_cpu_record(im)
    subprocess.run([sys.executable,str(ROOT/'tools/build_gallery.py'),'--manifest',str(mf),'--output',str(DEST/'CRF_Render_Gallery.html'),'--copy-originals'],check=True)
    sheet=contact_sheet(items)
    entries=[(f,str(f.relative_to(ROOT))) for f in source_files()]
    entries += [(DEST/'CRF_Render_Gallery.html','CRF_Render_Gallery.html'),(sheet,sheet.name),(mf,'measurements/collection_manifest.json')]
    notebook=DEST/'CRF_GPU_Colab.ipynb'
    notebook_meta=DEST/'CRF_GPU_Colab.build.json'
    if notebook.exists() and notebook_meta.exists():
        nb=json.loads(notebook_meta.read_text())
        if nb.get('source_zip_sha256')!=sha(DEST/'CRF_CodeNative_Render_Source.zip'):
            raise ValueError('Rebuild the Colab notebook from the final source ZIP before packaging')
        if nb.get('notebook_sha256')!=sha(notebook):
            raise ValueError('Colab notebook checksum differs from its build record')
        entries += [(notebook,notebook.name),(notebook_meta,'measurements/'+notebook_meta.name)]
    proof=ROOT/'outputs/CRF_Controlled_Parameter_Change.png'
    if proof.exists():entries.append((proof,'images/'+proof.name))
    for audit_name in ['still_life_display','landscape_display']:
        audit=ROOT/'audit'/audit_name
        if audit.exists():
            entries.extend((p,str(p.relative_to(ROOT))) for p in sorted(audit.rglob('*')) if p.is_file())
    for im in items:
        for key in ['png','preview']:
            p=ROOT/im[key];entries.append((p,'images/'+p.name))
        pref=ROOT/'outputs'/im['prefix']
        for suffix in ['.json','.development.json']:
            p=Path(str(pref)+suffix);entries.append((p,'measurements/'+p.name))
        log=ROOT/'logs'/(im['prefix']+'.log');entries.append((log,'measurements/'+log.name))
        for key in ['aov_normal','aov_albedo','aov_depth']:
            p=ROOT/im[key];entries.append((p,'aov_previews/'+p.name))
    bundle=DEST/'CRF_CodeNative_HD_Collection.zip';writezip(bundle,entries)
    rawpaths=[]
    for im in items:
        prefix=ROOT/'outputs'/im['prefix'];raw=[]
        exr=ROOT/im['raw_exr'];raw.append((exr,exr.name))
        for suffix in ['.pfm','_normal.pfm','_albedo.pfm','_depth.pfm','.json','.development.json']:
            p=Path(str(prefix)+suffix);raw.append((p,p.name))
        path=DEST/(im['prefix']+'_HDR_AOV.zip');writezip(path,raw);rawpaths.append(path)
    verification={'images':len(items),'native_render_pixels':sum(i['width']*i['height'] for i in items),'camera_paths':sum(i['camera_paths'] for i in items),'sum_render_seconds':sum(i['seconds'] for i in items),'image_specs_verified':True,'cpu_render_records_verified':True,'development_records_verified':True,'zip_crc_verified':True,'gpu_executed':False,'artifacts':[]}
    artifacts=[bundle,DEST/'CRF_Render_Gallery.html',sheet,*rawpaths]
    for p in artifacts:verification['artifacts'].append({'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p)})
    (DEST/'delivery_verification.json').write_text(json.dumps(verification,indent=2)+'\n')
    return artifacts

if __name__=='__main__':
    sourcezip()
    if '--source-only' not in sys.argv:final()
