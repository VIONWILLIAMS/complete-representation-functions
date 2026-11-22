"""Bounded late-residual Gaussian refinement of finite photographic observations.

Only explicit continuous function parameters are exported. The source image is
an optimization target, never a runtime texture or hidden residual raster.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import io
import json
import math
from pathlib import Path
import time

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse.linalg import lsmr

import quality12 as prior
import crf08_gaussian as legacy

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts/quality13.json"
FROZEN_CONTRACT_HASH = "f262a18ad60ae4f77bed9608b28aecac2c1201d109a7709b82668a1d0a1b193b"
ALGORITHM = "post_geometry_residual_allocation_joint_adam_colour_polish_v1"


def load_contract(path=CONTRACT_PATH):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != FROZEN_CONTRACT_HASH:
        raise ValueError("Detail-quality contract differs from its frozen hash")
    return json.loads(raw)


CONTRACT = load_contract()
SCENES = {s["id"]: s for s in CONTRACT["scenes"]}


@dataclass(frozen=True)
class FitSpec:
    budget: int
    reserved_fraction: float = .25
    initial_geometry_steps: int = 100
    late_geometry_steps: int = 60
    iterations: int = 50
    polish_iterations: int = 40
    decimals: int = 6

    def validate(self):
        if not isinstance(self.budget, int) or not 32 <= self.budget <= CONTRACT["representation"]["maximumBasisCount"]:
            raise ValueError("Total basis budget must be in 32..262144")
        if not .1 <= self.reserved_fraction <= .5:
            raise ValueError("Reserved fraction must be in .1.. .5")
        if not 0 <= self.initial_geometry_steps <= 100 or not 0 <= self.late_geometry_steps <= 60:
            raise ValueError("Geometry step count exceeds frozen optimization budget")
        if not 1 <= self.iterations <= 50 or not 0 <= self.polish_iterations <= 40:
            raise ValueError("Sparse solver iteration count exceeds bounded profile")
        if not 4 <= self.decimals <= 9:
            raise ValueError("Export decimal precision must be in 4..9")


def validate_reference(scene_id, source_path, rgba):
    if scene_id not in SCENES:
        raise ValueError("Unknown frozen scene")
    scene = SCENES[scene_id]
    rgb = prior._opaque_rgb(rgba)
    source_bytes = Path(source_path).read_bytes()
    digest = hashlib.sha256(source_bytes).hexdigest()
    if digest != scene["fileSHA256"] or (rgb.shape[1], rgb.shape[0]) != (scene["width"], scene["height"]):
        raise ValueError("Reference bytes or dimensions do not match frozen scene")
    # Decode exactly the bytes that acquired the frozen file hash. A caller may
    # not bind a same-sized replacement array to the approved source filename.
    with Image.open(io.BytesIO(source_bytes)) as image:
        decoded = np.asarray(image.convert("RGBA"))
    if decoded.shape[:2] != rgba.shape[:2] or not np.array_equal(rgb, decoded[..., :3]):
        raise ValueError("Supplied observation pixels differ from the frozen source decode")
    if np.any(decoded[..., 3] != 255):
        raise ValueError("Frozen source must decode to an opaque observation")
    return {"path": scene["referencePath"], "sha256": digest,
            "width": scene["width"], "height": scene["height"],
            "decodedRGBASHA256": hashlib.sha256(np.ascontiguousarray(decoded).tobytes()).hexdigest(),
            "resized": False, "cropped": False, "referenceScope": scene["referenceScope"]}


def render_float(params, base, width, height):
    """Exact reference formula, without target or raster inputs."""
    out = np.tile(np.asarray(base, np.float64), (width * height, 1))
    for p in params:
        indices, weights = legacy.support(p, width, height)
        out[indices] += weights[:, None] * p[5:8]
    return out.reshape(height, width, 3)


def polish(params, rgb, base, iterations):
    matrix = legacy.dictionary(params[:, :5], rgb.shape[1], rgb.shape[0])
    target = rgb.reshape(-1, 3).astype(np.float64) - base
    coefficients = params[:, 5:].copy()
    previous = matrix @ coefficients
    old_loss = float(np.mean((target - previous) ** 2))
    for channel in range(3):
        residual = target[:, channel] - previous[:, channel]
        coefficients[:, channel] += lsmr(matrix, residual, damp=.015, atol=1e-6, btol=1e-6, maxiter=iterations)[0]
    coefficients = np.clip(coefficients, -4000, 4000)
    after = matrix @ coefficients
    new_loss = float(np.mean((target - after) ** 2))
    if new_loss < old_loss:
        params = params.copy()
        params[:, 5:] = coefficients
    return params, {"iterations": iterations, "accepted": new_loss < old_loss,
                    "beforeFloatMSE": old_loss, "afterFloatMSE": min(old_loss, new_loss)}


def fit_observation(rgba, spec, asset_id="observation", progress=None):
    spec.validate()
    rgb = prior._opaque_rgb(rgba)
    height, width = rgb.shape[:2]
    if spec.budget > width * height:
        raise ValueError("Basis budget exceeds source pixel count")
    started = time.perf_counter()
    reserved = max(1, round(spec.budget * spec.reserved_fraction))
    initial_budget = spec.budget - reserved
    history = []

    def record(phase, image=None, **extra):
        row = {"phase": phase, "elapsedSeconds": round(time.perf_counter() - started, 6), **extra}
        if image is not None:
            row.update(legacy.metrics(rgb, image))
        history.append(row)
        if progress:
            progress(row)

    initial_spec = prior.FitSpec(initial_budget, spec.iterations, spec.initial_geometry_steps,
                                 spec.polish_iterations, .35, spec.decimals)
    initial = prior.fit_observation(rgba, initial_spec, asset_id,
        lambda row: record("initial/" + row["phase"], **{k: v for k, v in row.items() if k not in ("phase", "elapsedSeconds")}))
    gaussian = initial["gaussian"]
    params = np.asarray(gaussian["splats"], np.float64)
    base = np.asarray(gaussian["base"], np.float64)
    initial_pred = render_float(params, base, width, height)
    record("initial_geometry_complete", initial_pred, count=len(params), reserved=reserved)

    # Allocate only after all initial geometry and colour optimization has run.
    residual = rgb.astype(np.float64) - initial_pred
    remaining = spec.budget - len(params)
    spacing = math.sqrt(width * height / len(params))
    extra = legacy.adaptive_gaussians(residual, np.full((height, width), 255, np.uint8), remaining, spacing)
    if not len(extra):
        record("late_allocation_no_remaining_error", initial_pred, count=len(params))
        late_report = {"steps": 0, "reason": "no_remaining_error", "available": False}
        solve_report = {"iterations": 0, "accepted": False}
        polish_report = {"iterations": 0, "accepted": False}
    else:
        # A zero-coefficient append preserves the first-stage field exactly.
        params = np.vstack((params, np.column_stack((extra, np.zeros((len(extra), 3))))))
        params[:, 2:4] = np.maximum(prior.MIN_SIGMA, params[:, 2:4])
        record("late_residual_allocation", count=len(params), allocated=len(extra), reserved=reserved,
               source="post_geometry_float_residual", residualExported=False)
        params, solve_report = polish(params, rgb, base, spec.iterations)
        record("late_colour_initialization", render_float(params, base, width, height), count=len(params), **solve_report)
        if spec.late_geometry_steps:
            params, late_report = prior.refine_geometry(params, rgb, base, spec.late_geometry_steps,
                lambda step, pred, loss: record("late_joint_geometry_colour_" + str(step), pred, count=len(params), floatMSE=loss))
        else:
            late_report = {"steps": 0, "reason": "not_requested", "available": False}
        params, polish_report = polish(params, rgb, base, spec.polish_iterations)
        record("final_colour_polish", render_float(params, base, width, height), count=len(params), **polish_report)
    if len(params) > spec.budget:
        raise RuntimeError("Internal basis allocation exceeded frozen budget")
    gaussian = {"schema": legacy.SCHEMA, "id": asset_id, "width": width, "height": height,
                "base": np.round(base, spec.decimals).tolist(), "splats": np.round(params, spec.decimals).tolist(),
                "kernel": {"type": "signed_additive_gaussian", "cutoffSigma": 4,
                           "sample": "pixel_centres", "colorSpace": "srgb_encoded_0_255"}}
    result = {"schema": prior.SCHEMA, "version": prior.VERSION, "gaussian": gaussian,
              "qualityContractHash": FROZEN_CONTRACT_HASH, "qualityContractId": CONTRACT["id"],
              "provenance": {"kind": "observation_conditioned_gaussian_reconstruction",
                  "sourceRGBEmbedded": False, "losslessResidualEmbedded": False, "perPixelRGBTable": False,
                  "neuralModelTraining": False, "referenceConditioned": True,
                  "optimizationScope": "this_observation_only", "generalSceneGeneration": False,
                  "physicalRelighting": False, "geometry": "two_dimensional_image_plane",
                  "illumination": "inherited_from_observation", "programRSI": False,
                  "humanEngineeredFitterUpgrade": True, "gpuUsed": False},
              "fit": {"algorithm": ALGORITHM, "spec": asdict(spec), "history": history,
                      "initialFit": initial["fit"], "lateGeometry": late_report,
                      "lateColourInitialization": solve_report, "colourPolish": polish_report,
                      "requestedBudget": spec.budget, "actualBasisCount": len(params),
                      "reservedBasisCount": reserved, "minimumSigmaConstraint": prior.MIN_SIGMA,
                      "seconds": round(time.perf_counter() - started, 6),
                      "bestCheckpointRule": "lowest_full_frame_float_MSE_within_each_stage"}}
    prior.validate_asset(result)
    return result


def measure_quality(reference, prediction, scene):
    """Image-level measurement independently recomputed from final RGB8 replay.

    Uses the metric definition inherited from the frozen quality12 contract but
    none of that module's evaluator/threshold results. ROI SSIM selects the
    full-frame map. This is finite reference fidelity, not a realism proof.
    """
    a = prior._opaque_rgb(reference).astype(np.float64)
    b = prior._opaque_rgb(prediction).astype(np.float64)
    if a.shape != b.shape:
        raise ValueError("Quality comparison dimensions differ")
    if (a.shape[1], a.shape[0]) != (scene["width"], scene["height"]):
        raise ValueError("Evaluation dimensions differ from frozen scene")
    d = np.abs(a - b)
    f = lambda x: ndimage.gaussian_filter(x, (1.5, 1.5, 0), truncate=3.5, mode="reflect")
    ma, mb = f(a), f(b)
    va, vb = np.maximum(0, f(a * a) - ma * ma), np.maximum(0, f(b * b) - mb * mb)
    cov = f(a * b) - ma * mb
    smap = ((2 * ma * mb + 6.5025) * (2 * cov + 58.5225)) / ((ma * ma + mb * mb + 6.5025) * (va + vb + 58.5225))

    def region(bounds):
        x0, y0, x1, y1 = bounds
        error = d[y0:y1, x0:x1]
        mse = float(np.mean(error * error))
        return {"mae": float(np.mean(error)), "rmse": math.sqrt(mse),
                "psnr": 10 * math.log10(255 ** 2 / mse) if mse else None,
                "identicalRGB": mse == 0, "ssim": float(smap[y0:y1, x0:x1].mean()),
                "p99ChannelError": float(np.percentile(error, 99)),
                "fractionPixelsAnyChannelAbove32": float((error.max(2) > 32).mean()),
                "pixelsAnyChannelAbove32": int((error.max(2) > 32).sum()),
                "maxChannelError": int(error.max()), "evaluatedPixels": int(error.shape[0] * error.shape[1])}

    height, width = a.shape[:2]
    metrics = region((0, 0, width, height))
    gate = CONTRACT["globalGate"]
    global_checks = {"psnr": metrics["identicalRGB"] or metrics["psnr"] >= gate["psnrMin"],
                     "ssim": metrics["ssim"] >= gate["ssimMin"], "mae": metrics["mae"] <= gate["maeMax"],
                     "p99ChannelError": metrics["p99ChannelError"] <= gate["p99ChannelErrorMax"],
                     "fractionPixelsAnyChannelAbove32": metrics["fractionPixelsAnyChannelAbove32"] <= gate["fractionPixelsAnyChannelAbove32Max"]}
    rois = []
    for roi in scene["rois"]:
        normalized = roi["bounds"]
        bounds = (max(0, math.floor(normalized[0] * width)), max(0, math.floor(normalized[1] * height)),
                  min(width, math.ceil(normalized[2] * width)), min(height, math.ceil(normalized[3] * height)))
        m = region(bounds)
        passed = m["ssim"] >= CONTRACT["roiGate"]["ssimMin"] and m["mae"] <= CONTRACT["roiGate"]["maeMax"]
        rois.append({"id": roi["id"], "normalizedBounds": normalized, "pixelBounds": list(bounds), "metrics": m, "passed": passed})
    return {"passed": all(global_checks.values()) and all(r["passed"] for r in rois),
            "metrics": metrics, "rois": rois, "gates": {"global": global_checks, "roisPassed": all(r["passed"] for r in rois)},
            "measurement": {"input": "serialized_asset_replay_RGB8", "ssim": "full_frame_gaussian_sigma1.5_truncate3.5_reflect_population_per_RGB_mean",
                            "roiPolicy": "crop_full_frame_SSIM_map", "rounding": "clamp_floor_value_plus_half",
                            "referenceFidelityOnly": True}}
