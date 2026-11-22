"""CRF 0.9 shared appearance descriptors and bounded statistical learning.

These are sufficient statistics of multiple real observations, not RGB grids or
source patches. Scene geometry remains an explicitly authored program prior.
The model cannot establish arbitrary text-to-image or photoreal generalization.
"""
from __future__ import annotations
import hashlib
import math
import json
import numpy as np
from scipy.ndimage import convolve1d

CATEGORIES = ('architecture', 'landscape', 'still_life')

def descriptor(rgba, *, identifier, source_group, category):
    rgba = np.asarray(rgba, dtype=np.uint8)
    h, w = rgba.shape[:2]
    scale = min(1, 128 / max(w, h))
    aw, ah = max(8, math.floor(w * scale + .5)), max(8, math.floor(h * scale + .5))
    ix = np.clip(np.floor((np.arange(aw) + .5) * w / aw).astype(int), 0, w - 1)
    iy = np.clip(np.floor((np.arange(ah) + .5) * h / ah).astype(int), 0, h - 1)
    small = rgba[np.ix_(iy, ix)]
    rgb = small[..., :3].astype(float) / 255
    rgb = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    alpha = small[..., 3].astype(float) / 255
    count = float(alpha.sum())
    if count < 1:
        raise ValueError('No usable pixels')
    mean = (rgb * alpha[..., None]).sum((0, 1)) / count
    std = np.sqrt(np.maximum(0, (rgb ** 2 * alpha[..., None]).sum((0, 1)) / count - mean ** 2))
    lum = (rgb @ np.array([.2126, .7152, .0722])).astype(np.float32)
    previous = lum
    bands = []
    for sigma in [.6, 1.2, 2.4, 4.8]:
        radius = math.ceil(3 * sigma)
        k = np.exp(-.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
        k /= k.sum()
        blurred = convolve1d(convolve1d(lum, k, axis=1, mode='nearest'), k, axis=0, mode='nearest')
        bands.append(float(np.sqrt(((previous - blurred) ** 2 * alpha).sum() / count)))
        previous = blurred
    return {'id': identifier, 'sourceGroup': source_group, 'category': category,
            'mean': mean.tolist(), 'std': std.tolist(), 'bands': bands,
            'sampleCount': round(count), 'analysisSize': [aw, ah],
            'method': 'linear_rgb_moments_and_gaussian_band_rms_v1'}

def learn(observations):
    categories = {}
    for category in CATEGORIES:
        rows = [r for r in observations if r['category'] == category]
        if rows:
            categories[category] = {'count': len(rows),
                **{key: np.mean([r[key] for r in rows], 0).tolist() for key in ['mean', 'std', 'bands']},
                'sourceGroups': sorted(set(r['sourceGroup'] for r in rows))}
    signature = hashlib.sha256(json.dumps(observations, sort_keys=True).encode()).hexdigest()
    return {'schema': 'crf.shared_appearance.v0.9', 'id': 'shared-' + signature[:16],
        'revision': 1, 'categories': categories, 'observations': observations,
        'sourceCount': len(observations), 'sha256': signature,
        'scope': 'shared multi-image linear-color moments and Gaussian frequency-band amplitudes; procedural shape prior is hand-authored',
        'training': 'maximum-likelihood sample moments; equal weight per independent observation',
        'sourceRGBEmbedded': False, 'neuralWeightsTrained': False, 'generativeGeneralizationProven': False}

def evaluate_descriptors(model, held_out):
    default = np.array([.018, .013, .018, .024])
    rows = []
    for row in held_out:
        learned = model['categories'].get(row['category'])
        if not learned:
            rows.append({'id': row['id'], 'status': 'unsupported_category'})
            continue
        target = np.array(row['bands'])
        # Raw descriptor-space error, not an image reconstruction or realism score.
        old = float(np.square(default - target).mean())
        new = float(np.square(np.array(learned['bands']) - target).mean())
        rows.append({'id': row['id'], 'category': row['category'], 'status': 'evaluated',
                     'handAuthoredBandMSE': old, 'learnedBandMSE': new, 'improved': new < old})
    valid = [r for r in rows if r['status'] == 'evaluated']
    return {'scope': 'held-out Gaussian frequency-band descriptor prediction only', 'rows': rows,
            'count': len(valid), 'meanHandAuthoredBandMSE': float(np.mean([r['handAuthoredBandMSE'] for r in valid])) if valid else None,
            'meanLearnedBandMSE': float(np.mean([r['learnedBandMSE'] for r in valid])) if valid else None,
            'improvedCount': sum(r['improved'] for r in valid),
            'photorealismMeasured': False, 'fullP3Passed': False}

def canonical_fruit_skin(rgba, bbox, seed=9):
    """Heuristic chromatic foreground → per-row canonical object coordinates.

    This is not a semantic foundation segmenter or intrinsic-reflectance solver.
    Low spatial frequencies are explicitly removed to reduce baked illumination.
    """
    import cv2
    from scipy import ndimage
    rgb = np.asarray(rgba, dtype=np.uint8)[..., :3]
    h, w = rgb.shape[:2]
    scale = min(1, 384 / max(h, w))
    if scale < 1:
        rgb = cv2.resize(rgb, (round(w*scale), round(h*scale)), interpolation=cv2.INTER_AREA)
    h, w = rgb.shape[:2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    mask = ((hsv[..., 0] < 76) | (hsv[..., 0] > 165)) & (hsv[..., 1] > 58) & (hsv[..., 2] > 42)
    x0, y0, x1, y1 = bbox
    roi = np.zeros((h, w), bool)
    roi[max(0,int(y0*h)):min(h,math.ceil(y1*h)), max(0,int(x0*w)):min(w,math.ceil(x1*w))] = True
    mask &= roi
    mask = ndimage.binary_closing(mask, iterations=2)
    labels, count = ndimage.label(mask)
    if not count: raise ValueError('No chromatic foreground')
    areas = np.bincount(labels.ravel()); areas[0] = 0
    mask = ndimage.binary_fill_holes(labels == int(np.argmax(areas)))
    ys, xs = np.nonzero(mask)
    if len(xs) < 180: raise ValueError('Foreground too small')
    left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)
    if (right-left)/(bottom-top) < .3 or (right-left)/(bottom-top) > 3:
        raise ValueError('Implausible foreground aspect ratio')
    n = 64; canonical = np.zeros((n,n,3),float); valid = np.zeros((n,n),bool)
    for j in range(n):
        v = (j+.5)/n
        yy = min(bottom-1,top+int(v*(bottom-top)))
        occupied = np.flatnonzero(mask[yy])
        if len(occupied)<2: continue
        # Map visible width of each scanline to a shared canonical disk.
        half = math.sqrt(max(0,1-(v*2-1)**2))
        for i in range(n):
            u = (i+.5)/n*2-1
            if abs(u) > half*.94: continue
            q = .5+.5*u/max(.001,half)
            xx = int(round(occupied[0]+q*(occupied[-1]-occupied[0])))
            canonical[j,i] = rgb[yy,xx]/255
            valid[j,i] = True
    if valid.sum() < 600: raise ValueError('Insufficient canonical coverage')
    # Extend the interior before filtering to avoid treating the alpha boundary as texture.
    _, nearest = ndimage.distance_transform_edt(~valid, return_indices=True)
    canonical[~valid] = canonical[nearest[0],nearest[1]][~valid]
    linear_rgb = np.where(canonical<=.04045,canonical/12.92,((canonical+.055)/1.055)**2.4)
    logarithm = np.log(np.maximum(linear_rgb,.015))
    lowpass = ndimage.gaussian_filter(logarithm, sigma=(3.5,3.5,0), mode='nearest')
    residual = np.clip(logarithm-lowpass,-.65,.65)
    profiles=[]; centers=[]
    for v in np.linspace(0,1,33):
        yy=min(bottom-1,top+int(v*(bottom-top)))
        occupied=np.flatnonzero(mask[yy])
        profiles.append((occupied[-1]-occupied[0]+1)/(right-left) if len(occupied) else 0)
        centers.append(((occupied[-1]+occupied[0])/2-(left+right-1)/2)/max(1,(right-left)/2) if len(occupied) else 0)
    profiles=ndimage.gaussian_filter1d(np.array(profiles),.7,mode='nearest')
    centers=ndimage.gaussian_filter1d(np.array(centers),1.2,mode='nearest')
    return residual, valid, {'maskMethod':'HSV chromatic foreground + component + fill; inferred',
        'canonicalMethod':'per-row visible silhouette width to canonical disk',
        'lowpassSigma':3.5,'gridSize':64,'coverage':int(valid.sum()),'sourceBBoxPixels':[left,top,right,bottom],
        'intrinsicAlbedoRecovered':False,'silhouetteWidths':profiles.tolist(),'silhouetteCenters':centers.tolist()}

def fixed_gaussian_basis(n=64, grid=17, sigma=.09):
    from scipy.sparse import csr_matrix
    yy, xx = np.mgrid[:n,:n]
    xx=(xx.ravel()+.5)/n*2-1; yy=(yy.ravel()+.5)/n*2-1
    centers=np.array([(x,y) for y in np.linspace(-1,1,grid) for x in np.linspace(-1,1,grid)])
    q=((xx[:,None]-centers[:,0])**2+(yy[:,None]-centers[:,1])**2)/(sigma*sigma)
    return csr_matrix(np.where(q<16,np.exp(-.5*q),0)),centers

def learn_gaussian_skin(items):
    """Shared mean and low-rank coefficient modes on one canonical Gaussian basis."""
    from scipy.sparse.linalg import lsmr
    basis, centers = fixed_gaussian_basis()
    fits=[]
    for item in items:
        mask=item['mask'].ravel(); target=item['residual'].reshape(-1,3)
        coeff=np.column_stack([lsmr(basis[mask],target[mask,c],damp=.045,atol=1e-6,btol=1e-6,maxiter=120)[0] for c in range(3)])
        fit=basis@coeff
        fits.append({**item,'coefficients':coeff,'fitMSE':float(np.mean((fit[mask]-target[mask])**2))})
    train=[r for r in fits if r['split']=='train']
    if len(train)<2:
        return None,{'status':'insufficient_training_instances','trainingCount':len(train),'fullP3Passed':False}
    matrix=np.array([r['coefficients'].ravel() for r in train]); mean=matrix.mean(0)
    _,singular,vt=np.linalg.svd(matrix-mean,full_matrices=False)
    rank=min(4,len(train)-1); modes=vt[:rank]; deviations=singular[:rank]/math.sqrt(max(1,len(train)-1))
    payload={'schema':'crf.canonical_gaussian_basis.v0.9','family':'fruit_skin',
        'coordinates':'canonical silhouette disk [-1,1]^2; colors are log-linear high-frequency residuals',
        'gridSize':17,'sigma':.09,'cutoffSigma':4,'mean':mean.reshape(-1,3).round(8).tolist(),
        'modes':modes.reshape(rank,-1,3).round(8).tolist(),'standardDeviations':deviations.round(8).tolist(),
        'rank':rank,'trainingCount':len(train),'trainingIds':[r['id'] for r in train],
        'sampleRule':'mean + sum(clipped N(0,1) * std * PCA_mode); evaluated through fixed Gaussian functions',
        'sourceRGBEmbedded':False,'illuminationRemoval':'local log-RGB Gaussian high-pass, not intrinsic albedo truth'}
    shape_models={}
    for kind in ['apple','pear','orange']:
        shape_rows=[r for r in train if r.get('semanticType')==kind]
        # Discard obviously clipped masks rather than learning a crop boundary as shape.
        shape_rows=[r for r in shape_rows if max(r['extraction']['silhouetteWidths'][0],r['extraction']['silhouetteWidths'][-1])<.75]
        if not shape_rows: continue
        widths=np.array([r['extraction']['silhouetteWidths'] for r in shape_rows]);centers_arr=np.array([r['extraction']['silhouetteCenters'] for r in shape_rows]);wm=widths.mean(0);cm=centers_arr.mean(0)
        if len(shape_rows)>1:
            _,sv,vv=np.linalg.svd(widths-wm,full_matrices=False);rnk=min(2,len(shape_rows)-1)
            width_modes=(vv[:rnk]*sv[:rnk,None]/math.sqrt(len(shape_rows)-1)).tolist()
        else: width_modes=[]
        shape_models[kind]={'widthMean':wm.tolist(),'centerMean':cm.tolist(),'widthModes':width_modes,'trainingCount':len(shape_rows),'sourceIds':[r['id'] for r in shape_rows],
            'scope':'heuristic visible silhouette statistics; single-instance classes do not establish shape generalization'}
    payload['shapeModels']=shape_models
    evaluation=[]
    for row in fits:
        target=row['residual'].reshape(-1,3); mask=row['mask'].ravel()
        mean_img=basis@mean.reshape(-1,3)
        residual_coeff=row['coefficients'].ravel()-mean
        latent=modes@residual_coeff
        projected=mean+latent@modes
        projected_img=basis@projected.reshape(-1,3)
        evaluation.append({'id':row['id'],'split':row['split'],'fitMSE':row['fitMSE'],
            'zeroAppearanceMSE':float(np.mean(target[mask]**2)),
            'sharedMeanMSE':float(np.mean((mean_img[mask]-target[mask])**2)),
            'oracleProjectedPCAMSE':float(np.mean((projected_img[mask]-target[mask])**2)),
            'oracleLatentsUseHeldoutTarget':True,'extraction':row['extraction']})
    report={'status':'trained_limited_function_family','trainingCount':len(train),'rank':rank,
        'gaussianBasisFunctions':len(centers),'sharedLearnedNumbers':int(mean.size+modes.size+deviations.size),
        'instances':evaluation,'scope':'actual shared canonical Gaussian coefficient mean/PCA; geometry remains a hand-authored program',
        'evaluationWarning':'Oracle PCA projection measures basis reconstruction, not new-image generation or realism. All individual-fit/PCA diagnostic values are separate from G2.',
        'fullP3Passed':False}
    return payload,report
