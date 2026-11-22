#!/usr/bin/env python3
"""CRF 0.6 showcase board. Read-only inputs; final PNG is written only to /tmp."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "web/downloads"
OUTPUT = Path("/tmp/crf_0_6_overview.png")
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

def font(size):
    return ImageFont.truetype(FONT, size, index=0)

W, H = 1280, 1436
INK = "#173B36"
MUTED = "#61746D"
ACCENT = "#42745F"
canvas = Image.new("RGB", (W, H), "#F0F4EE")
draw = ImageDraw.Draw(canvas)

draw.rounded_rectangle((36, 31, 168, 63), radius=16, fill="#DFE9DF")
draw.text((52, 34), "可执行场景研究", font=font(15), fill=ACCENT)
draw.text((36, 72), "CRF 图形计算编辑器", font=font(42), fill=INK)
draw.text((38, 128), "观测与生成，汇入同一套物体函数", font=font(20), fill=MUTED)
draw.rounded_rectangle((1129, 47, 1244, 112), radius=19, fill=INK)
draw.text((1153, 54), "0.6", font=font(39), fill="#EEF5EB")

cards = [
    ("common_reference", "01", "观测 × 原生生成",
     ["照片拟合的苹果，与原生函数生成的梨子同场渲染。"]),
    ("common_edited", "02", "直接编辑物体函数",
     ["通过共享接口修改颜色与形态，保留拟合表面细节。"]),
    ("stilllife_reference", "03", "原生静物场景",
     ["果体、花器与木质承托面，由场景程序组合生成。"]),
    ("courtyard_reference", "04", "原生庭院场景",
     ["墙窗、长凳、盆栽，由场景程序构建。",
      "这是原生生成示例，非 Street 照片的复原结果。"]),
]

CARD_W, IMAGE_H, CARD_H = 592, 444, 568
for index, (name, number, title, captions) in enumerate(cards):
    x = 36 + (index % 2) * 616
    y = 177 + (index // 2) * 590
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x + 1, y + 5, x + CARD_W + 1, y + CARD_H + 5),
                         radius=17, fill=(20, 51, 40, 17))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7))
    canvas.paste(shadow, (0, 0), shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x, y, x + CARD_W, y + CARD_H), radius=16,
                           fill="#FFFFFF", outline="#D9E3D9", width=1)
    original = Image.open(SOURCE / f"crf_0_6_{name}.png").convert("RGB")
    if original.size != (960, 720):
        raise ValueError(f"Unexpected source aspect ratio or size: {name}: {original.size}")
    image = original.resize((CARD_W - 2, IMAGE_H), Image.Resampling.LANCZOS)
    # Only round the card's two upper image corners. No crop or scene alteration.
    mask = Image.new("L", image.size, 255)
    md = ImageDraw.Draw(mask)
    md.rectangle((0, 0, image.width, 17), fill=0)
    md.rounded_rectangle((0, 0, image.width - 1, 40), radius=15, fill=255)
    md.rectangle((0, 17, image.width, image.height), fill=255)
    canvas.paste(image, (x + 1, y + 1), mask)
    draw = ImageDraw.Draw(canvas)
    text_y = y + IMAGE_H + 18
    draw.rounded_rectangle((x + 20, text_y + 4, x + 59, text_y + 34), radius=9,
                           fill="#E4EEE2")
    draw.text((x + 28, text_y + 4), number, font=font(16), fill=ACCENT)
    draw.text((x + 72, text_y - 1), title, font=font(26), fill=INK)
    for line, caption in enumerate(captions):
        f = font(18 if line == 0 else 16)
        if draw.textbbox((0, 0), caption, font=f)[2] > CARD_W - 40:
            raise ValueError(f"Caption exceeds card width: {caption}")
        draw.text((x + 20, text_y + 43 + line * 27), caption,
                  font=f, fill=MUTED if line == 0 else "#8A6640")

draw.line((36, 1360, 1244, 1360), fill="#CAD9CD", width=1)
draw.text((36, 1375), "同一套程序结构 · 共享编辑与渲染 · 支持空间视角与时间轴", font=font(19), fill=INK)
draw.text((36, 1405), "展示当前实际渲染结果；单图拟合的几何与未见表面仍包含推断。", font=font(15), fill=MUTED)

canvas.save(OUTPUT, optimize=True)
print(f"{OUTPUT} ({OUTPUT.stat().st_size:,} bytes; {W} × {H})")
