"""Full-resolution, observation-conditioned 2D Gaussian reconstruction.

This is numerical fitting of one supplied observation, not a generative prior.
Only continuous Gaussian geometry and signed colour coefficients are exported.
The renderer accepts exported parameters only; it cannot read the observation.
The frozen photo-quality contract is evaluated independently after JSON export.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.sparse.linalg import lsmr

import crf08_gaussian as legacy

SCHEMA = "crf.quality_asset.v1"
VERSION = "1.1.0-experimental.2"
CONTRACT_PATH = Path(__file__).resolve().parents[1] / "contracts/quality12.json"
FROZEN_CONTRACT_HASH = "3cdd4ed7c25d91bd8eb78c435816154b79038008e397db94b5ae5fc589734ab8"


def load_contract(path=CONTRACT_PATH):
    data = Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != FROZEN_CONTRACT_HASH:
        raise ValueError("Quality contract differs from the frozen contract; candidate evaluation refused")
    return json.loads(data)


CONTRACT = load_contract()
MIN_SIGMA = CONTRACT["representation"]["minSigmaSourcePixels"]
MAX_GAUSSIANS = CONTRACT["representation"]["maxBasisCount"]
ALPINE_ROIS = tuple((r["id"], r["label"], tuple(r["bounds"])) for r in CONTRACT["rois"])
ROI_THRESHOLDS = {r["id"]: r for r in CONTRACT["rois"]}
METRIC_SPEC = {
    "colorSpace": "decoded_srgb_encoded_8bit",
    "rounding": "floor(x+0.5), clamp 0..255",
    "ssim": {
        "window": "gaussian", "sigma": 1.5, "truncate": 3.5,
        "boundary": "reflect", "covariance": "population",
        "C1": 6.5025, "C2": 58.5225,
        "channels": "RGB independently, arithmetic mean",
        "roi": "select from the full-frame SSIM map, no recropping/filtering",
    },
    "roiBounds": "floor(min*dimension), ceil(max*dimension), half-open",
}


@dataclass(frozen=True)
class FitSpec:
    budget: int = 65536
    iterations: int = 50
    geometry_steps: int = 100
    polish_iterations: int = 30
    initial_fraction: float = 0.35
    decimals: int = 6

    def validate(self):
        if not isinstance(self.budget, int) or not 16 <= self.budget <= MAX_GAUSSIANS:
            raise ValueError("Gaussian budget must be an integer in 16..262144")
        if not 1 <= self.iterations <= 200 or not 0 <= self.geometry_steps <= 500:
            raise ValueError("Invalid bounded fitting iteration count")
        if not 0 <= self.polish_iterations <= 200:
            raise ValueError("Invalid bounded colour-polish iteration count")
        if not 0.05 <= self.initial_fraction <= 1 or not 4 <= self.decimals <= 9:
            raise ValueError("Invalid initial fraction or export precision")


def _opaque_rgb(rgba):
    a = np.asarray(rgba)
    if a.dtype != np.uint8 or a.ndim != 3 or a.shape[2] not in (3, 4):
        raise ValueError("Expected a uint8 RGB or RGBA observation")
    if min(a.shape[:2]) < 4 or max(a.shape[:2]) > 4096:
        raise ValueError("Observation dimensions must be in 4..4096")
    if a.shape[2] == 4 and np.any(a[..., 3] != 255):
        raise ValueError("This photo profile requires an opaque observation")
    return a[..., :3]


def _native_evaluator():
    # The established derivative formula is reused without editing legacy code.
    # Compile options are included in the build identity; no fast-math is used.
    source = legacy._NATIVE_SOURCE
    options = ["-O3", "-shared", "-fPIC"]
    digest = hashlib.sha256((source + repr(options)).encode()).hexdigest()
    directory = Path(tempfile.gettempdir()) / "crf-quality12-native"
    directory.mkdir(exist_ok=True)
    binary = directory / (digest + ".so")
    if not binary.exists():
        compiler = shutil.which("g++") or shutil.which("clang++")
        if not compiler:
            raise RuntimeError("Geometry optimization requires g++ or clang++")
        src = directory / (digest + f"-{os.getpid()}.cpp")
        pending = directory / (digest + f"-{os.getpid()}.so")
        src.write_text(source)
        result = subprocess.run([compiler, *options, "-fopenmp", str(src), "-o", str(pending)], capture_output=True)
        if result.returncode:
            result = subprocess.run([compiler, *options, str(src), "-o", str(pending)], capture_output=True)
        src.unlink(missing_ok=True)
        if result.returncode:
            raise RuntimeError("Native Gaussian derivative compilation failed")
        pending.replace(binary)
    library = ctypes.CDLL(str(binary))
    function = library.evaluate
    ptr = np.ctypeslib.ndpointer(dtype=np.float64, flags="C_CONTIGUOUS")
    function.argtypes = [ptr, ctypes.c_int, ctypes.c_int, ctypes.c_int, ptr, ptr, ptr, ptr, ptr]
    function.restype = ctypes.c_double
    return function, digest


def refine_geometry(params, rgb, base, steps, progress=None):
    """Joint centre/covariance/colour Adam with a fixed 0.35 pixel sigma floor."""
    function, build = _native_evaluator()
    p = np.ascontiguousarray(params, np.float64).copy()
    p[:, 2:4] = np.maximum(MIN_SIGMA, p[:, 2:4])
    target = np.ascontiguousarray(rgb, np.float64)
    height, width = target.shape[:2]
    alpha = np.ones((height, width), np.float64)
    base = np.ascontiguousarray(base, np.float64)
    pred, grad = np.empty_like(target), np.zeros_like(p)
    first, second = np.zeros_like(p), np.zeros_like(p)
    best, best_loss = p.copy(), math.inf
    history = []
    rates = np.array([.06, .06, .018, .018, .025, .7, .7, .7])
    for step in range(steps + 1):
        loss = function(p, len(p), width, height, target, alpha, base, pred, grad)
        if not math.isfinite(loss) or not np.all(np.isfinite(p)):
            raise FloatingPointError("Non-finite Gaussian optimization state")
        if loss < best_loss:
            best_loss, best = float(loss), p.copy()
        if step % 10 == 0 or step == steps:
            history.append({"step": step, "floatMSE": loss, "bestFloatMSE": best_loss})
            if progress:
                progress(step, pred, loss)
        if step == steps:
            break
        first = .9 * first + .1 * grad
        second = .999 * second + .001 * grad * grad
        change = rates * (first / (1 - .9 ** (step + 1))) / (np.sqrt(second / (1 - .999 ** (step + 1))) + 1e-8)
        change *= max(.1, 1 - step / max(1, steps))
        p[:, :2] -= change[:, :2]
        p[:, 2:4] *= np.exp(-change[:, 2:4])
        p[:, 4:] -= change[:, 4:]
        p[:, 0] = np.clip(p[:, 0], -.5, width + .5)
        p[:, 1] = np.clip(p[:, 1], -.5, height + .5)
        p[:, 2:4] = np.clip(p[:, 2:4], MIN_SIGMA, max(width, height))
        p[:, 5:] = np.clip(p[:, 5:], -4000, 4000)
    return best, {
        "available": True, "steps": steps, "bestFloatMSE": best_loss,
        "minimumSigmaConstraint": MIN_SIGMA, "nativeBuildSHA256": build,
        "history": history,
        "parameters": "cx,cy,log_sigma_x,log_sigma_y,theta,R,G,B",
    }


def validate_asset(asset):
    gaussian = asset.get("gaussian", asset)
    if gaussian.get("schema") != legacy.SCHEMA:
        raise ValueError("Expected the explicit v0.8 Gaussian parameter format")
    width, height = gaussian.get("width"), gaussian.get("height")
    if not all(isinstance(n, int) and 4 <= n <= 4096 for n in (width, height)):
        raise ValueError("Invalid asset dimensions")
    base, p = np.asarray(gaussian.get("base"), np.float64), np.asarray(gaussian.get("splats"), np.float64)
    if base.shape != (3,) or p.ndim != 2 or p.shape[1] != 8 or not 1 <= len(p) <= MAX_GAUSSIANS:
        raise ValueError("Invalid Gaussian parameter shape or count")
    if not np.all(np.isfinite(base)) or not np.all(np.isfinite(p)):
        raise ValueError("Non-finite Gaussian parameters")
    if np.any(p[:, 2:4] < MIN_SIGMA) or np.any(p[:, 2:4] > max(width, height)):
        raise ValueError("Gaussian sigma violates the frozen quality profile")
    if np.any(np.abs(p[:, 5:]) > 4000):
        raise ValueError("Gaussian coefficient exceeds the bounded profile")
    if np.any(p[:, 0] < -.5) or np.any(p[:, 0] > width + .5) or np.any(p[:, 1] < -.5) or np.any(p[:, 1] > height + .5):
        raise ValueError("Gaussian centre outside the bounded profile")
    expected_kernel = {"type": "signed_additive_gaussian", "cutoffSigma": 4, "sample": "pixel_centres", "colorSpace": "srgb_encoded_0_255"}
    if gaussian.get("kernel") != expected_kernel or "alpha" in gaussian:
        raise ValueError("Unsupported kernel or opaque-photo coverage semantics")
    return gaussian


def render_asset(asset):
    """Float64 reference evaluation from parameters; no observation argument."""
    gaussian = validate_asset(asset)
    width, height = gaussian["width"], gaussian["height"]
    pred = np.tile(np.asarray(gaussian["base"], np.float64), (width * height, 1))
    for p in gaussian["splats"]:
        indices, weights = legacy.support(p, width, height)
        pred[indices] += weights[:, None] * np.asarray(p[5:8], np.float64)
    rgb = np.clip(np.floor(pred.reshape(height, width, 3) + .5), 0, 255).astype(np.uint8)
    return np.dstack((rgb, np.full((height, width), 255, np.uint8)))


def fit_observation(rgba, spec=FitSpec(), asset_id="observation", progress=None):
    spec.validate()
    rgb = _opaque_rgb(rgba)
    h, w = rgb.shape[:2]
    if spec.budget > w * h:
        raise ValueError("Requested budget exceeds the observation pixel count")
    started = time.perf_counter()
    history = []
    def record(phase, image, **extra):
        row = {"phase": phase, "elapsedSeconds": round(time.perf_counter() - started, 6), **legacy.metrics(rgb, image), **extra}
        history.append(row)
        if progress:
            progress(row)
    def initial_progress(row):
        row = dict(row)
        row["elapsedSeconds"] = round(time.perf_counter() - started, 6)
        history.append(row)
        if progress:
            progress(row)
    initial = legacy.fit_image(np.dstack((rgb, np.full((h, w), 255, np.uint8))), budget=spec.budget,
                               iterations=spec.iterations, asset_id=asset_id, progress=initial_progress,
                               geometry_steps=0, initial_fraction=spec.initial_fraction)
    params = np.asarray(initial["splats"], np.float64)
    base = np.asarray(initial["base"], np.float64)
    geometry_report = {"available": False, "steps": 0, "reason": "not_requested"}
    if spec.geometry_steps:
        params, geometry_report = refine_geometry(params, rgb, base, spec.geometry_steps,
            lambda step, pred, loss: record("joint_geometry_colour_" + str(step), pred, count=len(params), floatMSE=loss))
    polish_report = {"iterations": spec.polish_iterations, "accepted": False}
    if spec.polish_iterations:
        matrix = legacy.dictionary(params[:, :5], w, h)
        target = rgb.reshape(-1, 3).astype(np.float64) - base
        coefficients = params[:, 5:].copy()
        previous = matrix @ coefficients
        old_loss = float(np.mean((target - previous) ** 2))
        for channel in range(3):
            residual = target[:, channel] - previous[:, channel]
            coefficients[:, channel] += lsmr(matrix, residual, damp=.015, atol=1e-6, btol=1e-6, maxiter=spec.polish_iterations)[0]
        coefficients = np.clip(coefficients, -4000, 4000)
        after = matrix @ coefficients
        new_loss = float(np.mean((target - after) ** 2))
        accepted = new_loss < old_loss
        if accepted:
            params[:, 5:] = coefficients
        polish_report.update({"accepted": accepted, "beforeFloatMSE": old_loss, "afterFloatMSE": new_loss})
        record("global_colour_polish", (after if accepted else previous).reshape(h, w, 3) + base, count=len(params))
    gaussian = {
        "schema": legacy.SCHEMA, "id": asset_id, "width": w, "height": h,
        "base": np.round(base, spec.decimals).tolist(),
        "splats": np.round(params, spec.decimals).tolist(),
        "kernel": {"type": "signed_additive_gaussian", "cutoffSigma": 4, "sample": "pixel_centres", "colorSpace": "srgb_encoded_0_255"},
    }
    provenance = {
        "kind": "observation_conditioned_gaussian_reconstruction",
        "sourceRGBEmbedded": False, "losslessResidualEmbedded": False,
        "perPixelRGBTable": False, "neuralModelTraining": False,
        "referenceConditioned": True, "optimizationScope": "this_observation_only",
        "generalSceneGeneration": False, "physicalRelighting": False,
        "geometry": "two_dimensional_image_plane", "illumination": "inherited_from_observation",
    }
    result = {"schema": SCHEMA, "version": VERSION, "gaussian": gaussian, "provenance": provenance,
              "qualityContractHash": FROZEN_CONTRACT_HASH, "qualityContractId": CONTRACT["id"],
              "fit": {"spec": asdict(spec), "seconds": round(time.perf_counter() - started, 6),
                      "history": history, "geometryOptimization": geometry_report, "colourPolish": polish_report,
                      "algorithm": "residual_adaptive_lsmr_joint_geometry_colour_adam_polish",
                      "bestCheckpointRule": "lowest_unquantized_full_frame_MSE_within_each_stage",
                      "minimumSigmaConstraint": MIN_SIGMA}}
    validate_asset(result)
    return result


def evaluate_quality(reference, prediction, rois=ALPINE_ROIS):
    """Frozen full-frame metrics and selections of one full-frame SSIM map."""
    a = _opaque_rgb(reference).astype(np.float64)
    raw_prediction = np.asarray(prediction)
    if raw_prediction.ndim != 3 or raw_prediction.shape[:2] != a.shape[:2] or raw_prediction.shape[2] not in (3, 4):
        raise ValueError("Reference and prediction dimensions must match exactly")
    if not np.all(np.isfinite(raw_prediction)):
        raise ValueError("Non-finite prediction")
    b = np.clip(np.floor(raw_prediction[..., :3].astype(np.float64) + .5), 0, 255)
    diff = a - b
    ssim = CONTRACT["metrics"]["ssim"]
    filtered = lambda x: ndimage.gaussian_filter(x, (ssim["sigma"], ssim["sigma"], 0), truncate=ssim["truncate"], mode=ssim["boundary"])
    ma, mb = filtered(a), filtered(b)
    va, vb = np.maximum(0, filtered(a * a) - ma * ma), np.maximum(0, filtered(b * b) - mb * mb)
    cov = filtered(a * b) - ma * mb
    c1, c2 = ssim["C1"], ssim["C2"]
    smap = ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2))
    h, w = a.shape[:2]
    def region(bounds):
        x0, y0, x1, y1 = bounds
        d, s = diff[y0:y1, x0:x1], smap[y0:y1, x0:x1]
        if not d.size:
            raise ValueError("Empty evaluation ROI is invalid")
        mse = float(np.mean(d * d))
        return {"mae": float(np.mean(np.abs(d))), "rmse": math.sqrt(mse),
                "psnr": 10 * math.log10(255 ** 2 / mse) if mse else None,
                "ssim": float(s.mean()), "maxError": int(np.max(np.abs(d))),
                "exactRGBFraction": float(np.mean(np.all(d == 0, axis=-1))),
                "evaluatedPixels": int(d.shape[0] * d.shape[1])}
    full = region((0, 0, w, h))
    entries = []
    seen = set()
    for roi_id, name, box in rois:
        if roi_id in seen or len(box) != 4 or not all(math.isfinite(v) for v in box):
            raise ValueError("Invalid or duplicate ROI")
        seen.add(roi_id)
        x0, y0, x1, y1 = box
        if not 0 <= x0 < x1 <= 1 or not 0 <= y0 < y1 <= 1:
            raise ValueError("Normalized ROI must be nonempty and in 0..1")
        if roi_id not in ROI_THRESHOLDS or tuple(box) != tuple(ROI_THRESHOLDS[roi_id]["bounds"]):
            raise ValueError("ROI differs from the frozen contract")
        bounds = [math.floor(x0 * w), math.floor(y0 * h), math.ceil(x1 * w), math.ceil(y1 * h)]
        values = region(bounds)
        gate = ROI_THRESHOLDS[roi_id]
        entries.append({"id": roi_id, "name": name, "normalizedBox": list(box), "pixelBounds": bounds,
                        "metrics": values, "passed": values["ssim"] >= gate["ssimMin"] and values["mae"] <= gate["maeMax"]})
    gate = CONTRACT["fullFrame"]
    full_passed = (full["psnr"] is None or full["psnr"] >= gate["psnrMin"]) and full["ssim"] >= gate["ssimMin"] and full["mae"] <= gate["maeMax"]
    roi_passed = all(item["passed"] for item in entries)
    return {"metrics": full, "rois": entries, "metricSpec": METRIC_SPEC,
            "qualityContractHash": FROZEN_CONTRACT_HASH, "qualityContractId": CONTRACT["id"],
            "gates": {"fullFrame": dict(gate),
                      "rois": [{"id": r["id"], "ssimMin": r["ssimMin"], "maeMax": r["maeMax"]} for r in CONTRACT["rois"]],
                      "fullFramePassed": full_passed, "roiPassed": roi_passed},
            "passed": full_passed and roi_passed}


def representation_statistics(asset, json_bytes):
    g = validate_asset(asset)
    params = np.asarray(g["splats"], np.float64)
    count = len(params)
    scalars = count * 8 + 3
    raw_bytes = g["width"] * g["height"] * 3
    return {"gaussians": count, "parameterCount": scalars, "geometryParameterCount": count * 5,
            "colourParameterCount": count * 3 + 3, "parameterFloat32Bytes": scalars * 4,
            "parameterFloat64Bytes": scalars * 8, "rawRGBBytes": raw_bytes,
            "float32ToRawRGBRatio": scalars * 4 / raw_bytes, "jsonBytes": json_bytes,
            "jsonToRawRGBRatio": json_bytes / raw_bytes, "gaussiansPerSourcePixel": count / (g["width"] * g["height"]),
            "minimumSigma": float(params[:, 2:4].min()), "medianSigma": float(np.median(params[:, 2:4])),
            "maximumSigma": float(params[:, 2:4].max()),
            "sigmasAtMinimum": int(np.count_nonzero(params[:, 2:4] <= MIN_SIGMA + 1e-6)),
            "encoding": "JSON decimal explicit continuous Gaussian parameters; not a compression claim"}


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf8")
