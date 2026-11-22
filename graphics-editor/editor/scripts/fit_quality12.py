#!/usr/bin/env python3
"""Fit a full-resolution photo, export functions, then measure exported replay."""
from __future__ import annotations
import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
import scipy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fitting"))
import quality12 as quality


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--report", type=Path)
    p.add_argument("--preview", type=Path)
    p.add_argument("--budget", type=int, default=65536)
    p.add_argument("--iterations", type=int, default=50)
    p.add_argument("--geometry-steps", type=int, default=100)
    p.add_argument("--polish-iterations", type=int, default=30)
    p.add_argument("--initial-fraction", type=float, default=.35)
    p.add_argument("--decimals", type=int, default=6)
    p.add_argument("--id", default=None)
    p.add_argument("--roi-profile", choices=("alpine", "none"), default="alpine")
    args = p.parse_args()
    started = time.perf_counter()
    rgba = np.asarray(Image.open(args.input).convert("RGBA"))
    h, w = rgba.shape[:2]
    source = {"path": args.input.as_posix(), "sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
              "width": w, "height": h, "decodedRGBASHA256": hashlib.sha256(rgba.tobytes()).hexdigest(),
              "resized": False, "cropped": False}
    expected = quality.CONTRACT["reference"]
    contract_role = "main_reference_acceptance" if args.roi_profile == "alpine" else "shared_metric_profile_only_different_reference"
    if args.roi_profile == "alpine" and (source["sha256"] != expected["fileSha256"] or (w, h) != (expected["width"], expected["height"])):
        raise ValueError("Observation does not match the frozen primary reference; use --roi-profile none for a supplementary fit")
    spec = quality.FitSpec(args.budget, args.iterations, args.geometry_steps, args.polish_iterations, args.initial_fraction, args.decimals)
    asset = quality.fit_observation(rgba, spec, args.id or args.input.stem,
                                    lambda row: print(json.dumps(row), flush=True))
    asset["provenance"]["source"] = source
    asset["provenance"]["qualityContractRole"] = contract_role
    asset["provenance"]["fitterSHA256"] = hashlib.sha256((ROOT / "fitting/quality12.py").read_bytes()).hexdigest()
    asset["provenance"]["legacyFitterSHA256"] = hashlib.sha256((ROOT / "fitting/crf08_gaussian.py").read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(quality.canonical_json(asset))
    # Deliberately drop the in-memory candidate and read the actual quantized file.
    del asset
    exported = json.loads(args.output.read_text())
    render_started = time.perf_counter()
    replay = quality.render_asset(exported)
    replay_seconds = time.perf_counter() - render_started
    scores = quality.evaluate_quality(rgba, replay, quality.ALPINE_ROIS if args.roi_profile == "alpine" else ())
    metrics_gate_passed = scores["passed"]
    if args.roi_profile == "none":
        # A different reference cannot pass the Alpine source/ROI contract.
        scores["supplementaryFullFrameGatePassed"] = metrics_gate_passed
        scores["primaryContractAcceptance"] = "not_applicable"
        scores["passed"] = None
        scores["gates"]["roiPassed"] = None
    preview = args.preview or args.output.with_suffix(".png")
    preview.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(replay).save(preview)
    report = {"schema": "crf.quality_evidence.v1", "version": quality.VERSION, "source": source,
              "provenance": exported["provenance"], **scores,
              "qualityContractRole": contract_role,
              "representation": quality.representation_statistics(exported, args.output.stat().st_size),
              "fit": exported["fit"], "exportedJSONReplayed": True,
              "runtimeSourceImageRead": False,
              "assetSHA256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
              "asset": {"path": args.output.as_posix(), "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()},
              "replayRGBASHA256": hashlib.sha256(replay.tobytes()).hexdigest(),
              "frameDescriptor": {"width": w, "height": h, "channels": "RGBA8", "colorSpace": "srgb", "alpha": "opaque", "sample": "pixel_centres"},
              "replaySeconds": round(replay_seconds, 6), "totalSeconds": round(time.perf_counter() - started, 6),
              "environment": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "platform": platform.platform()},
              "artifacts": {"asset": args.output.as_posix(), "preview": preview.as_posix()},
              "claimScope": "One observation-conditioned reconstruction. No held-out scene generation or realistic physical motion claim."}
    report_path = args.report or args.output.with_name(args.output.stem + ".quality.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    print(json.dumps({"complete": True, "asset": str(args.output), "report": str(report_path), "passed": report["passed"],
                      "metrics": report["metrics"], "rois": report["rois"], "representation": report["representation"]}), flush=True)
    return 0 if metrics_gate_passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
