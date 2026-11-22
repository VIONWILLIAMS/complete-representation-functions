"""Scan every reference pixel into an observation-backed semantic point program.

This is not image compression, learned segmentation, or recovered physical 3D.
All masks below are assistant-authored source-image annotations. Only the road
paint mask has an additional source-luminance region-growing refinement.
"""
from __future__ import annotations

import base64
import hashlib
import json
import math
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFont
from scipy.ndimage import (binary_dilation, binary_erosion, binary_fill_holes, binary_propagation,
                           distance_transform_edt, gaussian_filter, sobel, map_coordinates)

SCHEMA = "crf.scene.v0.5"
SIZE = (667, 1000)
GROUND_SLOPE = 1.0 / math.tan(math.radians(20.0))
DEFINITIONS = [
    ("wall.main", "主墙面", "wall", "建筑", None),
    ("wall.base", "墙脚带", "wall_base", "建筑", "wall.main"),
    ("road.main", "沥青道路", "road", "地面", None),
    ("road.edge", "路缘线与白漆碎片", "road_marking", "地面", "road.main"),
    ("sidewalk.main", "人行道与后排地面", "sidewalk", "地面", None),
    ("crosswalk.main", "斑马线白漆", "crosswalk", "地面", "road.main"),
    ("pole.main", "前景主杆", "pole", "信号设施", None),
    ("pole.arm", "顶部斜臂与弯管", "pole_arm", "信号设施", "pole.main"),
    ("signal.support", "横臂与吊架", "support_arm", "信号设施", "pole.main"),
    ("signal.main", "正面行人信号灯", "pedestrian_signal", "信号设施", "signal.support"),
    ("window.r0.c0", "左上窗（部分可见）", "window", "建筑", "wall.main"),
    ("window.r0.c1", "右上窗（部分可见）", "window", "建筑", "wall.main"),
    ("window.r1.c0", "左中窗", "window", "建筑", "wall.main"),
    ("window.r1.c1", "右中窗", "window", "建筑", "wall.main"),
    ("window.r2.c0", "左下窗", "window", "建筑", "wall.main"),
    ("window.r2.c1", "右下窗", "window", "建筑", "wall.main"),
    ("signal.side", "侧向灯背与遮罩", "signal_back_housings", "信号设施", "pole.main"),
    ("wall.fixtures", "左缘裁切设施", "cropped_wall_fixtures", "建筑", "wall.main"),
]
INDEX = {item[0]: i for i, item in enumerate(DEFINITIONS)}


def _draw_mask(*, polygons=(), lines=(), rectangles=(), rounded=(), ellipses=()):
    im = Image.new("L", SIZE, 0)
    d = ImageDraw.Draw(im)
    for polygon in polygons:
        d.polygon([tuple(p) for p in polygon], fill=255)
    for points, width in lines:
        d.line([tuple(p) for p in points], fill=255, width=int(width), joint="curve")
    for box in rectangles:
        d.rectangle(tuple(box), fill=255)
    for box, radius in rounded:
        d.rounded_rectangle(tuple(box), radius=radius, fill=255)
    for box in ellipses:
        d.ellipse(tuple(box), fill=255)
    return np.asarray(im) > 0


def build_labels(rgb, annotation):
    """Source-image annotations; never consumes a rendered semantic map."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    # Observed row boundaries, refined from the source crop, not model geometry.
    wall_end = 738.2 + 0.0045 * xx
    base_end = 763.7 + 0.002 * xx
    curb_end = 839.8 + 0.0120 * xx
    base = np.full((h, w), INDEX["wall.main"], dtype=np.uint8)
    base[yy >= wall_end] = INDEX["wall.base"]
    base[yy >= base_end] = INDEX["sidewalk.main"]
    base[yy >= curb_end] = INDEX["road.main"]
    labels = base.copy()
    masks = {}
    annotation_records = {}

    def assign(entity_id, mask, method, definition):
        if method.startswith("assistant_assisted_source_"):
            mask = binary_dilation(mask, iterations=1)
            definition = {**definition, "source_contour_margin_px": 1}
        masks[entity_id] = mask
        labels[mask] = INDEX[entity_id]
        annotation_records[entity_id] = {
            "method": method, "definition": definition,
            "source": "original_reference_rgb", "rendered_semantic_map_used": False,
        }

    # Outer frame outlines traced against original pixels; cropped top edges
    # are not expanded into the image as supposed observations.
    window_polygons = {
        "window.r0.c0": [[40, 0], [110, 0], [109, 35], [41, 37]],
        "window.r0.c1": [[184, 0], [253, 0], [252, 35], [184, 36]],
        "window.r1.c0": [[42, 256], [110, 255], [110, 326], [41, 328]],
        "window.r1.c1": [[184, 256], [253, 256], [253, 326], [183, 328]],
        "window.r2.c0": [[42, 542], [110, 541], [111, 612], [40, 615]],
        "window.r2.c1": [[183, 542], [253, 542], [253, 612], [182, 615]],
    }
    for entity_id, polygon in window_polygons.items():
        assign(entity_id, _draw_mask(polygons=[polygon]),
               "assistant_assisted_source_polygon", {"polygon_px": polygon})

    fixtures = [
        [[0, 79], [9, 80], [14, 85], [14, 113], [6, 116], [0, 114]],
        [[0, 366], [13, 367], [15, 371], [15, 400], [10, 407], [0, 409]],
        [[0, 656], [7, 657], [9, 661], [9, 688], [5, 693], [0, 694]],
    ]
    assign("wall.fixtures", _draw_mask(polygons=fixtures),
           "assistant_assisted_source_polygon", {"polygons_px": fixtures})

    # The previous observation's line fits are merely manual scan seeds. The
    # actual white-paint ownership is recomputed from this source photograph.
    old = {e["id"]: e for e in annotation["entities"]}
    polys = old["crosswalk.main"]["geometry_2d"]["polygons_px"]
    seed_geometry = _draw_mask(polygons=polys)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    # Keep source texture holes within a paint region, while extending the old
    # straight edges by only a few pixels to follow the observed worn contours.
    candidate = (lum > 99.0) & (yy >= 846) & binary_dilation(seed_geometry, iterations=3)
    seed = candidate & seed_geometry & (lum > 135.0)
    paint = binary_propagation(seed, mask=candidate)
    paint = binary_fill_holes(paint) & binary_dilation(seed_geometry, iterations=3)
    assign("crosswalk.main", paint, "assistant_seeded_source_luminance_region_growing",
           {"borrowed_seeds": "0.3 observed stripe boundary fits, not rendered masks",
            "luminance_threshold": 99.0, "seed_threshold": 135.0,
            "seed_expansion_px": 3, "bottom_cropping": "observed pixels only"})

    edge_band = (np.abs(yy - (844.8 + 0.0106 * xx)) <= 3.0)
    edge = (lum > 110) & edge_band
    fragment_seed = _draw_mask(polygons=[[[0, 968], [93, 965], [79, 975], [0, 986]]])
    fragment = binary_propagation(fragment_seed & (lum > 130),
                                 mask=binary_dilation(fragment_seed, iterations=2) & (lum > 104))
    # Keep the tiny disconnected road-paint fragment as an explicit observed
    # marking. Its relation to the crosswalk is still not established.
    assign("road.edge", edge | fragment, "assistant_seeded_source_luminance_region_growing",
           {"road_edge_centerline": [[0, 844.8], [667, 851.87]],
            "fragment_semantics": "road paint fragment; crosswalk membership unresolved"})

    # Front pole silhouette, including the lower sleeve and top socket.
    pole_polygon = [[174, 62], [190, 62], [194, 68], [193, 103], [191, 111],
                    [192, 538], [195, 548], [195, 733], [191, 735], [190, 831],
                    [165, 832], [165, 552], [168, 545], [169, 113], [163, 104],
                    [162, 95], [170, 87], [170, 69]]
    pole = _draw_mask(polygons=[pole_polygon], ellipses=[(170, 60, 194, 72)])
    assign("pole.main", pole, "assistant_assisted_source_silhouette",
           {"polygon_px": pole_polygon, "top_cap_ellipse_px": [170, 60, 194, 72]})

    arm_centerline = [[98, -40], [177.56, 97]]
    arm = _draw_mask(lines=[(arm_centerline, 17),
                           ([[73, -10], [79, 13], [86, 35], [91, 51], [96, 55],
                             [100, 50], [97, 34], [94, 13], [90, -10]], 6)])
    # Foreground tube pixels overlap the upper-left window; later assignments
    # implement the observed occlusion, not intersecting full bounding boxes.
    assign("pole.arm", arm, "assistant_assisted_source_polyline_silhouette",
           {"main_centerline_px": arm_centerline, "width_px": 17,
            "curved_tube": "assistant traced; cropped upper return unobserved"})

    support_polygons = [
        [[190, 378], [197, 378], [199, 382], [312, 383], [312, 390],
         [302, 393], [203, 392], [201, 401], [192, 406]],
        [[294, 390], [298, 390], [298, 402], [305, 402], [305, 407],
         [287, 407], [287, 402], [293, 402]],
    ]
    assign("signal.support", _draw_mask(polygons=support_polygons),
           "assistant_assisted_source_silhouette", {"polygons_px": support_polygons})

    side_polygons = [
        [[193, 409], [204, 408], [206, 413], [231, 417], [235, 420],
         [233, 425], [218, 443], [208, 445], [202, 440], [194, 441]],
        [[193, 453], [204, 453], [207, 457], [232, 459], [234, 463],
         [218, 483], [208, 486], [201, 481], [201, 493], [193, 493]],
    ]
    side = _draw_mask(polygons=side_polygons, rectangles=[(193, 404, 202, 491)])
    assign("signal.side", side, "assistant_assisted_source_silhouette",
           {"polygons_px": side_polygons, "backplate_px": [193, 404, 202, 491]})

    lamp = _draw_mask(rounded=[((277, 405, 321, 451), 10), ((276, 448, 320, 492), 9)],
                      rectangles=[(276, 438, 322, 465), (275, 420, 279, 437), (319, 420, 323, 435),
                                  (275, 460, 279, 479), (318, 459, 322, 477)])
    assign("signal.main", lamp, "assistant_assisted_source_rounded_silhouette",
           {"upper_outline_px": [277, 405, 321, 451],
            "lower_outline_px": [276, 448, 320, 492], "continuous_housing_bridge_px": [276,438,322,465]})
    # Read-only source QA exposed a narrow omitted side backplate and the
    # triangular shoe beneath the horizontal arm. Only wall-labelled pixels
    # may be added; no window, pole, signal, or other object's ownership changes.
    local_additions = {
        "signal.side": _draw_mask(rectangles=[(201, 405, 207, 495)]),
        "signal.support": _draw_mask(polygons=[
            [[201, 390], [208, 392], [205, 400], [201, 405]],
            [[299, 390], [311, 390], [304, 399], [299, 403]],
        ]),
    }
    for entity_id, addition in local_additions.items():
        idx = INDEX[entity_id]
        candidate = binary_dilation((labels == idx) | addition, iterations=1)
        added = candidate & (labels == INDEX["wall.main"])
        labels[added] = idx
        masks[entity_id] |= added
        annotation_records[entity_id]["sourceEdgeRefinement"] = {
            "method": "assistant_source_crop_inspection; local backplate/shoe outline plus1px",
            "added_pixels": int(added.sum()),
            "previous_owner_required": "wall.main", "other_object_pixels_overwritten": 0,
        }
    for entity_id in ("wall.main", "wall.base", "road.main", "sidewalk.main"):
        annotation_records[entity_id] = {
            "method": "assistant_assisted_source_surface_boundaries",
            "source": "original_reference_rgb", "rendered_semantic_map_used": False,
            "definition": {"occlusion": "visible ownership after foreground silhouette priority"},
        }
    # The first hidden surface behind a pole/arm can be a window, rather than
    # the facade. Borrow only the declared window silhouette, and infer RGB
    # later from that same window's visible pixels. This is not a full hidden
    # surface stack: behind this inferred window, another wall layer is absent.
    for entity_id in window_polygons:
        idx = INDEX[entity_id]
        occluded_window = masks[entity_id] & (labels != idx)
        base[occluded_window] = idx
    return labels, base, annotation_records


def _axis_interpolate(rgb, known, axis):
    """Interpolate only from pixels observed on the same semantic base surface."""
    data = np.moveaxis(rgb.astype(np.float64), axis, 1)
    mask = np.moveaxis(known, axis, 1)
    out = np.zeros_like(data)
    span = np.full(mask.shape, np.inf)
    t = np.arange(data.shape[1])
    for row in range(data.shape[0]):
        k = np.flatnonzero(mask[row])
        if not len(k):
            continue
        for c in range(3):
            out[row, :, c] = np.interp(t, k, data[row, k, c])
        left = k[np.maximum(0, np.searchsorted(k, t, side="right") - 1)]
        right = k[np.minimum(len(k) - 1, np.searchsorted(k, t, side="left"))]
        # At an image edge, one-sided continuation receives lower confidence.
        span[row] = np.maximum(1, right - left) + 2 * np.maximum(np.abs(t - left), np.abs(right - t))
    return np.moveaxis(out, 1, axis), np.moveaxis(span, 1, axis)



def _wall_context(rgb, known, holes):
    """Observed wall illumination, transported texture, and fitted seam continuity.

    The unknown pixels never supply colors. Texture is an explicitly inferred
    reuse of visible same-wall high frequencies; the fit is not hidden truth.
    """
    rgb64 = rgb.astype(np.float64)
    mask = known.astype(np.float64)
    def normalized(sigma):
        den = gaussian_filter(mask, sigma)
        num = gaussian_filter(rgb64 * mask[..., None], (sigma, sigma, 0))
        return num / np.maximum(den[..., None], 1e-12)
    fine = normalized(1.15)
    illumination = normalized(5.0)
    broad = normalized(18.0)
    hrgb, hspan = _axis_interpolate(illumination, known, 1)
    vrgb, vspan = _axis_interpolate(illumination, known, 0)
    wh = 1 / np.maximum(hspan, 1) ** 2
    wv = .4 / np.maximum(vspan, 1) ** 2
    proposed = .95 * ((hrgb * wh[..., None] + vrgb * wv[..., None]) /
                       np.maximum((wh + wv)[..., None], 1e-15)) + .05 * broad
    h, w = known.shape
    yy, xx = np.mgrid[:h, :w]
    residual = rgb64 - fine
    donor_valid = binary_erosion(known,iterations=4,border_value=0)
    # Fitted facade seams are structural information, not random plaster noise.
    for nominal in (161, 448):
        donor_valid[max(0, nominal - 12):min(h, nominal + 12)] = False
    nearest = distance_transform_edt(~donor_valid, return_distances=False, return_indices=True)
    donor_y, donor_x = nearest[0].copy(), nearest[1].copy()
    pending = holes.copy()
    for dx, dy in [(72,0),(-72,0),(144,0),(-144,0),(0,56),(0,-56),(216,0),(-216,0)]:
        tx = np.clip(xx + dx, 0, w-1); ty = np.clip(yy + dy, 0, h-1)
        valid = pending & donor_valid[ty,tx] & (xx+dx >= 0) & (xx+dx < w) & (yy+dy >= 0) & (yy+dy < h)
        donor_x[valid] = tx[valid]; donor_y[valid] = ty[valid]; pending[valid] = False
    lum = np.maximum(10, proposed @ np.array([.2126,.7152,.0722]))
    donor_lum = np.maximum(10, fine[donor_y,donor_x] @ np.array([.2126,.7152,.0722]))
    texture_gain = np.clip(np.sqrt(lum / donor_lum), .65, 1.5)
    transported = residual[donor_y,donor_x] * texture_gain[...,None]
    proposed += transported
    seams=[]
    source_lum=rgb64 @ np.array([.2126,.7152,.0722])
    for nominal in (161, 448):
        y0,y1=max(0,nominal-12),min(h,nominal+10)
        valid_columns = np.all(known[y0:y1], axis=0)
        columns=np.flatnonzero(valid_columns)
        if len(columns)<20: continue
        minima=np.argmin(source_lum[y0:y1,columns],axis=0)+y0
        good=np.ones(len(columns),dtype=bool)
        for _ in range(4):
            fit=np.polyfit(columns[good],minima[good],1)
            good=np.abs(minima-np.polyval(fit,columns))<1.25
        if good.sum()<15: continue
        slope, intercept=map(float,fit)
        affected=holes & (np.abs(yy-(slope*xx+intercept)) <= 6)
        ys,xs=np.nonzero(affected)
        for y,x in zip(ys,xs):
            # Sample along the fitted seam, preserving the observed row phase.
            candidates=columns
            ypos=y+slope*(candidates-x)
            valid=(ypos>=0)&(ypos<h-1)
            candidates=candidates[valid]; ypos=ypos[valid]
            if not len(candidates): continue
            left_idx=max(0,np.searchsorted(candidates,x)-1)
            right_idx=min(len(candidates)-1,np.searchsorted(candidates,x))
            lx,rx=candidates[left_idx],candidates[right_idx]
            ly,ry=ypos[left_idx],ypos[right_idx]
            t=0 if lx==rx else float(np.clip((x-lx)/(rx-lx),0,1))
            color=np.array([(1-t)*np.interp(ly,np.arange(h),rgb64[:,lx,c])+t*np.interp(ry,np.arange(h),rgb64[:,rx,c]) for c in range(3)])
            distance=abs(y-(slope*x+intercept))
            blend=1 if distance<=4 else (6-distance)/2
            proposed[y,x]=proposed[y,x]*(1-blend)+(color+.35*transported[y,x])*blend
        seams.append({"slope":slope,"intercept":intercept,"observedColumns":int(good.sum()),"continuedPixels":int(affected.sum())})
    return proposed, {"seams":seams,"textureDonors":"visible same-wall high-frequency residual; translated donors with valid-mask fallback", "foregroundDonors":0}


def boundary_bindings(rgb, labels, base, background):
    """Sparse calibrated color-mixture estimates around observed facade objects.

    An original RGB sample remains the anchor. Only changes to the foreground
    and wall material invoke the estimated mixture, so the unedited image is
    byte exact. This is an assisted local matte, not an automatic true alpha.
    """
    wall=INDEX["wall.main"]
    foreground=(labels!=wall)&(base==wall)
    inside=distance_transform_edt(foreground)
    band=foreground & (inside<=4.1)
    # Deeper observed points estimate the foreground endpoint. Host endpoint is
    # the separately inferred wall field. Confidence falls when endpoints agree.
    indices=[]; fractions=[]; colors=[]
    source=rgb.astype(np.float64)
        # Do not let that blur import original foreground values: smooth only the
    # inferred/observed host wall colors where the host actually is wall.
    wallfield=background.astype(np.float64).copy()
    for index in np.unique(labels[band]):
        region=labels==index
        deep=region & (distance_transform_edt(region)>=4.5)
        if not deep.any(): deep=binary_erosion(region,iterations=1)
        if not deep.any(): continue
        nearest=distance_transform_edt(~deep,return_distances=False,return_indices=True)
        F=source[nearest[0],nearest[1]]
        B=wallfield
        delta=B-F
        denom=(delta*delta).sum(axis=2)
        beta=((source-F)*delta).sum(axis=2)/np.maximum(denom,1)
        beta=np.clip(beta,0,1)
        background_distance=np.sqrt(((source-B)**2).mean(axis=2))
        # Colors within 5 RGB levels of local wall are conservatively wall-rich.
        color_likelihood=np.clip((24-background_distance)/20,0,1)
        beta=np.maximum(beta,color_likelihood)
        edge_distance=distance_transform_edt(region)
        spatial=np.clip((4.7-edge_distance)/2.5,0,1)
        beta*=spatial
        beta[denom<100]=np.maximum(beta[denom<100],color_likelihood[denom<100]*spatial[denom<100])
        mask=band & region & (beta>.025)
        ys,xs=np.nonzero(mask)
        for y,x in zip(ys,xs):
            indices.append(y*labels.shape[1]+x);fractions.append(int(round(beta[y,x]*255)));colors.append(background[y,x].tolist())
    order=np.argsort(indices)
    ids=np.asarray(indices,dtype='<u4')[order]
    beta=np.asarray(fractions,dtype=np.uint8)[order]
    colors=np.asarray(colors,dtype=np.uint8)[order]
    return {"schema":"crf.boundary_mixture.v1","hostIndex":wall,
            "indicesBase64":_b64(ids),"backgroundFractionBase64":_b64(beta),
            "backgroundRgbBase64":_b64(colors),"count":len(ids),
            "bandWidthPx":4.1,
            "method":"assisted local foreground/background color projection with spatial confidence; original RGB calibrated anchor",
            "truth":"estimated matte, not measured alpha; no change at default materials"}, (ids,beta,colors)

def infer_background(rgb, labels, base):
    """Directional visible-surface interpolation; no foreground donor colors.

    Observed surface pixels remain unchanged. Only a labelled occlusion mask is
    used by the frontend to instantiate extra inferred background Gaussians.
    """
    h, w = labels.shape
    foreground = labels != base
    # Extra points are permitted only under a *different* observed object.
    # Donor exclusion is wider, but never creates a duplicate same-host sample.
    inferred = foreground.copy()
    donor_exclusion = binary_dilation(foreground, iterations=5)
    out = rgb.astype(np.float64).copy()
    surfaces = []
    host_ids = ["wall.main", "wall.base", "sidewalk.main", "road.main"]
    host_ids += [entity_id for entity_id in INDEX if entity_id.startswith("window.")]
    for entity_id in host_ids:
        index = INDEX[entity_id]
        domain = base == index
        holes = domain & inferred
        if not holes.any():
            continue
        if entity_id.startswith("window."):
            known = binary_erosion(labels == index, iterations=1, border_value=0)
        else:
            known = domain & ~donor_exclusion & (labels == index)
        if not np.any(known):
            raise ValueError("No observed background donors for " + entity_id)
        if entity_id == "wall.main":
            illumination_known = domain & (labels == index) & ~binary_dilation(foreground,iterations=1)
            proposed, wall_report = _wall_context(rgb, illumination_known, holes)
            method = "same-wall illumination continuation + transported observed texture + fitted seam continuity"

        else:
            hrgb, hspan = _axis_interpolate(rgb, known, 1)
            vrgb, vspan = _axis_interpolate(rgb, known, 0)
            wh = 1 / np.maximum(hspan, 1) ** 2
            wv = 1 / np.maximum(vspan, 1) ** 2
            weights = wh + wv
            nearest_indices = distance_transform_edt(~known, return_distances=False, return_indices=True)
            proposed = rgb[nearest_indices[0], nearest_indices[1]].astype(np.float64)
            usable = weights > 0
            proposed[usable] = ((hrgb * wh[..., None] + vrgb * wv[..., None]) /
                                np.maximum(weights[..., None], 1e-20))[usable]
            method = ("same-window directional continuation; visible donor erosion1px" if entity_id.startswith("window.")
                      else "same-surface directional interpolation; donor exclusion5px")
            if entity_id.startswith("window.") and entity_id.endswith("c1"):
                # A previously occluded frame edge is a surface-structure
                # hypothesis: mirror the observed opposite jamb at the same row.
                ys,xs=np.nonzero(domain | (labels==index))
                center=(int(xs.min())+int(xs.max()))/2
                grid_y,grid_x=np.mgrid[:h,:w]
                mirror_x=np.clip(np.rint(2*center-grid_x).astype(int),0,w-1)
                usable=holes & (labels[grid_y,mirror_x]==index)
                proposed[usable]=rgb[grid_y[usable],mirror_x[usable]]
                method += "; hidden left jamb uses observed opposite-jamb symmetry hypothesis"

        # Smooth interpolated estimates only. Never feed the removed foreground
        # pixels (including those on an adjacent base surface) back into the
        # filter as donors. The proposal everywhere derives from `known` only.
        smooth = proposed if entity_id == "wall.main" else gaussian_filter(proposed, sigma=(0.65, 0.65, 0))
        out[holes] = smooth[holes]
        surfaces.append({"id": entity_id, "observed_donor_pixels": int(known.sum()),
                         "inferred_pixels": int(holes.sum()), "foreground_donors": 0,
                         "method": method, **({"context":wall_report} if entity_id == "wall.main" else {})})
    result = np.clip(np.rint(out), 0, 255).astype(np.uint8)
    result[~inferred] = rgb[~inferred]
    return result, inferred.astype(np.uint8), surfaces


def _b64(array):
    return base64.b64encode(np.ascontiguousarray(array).tobytes()).decode("ascii")


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _palette():
    return np.array([[124, 157, 170], [127, 102, 84], [80, 87, 98], [255, 214, 70],
                     [225, 165, 89], [241, 232, 177], [233, 74, 73], [233, 133, 67],
                     [206, 85, 210], [80, 210, 150], [87, 168, 255], [119, 94, 237],
                     [42, 183, 207], [76, 122, 207], [88, 207, 236], [140, 109, 209],
                     [202, 172, 225], [131, 188, 94]], dtype=np.uint8)


def scan_pixels(input_path, labels=None):
    """Generic RGB8 pixel/edge statistics, optionally grouped by supplied labels.

    `labels` is an integer HxW array with values 0..255. If omitted, a single
    group contains the entire image. This function does not invent semantics or
    depth and works with image dimensions other than the Street demonstration.
    Its result is JSON-serializable and contains statistics, not raster arrays.
    """
    path = Path(input_path)
    with Image.open(path) as im:
        rgb = np.array(ImageOps.exif_transpose(im).convert("RGB"))
    provided = labels is not None
    if labels is None:
        labels = np.zeros(rgb.shape[:2], dtype=np.uint8)
    labels = np.asarray(labels)
    if labels.shape != rgb.shape[:2] or not np.issubdtype(labels.dtype, np.integer):
        raise ValueError("labels must be an integer array matching image height and width")
    if int(labels.min()) < 0 or int(labels.max()) > 255:
        raise ValueError("labels must be in 0..255")
    lum = rgb.astype(np.float64) @ np.array([.2126, .7152, .0722])
    grad = np.hypot(sobel(lum, axis=0), sobel(lum, axis=1)) / 8.0
    edges = grad >= 12
    segments = []
    for index in np.unique(labels):
        mask = labels == index
        ys, xs = np.nonzero(mask)
        values = rgb[mask].astype(np.float64)
        stats = {"pixelCount": int(mask.sum()), "fraction": float(mask.mean()),
                 "meanRGB": np.round(values.mean(axis=0), 5).tolist(),
                 "stdRGB": np.round(values.std(axis=0), 5).tolist(),
                 "medianRGB": np.median(values, axis=0).tolist(),
                 "minRGB": values.min(axis=0).astype(int).tolist(),
                 "maxRGB": values.max(axis=0).astype(int).tolist(),
                 "meanLuminance": float(lum[mask].mean()),
                 "gradientMean": float(grad[mask].mean()),
                 "gradientP95": float(np.percentile(grad[mask], 95)),
                 "edgePixelCount": int((edges & mask).sum()),
                 "edgeFraction": float(edges[mask].mean())}
        segments.append({"index": int(index),
                         "bbox": [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)],
                         "pivot": [float(xs.mean()+.5), float(ys.mean()+.5)], "statistics": stats})
    return {"schema": "crf.pixel_scan.v0.5", "width": rgb.shape[1], "height": rgb.shape[0],
            "pixelCount": int(labels.size), "labelsProvided": provided,
            "fileSha256": _sha(path.read_bytes()), "rgbSha256": _sha(rgb.tobytes()),
            "edgePixelCount": int(edges.sum()), "segments": segments,
            "semantics": "Caller-supplied labels only; no automatic segmentation or depth inference"}


def scan(reference_path, annotation_path, project_root):
    reference_path, annotation_path, project_root = map(Path, (reference_path, annotation_path, project_root))
    for sub in ("scanner/masks", "scanner/previews", "web/assets", "reports", "docs"):
        (project_root / sub).mkdir(parents=True, exist_ok=True)
    with Image.open(reference_path) as im:
        rgb = np.asarray(ImageOps.exif_transpose(im).convert("RGB"), dtype=np.uint8).copy()
    if (rgb.shape[1], rgb.shape[0]) != SIZE:
        raise ValueError("This assisted scan is defined for the 667 x 1000 source image")
    annotation = json.loads(annotation_path.read_text())
    labels, base, annotation_records = build_labels(rgb, annotation)
    background, inferred, fill_surfaces = infer_background(rgb, labels, base)
    mixture, mixture_arrays = boundary_bindings(rgb, labels, base, background)
    lum = rgb.astype(np.float64) @ np.array([0.2126, 0.7152, 0.0722])
    grad = np.hypot(sobel(lum, axis=0), sobel(lum, axis=1)) / 8.0
    edge = grad >= 12.0
    generic_scan = scan_pixels(reference_path, labels)
    measured = {entry["index"]: entry for entry in generic_scan["segments"]}
    objects = []
    palette = _palette()
    pole_rows = np.flatnonzero(np.any(labels == INDEX["pole.main"], axis=1))
    pole_depth = max(200.0, (float(pole_rows.max()) + 0.5 - 764.0) * GROUND_SLOPE + 2.0)
    for entity_id, label_cn, kind, group, parent in DEFINITIONS:
        index = INDEX[entity_id]
        mask = labels == index
        ys, xs = np.nonzero(mask)
        if not len(xs):
            raise ValueError("Empty semantic object: " + entity_id)
        pivot = measured[index]["pivot"]
        if entity_id in ("road.main", "road.edge", "crosswalk.main", "sidewalk.main"):
            offset = 0.8 if entity_id in ("road.edge", "crosswalk.main") else 0.0
            depth = (pivot[1] - 764.0) * GROUND_SLOPE + offset
            slope = [0.0, GROUND_SLOPE]
            normal = [0.0, math.cos(math.radians(20)), math.sin(math.radians(20))]
        else:
            depth = {"pole.main": pole_depth, "pole.arm": pole_depth + 10.0,
                     "signal.support": pole_depth + 10.0, "signal.main": pole_depth + 20.0,
                     "signal.side": pole_depth + 16.0, "wall.fixtures": 12.0}.get(entity_id, 3.0 if kind == "window" else 0.0)
            slope, normal = [0.0, 0.0], [0.0, 0.0, 1.0]
        stats = measured[index]["statistics"]
        obj = {"id": entity_id, "index": index, "label": label_cn, "kind": kind,
               "group": group, "parent": parent,
               "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
               "pivot": pivot, "depth": float(depth), "depthSlope": slope, "normal": normal,
               "displayColor": palette[index].astype(int).tolist(), "statistics": stats,
               "provenance": {"segmentation": "assistant_assisted_source_segmentation",
                              "method": annotation_records[entity_id]["method"],
                              "rgb": "observed_reference_RGB8_samples",
                              "depth": "editable_single_view_hypothesis_not_measured_depth",
                              "referenceId": "reference.street.001"}}
        if entity_id == "signal.main":
            obj["signalPanels"] = {"upper": [282, 410, 316, 446], "lower": [282, 454, 316, 488]}
        objects.append(obj)
        Image.fromarray((mask.astype(np.uint8) * 255)).save(project_root / "scanner/masks" / (entity_id + ".png"))
    relations = [{"type": "attached_to", "parent": obj["parent"], "child": obj["id"],
                  "provenance": "assistant_assisted_attachment_hypothesis"}
                 for obj in objects if obj["parent"] is not None]
    relations.append({"type": "stands_on", "parent": "sidewalk.main", "child": "pole.main",
                      "provenance": "assistant_assisted_contact_hypothesis"})
    n = int(labels.size)
    payload = {
        "schema": SCHEMA, "width": SIZE[0], "height": SIZE[1],
        "referenceSha256": _sha(reference_path.read_bytes()),
        "rgbBase64": _b64(rgb), "labelsBase64": _b64(labels),
        "backgroundRgbBase64": _b64(background),
        "backgroundInferredMaskBase64": _b64(inferred),
        "backgroundLabelsBase64": _b64(base),
        "boundaryMixture": mixture,
        "objects": objects, "relations": relations,
        "source": {
            "id": "reference.street.001", "asset": "assets/reference.png",
            "fileSha256": _sha(reference_path.read_bytes()), "rgbSha256": _sha(rgb.tobytes()),
            "mode": "RGB8", "scanCoverage": "all original pixels exactly once in observed layer",
            "canonicalization": "Pillow ImageOps.exif_transpose; RGB8; row-major interleaved RGB",
            "segmentation": "assistant-assisted segmentation of source pixels; not model-rendered labels",
            "auxiliaryAnnotation": "CRF Street 0.3 observed regions and stripe boundary fits",
            "auxiliaryAnnotationSha256": _sha(annotation_path.read_bytes()),
            "notCompression": True, "learnedAutomaticSegmentation": False,
        },
        "metadata": {
            "coordinateSystem": {"x": "u+0.5-width/2", "y": "height/2-(v+0.5)",
                                 "z": "depth + depthSlope[0]*(u+0.5-pivot[0]) + depthSlope[1]*(v+0.5-pivot[1])",
                                 "unit": "reference_pixel_units", "positiveZ": "toward_reference_observer"},
            "boundsConvention": "bbox=[x0,y0,x1,y1], integer half-open image indices",
            "geometry": "layered surfel hypothesis; no unique 3D or hidden-surface recovery",
            "background": "Only inferredMask>0 produces extra background points, assigned to backgroundLabels host surface",
            "backgroundMethod": "wall: same-surface illumination, transported texture and fitted seam continuity; ground: directional interpolation; first hidden window: same-window continuation",
            "backgroundValidation": "unobserved regions have no ground truth; plausible infill only",
            "hiddenLayerLimit": "At most one inferred host surface per image pixel. Removing multiple overlapping layers can expose unmodeled deeper regions.",
            "illumination": "Observed RGB includes baked shadows; object motion does not recover or recompute real lighting",
            "objectBoundaryQuality": "hard selection ownership plus sparse estimated wall/foreground material-mixture bindings in a 4.1px edge band; default RGB anchor exact",
            "contactDepthRevision": "Pole cluster raised to >=200px and >=ground depth at its last visible sample +2; a declared contact/occlusion hypothesis",
        },
        "statistics": {
            "sourcePixelCount": n, "assignedPixelCount": int(sum(o["statistics"]["pixelCount"] for o in objects)),
            "unassignedPixelCount": 0, "objectCount": len(objects),
            "observedRgbByteCount": int(rgb.nbytes), "labelByteCount": int(labels.nbytes),
            "backgroundRgbByteCount": int(background.nbytes), "backgroundInferredPixelCount": int(inferred.sum()),
            "backgroundInferredFraction": float(inferred.mean()),
            "visibleBasePixelCount": int((inferred == 0).sum()),
            "backgroundInferredMaskByteCount": int(inferred.nbytes), "backgroundLabelByteCount": int(base.nbytes),
            "storedRasterParameterBytes": int(rgb.nbytes + labels.nbytes + background.nbytes + inferred.nbytes + base.nbytes + sum(a.nbytes for a in mixture_arrays)),
            "boundaryMixturePixelCount":mixture["count"],
            "rgbRoundTripExact": bool(np.array_equal(np.frombuffer(base64.b64decode(_b64(rgb)), dtype=np.uint8).reshape(rgb.shape), rgb)),
            "edgeDefinition": "luminance Sobel magnitude / 8 >= 12 in 0..255 units",
            "edgePixelCount": int(edge.sum()),
        },
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("</", "<\\/")
    js_path = project_root / "web/assets/scene-data.js"
    js_path.write_text("/* Explicit observed RGB/semantic arrays plus separately declared inferred infill. */\nglobalThis.CRF_SCENE_DATA = " + encoded + ";\n", encoding="utf-8")
    if reference_path.resolve() != (project_root / "web/assets/reference.png").resolve():
        shutil.copyfile(reference_path, project_root / "web/assets/reference.png")

    Image.fromarray(labels).save(project_root / "scanner/masks/labels.png")
    Image.fromarray((inferred * 255).astype(np.uint8)).save(project_root / "scanner/masks/background_inferred.png")
    Image.fromarray((edge * 255).astype(np.uint8)).save(project_root / "scanner/masks/source_edges.png")
    Image.fromarray(background).save(project_root / "scanner/previews/background_inferred.png")
    matte=np.zeros(labels.size,dtype=np.uint8);matte[mixture_arrays[0]]=mixture_arrays[1]
    Image.fromarray(matte.reshape(labels.shape)).save(project_root / "scanner/previews/background_mixture.png")
    colored = palette[labels]
    overlay = np.rint(rgb * 0.58 + colored * 0.42).astype(np.uint8)
    boundary = np.zeros(labels.shape, dtype=bool)
    boundary[1:] |= labels[1:] != labels[:-1]
    boundary[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    overlay[boundary] = [255, 255, 255]
    Image.fromarray(overlay).save(project_root / "scanner/previews/semantic_overlay.png")
    Image.fromarray(colored).save(project_root / "scanner/previews/semantic_labels.png")
    preview = Image.new("RGB", (SIZE[0] * 2, SIZE[1]), "white")
    preview.paste(Image.fromarray(rgb), (0, 0)); preview.paste(Image.fromarray(overlay), (SIZE[0], 0))
    preview.save(project_root / "scanner/previews/mask_preview.png")
    report = {
        "schema": "crf.pixel_scan_report.v0.5", "reference": payload["source"],
        "pixelScanInterface": "scanner.scene_scan.scan_pixels(input_path, labels=None); used for this scan",
        "statistics": payload["statistics"], "objects": objects, "relations": relations,
        "segmentationAnnotations": annotation_records,
        "backgroundInference": {"method": payload["metadata"]["backgroundMethod"],
                                "surfaces": fill_surfaces,
                                "visiblePixelsPreserved": bool(np.array_equal(background[inferred == 0], rgb[inferred == 0])),
                                "foregroundDonorCount": 0, "hiddenGroundTruthAvailable": False,
                                "castShadowRecomputation": False},
        "payload": {"path": "web/assets/scene-data.js", "bytes": js_path.stat().st_size,
                    "sha256": _sha(js_path.read_bytes()), "compressionClaim": False,
                    "denseObservationDataExplicitlyStored": True},
        "qaArtifacts": {"overlay": "scanner/previews/semantic_overlay.png",
                        "comparison": "scanner/previews/mask_preview.png",
                        "background": "scanner/previews/background_inferred.png",
                        "masks": "scanner/masks/"},
        "claims": {"all667000PixelsScanned": n == 667000, "automaticSegmentation": False,
                   "true3DRecovered": False, "unobservedBackgroundVerified": False,
                   "sourceImageUsedAsBlenderTexture": False, "BlenderUsed": False,
                   "observationRGBIsInputToFrontendReconstruction": True},
    }
    (project_root / "reports/scan_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return report
