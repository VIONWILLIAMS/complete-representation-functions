# 山水显示重建审计

本轮采用经审查的传统候选，仅更新最终显示PNG/预览和记录。原始PFM/EXR未动，场景几何和纹理代码未改。

- `*_before_firefly_suppression.png`及其development/预览：原有3次a-trous显示基线。
- `*_comparison_100pct.jpg`：三个水面区域的同坐标100%对照。
- `*_changed_mask.png`：2049个被削减的原始线性像素。后续局部滤波也可能影响邻域。
- `*_firefly_report.json`：全部参数和每个修改像素的坐标、亮度、局部支持信息。其“original_final_png_untouched”字段描述候选生成阶段，正式采用另见下项。
- `adoption_verification.json`：正式采用前后哈希及原始HDR保持不变的证据。
- `material_policy.json`：不整体保护介电水面；局部AOV连续性和成片高光支持仍起保护作用。

处理2049像素（0.032568%），但这些样本很亮，约削减4.33%的原始估计总亮度。它可能压低真实但未充分采样的太阳闪光/焦散，是有偏显示重建，不能当作物理积分精度提高。山体和树群的明显CG形态没有修复。

复现：源码及Python依赖齐全，把该图beauty PFM、EXR、albedo/normal/depth三个PFM放入 `outputs/` 后执行：

```bash
python3 tools/apply_landscape_display.py
```

不需要事先存在PNG或development；入口会先补建普通显影基线。此命令只更新山水展示，不执行路径追踪重渲染。
