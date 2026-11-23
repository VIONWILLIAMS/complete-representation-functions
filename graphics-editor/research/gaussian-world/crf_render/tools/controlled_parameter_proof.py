"""Summarise the deliberately tiny, reproducible glass-colour A/B experiment.

Run after both 320x400 controls have been rendered and developed. This script
only lays out existing renders and verifies their scene and geometry AOVs.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from develop import read_pfm


ROOT=Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(size, bold=False):
    path=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf')
    return ImageFont.truetype(str(path),size) if path.exists() else ImageFont.load_default()


def main():
    scenes=[ROOT/'scenes'/('control_product_'+k+'.scene') for k in ('A','B')]
    lines=[p.read_text().splitlines() for p in scenes]
    assert len(lines[0])==len(lines[1])
    changed=[i for i,(a,b) in enumerate(zip(*lines)) if a!=b]
    assert len(changed)==1 and all(lines[k][changed[0]].startswith('mat glass ') for k in (0,1))
    params=[lines[k][changed[0]].split() for k in (0,1)]
    assert params[0][:3]==params[1][:3] and params[0][6:]==params[1][6:]
    results={}
    for k in ('A','B'):
        prefix=ROOT/'outputs'/('control_product_'+k)
        m=json.loads(prefix.with_suffix('.json').read_text())
        assert (m['width'],m['height'],m['spp'],m['seed'],m['max_depth'])==(320,400,48,77331,12)
        assert m['nonfinite_pixels']==0
        results[k]={
            'scene':str(scenes[0 if k=='A' else 1].relative_to(ROOT)),
            'scene_sha256':sha(scenes[0 if k=='A' else 1]),
            'render_settings':m,
            'artifacts':{suffix:{'path':str(Path(str(prefix)+suffix).relative_to(ROOT)),
                                'sha256':sha(Path(str(prefix)+suffix))}
                         for suffix in ('.pfm','.png','_normal.pfm','_depth.pfm','_albedo.pfm')},
            'development':json.loads(prefix.with_suffix('.development.json').read_text()),
        }
    geometry_identity={
        suffix:results['A']['artifacts'][suffix]['sha256']==results['B']['artifacts'][suffix]['sha256']
        for suffix in ('_normal.pfm','_depth.pfm')}
    assert all(geometry_identity.values())
    unchanged_scene='\n'.join(line for i,line in enumerate(lines[0]) if i!=changed[0])
    assert unchanged_scene=='\n'.join(line for i,line in enumerate(lines[1]) if i!=changed[0])
    aa=read_pfm(ROOT/'outputs/control_product_A_albedo.pfm')
    ab=read_pfm(ROOT/'outputs/control_product_B_albedo.pfm')
    delta=np.any(aa!=ab,axis=2)
    yy,xx=np.where(delta)
    beauty_different=results['A']['artifacts']['.pfm']['sha256']!=results['B']['artifacts']['.pfm']['sha256']
    assert beauty_different and delta.any()
    canvas=Image.new('RGB',(800,564),'#f2efe8')
    draw=ImageDraw.Draw(canvas)
    draw.text((40,20),'CRF / CONTROLLED MATERIAL EXPERIMENT',fill='#585c53',font=font(13))
    draw.text((40,42),'Change the code. Recompute the image.',fill='#20291f',font=font(22,True))
    for k,x,label in [('A',54,'A  /  GREEN GLASS'),('B',426,'B  /  AMBER GLASS')]:
        im=Image.open(ROOT/'outputs'/('control_product_'+k+'.png')).convert('RGB')
        assert im.size==(320,400)
        canvas.paste(im,(x,82))
        draw.text((x,493),label,fill='#20291f',font=font(15,True))
        code='transmission = '+('(.39, .72, .45)' if k=='A' else '(.86, .42, .08)')
        draw.text((x,515),code,fill='#565e50',font=font(13))
    draw.line((40,539,760,539),fill='#d3d7cb',width=1)
    draw.text((40,546),'Same camera, geometry, lights and seed 77331. Only glass transmission changed.',fill='#59614f',font=font(11))
    image_path=ROOT/'outputs/CRF_Controlled_Parameter_Change.png'
    canvas.save(image_path,optimize=True)
    report={
        'experiment':'A single material parameter vector changes the image after re-rendering.',
        'parameter':'Glass Beer transmission colour per world unit (linear RGB).',
        'scene_line_number_1based':changed[0]+1,
        'exact_line_A':lines[0][changed[0]],'exact_line_B':lines[1][changed[0]],
        'changed_scene_lines':len(changed),
        'everything_else_in_scene_identical':True,
        'unchanged_scene_sha256':hashlib.sha256(unchanged_scene.encode()).hexdigest(),
        'renderer_binary_sha256':sha(ROOT/'crf_render'),
        'geometry_aov_byte_identical':geometry_identity,
        'beauty_changed':beauty_different,
        'albedo_changed_pixel_count':int(delta.sum()),
        'albedo_changed_bbox_xyxy':[int(xx.min()),int(yy.min()),int(xx.max())+1,int(yy.max())+1],
        'seed':77331,'threads':2,'postprocessing':'Identical 2-pass AOV-guided a-trous, filmic curve, sRGB.',
        'interpretation':'This proves explicit code-level material control and identical primary geometry. It does not assert that indirect illumination is unchanged; material changes may affect reflections and transmitted light.',
        'results':results,
        'comparison':{'path':str(image_path.relative_to(ROOT)),'sha256':sha(image_path),'width':800,'height':564,'source_panels_native_size':[320,400]},
    }
    out=ROOT/'logs/controlled_parameter_check.json'
    out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'report':str(out),'comparison':str(image_path),'geometry_aov_byte_identical':geometry_identity,'changed_scene_lines':len(changed),'albedo_changed_pixel_count':int(delta.sum())},indent=2))


if __name__=='__main__':main()
