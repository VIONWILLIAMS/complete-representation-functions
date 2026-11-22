"""Meaningful contract, evidence and late-refinement regression checks."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fitting"))
sys.path.insert(0, str(ROOT / "scripts"))
import quality13 as q
import quality12 as prior
import fit_quality13 as runner


class Quality13Tests(unittest.TestCase):
    def test_frozen_contract_rejects_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "contract.json"
            path.write_bytes(q.CONTRACT_PATH.read_bytes() + b" ")
            with self.assertRaises(ValueError):
                q.load_contract(path)

    def test_scene_source_binding(self):
        scene = q.SCENES["orchard"]
        path = ROOT / scene["referencePath"]
        rgba = np.asarray(Image.open(path).convert("RGBA"))
        source = q.validate_reference("orchard", path, rgba)
        self.assertEqual(source["sha256"], scene["fileSHA256"])
        with self.assertRaises(ValueError):
            q.validate_reference("street", path, rgba)
        with self.assertRaises(ValueError):
            q.validate_reference("orchard", path, rgba[::2, ::2])
        substituted = rgba.copy()
        substituted[0, 0, 0] ^= 1
        with self.assertRaisesRegex(ValueError, "pixels differ"):
            q.validate_reference("orchard", path, substituted)

    def test_tail_gate_cannot_hide_high_error_region(self):
        scene = {"width": 100, "height": 100, "rois": [{"id": "fixed", "bounds": [0, 0, 1, 1]}]}
        a = np.full((100, 100, 3), 120, np.uint8)
        b = a.copy()
        b[:10, :10, 0] = 160
        result = q.measure_quality(a, b, scene)
        self.assertAlmostEqual(result["metrics"]["mae"], 40 / 300)
        self.assertEqual(result["metrics"]["pixelsAnyChannelAbove32"], 100)
        self.assertFalse(result["gates"]["global"]["fractionPixelsAnyChannelAbove32"])
        self.assertFalse(result["passed"])

    def test_identity_metrics_and_dimension_rejection(self):
        a = np.full((12, 16, 3), 90, np.uint8)
        scene = {"width": 16, "height": 12, "rois": [{"id": "fixed", "bounds": [.1, .1, .8, .8]}]}
        result = q.measure_quality(a, a.copy(), scene)
        self.assertTrue(result["passed"])
        self.assertEqual(result["metrics"]["ssim"], 1)
        self.assertTrue(result["metrics"]["identicalRGB"])
        with self.assertRaises(ValueError):
            q.measure_quality(a, a[:6], scene)

    def test_budget_and_steps_are_bounded(self):
        for spec in (q.FitSpec(262145), q.FitSpec(64, reserved_fraction=0),
                     q.FitSpec(64, late_geometry_steps=61), q.FitSpec(64, polish_iterations=41)):
            with self.assertRaises(ValueError):
                spec.validate()

    def test_real_late_fit_serialized_source_free_replay(self):
        yy, xx = np.mgrid[:16, :20]
        rgb = np.dstack((80 + xx * 4, 110 + yy * 3, 95 + 25 * ((xx + yy) % 2))).astype(np.uint8)
        rgba = np.dstack((rgb, np.full((16, 20), 255, np.uint8)))
        spec = q.FitSpec(64, initial_geometry_steps=2, late_geometry_steps=2, iterations=3, polish_iterations=3)
        asset = q.fit_observation(rgba, spec, "unit-fixture")
        self.assertLessEqual(len(asset["gaussian"]["splats"]), 64)
        self.assertTrue(any(row["phase"] == "late_residual_allocation" for row in asset["fit"]["history"]))
        self.assertGreaterEqual(np.min(np.array(asset["gaussian"]["splats"])[:, 2:4]), .35)
        reloaded = json.loads(prior.canonical_json(asset))
        np.testing.assert_array_equal(prior.render_asset(asset), prior.render_asset(reloaded))
        self.assertFalse(asset["provenance"]["sourceRGBEmbedded"])
        self.assertFalse(asset["provenance"]["losslessResidualEmbedded"])
        self.assertEqual(asset["qualityContractHash"], q.FROZEN_CONTRACT_HASH)
        self.assertNotEqual(asset["qualityContractHash"], prior.FROZEN_CONTRACT_HASH)

    def fixture_scene(self, directory):
        source_path = directory / "source.png"
        rgba = np.full((16, 20, 4), 100, np.uint8)
        rgba[..., 3] = 255
        Image.fromarray(rgba).save(source_path)
        scene = {"id": "fixture", "referencePath": "source.png", "referenceScope": "synthetic unit fixture",
                 "width": 20, "height": 16, "basisBudget": 32,
                 "fileSHA256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
                 "rois": [{"id": "whole", "bounds": [0, 0, 1, 1]}]}
        return source_path, rgba, scene

    def fixture_result(self, directory, name, value, source_path, rgba, scene):
        source = q.validate_reference(scene["id"], source_path, rgba)
        asset = {"schema": prior.SCHEMA, "version": prior.VERSION,
                 "gaussian": {"schema": "crf.gaussian_asset.v0.8", "id": name, "width": 20, "height": 16,
                     "base": [value, value, value], "splats": [[10, 8, 2, 2, 0, 0, 0, 0]],
                     "kernel": {"type": "signed_additive_gaussian", "cutoffSigma": 4,
                                "sample": "pixel_centres", "colorSpace": "srgb_encoded_0_255"}},
                 "provenance": {"sourceRGBEmbedded": False, "losslessResidualEmbedded": False}, "fit": {"seconds": 0}}
        asset_path, report_path = directory / (name + ".asset.json"), directory / (name + ".quality.json")
        report = runner.export_and_measure(asset, asset_path, directory / (name + ".png"), rgba, scene, source, name)
        runner.write_json(report_path, report)
        return runner.verify_result(asset_path, report_path, scene, source_path, rgba, name)

    def test_saved_result_revalidates_report_and_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source_path, rgba, scene = self.fixture_scene(directory)
            with patch.dict(q.SCENES, {"fixture": scene}):
                result = self.fixture_result(directory, "accepted", 99, source_path, rgba, scene)
                report = dict(result["report"])
                report["assetSHA256"] = "0" * 64
                runner.write_json(result["reportPath"], report)
                with self.assertRaisesRegex(ValueError, "asset bytes"):
                    runner.verify_result(result["assetPath"], result["reportPath"], scene, source_path, rgba, "accepted")
                report = dict(result["report"])
                report["metrics"] = {**report["metrics"], "rmse": 0.0}
                runner.write_json(result["reportPath"], report)
                with self.assertRaisesRegex(ValueError, "measured evidence"):
                    runner.verify_result(result["assetPath"], result["reportPath"], scene, source_path, rgba, "accepted")
                runner.write_json(result["reportPath"], result["report"])
                replaced_pixels = rgba.copy()
                replaced_pixels[0, 0, 1] = 101
                with self.assertRaisesRegex(ValueError, "pixels differ"):
                    runner.verify_result(result["assetPath"], result["reportPath"], scene, source_path, replaced_pixels, "accepted")

    def test_weaker_passing_retry_preserves_accepted_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source_path, rgba, scene = self.fixture_scene(directory)
            with patch.dict(q.SCENES, {"fixture": scene}):
                original = self.fixture_result(directory, "attempt-01", 99, source_path, rgba, scene)
                weaker = self.fixture_result(directory, "attempt-02", 98, source_path, rgba, scene)
                packs, reports = directory / "packs", directory / "reports"
                first = runner.publish_selection(original, None, packs, reports, "fixture", 1, {"attempt": 1})
                accepted = runner.verify_result(packs / "fixture.asset.json", reports / "fixture.quality.json", scene, source_path, rgba, "accepted_pack")
                keep_paths = [packs / "fixture.asset.json", packs / "fixture.quality.json", reports / "fixture.quality.json",
                              reports / "fixture.png", reports / "reconstruction.png"]
                before = {p: p.read_bytes() for p in keep_paths}
                self.assertTrue(weaker["report"]["passed"])
                best = runner.choose_best_result([original, weaker, accepted], accepted)
                runner.publish_selection(best, accepted, packs, reports, "fixture", 2, {"attempt": 2})
                self.assertEqual(before, {p: p.read_bytes() for p in keep_paths})
                decision = json.loads((reports / "attempt-02.selection.json").read_text())
                self.assertEqual(decision["action"], "retained_previous_best")
                self.assertEqual(decision["selectedAssetSHA256"], first["assetSHA256"])

    def test_failed_retry_and_baseline_cannot_replace_previous_best(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source_path, rgba, scene = self.fixture_scene(directory)
            with patch.dict(q.SCENES, {"fixture": scene}):
                accepted = self.fixture_result(directory, "accepted_pack", 99, source_path, rgba, scene)
                baseline = self.fixture_result(directory, "baseline", 97, source_path, rgba, scene)
                failed = self.fixture_result(directory, "attempt-03", 96, source_path, rgba, scene)
                self.assertFalse(failed["report"]["passed"])
                best = runner.choose_best_result([baseline, failed, accepted], accepted)
                self.assertEqual(best["report"]["assetSHA256"], accepted["report"]["assetSHA256"])
                self.assertIsNone(runner.choose_best_result([failed]))
                unverified = {**accepted, "verified": False}
                with self.assertRaisesRegex(ValueError, "reverified evidence"):
                    runner.choose_best_result([unverified])

    def test_retry_can_promote_verified_improvement(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source_path, rgba, scene = self.fixture_scene(directory)
            with patch.dict(q.SCENES, {"fixture": scene}):
                original = self.fixture_result(directory, "attempt-01", 98, source_path, rgba, scene)
                improved = self.fixture_result(directory, "attempt-02", 99, source_path, rgba, scene)
                packs, reports = directory / "packs", directory / "reports"
                runner.publish_selection(original, None, packs, reports, "fixture", 1, {"attempt": 1})
                accepted = runner.verify_result(packs / "fixture.asset.json", reports / "fixture.quality.json", scene, source_path, rgba, "accepted_pack")
                best = runner.choose_best_result([improved, accepted], accepted)
                selected = runner.publish_selection(best, accepted, packs, reports, "fixture", 2, {"attempt": 2})
                self.assertEqual(selected["assetSHA256"], improved["report"]["assetSHA256"])
                verified = runner.verify_result(packs / "fixture.asset.json", reports / "fixture.quality.json", scene, source_path, rgba, "accepted_pack")
                self.assertEqual(verified["report"]["metrics"]["rmse"], 1.0)

    def test_prior_attempt_scan_revalidates_all_evidence_and_report_copies(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source_path, rgba, scene = self.fixture_scene(directory)
            work, reports, packs = directory / "work", directory / "reports", directory / "packs"
            work.mkdir()
            with patch.dict(q.SCENES, {"fixture": scene}):
                accepted = self.fixture_result(work, "attempt-01", 99, source_path, rgba, scene)
                weaker = self.fixture_result(work, "attempt-02", 98, source_path, rgba, scene)
                runner.publish_selection(accepted, None, packs, reports, "fixture", 1, {"attempt": 1})
                for result in (accepted, weaker):
                    (reports / result["reportPath"].name).write_bytes(result["reportPath"].read_bytes())
                results, incumbent = runner.previous_results(packs, reports, work, scene, source_path, rgba)
                self.assertEqual(len(results), 3)
                self.assertEqual(runner.choose_best_result(results, incumbent)["report"]["assetSHA256"], accepted["report"]["assetSHA256"])
                pack_report = packs / "fixture.quality.json"
                original = pack_report.read_bytes()
                pack_report.write_bytes(original + b" ")
                with self.assertRaisesRegex(ValueError, "copies"):
                    runner.previous_results(packs, reports, work, scene, source_path, rgba)
                pack_report.write_bytes(original)
                forged = dict(weaker["report"])
                forged["metrics"] = {**forged["metrics"], "rmse": .01}
                runner.write_json(reports / "attempt-02.quality.json", forged)
                with self.assertRaisesRegex(ValueError, "measured evidence"):
                    runner.previous_results(packs, reports, work, scene, source_path, rgba)


if __name__ == "__main__":
    unittest.main()
