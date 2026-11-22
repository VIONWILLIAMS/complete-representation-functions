"""Locked, full-resolution RGB8 acceptance; all multiscale results are diagnostic.

No resizing, registration, blur, crop, or tolerance can make exact100 true.
Error images are evaluation artifacts and must never be renderer inputs.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, label, sobel

SCHEMA = "crf.pixel_acceptance.v1"
SIZE = (667, 1000)
THRESHOLDS = (0, 1, 2, 5, 10, 20, 32)
TILE_SIZE = 64


class PixelContractError(ValueError):
    pass


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
        separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _save(value, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+"\n",
                    encoding="utf-8")


def _load_rgb8(path):
    path = Path(path)
    with Image.open(path) as im:
        if im.size != SIZE:
            raise PixelContractError(f"Expected exactly {SIZE[0]}x{SIZE[1]}, got {im.size}; resizing is forbidden")
        if im.getexif().get(274, 1) not in (None, 1):
            raise PixelContractError("Nontrivial EXIF orientation requires a separate declared input conversion")
        if im.mode not in ("RGB", "RGBA"):
            raise PixelContractError("Expected decoded RGB8 or fully opaque RGBA8")
        a = np.asarray(im, dtype=np.uint8).copy()
        if im.mode == "RGBA":
            if np.any(a[:, :, 3] != 255):
                raise PixelContractError("Nonopaque alpha cannot satisfy the RGB8 rendered-observation contract")
            a = a[:, :, :3].copy()
        return a, {"path":str(path.resolve()), "file_sha256":file_hash(path),
            "rgb_sha256":hashlib.sha256(a.tobytes()).hexdigest(), "source_mode":im.mode,
            "width":im.width, "height":im.height,
            "conversion":"Opaque RGBA alpha discarded if present; no ICC transform or spatial transform"}


def normalize_rois(rois=None):
    result = {}
    for name, item in (rois or {}).items():
        spec = {"bbox":item} if isinstance(item, (list,tuple)) else dict(item)
        box = spec.get("bbox", spec.get("bbox_px"))
        if not isinstance(name, str) or not isinstance(box, (list,tuple)) or len(box)!=4:
            raise PixelContractError("ROI map requires named four-coordinate bounding boxes")
        if any(type(v) not in (int,float) or not math.isfinite(v) for v in box):
            raise PixelContractError("ROI coordinates must be finite")
        x0,y0,x1,y1 = box
        clipped = [max(0,math.floor(x0)),max(0,math.floor(y0)),
                   min(SIZE[0],math.ceil(x1)),min(SIZE[1],math.ceil(y1))]
        if clipped[0]>=clipped[2] or clipped[1]>=clipped[3]:
            raise PixelContractError("An ROI must contain visible pixels: "+name)
        tolerance = spec.get("max_mae_regression", spec.get("mae_regression", .5))
        if type(tolerance) not in (int,float) or not math.isfinite(tolerance) or tolerance<0:
            raise PixelContractError("ROI regression tolerance must be finite and nonnegative")
        result[name] = {"bbox":clipped, "requested_bbox":list(box),
            "scope":spec.get("scope","overlapping_entity_roi"),
            "role":spec.get("role",name.split(".")[0]),
            "max_mae_regression":float(tolerance)}
    return result


def _connection_specs(connections):
    specs = []
    for entry in (connections or []):
        c = dict(entry)
        for key in ("id","bbox","a","b"):
            if key not in c: raise PixelContractError("Connection probe requires "+key)
        c["bbox"] = normalize_rois({c["id"]:c["bbox"]})[c["id"]]["bbox"]
        for key in ("a","b"):
            if len(c[key])!=2 or any(not math.isfinite(float(v)) for v in c[key]):
                raise PixelContractError("Connection endpoints must be two finite pixel coordinates")
            if not (c["bbox"][0]<=c[key][0]<c["bbox"][2] and c["bbox"][1]<=c[key][1]<c["bbox"][3]):
                raise PixelContractError("Connection endpoints must lie inside their fixed ROI")
        c.setdefault("polarity","dark"); c.setdefault("threshold_255",100.)
        c.setdefault("endpoint_radius_px",2)
        if c["polarity"] not in ("dark","bright") or not 0<=c["threshold_255"]<=255:
            raise PixelContractError("Invalid connection threshold")
        if type(c["endpoint_radius_px"]) is not int or not 0<=c["endpoint_radius_px"]<=10:
            raise PixelContractError("Connection endpoint radius must be an integer in 0..10")
        specs.append(c)
    if len({c["id"] for c in specs})!=len(specs):
        raise PixelContractError("Connection probe IDs must be unique")
    return specs


def checker_contract(reference_path, *, rois=None, connections=None):
    _, ref = _load_rgb8(reference_path)
    return {"schema":SCHEMA,"implementation_sha256":file_hash(__file__),
        "reference_file_sha256":ref["file_sha256"],"reference_rgb_sha256":ref["rgb_sha256"],
        "size":list(SIZE),"thresholds":list(THRESHOLDS),"tile_size":TILE_SIZE,
        "exact_rule":"dimensions match AND every original RGB8 channel equals; diagnostic thresholds never substitute",
        "alignment":"none; no resizing, registration, cropping, or preblur",
        "rois":normalize_rois(rois),"connections":_connection_specs(connections),
        "diagnostics":{"ssim_sigma_px":1.5,"low_frequency_sigma_px":4.,
            "texture_sigma_px":2.,"edge_threshold_255":12.,"edge_tolerance_px":1.5}}


def _metrics(diff, max_error, ssim):
    squared = diff.astype(np.float64)**2
    mse = float(squared.mean())
    return {"rgb_mae_255":float(np.abs(diff).mean()),"rgb_rmse_255":math.sqrt(mse),
        "max_abs_channel_error":int(max_error.max()),
        "psnr_db":None if mse==0 else 10*math.log10(255.**2/mse),
        "psnr_infinite":mse==0,"luminance_ssim_gaussian_1_5":float(ssim.mean()),
        "exact_pixel_fraction":float(np.mean(max_error==0)),
        "exact_channel_fraction":float(np.mean(diff==0)),
        "pixels_evaluated":int(max_error.size)}


def _ssim(x, y):
    x=x/255.;y=y/255.
    ux=gaussian_filter(x,1.5);uy=gaussian_filter(y,1.5)
    vx=np.maximum(gaussian_filter(x*x,1.5)-ux*ux,0.)
    vy=np.maximum(gaussian_filter(y*y,1.5)-uy*uy,0.)
    cov=gaussian_filter(x*y,1.5)-ux*uy
    return ((2*ux*uy+.01**2)*(2*cov+.03**2))/((ux*ux+uy*uy+.01**2)*(vx+vy+.03**2))


def _edge_map(lum):
    return np.hypot(sobel(lum,0),sobel(lum,1))/8.


def _edge_diagnostic(first, second):
    a=first>12.;b=second>12.
    na,nb=int(a.sum()),int(b.sum())
    recall = float(np.mean(distance_transform_edt(~b)[a]<=1.5)) if na and nb else float(na==0)
    precision = float(np.mean(distance_transform_edt(~a)[b]<=1.5)) if nb and na else float(nb==0)
    f1=2*precision*recall/(precision+recall) if precision+recall else 0.
    return {"gradient_mae_255":float(np.abs(first-second).mean()),"precision":precision,
        "recall":recall,"f1":f1,"threshold_255":12.,"tolerance_px":1.5,
        "scope":"Diagnostic edge matching only; never used for exact100"}


def _texture(first, second):
    sa,sb=float(first.std()),float(second.std())
    corr=float(np.corrcoef(first.ravel(),second.ravel())[0,1]) if min(sa,sb)>1e-10 else float(np.array_equal(first,second))
    return {"reference_detail_std_255":sa,"candidate_detail_std_255":sb,
        "std_abs_gap_255":abs(sa-sb),"std_ratio":None if sa<1e-10 else sb/sa,
        "detail_mae_255":float(np.abs(first-second).mean()),"sample_correlation":corr,
        "scope":"sigma2 high-pass diagnostic; region boxes can also contain edges"}


def _connectivity(luminance, spec):
    x0,y0,x1,y1=spec["bbox"]
    values=luminance[y0:y1,x0:x1]
    mask=values<spec["threshold_255"] if spec["polarity"]=="dark" else values>spec["threshold_255"]
    components,_=label(mask,structure=np.ones((3,3),dtype=np.uint8))
    radius=spec["endpoint_radius_px"]
    sets=[]
    for x,y in (spec["a"],spec["b"]):
        x,y=int(round(x-x0)),int(round(y-y0))
        neighborhood=components[max(0,y-radius):y+radius+1,max(0,x-radius):x+radius+1]
        sets.append(set(int(v) for v in np.unique(neighborhood) if v))
    return {"connected":bool(sets[0]&sets[1]),"a_hits_foreground":bool(sets[0]),
        "b_hits_foreground":bool(sets[1]),"foreground_pixels":int(mask.sum())}


def assess(reference_path, candidate_path, *, rois=None, connections=None, output_dir=None):
    """Compare original aligned samples; return a durable report, including invalid candidates."""
    contract=checker_contract(reference_path,rois=rois,connections=connections)
    a,ref=_load_rgb8(reference_path)
    report={"schema":SCHEMA,"checker_sha256":canonical_hash(contract),"checker_contract":contract,
        "valid":False,"exact100":False,"status":"invalid_input","reference":ref,
        "candidate":{"path":str(Path(candidate_path).resolve())},
        "dimensions":{"expected":list(SIZE),"match":False},"global":None,
        "exact_pixel_fraction":None,"exact_channel_fraction":None,"threshold_hits":{},
        "diagnostics":{},"rois":{},"connections":{},"tiles":[],
        "scoring_note":"Only strict original RGB8 equality can pass exact100; multiscale fields are diagnostic",
        "roi_note":"Entity boxes may overlap; their scores are not summed into the global metric"}
    try:
        b,candidate=_load_rgb8(candidate_path)
    except (PixelContractError,OSError,ValueError) as error:
        report["error"]=str(error)
        if Path(candidate_path).is_file():report["candidate"]["file_sha256"]=file_hash(candidate_path)
        if output_dir is not None:_save(report,Path(output_dir)/"pixel_report.json")
        return report
    report["candidate"]=candidate;report["valid"]=True;report["dimensions"]["match"]=True
    diff=a.astype(np.int16)-b.astype(np.int16);max_error=np.abs(diff).max(axis=-1)
    weights=np.array([.2126,.7152,.0722])
    la=a@weights;lb=b@weights;ssim=_ssim(la,lb)
    lowa=gaussian_filter(a.astype(np.float32),sigma=(4.,4.,0.))
    lowb=gaussian_filter(b.astype(np.float32),sigma=(4.,4.,0.))
    deta=la-gaussian_filter(la,2.);detb=lb-gaussian_filter(lb,2.)
    edgea=_edge_map(la);edgeb=_edge_map(lb)
    metrics=_metrics(diff,max_error,ssim)
    report.update({"global":metrics,"exact100":bool(np.all(diff==0)),
        "exact_pixel_fraction":metrics["exact_pixel_fraction"],
        "exact_channel_fraction":metrics["exact_channel_fraction"]})
    report["status"]="exact100" if report["exact100"] else "not_exact"
    for threshold in THRESHOLDS:
        hits=int(np.count_nonzero(max_error<=threshold))
        report["threshold_hits"][str(threshold)]={"pixels":hits,"fraction":hits/max_error.size,
            "rule":"all three channel absolute differences <= threshold","threshold_255":threshold}
    report["diagnostics"]={"edge":_edge_diagnostic(edgea,edgeb),
        "low_frequency":{"sigma_px":4.,"rgb_mae_255":float(np.abs(lowa-lowb).mean())},
        "texture":_texture(deta,detb)}
    for name,spec in contract["rois"].items():
        x0,y0,x1,y1=spec["bbox"];sl=np.s_[y0:y1,x0:x1]
        report["rois"][name]={**spec,"metrics":_metrics(diff[sl],max_error[sl],ssim[sl]),
            "low_frequency_mae_255":float(np.abs(lowa[sl]-lowb[sl]).mean()),
            "edge":_edge_diagnostic(edgea[sl],edgeb[sl]),"texture":_texture(deta[sl],detb[sl])}
    for spec in contract["connections"]:
        first,second=_connectivity(la,spec),_connectivity(lb,spec)
        report["connections"][spec["id"]]={"spec":spec,"reference":first,"candidate":second,
            "matches_reference":first["connected"]==second["connected"],
            "scope":"Fixed ROI threshold connectivity diagnostic; not a mesh-contact proof"}
    for y in range(0,SIZE[1],TILE_SIZE):
        for x in range(0,SIZE[0],TILE_SIZE):
            x1,y1=min(SIZE[0],x+TILE_SIZE),min(SIZE[1],y+TILE_SIZE);sl=np.s_[y:y1,x:x1]
            mae=float(np.abs(diff[sl]).mean())
            report["tiles"].append({"bbox":[x,y,x1,y1],"mae_255":mae,
                "exact_pixel_fraction":float(np.mean(max_error[sl]==0)),
                "max_error_255":int(max_error[sl].max()),"priority":mae})
    report["tiles"].sort(key=lambda item:(-item["priority"],item["bbox"][1],item["bbox"][0]))
    if output_dir is not None:
        out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
        Image.fromarray(max_error.astype(np.uint8)).save(out/"error_max_channel.png")
        tile_map=np.zeros((SIZE[1],SIZE[0],3),dtype=np.uint8)
        for tile in report["tiles"]:
            x0,y0,x1,y1=tile["bbox"];v=min(255,round(tile["priority"]*4.))
            tile_map[y0:y1,x0:x1]=[v,round(v*.25),0]
        Image.fromarray(tile_map).save(out/"tile_priority.png")
        report["outputs"]={"error_map":str((out/"error_max_channel.png").resolve()),
            "tile_priority_map":str((out/"tile_priority.png").resolve()),
            "error_map_scale":"max absolute original channel error, 0..255",
            "tile_display_scale":"red=min(255,4*tile_MAE); exact values are in tiles",
            "analysis_only_never_renderer_input":True}
        _save(report,out/"pixel_report.json")
    return report
