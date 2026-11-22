#!/usr/bin/env python3
"""Fit one frozen quality13 scene and retain baseline, attempts and export replay."""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
from pathlib import Path
import sys
import time

import numpy as np
import scipy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fitting"))
import quality13 as quality
import quality12 as prior


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def export_and_measure(asset, path, preview, rgba, scene, source, role):
    asset["provenance"].update({"source": source, "qualityContractRole": role,
                               "fitterSHA256": sha(ROOT / "fitting/quality13.py"),
                               "priorFitterSHA256": sha(ROOT / "fitting/quality12.py"),
                               "legacyFitterSHA256": sha(ROOT / "fitting/crf08_gaussian.py")})
    # Even the old-method baseline is evaluated only by the new contract.
    asset["qualityContractHash"] = quality.FROZEN_CONTRACT_HASH
    asset["qualityContractId"] = quality.CONTRACT["id"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(prior.canonical_json(asset))
    del asset
    exported = json.loads(path.read_text())
    started = time.perf_counter()
    frame = prior.render_asset(exported)
    render_seconds = time.perf_counter() - started
    preview.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(frame).save(preview)
    # Measure the actual written PNG, not an unquantized training prediction.
    actual_png = np.asarray(Image.open(preview).convert("RGBA"))
    measured = quality.measure_quality(rgba, actual_png, scene)
    return {"schema": "crf.detail_quality_evidence.v1", "sceneId": scene["id"], "source": source,
            "qualityContractHash": quality.FROZEN_CONTRACT_HASH, "qualityContractId": quality.CONTRACT["id"],
            "qualityContractRole": role, **measured, "fit": exported["fit"],
            "provenance": exported["provenance"],
            "representation": prior.representation_statistics(exported, path.stat().st_size),
            "asset": {"path": str(path), "sha256": sha(path), "bytes": path.stat().st_size},
            "assetSHA256": sha(path),
            "tailMetrics": {k: measured["metrics"][k] for k in ("p99ChannelError", "fractionPixelsAnyChannelAbove32", "pixelsAnyChannelAbove32", "maxChannelError")},
            "artifacts": {"nativePNG": str(preview), "nativePNGSHA256": sha(preview)},
            "replayRGBASHA256": hashlib.sha256(actual_png.tobytes()).hexdigest(),
            "exportedJSONReplayed": True, "savedPNGMeasured": True, "runtimeSourceImageRead": False,
            "replaySeconds": round(render_seconds, 6),
            "environment": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
                            "platform": platform.platform(), "solver": "CPU", "gpuUsed": False},
            "scope": "Finite per-observation function reconstruction; not novel-scene generation, relighting, dynamics, or RSI."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", choices=tuple(quality.SCENES))
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--reserved-fraction", type=float, default=.25)
    parser.add_argument("--attempt", type=int, default=1)
    parser.add_argument("--skip-baseline", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.attempt <= quality.CONTRACT["budgets"]["maxFitAttemptsPerScene"]:
        raise ValueError("Attempt number exceeds frozen limit")
    scene = quality.SCENES[args.scene]
    source_path = ROOT / scene["referencePath"]
    rgba = np.asarray(Image.open(source_path).convert("RGBA"))
    source = quality.validate_reference(args.scene, source_path, rgba)
    work = args.work_dir / args.scene
    reports = ROOT / "reports/quality13/fitting" / args.scene
    packs = ROOT / "quality-packs"
    attempt_report = reports / ("attempt-%02d.quality.json" % args.attempt)
    if attempt_report.exists():
        raise FileExistsError("An existing attempt may not be overwritten")
    reports.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)

    def progress(role):
        return lambda row: print(json.dumps({"scene": args.scene, "role": role, **row}, allow_nan=False), flush=True)

    baseline_path = work / "baseline.asset.json"
    baseline_report_path = reports / "baseline.quality.json"
    if not args.skip_baseline:
        if baseline_report_path.exists():
            raise FileExistsError("Baseline already exists; use --skip-baseline")
        t = time.perf_counter()
        baseline_spec = prior.FitSpec(scene["basisBudget"], 50, 100, 40, .35, 6)
        baseline = prior.fit_observation(rgba, baseline_spec, args.scene + ".baseline", progress("baseline"))
        baseline_report = export_and_measure(baseline, baseline_path, reports / "baseline.png", rgba, scene, source, "same_total_budget_old_method_baseline")
        baseline_report["totalSeconds"] = round(time.perf_counter() - t, 6)
        write_json(baseline_report_path, baseline_report)
    else:
        baseline_report = json.loads(baseline_report_path.read_text())
        if baseline_report["asset"]["sha256"] != sha(baseline_path) or baseline_report["source"]["sha256"] != source["sha256"]:
            raise ValueError("Baseline source or asset evidence changed")

    t = time.perf_counter()
    spec = quality.FitSpec(scene["basisBudget"], args.reserved_fraction)
    candidate = quality.fit_observation(rgba, spec, args.scene + ".quality13", progress("candidate"))
    candidate_path = work / ("attempt-%02d.asset.json" % args.attempt)
    candidate_report = export_and_measure(candidate, candidate_path, reports / ("attempt-%02d.png" % args.attempt),
                                         rgba, scene, source, "late_residual_candidate")
    candidate_report["totalSeconds"] = round(time.perf_counter() - t, 6)
    candidate_report["attempt"] = args.attempt
    candidate_report["sameBudgetComparison"] = {"baselineMetrics": baseline_report["metrics"],
        "baselineFitSeconds": baseline_report["fit"]["seconds"], "candidateFitSeconds": candidate_report["fit"]["seconds"],
        "baselineBasisCount": baseline_report["representation"]["gaussians"],
        "candidateBasisCount": candidate_report["representation"]["gaussians"],
        "psnrImprovementDb": candidate_report["metrics"]["psnr"] - baseline_report["metrics"]["psnr"],
        "maeReductionFraction": 1 - candidate_report["metrics"]["mae"] / baseline_report["metrics"]["mae"],
        "computeComparison": "Different optimization steps and actual wall time; no equal-time speed claim."}
    write_json(attempt_report, candidate_report)
    # Promotion requires frozen gates AND nonregressing full-frame squared error.
    accepted = candidate_report["passed"] and candidate_report["metrics"]["rmse"] <= baseline_report["metrics"]["rmse"]
    selected_path = candidate_path if accepted else baseline_path
    selected_report = candidate_report if accepted else baseline_report
    final = dict(selected_report)
    final["selection"] = {"selected": "late_residual_candidate" if accepted else "old_method_baseline_fallback",
                          "candidateAttempt": args.attempt, "candidatePassedFrozenGates": candidate_report["passed"],
                          "candidateNonregressingMSE": candidate_report["metrics"]["rmse"] <= baseline_report["metrics"]["rmse"],
                          "rule": "candidate must pass frozen contract and not regress baseline full-frame MSE",
                          "baselineReport": str(baseline_report_path), "candidateReport": str(attempt_report)}
    final["sameBudgetComparison"] = candidate_report["sameBudgetComparison"]
    final_asset = packs / (args.scene + ".asset.json")
    packs.mkdir(parents=True, exist_ok=True)
    final_asset.write_bytes(selected_path.read_bytes())
    final_png = reports / "reconstruction.png"
    final_png.write_bytes(Path(selected_report["artifacts"]["nativePNG"]).read_bytes())
    # Stable scene-named alias for the independent JS/Python verification tools.
    (reports / (args.scene + ".png")).write_bytes(final_png.read_bytes())
    final["asset"] = {"path": "quality-packs/" + final_asset.name, "sha256": sha(final_asset), "bytes": final_asset.stat().st_size}
    final["artifacts"] = {"nativePNG": str(final_png.relative_to(ROOT)), "nativePNGSHA256": sha(final_png)}
    write_json(reports / (args.scene + ".quality.json"), final)
    write_json(packs / (args.scene + ".quality.json"), final)
    print(json.dumps({"complete": True, "scene": args.scene, "selected": final["selection"]["selected"],
                      "passed": final["passed"], "metrics": final["metrics"], "comparison": final["sameBudgetComparison"],
                      "asset": str(final_asset)}), flush=True)
    return 0 if final["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
