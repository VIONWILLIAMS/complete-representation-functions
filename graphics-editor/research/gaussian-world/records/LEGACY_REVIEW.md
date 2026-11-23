# CPU 渲染实验交接审计

审计日期：2026-11-23。本文为现有实验资料的只读整理，不代表重新渲染或重新执行 GPU 验证。以下路径以独立实验的 `crf_render/` 为根；若父仓库把它放到 `experiments/` 下，请先进入相应目录。

## 1. 与主项目的关系

原始 `CRF_CodeNative_Photorealistic_Rendering_v0.1_Plan.md` 和本次 Gaussian v0.2 都是独立实验分支的方案名称。旧实验 README 明确说明没有覆盖或替代既有 CRF 1.2。不要把文件名里的 v0.1 / v0.2 用作主项目版本号回退。

原计划要求程序化几何和材质、自写渲染器、可追踪像素来源；首轮不使用外部照片、贴图、现成三维资产、扩散模型或图像生成 API。本次五张图遵循该范围。独立物理渲染器的后续对照结果必须标为 oracle，不能冒充自研输出。

## 2. 已完成事实和未完成边界

| 项目 | 可核查状态 | 记录位置 |
| --- | --- | --- |
| C++17 CPU 渲染器 | 已编译、执行，多线程 BVH 路径追踪 | `src/renderer.cpp`、`logs/renderer_verification.json` |
| 程序化场景 | 静物、室内建筑、产品、山水、沙丘 | `scenes/*.py`、`run_sources/` |
| 五张高清图 | 已由 CPU 直接渲染，无 AI 超分 | `outputs/collection_manifest.json`、逐图参数 JSON、逐图日志 |
| 原始 HDR/AOV | PFM beauty、材质色、法线、深度；PFM 转 EXR | 已交付原始数据包，Git 中保留索引与哈希 |
| 单参数 A/B 实验 | 一处玻璃 transmission 颜色改变，几何法线/深度逐字节相同 | `logs/controlled_parameter_check.json` |
| 传统显示重建 | AOV 引导 à-trous；静物与山水另有透明记录的离群亮点处理 | `audit/`、`docs/FIREFLY_RECONSTRUCTION.md` |
| CUDA 软件 BVH 原型 | 本机 NVCC 13.0.88 / sm_120 交叉编译与链接成功 | `logs/cuda_compile_status.json`、三份原始编译日志 |
| GPU 数值/性能 | 未执行 | 没有 GPU 渲染、CPU/GPU 一致性或实测吞吐结论 |
| OptiX / RT Core | 未实现 | 当前 CUDA 文件不能描述为 RT Core 加速 |
| 任意场景照片级、自动优化闭环 | 未证明、未完成 | 不能用高分辨率或样本数替代写实质量证据 |

CUDA 12.8.93 在本机 glibc 2.41 的失败不能代表目标 Ubuntu 22.04 / CUDA 12.8 环境会失败。CUDA 13.0.88 本机编译成功也不能代表远端 CUDA 12.8 已验证。目标机器必须使用当地工具链重建。

## 3. 五张 CPU 图的准确参数

全部使用 seed `20261123`，运行记录为 9 个 CPU 线程。耗时受到并行任务和资源争用影响，是当时的单次记录，不是独占机器基准。

| 文件前缀 | 原生尺寸 | spp | 最大深度 | 实测秒数 | 显影曝光 EV |
| --- | --- | --- | --- | --- | --- |
| `CRF_01_Warm_Still_Life` | 2048×2560 | 256 | 12 | 557.21309 | 0 |
| `CRF_02_Sunlit_Interior` | 3072×2048 | 256 | 12 | 1692.9349 | 0.5 |
| `CRF_03_Atelier_Product` | 2048×2560 | 256 | 16 | 508.65089 | 0 |
| `CRF_04_Alpine_Lake` | 3072×2048 | 256 | 10 | 612.78699 | 0 |
| `CRF_05_Wind_Dunes` | 3840×2160 | 192 | 6 | 472.32151 | 0 |

总计 31,363,072 个成图像素、7,498,104,832 条初始相机路径。单次记录耗时合计 3843.90738 秒，不能外推成 GPU 加速比。

五张 PNG 与 PFM/EXR 的 SHA-256 在 `outputs/collection_manifest.json`。预览 JPEG 是缩小图，用于浏览；原生像素比较必须使用原图与 HDR 包。

## 4. 必须保留的质量说明

1. 程序化形体和材质仍有明显简化，特别是山体、树种、植物叶片、家具和纹理规律性。更高 spp 主要降低噪声，不会自动补足真实物体结构。
2. 近似 RGB 光学、单介质状态、理想平滑介电玻璃、有限路径深度和透明直接光可见性处理均有局限。没有光谱色散或完整复杂介质栈。雾是相机距离混合近似，不是完整体积积分。
3. 静物最终显示抑制了 167 个原始像素（0.00319%）的孤立亮点，并保护主可见玻璃/金属表面。原始 PFM/EXR 未改。raw-only 静物显示复现已得到逐字节相同的最终 PNG。
4. 山水独立策略抑制了 2049 个像素（0.032568%），约减少原始估计总亮度的 4.33%。这可能削弱真实但未充分采样的闪光/焦散，是有偏显示重建。建筑、产品与沙丘没有采用该额外处理。
5. 没有与同一真实场景严格配准的摄影参考；不报告“95% 真实度”。已有 Lambert/Beer 检查是基础数值检查，不能推导全积分器物理正确。

## 5. 新增交接文档需要澄清的旧记录差异

这些历史文件保持原样，以下说明用于避免误读：

- `logs/cuda_preparation_status.json` 是早期准备记录，里面的 `NOT_COMPILED_NOT_RUN` 后来被 `logs/cuda_compile_status.json` 的真实编译结果更新；它不是当前总状态。
- `docs/SCENE_FORMAT.md` 有“Camera normal image”表述；源码实际输出 first-hit face-forward **世界空间**法线，再用 `n*0.5+0.5` 编码。depth 是单位射线方向上的距离，不是相机 Z；Gaussian 接口转换按升级方案 `ADAPTER_NOTES.md` 处理。
- 旧的材质色 AOV 没有统一 BRDF 语义：漫反射是反射率，金属是 F0/反射参数，玻璃是每世界单位 Beer transmission。不可直接当统一真实 albedo 监督。
- `README.md` 的示例静物命令为 192 spp / depth 10 / 8 threads，是运行示例。历史交付静物的真实值为 256 spp / depth 12 / 9 threads，以 JSON 为准。
- `tools/run_gpu_workload.sh --full` 的静物输出为 2048×3072，沙丘为 3072×2048，默认 depth 统一为 12；它并不精确复刻上表所有 CPU 参数。要测 CPU/GPU 同条件差异，需要另建一致参数实验配置。
- `run_sources/still_life/` 和 `run_sources/architecture/` 中的场景程序依赖 `scenes/arch_helpers.py`，该辅助文件没有在各自快照文件夹内重复冻结。保留该源文件，生成场景后对照 `source_hashes.json`。单独复制这两个快照子目录不足以运行。
- `run_sources/product/renderer.cpp` 的源码 SHA 不同于最终 `src/renderer.cpp`。产品原始图要使用产品冻结渲染器和冻结 `product.scene`；不能假定最新源码逐位重现早期输出。
- `finish_collection.py` 会生成/更新输出、清单和 run_sources，`package_delivery.py` 会写交付包，两个显示处理入口会写对应 PNG 与审计记录。Codex 接手时不要在历史证据目录无条件重跑这些会更新记录的脚本，应在独立实验副本或新输出目录运行。
- `build_colab_notebook.py` 会把源 ZIP 嵌入 Notebook；原 Notebook 的 cell 未在 GPU 执行。Git 中的 Notebook 是启动材料，不是 GPU 结果。

## 6. 可执行的下一步命令

以下命令是给接手者的操作说明，本次只读审计没有执行它们。工作目录为 `crf_render/`，新渲染结果应存入独立输出目录，不覆盖已有记录。

### 6.1 CPU 小尺寸 smoke

```bash
python3 -m pip install -r requirements.txt
make
mkdir -p outputs/codex_smoke
python3 scenes/still_life.py outputs/codex_smoke/still_life.scene
./crf_render outputs/codex_smoke/still_life.scene outputs/codex_smoke/still_life 160 240 8 124 10 2
python3 tools/develop.py outputs/codex_smoke/still_life --atrous 1
```

这只是编译与执行 smoke，不足以作为高清图复现或照片级质量验收。

### 6.2 产品历史场景的完整参数重算

```bash
mkdir -p outputs/codex_product_replay
g++ -O3 -std=c++17 -fopenmp -DNDEBUG run_sources/product/renderer.cpp -o outputs/codex_product_replay/renderer
outputs/codex_product_replay/renderer run_sources/product/product.scene outputs/codex_product_replay/product 2048 2560 256 20261123 16 9
python3 tools/develop.py outputs/codex_product_replay/product --atrous 3
```

不同编译器、数学库、CPU 浮点行为可能导致细微差异；不要承诺跨机器逐位相同。若生成 EXR，还需要提供 EXR 编码器的 FFmpeg；项目 requirements.txt 仅包含 Python 依赖。

### 6.3 目标 GPU 机器

先执行升级包的只读 `gpu_preflight.py`，核实实际硬件、驱动、CUDA 和 PyTorch，再在目标机使用本地兼容工具链构建旧 CUDA 原型：

```bash
./build_cuda.sh
./tools/run_gpu_workload.sh --smoke
```

仅在数值检查通过且看过 `gpu_preview.png` 后再运行有限完整任务。新 GPU 图像、数值容差、耗时和峰值显存必须使用真实运行记录。`sm_120` 是旧交叉编译目标，不应该在设备型号未核实前一律硬编码。

## 7. 当前源码指纹

本次只读计算与既有记录一致：

| 文件 | SHA-256 |
| --- | --- |
| `src/renderer.cpp` | `b016786233f2360cc5fe419f8d9e58d278cd7ac20d8f6054763dfa0d0db4dc4c` |
| `src/renderer_cuda.cu` | `c411072a90d85467575791b2e5f3b88db3ce8c3ba920ab01ecf43a8f0afaf314` |
| `src/cuda_shared.generated.cuh` | `400d70e894bd5b3e9d3bebb12b2dd3583d39a075c49ca14042acae1bcd8ea562` |
| `run_sources/product/renderer.cpp` | `919f1fd23fd34a933ee8fdc052a8c2e5f8e7c5df6b44e66a26b072ef28851345` |
| `scenes/arch_helpers.py` | `b36a2fe9fc939339b02d5c2a6bbed96450b3ea9f499a7a2d7658f60e0929c6f1` |

现有四个非产品 `source_hashes.json` 所列当前 CPU 源码、场景程序与已生成 `.scene` 的 SHA 均匹配。这里没有重新生成场景，因此只能证明当前文件与记录一致。

## 8. Git 收录与大文件边界

建议提交源码、场景生成器、冻结源码、可复现参数、原始编译/渲染/验收日志、A/B 和显影审计 JSON、所有说明文档、五张图索引、轻量预览以及 Notebook。附带 `legacy_file_selection.json` 提供逐文件建议、字节数和哈希。

约 84 MB 的当前展开场景可由 Python 生成；Git 保留生成器和场景哈希索引。仅产品历史冻结场景建议直接收录，因为它对应首张图的早期版本；也可作为带 SHA 的附件保存。原始 PFM、EXR、全尺寸 PNG、构建二进制和 CUDA 安装工具链不应混进源码提交。它们已有独立交付包，后续若要给 Codex 实际读取，应使用显式附件/资产存储入口，并验证 SHA，不能把索引当成已下载数据。

`logs/finalize_collection.log` 包含上传回执，应排除；`delivery/final_upload_receipt.txt` 和 stderr 也排除。连接状态 JSON 已只包含状态而无账号或连接字符串，可以作为“未连接”的历史事实保留。实际登录信息、临时授权链接与会话缓存不进入提交。

历史日志中 `/workspace/scratch/...` 和 `/opt/codex/...` 是原运行环境路径，用于还原当时执行过程。它们不是新工作区配置，不需要在新机器创建同名目录，也不应批量替换历史日志中的文字。README 与 tools 中绝大多数工作路径是相对路径；重放时以当前实验根为基准。
