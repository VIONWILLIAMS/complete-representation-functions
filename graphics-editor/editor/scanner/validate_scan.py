"""Independent payload checks; no renderer or semantic truth is assumed."""
from pathlib import Path
import base64
import hashlib
import json

import numpy as np
from PIL import Image, ImageOps

from .scene_scan import infer_background, INDEX


def validate(project_root, *, donor_control=True):
    root = Path(project_root)
    source = root / "web/assets/reference.png"
    code = (root / "web/assets/scene-data.js").read_text()
    data = json.loads(code.split("CRF_SCENE_DATA = ", 1)[1].rstrip().removesuffix(";"))
    with Image.open(source) as im:
        truth = np.array(ImageOps.exif_transpose(im).convert("RGB"))
    h, w = truth.shape[:2]
    def decode(name, channels=1):
        raw = base64.b64decode(data[name], validate=True)
        assert len(raw) == h * w * channels, name
        return np.frombuffer(raw, dtype=np.uint8).reshape((h, w, channels) if channels != 1 else (h, w))
    rgb = decode("rgbBase64", 3)
    labels = decode("labelsBase64")
    background = decode("backgroundRgbBase64", 3)
    inferred = decode("backgroundInferredMaskBase64")
    hosts = decode("backgroundLabelsBase64")
    assert data["referenceSha256"] == hashlib.sha256(source.read_bytes()).hexdigest()
    assert np.array_equal(rgb, truth)
    assert (data["width"], data["height"]) == (w, h)
    assert np.array_equal(inferred, (labels != hosts).astype(np.uint8))
    assert np.array_equal(background[inferred == 0], truth[inferred == 0])
    assert set(np.unique(labels)) == {obj["index"] for obj in data["objects"]}
    assert set(np.unique(hosts)).issubset(set(np.unique(labels)))
    assert sum(obj["statistics"]["pixelCount"] for obj in data["objects"]) == h * w
    yy, xx = np.mgrid[:h, :w]
    z_observed = np.zeros((h, w), dtype=np.float64)
    z_hidden = np.zeros_like(z_observed)
    for obj in data["objects"]:
        mask = labels == obj["index"]
        ys, xs = np.nonzero(mask)
        assert obj["statistics"]["pixelCount"] == int(mask.sum())
        assert obj["bbox"] == [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
        assert abs(np.linalg.norm(obj["normal"]) - 1) < 1e-10
        depth = obj["depth"] + obj["depthSlope"][0] * (xx + .5 - obj["pivot"][0]) + obj["depthSlope"][1] * (yy + .5 - obj["pivot"][1])
        z_observed[mask] = depth[mask]
        z_hidden[hosts == obj["index"]] = depth[hosts == obj["index"]]
    margins = (z_observed - z_hidden)[inferred != 0]
    assert np.all(margins > 0), "An inferred sample would cover an observed sample"
    control_passed = None
    if donor_control:
        # Change all foreground utility colors to a conspicuous unrelated value.
        # Hidden inference must remain identical: these objects are never donors.
        changed = rgb.copy()
        facility_ids = [INDEX[k] for k in ("pole.main", "pole.arm", "signal.support", "signal.main", "signal.side", "wall.fixtures")]
        changed[np.isin(labels, facility_ids)] = [255, 0, 255]
        control, control_mask, _ = infer_background(changed, labels, hosts)
        control_passed = bool(np.array_equal(control[inferred != 0], background[inferred != 0]))
        assert control_passed
        assert np.array_equal(control_mask, inferred)
    return {
        "independentDecodedRgbExactPixels": int(np.all(rgb == truth, axis=2).sum()),
        "independentDecodedRgbMaxError": int(np.abs(rgb.astype(np.int16) - truth.astype(np.int16)).max()),
        "referenceFileHashMatches": True, "allPayloadArrayLengthsCorrect": True,
        "labelsCoverEveryPixelExactlyOnce": True, "objectStatisticsAndBoundsChecked": True,
        "inferredMaskExactlyDifferentHost": True, "unchangedVisibleBackgroundPixels": int((inferred == 0).sum()),
        "inferredDepthBehindObservedAtEveryPixel": True, "minimumDepthMarginReferencePixels": float(margins.min()),
        "foregroundColorPerturbationLeavesInfillUnchanged": control_passed,
        "scope": "Array/label/depth/data-source contracts only; not a WebGL or semantic ground-truth validation",
    }
