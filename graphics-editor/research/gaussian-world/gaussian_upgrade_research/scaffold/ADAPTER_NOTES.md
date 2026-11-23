# CRF fixture → gsplat 接口适配核查

核查日期：2026-11-23。对应夹具：`fixtures/procedural_v1/`。本文件补充适配规则；原 `cameras.json`、metadata、场景文件、manifest 与生成工具均保持原样。没有执行 gsplat、CUDA、训练或图像渲染。

## 1. 必须显式适配半像素偏移

**不能把夹具中的 K 原样传给本次核查的 gsplat 光栅化接口。**

夹具采用 OpenCV 整数像素中心：左上像素中心坐标为 `(0,0)`。当前官方 gsplat 的 3DGS/2DGS 参考实现以 `(x+0.5,y+0.5)` 求每个像素的 Gaussian 权重；其 sensors 设计也把整数 pixel index 转为 `pixel.float()+0.5` 的 image point。当前读取到的 CUDA sparse backward 内核同样在 px/py 中加 `0.5f`。对应证据列在第 5 节。

适配规则：

```text
fx_gsplat = fx_fixture
fy_gsplat = fy_fixture
cx_gsplat = cx_fixture + 0.5
cy_gsplat = cy_fixture + 0.5
viewmats = w2c_opencv
```

默认 1024×768 夹具的主点因此从 `(511.5,383.5)` 变为 `(512,384)`。世界坐标、相机坐标轴、相机位姿、图像像素数组均不移动；不要另把图像平移半像素。

原因是同一条射线应满足：

```text
(x - cx_fixture) / fx
    = (x + 0.5 - (cx_fixture + 0.5)) / fx

(y - cy_fixture) / fy
    = (y + 0.5 - (cy_fixture + 0.5)) / fy
```

最小适配代码（不依赖 NumPy 或 PyTorch）：

```python
def fixture_view_to_gsplat(view):
    # Call exactly once on the original integer-centre fixture K.
    # The caller converts these lists to the installed API's tensor dtype/device.
    K_gsplat = [row[:] for row in view["K"]]
    K_gsplat[0][2] += 0.5
    K_gsplat[1][2] += 0.5
    viewmat = [row[:] for row in view["w2c_opencv"]]
    return K_gsplat, viewmat
```

不要对已经由导入器转换成边界坐标的 K 再加一次 0.5。应在数据适配层保存 `pixel_center_convention`，避免把导入路径、数据增强路径和 renderer 各自重复补偿。

## 2. 外参、缩放与 AOV

- gsplat 的 `viewmats` 是 **world-to-camera**，应使用夹具已有 `w2c_opencv`，不能直接传 `c2w_opencv`。相机轴为右、下、前，不需要 OpenGL 轴翻转。
- 若按图像边界坐标做缩放，先完成本文件的 K 适配，再将 fx/cx 乘横向缩放率、fy/cy 乘纵向缩放率。等价的整数中心公式是 `c_resized = scale*(c_original+0.5)-0.5`。这依赖一致的图像重采样约定；不要一边使用 `align_corners` 风格缩放，一边套用另一种主点公式。
- CRF depth 是主射线距离 t；比较 gsplat 的 camera-Z 深度前，使用 `Z=t/sqrt(1+((u-cx_fixture)/fx)^2+((v-cy_fixture)/fy)^2)`。若用适配后的 K，则 u/v 同时采用 `x+0.5,y+0.5`。
- CRF normal 是世界空间法线。本次读取的 gsplat 2DGS 参考代码将法线变到相机空间；比较时应显式应用 w2c 的 3×3 旋转，并确认朝向和有效 mask，不把编码后的 RGB 直接当向量。
- 所有约定应按实际固定的 gsplat tag/commit 再做一次小型对应测试。本次结论来自当前官方文档与源码审查，不代表已经通过 GPU 渲染一致性测试。

## 3. 实际执行的纯 CPU 代数核查

读取已存在的 120 个相机，每个选择 9 个像素位置，共检查 1080 对归一化相机射线。

| 检查 | 结果 |
|---|---:|
| 加 0.5 主点适配后的射线分量最大差 | 0.0（本次 Python 双精度结果） |
| 直接使用未适配 K 的射线分量最大差 | 0.0006071712060513588 |
| 夹具 manifest 中已核对的文件哈希数 | 365 |
| 夹具文件哈希不一致数 | 0 |
| GPU 执行 / 渲染 / 训练 | 均未执行 |

未适配时的差别是系统性的半像素位置误差，不应由 Gaussian 优化去补偿相机接口错误。此核查只证明像素和投影代数一致，不证明所有 renderer 的完整渲染模型等价。

## 4. 灯光分割由消费配置定义

**当前夹具没有默认 held-out-light 协议。** `render_jobs.json` 和 cameras 中的 train/val/test 指相机方位块；三个灯光配置均复用同样的 96/12/12 视角划分。metadata 已注明它本身不是留出灯光的基准。

主流程拟在独立配置中定义 `neutral_top` 训练、`warm_left` 验证、`cool_right` 测试；本次接口审查不改夹具标签。相机泛化与灯光泛化需要分开记账，例如：

| 评测类型 | 示意组合 | 所测能力 |
|---|---|---|
| V | neutral_top × test views | 新视角、原灯光 |
| L | cool_right × train views | 已知视角、新灯光 |
| VL | cool_right × test views | 新视角、新灯光同时改变 |

实际训练只能读取配置允许的图像和标签；数据文件存在不代表可以将测试光照参与优化。原版固定光照 RGB/SH 缓存也不能因设置了 L/VL 分割就自动获得重光照能力。程序已知 BRDF/灯光输入或明确的物理/可重光照模型才提供相应机制。

## 5. 官方证据

1. **Data Conventions**：定义 view matrix 为 w2c，以及四元数顺序；该页面本身没有说明半像素采样位置。
   https://docs.gsplat.studio/main/conventions/data_conventions.html

2. **3DGS 官方 PyTorch 参考实现**：`_persp_proj` 直接用 K 投影，`accumulate` 构造 `pixel_coords` 时加 0.5。它们合起来确定 K 必须处于对应的图像边界坐标系统。
   https://docs.gsplat.studio/main/_modules/gsplat/cuda/_torch_impl.html
   https://github.com/nerfstudio-project/gsplat/blob/main/gsplat/cuda/_torch_impl.py

3. **2DGS 官方 PyTorch 参考实现**：`pixel_ids_x/y` 加 0.5；射线与 surfel 的平面相交使用同一像素坐标。
   https://docs.gsplat.studio/main/_modules/gsplat/cuda/_torch_impl_2dgs.html

4. **当前 CUDA sparse backward 源码**：`RasterizeToPixelsSparseBwd.cu` 的 px/py 为 tile 像素索引加 0.5f，与上述参考实现一致。当前 dense forward 文件的网页读取未成功，未声称逐行复核该内核或编译执行。
   https://github.com/nerfstudio-project/gsplat/blob/main/gsplat/cuda/csrc/RasterizeToPixelsSparseBwd.cu

5. **官方 sensors 设计文档**：pixel 与 image point 的转换明确为加 0.5，反向为 floor。
   https://github.com/nerfstudio-project/gsplat/blob/main/gsplat/sensors/design-models.md

