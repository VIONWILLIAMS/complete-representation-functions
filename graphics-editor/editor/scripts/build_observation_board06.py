#!/usr/bin/env python3
"""Independent QA contact sheet. Reads source crops and fitted preview PNGs."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web/assets/v06"
report = json.loads((ROOT / "reports/v06/observation_fit.json").read_text())
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
font = ImageFont.truetype(font_path, 17)
small = ImageFont.truetype(font_path, 14)
title = ImageFont.truetype(font_path, 28)
canvas = Image.new("RGB", (1100, 1100), "#f5f5f2")
draw = ImageDraw.Draw(canvas)
draw.rectangle((0, 0, 1100, 100), fill="#152c32")
draw.text((28, 21), "CRF 0.6 / Observation fitting evidence", font=title, fill="white")
draw.text((28, 63), "Real photograph -> segmented evidence -> shared lathe + radiance field", font=small, fill="#b9d6d8")
for col, label in enumerate(["Original source crop", "Extracted mask", "Fitted front (code)"]):
    draw.text((28 + 360 * col, 117), label, font=font, fill="#1e393f")
for row, kind in enumerate(["apple", "pear"]):
    item = next(o for o in report["objects"] if o["kind"] == kind)
    top = 159 + row * 428
    for col, suffix in enumerate(["reference", "reference-mask", "fit-front"]):
        x = 26 + col * 360
        draw.rounded_rectangle((x, top, x + 330, top + 360), radius=8, fill="#e7e8e4")
        im = Image.open(ASSETS / f"{kind}-{suffix}.png").convert("RGBA")
        im.thumbnail((318, 348), Image.Resampling.LANCZOS)
        canvas.paste(im, (x + (330 - im.width) // 2, top + (360 - im.height) // 2), im)
    draw.text((28, top + 372), f"{kind.upper()}  |  silhouette IoU {item['profile']['silhouetteIoU']:.4f}  |  held-out RGB MAE {item['appearance']['holdoutRgbMAE']:.2f}/255", font=font, fill="#1e393f")
    draw.text((28, top + 398), "IoU uses the extracted mask, not an independent ground-truth segmentation.", font=small, fill="#586a6c")
draw.line((28, 1023, 1072, 1023), fill="#c1ceca", width=1)
draw.text((28, 1037), "Assisted ROI + color segmentation. Single-view rotational hypothesis; back surface is inferred.", font=small, fill="#586a6c")
draw.text((28, 1062), "Source: Apple and pear / Yves Geissbuehler / CC0. Lighting is baked into observed radiance.", font=small, fill="#586a6c")
canvas.save(ASSETS / "observation-overview.png", optimize=True)
print(ASSETS / "observation-overview.png")
