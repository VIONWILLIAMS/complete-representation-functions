# 静物最终显示的审计材料

最终采用：保护玻璃/金属主可见表面的传统孤立亮点抑制，再进行原有3次a-trous显影。

- `*_before_firefly_suppression.png`：采用前的完整PNG（已做原有a-trous，但尚未抑制离群亮点）。
- 对应原development JSON和预览：采用前显示记录。
- `*_comparison_100pct.jpg`：同坐标100%裁剪对照，不是分别生成的示意图。
- `*_changed_mask.png`：被缩减的167个原始线性像素位置；随后显示滤波还会影响邻域像素。
- `*_firefly_report.json`：候选计算阶段的详细记录。其 `original_final_png_untouched` 描述该阶段未覆盖原最终图；随后正式采用的动作由 `adoption_verification.json` 独立记录。
- `protected_specular_materials.scene`：用于恢复玻璃/金属主可见表面保护的材质定义快照，不包含可渲染几何或图片资产。
- `adoption_verification.json`：采用前后PNG哈希、预览哈希，以及PFM/EXR未改变的证明。

这是一种有偏显示重建，不代表提高了物理积分精度。真实、但未充分采样的焦散可能被削弱。原始HDR保留。

有原始静物PFM、三个PFM辅助通道及原始EXR后，在项目根目录执行：

```bash
python3 tools/apply_still_life_display.py
```

脚本仅更新静物PNG、预览、development记录和清单中的静物条目；其他图不默认采用此处理。
