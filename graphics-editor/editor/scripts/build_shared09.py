#!/usr/bin/env python3
"""Train shared CRF appearance moments from existing real downloaded references.

No network/model API call. No image or patch data is embedded in the model.
The grouped split is frozen before the held-out evaluation is computed.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'fitting'))
from learn_shared09 import descriptor, learn, evaluate_descriptors, canonical_fruit_skin, learn_gaussian_skin

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def group_key(row):
    url = row.get('sourceUrl', '')
    match = re.search(r'/photo/(?:[^/]*-)?(\d+)/?', url)
    return 'pexels:' + match.group(1) if match else url.split('?')[0] or row['sourceSHA256']

def main():
    items = json.loads((ROOT / 'reports/v08/learning/fits.json').read_text())['fits']
    rows, errors = [], []
    for item in items:
        category = 'architecture' if item['round'] in [6, 7] else 'landscape' if item['round'] >= 8 else 'still_life'
        path = ROOT / item['sourceFile']
        try:
            raw = path.read_bytes()
            assert hashlib.sha256(raw).hexdigest() == item['sourceSHA256'], 'Source hash mismatch'
            with Image.open(path) as im:
                rgba = np.asarray(ImageOps.exif_transpose(im).convert('RGBA'))
            row = descriptor(rgba, identifier=item['id'], source_group=group_key(item), category=category)
            row['sourceSHA256'] = item['sourceSHA256']
            row['sourceUrl'] = item.get('sourceUrl')
            row['dHash64'] = item.get('dHash64')
            rows.append(row)
        except Exception as exc:
            errors.append({'id': item['id'], 'error': str(exc)})
    # Merge exact source and conservative perceptual-near-copy groups before splitting.
    parent = list(range(len(rows)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i, a in enumerate(rows):
        for j in range(i):
            b = rows[j]
            near = False
            if a.get('dHash64') and b.get('dHash64'):
                near = (int(a['dHash64'], 16) ^ int(b['dHash64'], 16)).bit_count() <= 7
            if a['sourceGroup'] == b['sourceGroup'] or a['sourceSHA256'] == b['sourceSHA256'] or near:
                parent[find(i)] = find(j)
    for i, row in enumerate(rows):
        members = sorted(r['id'] for j, r in enumerate(rows) if find(i) == find(j))
        row['sourceGroup'] = 'group-' + hashlib.sha256('|'.join(members).encode()).hexdigest()[:16]
    assignment = {}
    for category in ['architecture', 'landscape', 'still_life']:
        groups = sorted(set(r['sourceGroup'] for r in rows if r['category'] == category), key=lambda g: hashlib.sha256(('crf09-split-1'+g).encode()).hexdigest())
        train_n, val_n = max(1, int(len(groups) * .6)), max(1, int(len(groups) * .2))
        for i, group in enumerate(groups):
            assignment.setdefault(group, 'train' if i < train_n else 'validation' if i < train_n + val_n else 'test')
    for row in rows: row['split'] = assignment[row['sourceGroup']]
    model = learn([r for r in rows if r['split'] == 'train'])
    model['splitPolicy'] = 'source URL/exact hash plus dHash Hamming<=7 groups, deterministic grouped 60/20/20 approximate split'
    model['splitLimitation'] = 'Scene/capture identity has not been manually verified for every unrelated web photograph; this is a conservative automated exploratory split, not final G2 evidence.'
    model['allObservationCount'] = len(rows)
    model['trainingGroupCount'] = len(set(r['sourceGroup'] for r in rows if r['split']=='train'))
    semantics={}
    for p in (ROOT/'reports/v08/learning').glob('semantics_*.json'):
        for row in json.loads(p.read_text()).get('items',[]): semantics[row['id']]=row
    by_id={r['id']:r for r in rows}; skin_items=[]; skin_errors=[]
    for item in items:
        if item['round'] not in [1,2] or item['id'] not in by_id: continue
        try:
            with Image.open(ROOT/item['sourceFile']) as im: rgba=np.asarray(ImageOps.exif_transpose(im).convert('RGBA'))
            residual,mask,details=canonical_fruit_skin(rgba,semantics.get(item['id'],{}).get('bbox',[0,0,1,1]))
            label=semantics.get(item['id'],{}).get('category','')
            kind='pear' if 'pear' in label else 'apple' if 'apple' in label else 'orange'
            skin_items.append({'id':item['id'],'semanticType':kind,'residual':residual,'mask':mask,'extraction':details,'split':by_id[item['id']]['split']})
        except Exception as exc: skin_errors.append({'id':item['id'],'error':str(exc)})
    skin_model,skin_report=learn_gaussian_skin(skin_items)
    if skin_model: model['functionFamilies']={'fruit_skin':skin_model}
    skin_report['failedExtractions']=skin_errors
    family_signature=hashlib.sha256(json.dumps({k:v for k,v in model.items() if k not in ['id','sha256']},sort_keys=True).encode()).hexdigest()
    model['sha256']=family_signature
    model['id']='shared-'+family_signature[:16]
    report = {'schema': 'crf.shared_learning_evidence.v0.9', 'modelId': model['id'],
        'sources': [{k: r[k] for k in ['id', 'category', 'sourceGroup', 'sourceUrl', 'sourceSHA256', 'split']} for r in rows],
        'counts': {part: sum(r['split']==part for r in rows) for part in ['train','validation','test']},
        'groupCounts': {part:len(set(r['sourceGroup'] for r in rows if r['split']==part)) for part in ['train','validation','test']},
        'validation': evaluate_descriptors(model, [r for r in rows if r['split']=='validation']),
        'test': evaluate_descriptors(model, [r for r in rows if r['split']=='test']),
        'failedInputs': errors,
        'learnedParameters': 'per-category linear RGB first and second moments and four Gaussian luminance-band RMS amplitudes',
        'modelBytesContainSourcePixels': False, 'generalNeuralGeneratorTrained': False,
        'fullP3Passed': False, 'limitations': [model['splitLimitation'],
            'Descriptor-space prediction improvement cannot establish realistic generation, correct semantic geometry, or unrestricted generalization.',
            'Known categories use explicitly authored shape programs; new geometry classes require a new implemented function.']}
    report['canonicalGaussianLearning']=skin_report
    write(ROOT / 'web/assets/v09/shared-appearance.json', model)
    write(ROOT / 'reports/v09/shared_learning.json', report)
    write(ROOT / 'reports/v09/appearance_observations.json', rows)
    print(json.dumps({'model': model['id'], 'counts':report['counts'], 'test':{k:v for k,v in report['test'].items() if k!='rows'},'modelFile':'web/assets/v09/shared-appearance.json'}, ensure_ascii=False))

if __name__ == '__main__': main()
