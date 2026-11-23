# 传统局部离群亮点抑制：显示重建实验

`tools/remove_fireflies.py` 在原始线性RGB上检测稀疏、异常高亮像素，再调用已有a-trous显影。它没有图像生成、神经网络、外部照片或贴图输入，也不修改原始PFM/EXR。

## 检测与限制

1. 用5×5局部亮度中位数进行候选筛选：中心亮度大于局部中位数×1.6加0.035。
2. 在7×7邻域中，仅保留法线、材质albedo与深度足够接近的邻点；至少需要12个同表面邻点。细小物体和边界因此倾向于被保留。
3. 同时检查MAD稳健离差。若邻域中至少有3个足够亮的同表面像素支持当前高亮，则保留该高亮。
4. 确认为孤立异常值时，仅缩减该像素的RGB幅度，保持其色相，将亮度限制在邻域稳健上界。其他原始线性像素逐值不动。
5. 在这个候选线性结果上进行原先的3次a-trous显示重建与色调转换。

可选 `--protect-specular-scene scenes/still_life.scene` 根据场景中type1金属、type2玻璃材质的精确albedo AOV颜色保护其主可见表面。它没有独立的material-ID AOV，颜色签名若与其他材质重合会过度保护；带程序纹理的金属也未必能由其基础颜色完整匹配。此保守选项的目的，是避免将玻璃表面的真实微小太阳闪光当作噪声。

## 代价

这是一种**有偏的显示重建**。仅凭单次渲染和辅助通道，无法从数学上区分所有真实小高光与随机路径亮点。它可能削弱真实、但采样尚不充分的焦散或亚像素闪光。它不能作为无偏辐亮度测量，也不能替代增加采样、改进积分器或更有效的焦散采样。

保留原始HDR、变更像素mask、处理参数和100%前后裁剪，便于审查。现有最终PNG不会被此脚本覆盖，除非后续另外明确采用候选版本。

## 运行

```bash
python3 tools/remove_fireflies.py outputs/CRF_01_Warm_Still_Life \
  --output-dir outputs/firefly_review --atrous 3

python3 tools/remove_fireflies.py outputs/CRF_01_Warm_Still_Life \
  --output-dir outputs/firefly_review_specular_protected --atrous 3 \
  --protect-specular-scene scenes/still_life.scene
```

输出含：候选PNG、预览JPEG、100%前后裁剪、变更像素mask和包含每个被抑制像素坐标与数值的JSON。最终数目、耗时和哈希以JSON为准。

合成检查覆盖：孤立亮点被缩减、连续2×2高光不变、不同材质的单像素高亮不变。结果位于 `logs/firefly_filter_checks.json`。

## 从只含原始HDR/AOV的数据包复现最终静物

配合源码包，将 beauty PFM、原始EXR、albedo/normal/depth三个PFM放入项目 `outputs/`；安装 numpy/Pillow/scipy。无需已有PNG或development JSON，执行 `python3 tools/apply_still_life_display.py` 即可。若显示文件或其记录缺失，入口会先进行普通3次a-trous显影，再采用保守离群亮点处理；原始数据只读，不做完整重渲染。
