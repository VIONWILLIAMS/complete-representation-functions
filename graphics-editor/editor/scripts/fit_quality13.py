#!/usr/bin/env python3
"""Fit one frozen quality13 scene and retain baseline, attempts and export replay."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
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


def evidence_equal(actual, recorded):
    """Permit only insignificant numerical roundoff, never a different gate."""
    if isinstance(actual, dict):
        return isinstance(recorded, dict) and actual.keys() == recorded.keys() and all(evidence_equal(v, recorded[k]) for k, v in actual.items())
    if isinstance(actual, list):
        return isinstance(recorded, list) and len(actual) == len(recorded) and all(evidence_equal(a, b) for a, b in zip(actual, recorded))
    if isinstance(actual, float):
        return isinstance(recorded, (int, float)) and not isinstance(recorded, bool) and math.isfinite(recorded) and math.isclose(actual, recorded, rel_tol=1e-12, abs_tol=1e-10)
    return type(actual) is type(recorded) and actual == recorded


def verify_result(asset_path, report_path, scene, source_path, rgba, role):
    """Re-establish reference, asset, replay and measured-gate binding before use.

    A report's 'passed' flag or recorded score never independently authorizes a
    promotion. Old fitter source hashes remain valid provenance; the exact old
    source is archived, and the current validator recomputes the image evidence.
    """
    source = quality.validate_reference(scene["id"], source_path, rgba)
    raw = Path(asset_path).read_bytes()
    asset = json.loads(raw)
    report = json.loads(Path(report_path).read_text())
    digest = hashlib.sha256(raw).hexdigest()
    if report.get("sceneId") != scene["id"] or report.get("source") != source:
        raise ValueError("Saved result is not bound to the verified reference")
    if report.get("qualityContractHash") != quality.FROZEN_CONTRACT_HASH or asset.get("qualityContractHash") != quality.FROZEN_CONTRACT_HASH:
        raise ValueError("Saved result contract binding differs")
    if report.get("assetSHA256") != digest or report.get("asset", {}).get("sha256") != digest:
        raise ValueError("Saved result asset bytes differ from its report")
    if report.get("provenance") != asset.get("provenance") or asset.get("provenance", {}).get("source") != source:
        raise ValueError("Saved asset/reference provenance differs")
    gaussian = prior.validate_asset(asset)
    if (gaussian["width"], gaussian["height"]) != (scene["width"], scene["height"]) or len(gaussian["splats"]) > scene["basisBudget"]:
        raise ValueError("Saved result dimensions or basis budget differ from contract")
    if report.get("fit") != asset.get("fit") or not evidence_equal(prior.representation_statistics(asset, len(raw)), report.get("representation")):
        raise ValueError("Saved result capacity or fitting provenance differs")
    frame = prior.render_asset(asset)
    if hashlib.sha256(frame.tobytes()).hexdigest() != report.get("replayRGBASHA256"):
        raise ValueError("Saved result replay does not match its evidence")
    measured = quality.measure_quality(rgba, frame, scene)
    for field in ("metrics", "rois", "gates", "passed"):
        if not evidence_equal(measured[field], report.get(field)):
            raise ValueError("Saved result measured evidence differs: " + field)
    expected_tail = {k: measured["metrics"][k] for k in ("p99ChannelError", "fractionPixelsAnyChannelAbove32", "pixelsAnyChannelAbove32", "maxChannelError")}
    if not evidence_equal(expected_tail, report.get("tailMetrics")):
        raise ValueError("Saved result tail evidence differs")
    return {"assetPath": Path(asset_path), "reportPath": Path(report_path), "report": report,
            "frame": frame, "role": role, "verified": True}


def choose_best_result(results, incumbent=None):
    """Lowest verified passing RMSE; ties retain the already accepted pack."""
    if any(not r.get("verified") for r in results):
        raise ValueError("Selection requires reverified evidence")
    passing = [r for r in results if r["report"]["passed"] is True]
    if not passing:
        return None
    incumbent_hash = incumbent["report"]["assetSHA256"] if incumbent else None
    return min(passing, key=lambda r: (r["report"]["metrics"]["rmse"],
                                      r["report"]["assetSHA256"] != incumbent_hash))


def previous_results(packs, reports, work, scene, source_path, rgba):
    """Fail closed on corrupt/missing accepted evidence; retain all old attempts."""
    asset_path = packs / (scene["id"] + ".asset.json")
    report_path = reports / (scene["id"] + ".quality.json")
    pack_report = packs / (scene["id"] + ".quality.json")
    found = [p.exists() for p in (asset_path, report_path, pack_report)]
    incumbent = None
    results = []
    if any(found):
        if not all(found) or report_path.read_bytes() != pack_report.read_bytes():
            raise ValueError("Accepted pack/report copies are missing or inconsistent")
        incumbent = verify_result(asset_path, report_path, scene, source_path, rgba, "accepted_pack")
        results.append(incumbent)
    for report in sorted(reports.glob("attempt-??.quality.json")):
        attempt_id = report.name.split(".", 1)[0]
        number = int(attempt_id.split("-")[1])
        if not 1 <= number <= quality.CONTRACT["budgets"]["maxFitAttemptsPerScene"]:
            raise ValueError("Saved attempt number exceeds the frozen limit")
        candidate_path = work / (attempt_id + ".asset.json")
        if not candidate_path.exists():
            recorded = json.loads(report.read_text())
            if incumbent and recorded.get("assetSHA256") == incumbent["report"]["assetSHA256"]:
                candidate_path = asset_path
            else:
                raise ValueError("Cannot revalidate a previous attempt: " + attempt_id)
        results.append(verify_result(candidate_path, report, scene, source_path, rgba, attempt_id))
    return results, incumbent


def publish_selection(best, incumbent, packs, reports, scene_id, attempt, decision):
    """Record every decision; never rewrite accepted bytes for a rejected retry."""
    reports.mkdir(parents=True, exist_ok=True)
    if best is None:
        decision.update({"action": "no_passing_result", "selectedAssetSHA256": None})
        write_json(reports / ("attempt-%02d.selection.json" % attempt), decision)
        return None
    digest = best["report"]["assetSHA256"]
    if incumbent and digest == incumbent["report"]["assetSHA256"]:
        decision.update({"action": "retained_previous_best", "selectedAssetSHA256": digest})
        write_json(reports / ("attempt-%02d.selection.json" % attempt), decision)
        return incumbent["report"]
    decision.update({"action": "promoted_verified_best", "selectedAssetSHA256": digest})
    raw = best["assetPath"].read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("Selected asset changed after verification")
    final = dict(best["report"])
    final["selection"] = {"selected": "old_method_baseline_fallback" if best["role"] == "baseline" else "late_residual_candidate",
                          "selectedEvidenceRole": best["role"], "evaluatedThroughAttempt": attempt,
                          "rule": "lowest measured RMSE among all passing reverified results; retain incumbent on ties",
                          "decision": decision}
    packs.mkdir(parents=True, exist_ok=True)
    final_asset = packs / (scene_id + ".asset.json")
    final_asset.write_bytes(raw)
    final_png = reports / "reconstruction.png"
    Image.fromarray(best["frame"]).save(final_png)
    (reports / (scene_id + ".png")).write_bytes(final_png.read_bytes())
    final["asset"] = {"path": "quality-packs/" + final_asset.name, "sha256": digest, "bytes": len(raw)}
    final["artifacts"] = {"nativePNG": str(final_png), "nativePNGSHA256": sha(final_png)}
    write_json(reports / (scene_id + ".quality.json"), final)
    write_json(packs / (scene_id + ".quality.json"), final)
    write_json(reports / ("attempt-%02d.selection.json" % attempt), decision)
    return final


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
    # Before doing another fit, reject damaged prior evidence and establish the
    # currently accepted result. This reads/replays pixels; it never refits them.
    previous_results(packs, reports, work, scene, source_path, rgba)

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
        baseline_report = verify_result(baseline_path, baseline_report_path, scene, source_path, rgba, "baseline")["report"]

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
        "psnrImprovementDb": (candidate_report["metrics"]["psnr"] - baseline_report["metrics"]["psnr"])
            if candidate_report["metrics"]["psnr"] is not None and baseline_report["metrics"]["psnr"] is not None else None,
        "maeReductionFraction": 1 - candidate_report["metrics"]["mae"] / baseline_report["metrics"]["mae"] if baseline_report["metrics"]["mae"] else None,
        "computeComparison": "Different optimization steps and actual wall time; no equal-time speed claim."}
    write_json(attempt_report, candidate_report)
    results, incumbent = previous_results(packs, reports, work, scene, source_path, rgba)
    results.append(verify_result(baseline_path, baseline_report_path, scene, source_path, rgba, "baseline"))
    best = choose_best_result(results, incumbent)
    decision = {"attempt": args.attempt, "candidateReport": str(attempt_report),
                "candidatePassedFrozenGates": candidate_report["passed"],
                "candidateAssetSHA256": candidate_report["assetSHA256"],
                "previousAcceptedAssetSHA256": incumbent["report"]["assetSHA256"] if incumbent else None,
                "verifiedResults": [{"role": r["role"], "passed": r["report"]["passed"],
                                     "rmse": r["report"]["metrics"]["rmse"], "assetSHA256": r["report"]["assetSHA256"]} for r in results],
                "selectionRule": "minimum verified passing RMSE across all attempts and baseline; retain accepted pack on ties"}
    final = publish_selection(best, incumbent, packs, reports, args.scene, args.attempt, decision)
    print(json.dumps({"complete": True, "scene": args.scene, "decision": decision,
                      "passed": bool(final and final["passed"]), "metrics": final["metrics"] if final else None,
                      "asset": str(packs / (args.scene + ".asset.json")) if final else None}), flush=True)
    return 0 if final and final["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
