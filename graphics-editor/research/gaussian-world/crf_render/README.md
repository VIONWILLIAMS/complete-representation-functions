# CRF 代码渲染样片实验

**本目录是一组独立的可复现实验，没有覆盖或替代既有 CRF 1.2 项目。** 图片由 Python 场景程序和本次编写的 C++ CPU 路径追踪器实际计算。它们是合成渲染样片，写实程度应以成图判断。

## 先看结果

- `CRF_Render_Gallery.html`：高清图片交付包根目录中的离线画廊；开发工作目录中位于 `delivery/`。
- `measurements/collection_manifest.json`：高清图片交付包中的成图清单；开发工作目录中位于 `outputs/`。以其中的实际尺寸、采样数、耗时和备注为准。
- 对应 PNG：按标注分辨率直接渲染，未使用 AI 超分辨率。
- 对应 PFM / EXR：保留未烘焙色调映射的线性 HDR 数据。
- 对应 `*.json`、`*.development.json`：记录渲染参数、运行时间和后处理步骤。

本实验设计了静物、建筑室内、山水、产品和沙丘五种题材。清单只应列入已经成功生成并检查的图片，不能把场景源码存在当作成图完成。

## 实际技术链路

通俗解释见 [这些图片的像素如何由代码算出来](docs/HOW_PIXELS_ARE_COMPUTED.md)。可在已连接的 Colab GPU 中执行的 Notebook 说明见 [Colab 执行入口](docs/COLAB_NOTEBOOK.md)。

`Python 场景代码 → 几何与材质描述 → 自编写 C++ 路径追踪 → 线性 PFM → 可选传统滤波 → 曝光与色调映射 → PNG`

几何、表面颜色和纹理都由程序构建。本次样片没有调用文生图模型，没有读取外部照片、贴图或三维资产，没有使用神经网络降噪。画廊缩略图只是为了浏览而缩小的预览，不能代替原尺寸 PNG。

## 当前实现状态

| 部分 | 状态 | 说明 |
| --- | --- | --- |
| C++ CPU 路径追踪器 | 已运行 | BVH 求交、三角形与球体、面积光与天空、太阳、MIS、多次反射 |
| 程序化场景与材质 | 已运行 | 木纹、石材、陶瓷、织物、玻璃、金属；各场景有不同侧重 |
| 薄透镜相机与辅助通道 | 已运行 | 景深；材质色、法线、深度数据 |
| 传统降噪与成像 | 已运行 | AOV 引导局部滤波 / à-trous 重建、曝光、简化 filmic 曲线与 sRGB |
| PNG 与线性 HDR 输出 | 已运行 | 原始 PFM 保留；PFM→EXR→PFM 的像素往返转换已核验 |
| CUDA 后端 | 本机交叉编译通过 | NVCC 13.0.88 完成 sm_120 编译与链接；GPU 未执行，远端 CUDA 12.8 未验证 |
| OptiX / RT Core | 未实现 | CUDA 原型使用软件 BVH；不能称为 OptiX 加速 |
| 云端 96GB GPU | 未验证 | 本轮样片由 CPU 产生，未取得云端 GPU 渲染结果 |
| Colab / tmate 连接路线 | 待连接地址 | CLI 0.8.0 已安装；OAuth 未完成并已关闭，尚缺 tmate 实际输出地址；没有新 VM 或 GPU 实测 |
| 全自主画质优化 | 未完成 | 已进行人工可审查的代码修改与重渲染；尚非无人持续优化系统 |

## 在 Linux CPU 环境复现

需要 C++17 编译器、OpenMP、Python 3；图像后处理需要 numpy、Pillow、scipy。以下为一张静物的运行示例，尺寸和采样数可以按交付图的 JSON 改成完全一致的值。

```bash
python3 -m pip install numpy Pillow scipy
make
mkdir -p outputs/replay
python3 scenes/still_life.py outputs/replay/still_life.scene
./crf_render outputs/replay/still_life.scene outputs/replay/still_life \
  2048 2560 192 20261123 10 8
python3 tools/develop.py outputs/replay/still_life --atrous 2
```

CPU 参数顺序：

```text
./crf_render 场景文件 输出前缀 宽 高 每像素样本数 随机种子 [最大路径深度] [CPU线程数]
```

可用场景程序为 `still_life.py`、`architecture.py`、`landscape.py`、`product.py` 和 `desert.py`。各自导出 `build()` 并接收一个场景输出路径。输出尺寸不会自动适配构图，优先沿用成图清单中的宽高比例。

`--atrous 2` 是两级传统局部重建；`--denoise` 为较简单的局部引导滤波。两者默认关闭。曝光参数、滤波方式、次数及输出哈希写入 `*.development.json`。省略这些选项即可查看不经降噪的版本。

### 产品图的冻结源码

首张产品图运行时，渲染器仍处于本轮开发过程。为保持溯源，`run_sources/product/` 保存了那次运行的场景、生成器和渲染器快照，`manifest.json` 记录其 SHA-256。

```bash
g++ -O3 -std=c++17 -fopenmp -DNDEBUG \
  run_sources/product/renderer.cpp -o crf_render_product_snapshot
```

复现该张产品图时，使用上面的可执行文件和 `run_sources/product/product.scene`，并读取原图 JSON 中的宽、高、spp、seed、max_depth。不要假设继续修改后的 `src/renderer.cpp` 能逐位复现早期输出。不同编译器、数学库和 CPU 浮点行为也可能产生细微差异。

## 在 GPU 机器继续验证

这些命令用于后续验证，**不代表本次已经使用 GPU 生成了图片**。

本轮在无 GPU 主机的独立目录安装了 NVIDIA 官方小组件，使用 NVCC 13.0.88、GCC 14.2、glibc 2.41 完成 `sm_120` 源码交叉编译和链接，源码没有为编译而修改。此前 NVCC 12.8.93 在本机遇到 glibc 2.41 数学函数声明冲突；这不能推断远端 CUDA 12.8 环境的结果。完整状态与原始日志在 `logs/cuda_compile_status.json` 及其列出的日志中。本机生成的 CUDA 13 二进制没有部署到远端；目标 GPU 机器仍需使用当地工具链从源码重建。

另外已经尝试官方 [google-colab-cli](https://github.com/googlecolab/google-colab-cli) 路线。CLI 0.8.0 已安装，但没有完成 Google OAuth；用户改走 tmate 后，授权提示已关闭。目前尚缺用户 Colab 运行实例实际输出的 tmate 连接地址，没有新建 Colab VM，也没有远程 `nvidia-smi` 或 GPU 渲染结果。连接状态记录在 `logs/colab_connection_status.json`。这些步骤没有证明用户原有的 96GB GPU 已连接。

```bash
./build_cuda.sh
./tools/run_gpu_workload.sh --smoke
./tools/run_gpu_workload.sh --full
```

先完成编译和 smoke 数值检查，再执行完整任务。脚本记录设备、利用率、显存、功耗、耗时及源码哈希；不会靠空分配把显存占满。兼容性、参数和局限见 `docs/CUDA_BACKEND.md`。

## 重建离线画廊

```bash
python3 tools/build_gallery.py \
  --manifest outputs/collection_manifest.json \
  --output delivery/CRF_Render_Gallery.html \
  --copy-originals
```

HTML 内嵌的是较小的浏览预览，单独打开也能查看。原尺寸 PNG 链接对应同目录下的 `images/`；使用完整交付包并保留目录结构才能打开这些原图。EXR 与大量辅助数据可以在独立的原始数据包中提供。

如果从高清图片交付包解压后重建，使用其中的清单位置：

```bash
python3 tools/build_gallery.py \
  --manifest measurements/collection_manifest.json \
  --output CRF_Render_Gallery.html
```

生成器同时识别开发目录的 `outputs/` 与交付包的 `images/`、`aov_previews/`。源代码压缩包不包含成图数据，需要先运行渲染或使用完整高清图片包。

## 如何评价这些图

本轮验证的是“代码能否实际产生可查看、可复现、可修改的多题材图像”。高分辨率、采样数和真实感是不同维度：增加采样主要降低噪声，不能自动修复过于规则的木纹、简化的叶片、材料模型或不自然的构图。

渲染器使用近似 RGB 光学、简化介质处理；可选雾为距离混合近似，并非完整体积积分。它也不是完整 ACES 色彩管理系统。这里没有与真实场景严格配准的参考照片，因此不报告“95% 真实度”或无依据的 PSNR/SSIM。

更完整的实现与阶段判断见 `docs/IMPLEMENTATION_REPORT.md`。

## 已采用的静物亮点显影

静物最终PNG额外采用了一次保守的传统离群亮点抑制，再做原有三次a-trous显影。它按法线、albedo和深度寻找同表面邻域，并保护玻璃/金属主可见表面。本次只缩减 **167个原始像素（0.00319%）** 的异常亮度；原始PFM和EXR不变。本轮静物与山水分别采用明确记录的离群亮点处理；建筑、产品与沙丘未启用该额外步骤。两张图的保护策略不同，见下节山水说明。

这属于**有偏的显示滤波**，可能削弱未充分采样的真实焦散，不能宣称提高了物理积分精度。没有神经网络或图像生成。原先未抑制的PNG、逐像素变更mask、参数报告、HDR不变证明和100%对照保存在 `audit/still_life_display/`。

复现前提：解压源码到项目根目录，安装 numpy、Pillow、scipy，并把静物 HDR/AOV 包中的原始 beauty PFM、EXR，以及 `_albedo.pfm`、`_normal.pfm`、`_depth.pfm` 放入该项目的 `outputs/` 目录。文件统一使用 `CRF_01_Warm_Still_Life` 前缀。**不需要已有最终PNG或development JSON**：如果任一缺失，脚本先用现有 `develop(..., atrous=3)` 建立普通显影基线，再执行同样的保守亮点处理。全部已有时保持原有行为；不会重新渲染场景。以下一条命令仅更新静物PNG、预览及其记录：

```bash
python3 tools/apply_still_life_display.py
```

如果从源码重新渲染，请先使用该图JSON中的实际参数：2048×2560、256 spp、seed 20261123、max_depth 12；再执行上述显示命令。原始成图对应的源码快照在 `run_sources/still_life/`。详细原理与代价见 `docs/FIREFLY_RECONSTRUCTION.md`。

## 已采用的山水亮点显影

山水最终PNG采用独立显示重建：不整体保护介电水面，而由法线/albedo/深度的局部连续性和至少3个相邻高亮支持保留成片高光。以亮度比1.6、线性绝对阈值0.035、7×7邻域与MAD检查，缩减 **2049个原始像素（0.032568%）** 的孤立峰值，然后进行3次a-trous显影。

这些像素非常亮，该操作约削减 **4.33%的原始估计总亮度**；这是有偏显示重建，真实但未充分采样的太阳闪光与焦散也可能被压低。山体、树群、石头、水面几何和纹理程序完全没改，CG形态仍然存在，不能把这次处理解释成照片级建模或物理积分精度提高。原始HDR保持不变，未抑制PNG、100%水面对照、mask、材料策略与完整报告保存在 `audit/landscape_display/`。

将山水beauty PFM、EXR及三个PFM辅助通道放入项目 `outputs/` 后执行（需要源码及numpy/Pillow/scipy）：

```bash
python3 tools/apply_landscape_display.py
```

此入口支持原始数据包中没有PNG/development的情况，会先建立普通3次a-trous基线，不重新渲染。源数据前缀为 `CRF_04_Alpine_Lake`，原始尺寸3072×2048。它只更新山水显示与对应记录。
