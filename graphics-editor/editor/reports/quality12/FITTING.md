# 原尺寸观察重建：拟合与质量证据

这份记录对应产品 `1.1.0-experimental.2`。文件名中的 `quality12` 是内部模块标识，不表示完整 CRF 1.2 或完整 1.1 研究计划已验收。

## 结论与适用范围

固定参考 `web/assets/v08/references/landscape.alpine.png` 的 **800×531 canonical 图像**，由 65,536 个显式二维高斯函数与 RGB 基色重新求值，在导出 JSON、重新读取参数后，达到 **PSNR 36.667752512 dB、SSIM 0.9728077248、MAE 2.13429535/255**。山林、水面、岸线建筑三个预定区域均通过冻结门槛。

这里的 800×531 是仓库既有的规范化参考尺寸，**不是相机原文件分辨率**。冻结契约记录了该参考由先前下载的 1280×850 观察经过 EXIF 方向处理与 Lanczos 缩小而来；本次拟合与评价没有进一步缩小或裁剪参考。

结果证明的是当前观察的函数表示与重建质量。它不证明无需参考图的新场景生成、类别泛化、真实三维、新视角、物理重照明或自主程序演化。拟合阶段读取目标观察；渲染阶段只读取显式函数参数。这个高质量分支没有训练共享神经网络，也没有宣称替代已有局部神经函数实验。

## 冻结合约与真实图像测量

正式契约是 `contracts/quality12.json`，SHA-256：

`3cdd4ed7c25d91bd8eb78c435816154b79038008e397db94b5ae5fc589734ab8`

拟合模块加载、核验该文件，拒绝被修改的契约。正式执行脚本同时核对参考文件 SHA-256 与尺寸。正式资产与报告分别绑定 `qualityContractHash`、源文件摘要、拟合代码摘要、参数文件摘要和输出 RGBA 摘要。

| 测量范围 | PSNR dB | SSIM | MAE /255 | 结果 |
|---|---:|---:|---:|---|
| 全帧 800×531 | 36.6677525 | 0.9728077 | 2.1342954 | 通过 |
| 山体与树林 `[40,26,320,293)` | 34.5499937 | 0.9656938 | 3.1681514 | 通过 |
| 水面与倒影 `[40,371,760,521)` | 39.6448665 | 0.9659827 | 1.6501574 | 通过 |
| 岸线与建筑 `[480,254,784,372)` | 34.0574834 | 0.9670446 | 3.3712459 | 通过 |

全帧要求 PSNR≥32、SSIM≥0.95、MAE≤4；每个 ROI 要求 SSIM≥0.90、MAE≤6。ROI 坐标采用左上界向下取整、右下界向上取整、半开区间，固定于运行前。没有按结果重新挑选区域。

SSIM 对 sRGB 编码 RGB8 的三个通道分别计算，Gaussian σ=1.5、truncate=3.5、reflect 边界、population covariance，C1=6.5025、C2=58.5225。先生成完整帧的 SSIM map，再选择 ROI；没有对各裁剪重新建立边界。PSNR、MAE 同样针对实际量化结果。此处 SSIM 衡量参考重建一致性，并不是单独的审美或真实感证明。

全帧最大单通道误差仍为 **80/255**，逐像素三通道完全相同的比例为 **13.453%**；高平均质量不代表每个高对比细节均无误差。

## 函数与求解方式

每个基函数保存 `[cx, cy, sigmaX, sigmaY, theta, R, G, B]`。像素中心为 `(x+0.5,y+0.5)`，旋转后坐标归一化得到平方距离 `q`，仅在 `q≤16` 的支撑内累加：

```text
colour(x,y) = base + sum(exp(-q/2) * signedRGB)
output = clamp(floor(colour + 0.5), 0, 255)
```

两条主轴 sigma 均不得小于 **0.35 源像素**，且限制最大值、中心范围、系数范围与函数个数。颜色系数可以为负；此表示是 sRGB 编码域中的数值近似，不能把系数解释成独立物体的物理辐射。

求解先用均匀覆盖与残差驱动的非均匀、多尺度高斯布局建立稀疏系统，然后交替求解颜色，并对中心、尺度、方向和颜色进行 100 步联合优化。最后用相同几何进行 30 次迭代预算的全局颜色回修。所有阶段保留真实误差与计时；优化选择依据整个状态的全帧浮点误差。最后将几何和颜色量化为六位小数，**只读取实际导出的 JSON 重新渲染后**进行正式评价。

残差仅用于拟合过程中的误差定位与数值更新，未保存为渲染图片或隐藏查表。导出的资产不包含原始 RGB 栅格、每像素颜色表、图片 base64、无损残差图或隐含外部图像依赖。最终图像由声明的连续函数求值产生。

## 成本、容量与比较

| 项目 | 实测值 |
|---|---:|
| 高斯函数 | 65,536 |
| 几何标量参数 | 327,680 |
| 颜色标量参数，含基色 | 196,611 |
| 标量参数总数 | 524,291 |
| 若以 Float32 存储参数 | 2,097,164 字节 |
| 原始 RGB8 数组 | 1,274,400 字节 |
| Float32 参数 / 原 RGB 数组 | 1.6456 倍 |
| 发布 JSON，含来源与阶段记录 | 5,328,907 字节 |
| 发布 JSON / 原 RGB 数组 | 4.1815 倍 |
| 既有 canonical PNG 文件 | 747,376 字节 |
| 每个源像素对应的函数数 | 0.154275 |
| 最小 / 中位 / 最大 sigma | 0.35 / 1.0042355 / 7.391421 |
| 触及最小值的 sigma 标量 | 4,846 / 131,072 |
| 完整拟合耗时 | 48.544883 秒 |
| Python 从参数重新求值 | 2.551626 秒 |
| 拟合、导出、重放与测量总耗时 | 51.678924 秒 |

该表示支持显式函数求值和后续编辑，**没有图像压缩优势的主张**。它的参数数目也远大于上一轮演示性小网络；两者不是同容量、同任务的直接性能比较。

同一最终运行中，在已分配完整 65,536 个函数、尚未联合优化时，PSNR 为 29.5831166 dB、SSIM 为 0.8922936、MAE 为 5.0471257。联合优化与颜色回修后，PSNR 增加 **7.0846359 dB**，MAE 降低 **57.713%**，函数数量未增加。这个对照增加了计算时间，不能称为等时间或更快的算法胜出。

`fit-experiments.json` 与 `experiments/*.report.json` 保留 32,768 点失败、65,536 点固定几何失败、旧 0.3 sigma 约束可行性实验与 131,072 点容量实验。旧约束实验不是最终合约验收；大中间参数文件不进入 Git。所有正式质量声明只绑定当前最终资产。

`fitting-runs.json` 另列 8 次实际拟合尝试及成本范围，包含成功但被最终合约绑定运行替代的临时结果。那次临时成功运行仅保留最后阶段的耗时下界，未将未知总耗时填写为零。并行实验各自的 wall time 之和不解释为 CPU 秒或整个任务的结束时间。

## 证据与复现

- 参数：`web/assets/quality12/alpine.asset.json`，外层 `crf.quality_asset.v1`，内层 `.gaussian` 为显式 v0.8 参数格式。
- 质量报告：`web/assets/quality12/alpine.quality.json`。
- Python 输出：`reports/quality12/alpine/reconstruction.png`。
- 独立 JavaScript 重放：`reports/quality12/kernel/verification.json`。最终原尺寸 RGBA 与 Python 输出逐字节一致；此证据与对真实参考的重建指标分别记录。
- 拟合模块：`fitting/quality12.py`；命令行：`scripts/fit_quality12.py`。
- 测试：`tests/test_quality12.py`，包含冻结契约拒绝、标量公式、SSIM map ROI 一致性、非法输入、参数边界和实际小图优化。

在 `graphics-editor/editor` 目录执行：

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 python scripts/fit_quality12.py \
  web/assets/v08/references/landscape.alpine.png \
  --output web/assets/quality12/alpine.asset.json \
  --report web/assets/quality12/alpine.quality.json \
  --preview reports/quality12/alpine/reconstruction.png \
  --budget 65536 --iterations 50 --geometry-steps 100 \
  --polish-iterations 30 --id landscape.alpine.quality12

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 python tests/test_quality12.py
```

参数数值可重算；运行计时和环境字段每次运行会变化，因此整个 JSON 文件字节摘要并不承诺跨次执行一致。已经封存的单个文件以其实际摘要为准。当前最终资产摘要为：

`c82556bd942e63f73ff2c3dedfd98cec0b3ebfd8cd5716a9bcd43cea1aaa6672`

当前完整 RGBA 输出摘要为：

`1d1e3dd5e8854fe659735dc33974443a136d5471084951e40bf28b2a3a3c90e1`

补充的落叶观察实验保存在 `secondary/leaves.quality.json` 与 `secondary/leaves.comparison.png`。该不同来源只用于验证同一拟合器可复用，既非独立封存统计评估，也不通过 Alpine 的源文件与 ROI 合约；其 `primaryContractAcceptance` 明确是 `not_applicable`。JPEG 预览拟合记录另外保留，不能把同一照片的 JPEG 和 PNG 当作两个独立样本。

该补充实验采用既有 `learn.r10.5cbf8dbb8c71.png` canonical 参考的 512×292 全部像素，24,576 个函数，同一 50 次稀疏求解、100 步几何优化、30 次颜色回修预算。导出 JSON 重放为 **43.0374348 dB、SSIM 0.9873231、MAE 1.249621/255**。更大源观察曾为 1100×627 的网站 OG 裁剪，不能把这次结果外推到其未观察的构图或原始细节。来源记录沿用 `web/assets/v08/learning.json` 的下载与规范化链路。

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 python scripts/fit_quality12.py \
  web/assets/v08/references/learn.r10.5cbf8dbb8c71.png \
  --output /tmp/crf-quality12-secondary/leaves-png.asset.json \
  --report reports/quality12/secondary/leaves.quality.json \
  --preview reports/quality12/secondary/leaves.reconstruction.png \
  --budget 24576 --iterations 50 --geometry-steps 100 \
  --polish-iterations 30 --id leaves.supplementary.quality12 --roi-profile none
```
