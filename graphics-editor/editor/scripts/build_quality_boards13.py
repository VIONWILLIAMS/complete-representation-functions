#!/usr/bin/env python3
"""Build native-pixel technical comparisons from audited quality13 outputs.

Final output copies are byte-for-byte copies. Comparison panels use integer
cropping and pasting only: no scaling, sharpening, recolouring or AI imagery.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_HASH = "f262a18ad60ae4f77bed9608b28aecac2c1201d109a7709b82668a1d0a1b193b"
INK = "#173F34"
MUTED = "#647B6D"
LINE = "#D5E2D7"
PAPER = "#F5F8F2"
ACCENT = "#267E61"
GOLD = "#987543"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict:
    image = Image.open(path).convert("RGBA")
    try:
        label = path.relative_to(ROOT).as_posix()
    except ValueError:
        label = str(path)
    return {"path": label, "bytes": path.stat().st_size, "fileSHA256": sha(path.read_bytes()),
            "width": image.width, "height": image.height, "decodedRGBASHA256": sha(image.tobytes())}


def crop_metrics(reference: Image.Image, prediction: Image.Image) -> dict:
    difference = np.asarray(reference.convert("RGB"), dtype=np.float64) - np.asarray(prediction.convert("RGB"), dtype=np.float64)
    mse = float(np.mean(difference * difference))
    return {"mae": float(np.mean(np.abs(difference))),
            "psnr": None if mse == 0 else 10 * math.log10(255 ** 2 / mse),
            "maxChannelError": int(np.max(np.abs(difference))),
            "evaluatedPixels": reference.width * reference.height}


def build(output: Path, regular_path: Path, bold_path: Path) -> dict:
    contract_bytes = (ROOT / "contracts/quality13.json").read_bytes()
    if sha(contract_bytes) != CONTRACT_HASH:
        raise ValueError("Detail-quality contract differs from the frozen version")
    contract = json.loads(contract_bytes)
    scene_specs = {scene["id"]: scene for scene in contract["scenes"]}
    for font in (regular_path, bold_path):
        if not font.is_file():
            raise FileNotFoundError(f"Chinese font is required for reproducible labels: {font}")
    fonts = {}

    def font(size: int, bold: bool = False):
        key = (size, bold)
        if key not in fonts:
            fonts[key] = ImageFont.truetype(str(bold_path if bold else regular_path), size, index=2)
        return fonts[key]

    output.mkdir(parents=True, exist_ok=True)
    review = ROOT / "reports/quality13/review"
    review.mkdir(parents=True, exist_ok=True)
    copies = []
    names = {"alpine_hd": "CRF_Alpine_1280.png", "street": "CRF_Street_667.png", "orchard": "CRF_Orchard_800.png"}
    for scene_id, name in names.items():
        source = ROOT / f"reports/quality13/fitting/{scene_id}/{scene_id}.png"
        report = json.loads((ROOT / f"reports/quality13/fitting/{scene_id}/{scene_id}.quality.json").read_text())
        record = file_record(source)
        if record["decodedRGBASHA256"] != report["replayRGBASHA256"] or record["fileSHA256"] != report["artifacts"]["nativePNGSHA256"]:
            raise ValueError(f"Output PNG differs from its audited report: {scene_id}")
        spec = scene_specs[scene_id]
        if (record["width"], record["height"]) != (spec["width"], spec["height"]):
            raise ValueError(f"PNG dimensions differ from the frozen source: {scene_id}")
        target = output / name
        shutil.copyfile(source, target)
        if sha(target.read_bytes()) != record["fileSHA256"]:
            raise ValueError(f"Output copy differs: {scene_id}")
        copies.append({"scene": scene_id, "source": record, "output": str(target), "byteExact": True})

    spec = scene_specs["alpine_hd"]
    reference_path = ROOT / spec["referencePath"]
    baseline_path = ROOT / "reports/quality13/fitting/alpine_hd/baseline.png"
    final_path = ROOT / "reports/quality13/fitting/alpine_hd/alpine_hd.png"
    reference_record, baseline_record, final_record = map(file_record, (reference_path, baseline_path, final_path))
    if reference_record["fileSHA256"] != spec["fileSHA256"]:
        raise ValueError("Alpine source differs from its frozen reference")
    baseline_report = json.loads((ROOT / "reports/quality13/fitting/alpine_hd/baseline.quality.json").read_text())
    final_report = json.loads((ROOT / "reports/quality13/fitting/alpine_hd/alpine_hd.quality.json").read_text())
    if baseline_record["decodedRGBASHA256"] != baseline_report["replayRGBASHA256"]:
        raise ValueError("Baseline PNG differs from its reported RGBA output")
    counts = [r["representation"]["gaussians"] for r in (baseline_report, final_report)]
    if counts != [spec["basisBudget"], spec["basisBudget"]]:
        raise ValueError("The displayed baseline and final must have the same frozen capacity")
    reference, baseline, final = [Image.open(p).convert("RGB") for p in (reference_path, baseline_path, final_path)]
    if not reference.size == baseline.size == final.size == (1280, 850):
        raise ValueError("Native comparison requires three 1280×850 images")

    # Every photo panel is pasted 1:1. Only labels and borders are drawn around it.
    full = Image.new("RGB", (2656, 1138), PAPER)
    draw = ImageDraw.Draw(full)
    draw.text((36, 28), "CRF  /  真实场景的函数重建", font=font(38, True), fill=INK)
    draw.text((36, 84), "保留观察的原生像素：1280 × 850。两侧均为 1:1 像素粘贴，无缩放、锐化或调色。", font=font(24), fill=MUTED)
    left, right, photo_top = 36, 1340, 182
    draw.text((left, 139), "参考照片  ·  仅用于评价与对照", font=font(25, True), fill=GOLD)
    draw.text((right, 139), "最终参数计算结果  ·  196,608 个二维高斯函数", font=font(25, True), fill=ACCENT)
    for x, image in ((left, reference), (right, final)):
        draw.rectangle((x - 1, photo_top - 1, x + image.width, photo_top + image.height), outline=LINE)
        full.paste(image, (x, photo_top))
    m = final_report["metrics"]
    draw.text((36, 1053), f"完整图像测量  PSNR {m['psnr']:.4f} dB  ·  SSIM {m['ssim']:.6f}  ·  MAE {m['mae']:.4f}/255", font=font(24, True), fill=INK)
    draw.text((36, 1094), "有限观察重建：指标不代表“真实度百分比”，也不证明任意新场景生成或物理重光照。", font=font(22), fill=MUTED)
    full_name = "CRF_Alpine_Comparison.png"
    full_path = output / full_name
    full.save(full_path, optimize=False)

    # Fixed 200×160 centres of the three previously frozen ROIs. No error-guided
    # location selection is performed, so both improvements and residuals remain.
    detail = Image.new("RGB", (850, 946), PAPER)
    draw = ImageDraw.Draw(detail)
    draw.text((28, 25), "CRF  /  固定区域的原生细节", font=font(28, True), fill=INK)
    draw.text((28, 70), "每格 200 × 160 源像素；取冻结 ROI 的中心，不缩放。", font=font(17), fill=MUTED)
    columns = [(168, reference, "参考照片", GOLD), (386, baseline, "同容量基线", MUTED), (604, final, "最终计算结果", ACCENT)]
    for x, _, label, color in columns:
        draw.text((x, 119), label, font=font(19, True), fill=color)
    crop_rows = []
    labels = {"forest": "山林纹理", "water": "水面倒影", "buildings": "岸边建筑"}
    for index, roi in enumerate(spec["rois"]):
        x0, y0, x1, y1 = roi["bounds"]
        frozen = [math.floor(x0 * 1280), math.floor(y0 * 850), math.ceil(x1 * 1280), math.ceil(y1 * 850)]
        cx0 = math.floor((frozen[0] + frozen[2] - 200) / 2)
        cy0 = math.floor((frozen[1] + frozen[3] - 160) / 2)
        crop = (cx0, cy0, cx0 + 200, cy0 + 160)
        if not frozen[0] <= crop[0] < crop[2] <= frozen[2] or not frozen[1] <= crop[1] < crop[3] <= frozen[3]:
            raise ValueError("A fixed centre crop is not contained in its frozen ROI")
        top = 166 + 214 * index
        draw.text((28, top + 5), f"0{index + 1}", font=font(15), fill=MUTED)
        draw.text((28, top + 36), labels[roi["id"]], font=font(20, True), fill=INK)
        draw.text((28, top + 75), f"x {cx0}–{cx0 + 199}", font=font(13), fill=MUTED)
        draw.text((28, top + 98), f"y {cy0}–{cy0 + 159}", font=font(13), fill=MUTED)
        cropped = []
        placements = []
        for x, image, label, _ in columns:
            panel = image.crop(crop)
            cropped.append(panel)
            draw.rectangle((x - 1, top - 1, x + 200, top + 160), outline=LINE)
            detail.paste(panel, (x, top))
            placements.append({"role": label, "boardBox": [x, top, x + 200, top + 160], "decodedRGBSHA256": sha(panel.tobytes())})
        base_metrics = crop_metrics(cropped[0], cropped[1])
        final_metrics = crop_metrics(cropped[0], cropped[2])
        draw.text((386, top + 171), f"MAE {base_metrics['mae']:.3f}/255", font=font(14), fill=MUTED)
        draw.text((604, top + 171), f"MAE {final_metrics['mae']:.3f}/255", font=font(14, True), fill=ACCENT)
        crop_rows.append({"roiId": roi["id"], "frozenNormalizedBounds": roi["bounds"], "frozenPixelBounds": frozen,
                          "cropBoxHalfOpen": list(crop), "cropDimensions": [200, 160], "resized": False,
                          "placements": placements, "baselineMetrics": base_metrics, "finalMetrics": final_metrics})
    draw.line((28, 820, 822, 820), fill=LINE, width=1)
    bs, fs = baseline_report["fit"]["seconds"], final_report["fit"]["seconds"]
    draw.text((28, 840), f"同容量，计算量不同：两者均 196,608 个函数；拟合耗时 {bs:.1f}s → {fs:.1f}s。", font=font(16), fill=INK)
    draw.text((28, 874), "基线先分配全部函数；最终方案在优化后对残留误差进行细化。", font=font(16), fill=MUTED)
    draw.text((28, 908), "这些局部是确定性中心裁剪；没有按误差挑选位置，也不换算“真实度百分比”。", font=font(15), fill=MUTED)
    detail_name = "CRF_Detail_Comparison.png"
    detail_path = output / detail_name
    detail.save(detail_path, optimize=False)

    # Read the written files back: labeling and encoding must not alter even
    # one photo-panel byte, including the fixed crops used for comparison.
    written_full = Image.open(full_path).convert("RGB")
    written_detail = Image.open(detail_path).convert("RGB")
    panel_checks = []
    for role, box, expected in (("full_reference", (36, 182, 1316, 1032), reference),
                                ("full_computed", (1340, 182, 2620, 1032), final)):
        if written_full.crop(box).tobytes() != expected.tobytes():
            raise ValueError("Full comparison panel pixels changed: " + role)
        panel_checks.append(role)
    for row in crop_rows:
        for placement, expected in zip(row["placements"], (reference, baseline, final)):
            if written_detail.crop(placement["boardBox"]).tobytes() != expected.crop(row["cropBoxHalfOpen"]).tobytes():
                raise ValueError("Detail comparison panel pixels changed: " + row["roiId"])
            panel_checks.append(row["roiId"] + "/" + placement["role"])

    boards = []
    for board_path, role in ((full_path, "native_full_reference_vs_computed"), (detail_path, "native_fixed_centre_detail_comparison")):
        published = review / board_path.name
        shutil.copyfile(board_path, published)
        record = file_record(board_path)
        if sha(published.read_bytes()) != record["fileSHA256"]:
            raise ValueError("GitHub review board copy differs")
        boards.append({"role": role, "output": record, "repositoryPath": published.relative_to(ROOT).as_posix(), "byteExactRepositoryCopy": True})
    manifest = {
        "schema": "crf.native_quality_boards.v1", "date": "2026-11-22", "timezone": "Asia/Shanghai",
        "generator": {"path": "scripts/build_quality_boards13.py", "sha256": sha(Path(__file__).read_bytes()),
                      "pillowVersion": PIL.__version__, "numpyVersion": np.__version__,
                      "fonts": [{"path": str(p), "sha256": sha(p.read_bytes()), "ttcIndex": 2} for p in (regular_path, bold_path)]},
        "qualityContractSHA256": CONTRACT_HASH,
        "pixelPolicy": {"photoPanelScaling": "none", "cropInterpolation": "none", "colourEdits": False,
                        "outputPNGCopyPolicy": "unchanged_original_bytes", "boardEncoding": "lossless_RGB_PNG",
                        "referenceIsGeneratedOutput": False, "realismPercentageClaim": False},
        "nativeOutputCopies": copies,
        "sources": {"reference": reference_record, "sameCapacityBaseline": baseline_record, "finalComputed": final_record},
        "fullBoard": {"photoDimensions": [1280, 850], "referencePlacement": [36, 182, 1316, 1032],
                      "computedPlacement": [1340, 182, 2620, 1032], "resized": False},
        "detailBoard": {"selectionRule": "floor-centred 200x160 crop within each integer frozen ROI; independent of errors",
                        "rows": crop_rows},
        "comparison": {"baselineBasisCount": counts[0], "finalBasisCount": counts[1],
                       "baselineFitSeconds": bs, "finalFitSeconds": fs,
                       "equalCapacity": True, "equalCompute": False,
                       "note": "Different optimization steps and wall time; no equal-time speed claim."},
        "writtenPNGChecks": {"panelsChecked": panel_checks, "allPhotoPanelRGBBytesExact": True},
        "boards": boards,
    }
    (review / "boards.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return {"copiedOutputs": [row["output"] for row in copies],
            "boards": [{"path": str(output / name), "sha256": sha((output / name).read_bytes())} for name in (full_name, detail_name)],
            "manifest": str(review / "boards.json")}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--font-regular", type=Path, default=Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"))
    parser.add_argument("--font-bold", type=Path, default=Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"))
    args = parser.parse_args()
    print(json.dumps(build(args.output_dir.resolve(), args.font_regular, args.font_bold), ensure_ascii=False, indent=2))
