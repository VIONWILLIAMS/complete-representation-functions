"""Quality-profile checks; photo acceptance is measured separately on real data."""
import copy
import hashlib
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fitting"))
import quality12 as quality
import crf08_gaussian as legacy


def example_asset():
    return {"schema": "crf.gaussian_asset.v0.8", "id": "test", "width": 20, "height": 16,
            "base": [70, 80, 90],
            "splats": [[6.25, 5.5, 1.1, .5, .4, 90, -20, 30], [15.3, 11.7, 2.2, 1.6, -.7, -30, 50, 70]],
            "kernel": {"type": "signed_additive_gaussian", "cutoffSigma": 4, "sample": "pixel_centres", "colorSpace": "srgb_encoded_0_255"}}


class ContractTests(unittest.TestCase):
    def test_contract_is_frozen_and_external(self):
        self.assertEqual(hashlib.sha256(quality.CONTRACT_PATH.read_bytes()).hexdigest(), quality.FROZEN_CONTRACT_HASH)
        changed = quality.load_contract()
        changed["fullFrame"]["ssimMin"] = .1
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "changed.json"
            path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "frozen contract"):
                quality.load_contract(path)

    def test_invalid_empty_and_moved_roi_refused(self):
        image = np.zeros((16, 20, 3), np.uint8)
        for rois in [(('water', 'empty', (0, 0, 0, 1)),), (('water', 'moved', (0, 0, 1, 1)),)]:
            with self.assertRaises(ValueError):
                quality.evaluate_quality(image, image, rois)

    def test_size_mismatch_does_not_resize_truth(self):
        with self.assertRaisesRegex(ValueError, "dimensions"):
            quality.evaluate_quality(np.zeros((16, 20, 3), np.uint8), np.zeros((8, 10, 3), np.uint8))


class NumericalTests(unittest.TestCase):
    def test_scalar_formula_and_json_only_replay(self):
        asset = json.loads(quality.canonical_json(example_asset()))
        actual = quality.render_asset(asset)
        truth = np.zeros((16, 20, 4), np.uint8)
        for y in range(16):
            for x in range(20):
                rgb = list(asset["base"])
                for cx, cy, sx, sy, theta, r, g, b in asset["splats"]:
                    dx, dy = x + .5 - cx, y + .5 - cy
                    u = (math.cos(theta) * dx + math.sin(theta) * dy) / sx
                    v = (-math.sin(theta) * dx + math.cos(theta) * dy) / sy
                    if u * u + v * v <= 16:
                        weight = math.exp(-.5 * (u * u + v * v))
                        rgb = [a + weight * c for a, c in zip(rgb, (r, g, b))]
                truth[y, x] = [min(255, max(0, math.floor(c + .5))) for c in rgb] + [255]
        np.testing.assert_array_equal(actual, truth)

    def test_full_frame_ssim_map_roi_agrees_with_mask_reference(self):
        rng = np.random.default_rng(117)
        reference = rng.integers(0, 256, (48, 64, 3), dtype=np.uint8)
        prediction = np.clip(reference.astype(float) + rng.normal(0, 8, reference.shape), 0, 255)
        report = quality.evaluate_quality(reference, prediction)
        self.assertAlmostEqual(report["metrics"]["ssim"], legacy.metrics(reference, prediction)["ssim"], places=14)
        for roi in report["rois"]:
            x0, y0, x1, y1 = roi["pixelBounds"]
            mask = np.zeros((48, 64), np.uint8)
            mask[y0:y1, x0:x1] = 255
            old = legacy.metrics(reference, prediction, mask)
            self.assertAlmostEqual(roi["metrics"]["ssim"], old["ssim"], places=14)
            self.assertEqual(roi["metrics"]["evaluatedPixels"], (x1 - x0) * (y1 - y0))

    def test_identical_image_is_perfect_but_wrong_image_fails(self):
        a = np.full((16, 20, 3), 120, np.uint8)
        same = quality.evaluate_quality(a, a)
        self.assertTrue(same["passed"])
        self.assertEqual(same["metrics"]["mae"], 0)
        self.assertIsNone(same["metrics"]["psnr"])
        self.assertEqual(same["metrics"]["ssim"], 1)
        self.assertFalse(quality.evaluate_quality(a, np.zeros_like(a))["passed"])

    def test_sigma_finite_coefficients_and_opaque_profile(self):
        for field, value in ((2, .349999), (3, float("nan")), (5, 4001)):
            asset = copy.deepcopy(example_asset())
            asset["splats"][0][field] = value
            with self.assertRaises(ValueError):
                quality.validate_asset(asset)
        asset = example_asset()
        asset["alpha"] = {"codec": "rle8", "runs": []}
        with self.assertRaises(ValueError):
            quality.validate_asset(asset)

    def test_representation_discloses_geometry_and_colour(self):
        asset = example_asset()
        result = quality.representation_statistics(asset, len(quality.canonical_json(asset)))
        self.assertEqual(result["parameterCount"], 19)
        self.assertEqual(result["geometryParameterCount"], 10)
        self.assertEqual(result["colourParameterCount"], 9)
        self.assertEqual(result["rawRGBBytes"], 20 * 16 * 3)
        self.assertEqual(result["parameterFloat32Bytes"], 76)

    def test_small_real_optimizer_improves_and_respects_floor(self):
        yy, xx = np.mgrid[:24, :32]
        rgb = np.stack((80 + 40 * np.sin(xx * .44), 110 + 60 * np.cos(yy * .38), 80 + 50 * np.sin((xx + yy) * .27)), axis=-1)
        rgb = np.clip(np.floor(rgb + .5), 0, 255).astype(np.uint8)
        asset = quality.fit_observation(rgb, quality.FitSpec(budget=80, iterations=20, geometry_steps=20, polish_iterations=10))
        self.assertGreaterEqual(min(g[2] for g in asset["gaussian"]["splats"]), quality.MIN_SIGMA)
        self.assertGreaterEqual(min(g[3] for g in asset["gaussian"]["splats"]), quality.MIN_SIGMA)
        trace = asset["fit"]["history"]
        initial = next(row["rmse"] for row in trace if row["phase"] == "joint_geometry_colour_0")
        final = quality.evaluate_quality(rgb, quality.render_asset(asset), ())["metrics"]["rmse"]
        self.assertLess(final, initial)
        self.assertEqual(asset["qualityContractHash"], quality.FROZEN_CONTRACT_HASH)
        self.assertFalse(asset["provenance"]["generalSceneGeneration"])


if __name__ == "__main__":
    unittest.main()
