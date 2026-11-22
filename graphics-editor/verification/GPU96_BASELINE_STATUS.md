# GPU96 实施基线与验证状态

**当前核对日期：2026-11-22（北京时间）。本文本次发布固定源码检查点为 `55103cc7399cef3bb5eb7d9e7875f3785dedd9cd`，不继续追随源分支的后续提交。**

**当前 quality12 已有实现、参数资产和质量/编辑器证据；“只有设计、没有实现”仅适用于后文保留的历史 f66 快照。** 新开发入口为 [`crf-gpu96-development`](https://github.com/VIONWILLIAMS/complete-representation-functions/tree/crf-gpu96-development)。已有程序仍由 CPU 执行；发布 96GB GPU 技术计划不表示 GPU 管线已经实现或实测。

## 1. 当前固定源码与发布前远端状态

| 项目 | 本次核对值 |
|---|---|
| 发布固定源码提交 | [`55103cc7399cef3bb5eb7d9e7875f3785dedd9cd`](https://github.com/VIONWILLIAMS/complete-representation-functions/commit/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd) |
| 原始 Git tree SHA | `346d3199a254545da9c87de655f49c753e938823` |
| 源分支 | `feat/crf-1.1-learnable-object-functions`，核对时指向 55103 |
| 发布前 `main` / `crf-editor-1.1` | 均为 `a04e7a0e85f997b8040bff85783dda89a768e928` |
| 当前产品标识 | `1.1.0-experimental.2`；quality12 是内部模块编号，不是正式产品 1.2 |
| 相对历史 f66 | 前进 2 个提交、落后 0 个；79 个文件变更 |
| 当前草稿 [PR #1](https://github.com/VIONWILLIAMS/complete-representation-functions/pull/1) | open / draft / 未合并，目标为 `crf-editor-1.1`；5 个提交、133 个变更文件 |

新增提交按依赖顺序为：

1. [`576d1e4a6ddf564c6fc3501861c57faa0ca7baa8`](https://github.com/VIONWILLIAMS/complete-representation-functions/commit/576d1e4a6ddf564c6fc3501861c57faa0ca7baa8)：实现 quality12 参考重建、编辑工作台与相应证据，父提交是 f66。
2. [`55103cc7399cef3bb5eb7d9e7875f3785dedd9cd`](https://github.com/VIONWILLIAMS/complete-representation-functions/commit/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd)：仅新增 quality13 细节质量合同及计划，父提交是 576d1e4；没有把该新合同的目标标为实测完成。

Git tree 来自 GitHub Git commit API 的原始 `tree.sha`。55103 递归 tree 共 2,326 个条目，`truncated:false`。此前 f66 的 tree、PR 和 CI 审计保留在本文历史附录，不再作为当前能力或文件缺失结论。

用户 HTML 报告引用的 `0325a1c15f4259732fa49afccba51c956c2c918b` / `9c6ecd6fc56fb3a6520c22951867c0437cea52b7` 在早先查询中未能由本仓库解析；55103 tree 中仍没有该报告描述的 `experiment12/` 或 `reports/v12/`。本次新增的 `reports/quality12/` 不能与该报告的本地陶杯/订书机实验混为一套证据。

## 2. quality12 当前实现与已记录结果

固定快照入口：[README_QUALITY.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_QUALITY.md)、[DELIVERY.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/reports/quality12/DELIVERY.md)、[acceptance.json](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/reports/quality12/acceptance.json)。

新增真实实现包括 Python 拟合器、Node/浏览器共用的纯参数 JS 求值器、Worker、质量工作台、限定调色与视口提案的 Harness、PNG/工程重放、二维镜头视频导出及测试。主要源文件为：

- `graphics-editor/editor/fitting/quality12.py`
- `graphics-editor/editor/scripts/fit_quality12.py`
- `graphics-editor/editor/web/crf-quality12.js`
- `graphics-editor/editor/web/quality-harness12.js`
- `graphics-editor/editor/web/quality-worker12.js`
- `graphics-editor/editor/web/quality-editor12.js`
- `graphics-editor/editor/web/quality12.html`

[quality12.json](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/contracts/quality12.json) 与 f66 中的内容逐字相同，Git blob SHA 均为 `a4ebd150514f0ebc9f3d1bcbb7e324ebf8749c50`，合同 SHA-256 为 `3cdd4ed7c25d91bd8eb78c435816154b79038008e397db94b5ae5fc589734ab8`。参考及门槛没有因新增实现而改变。

当前 acceptance 状态是 `passed_for_declared_reference_quality_scope`。下列为**读取到的仓库运行记录**，本次发布整理没有重新运行这些实验：

| 已记录项目 | 结果与适用范围 |
|---|---|
| 冻结 Alpine 全帧 800×531 | PSNR 36.6677525 dB、SSIM 0.9728077、MAE 2.1342954/255；通过原全帧合同。 |
| 固定山林、水面、岸边建筑 ROI | 三处均通过原冻结 SSIM/MAE 门槛；全帧最大通道误差仍为 80/255。 |
| 参数重放 | 序列化后无源参考输入，Python/JS 全部 RGBA 相同；[独立图像指标复算](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/reports/quality12/review/independent-audit.json)匹配报告。 |
| 实际浏览器制品 | 原生、2×、编辑后、重开后 PNG 与独立 Node 求值的 RGBA 相同；工程与反馈可重开。 |
| 视频 | VP9、800×531、120 帧、24 fps、5 秒；为固定内容的显式二维视口变化。 |
| 测试 | 187 项 JavaScript、9 项 Python；与历史 v11 的 166 项记录分开保留。 |
| 构建 | 261,718,865 bytes；250 MiB 上限 262,144,000 bytes，余量 **425,135 bytes**。 |
| 兼容 | 885 个历史文件、901 个公共文件及 9 个旧归档保留原字节；详细范围以构建/归档记录为准。 |
| 真实 LLM 调用 | 本轮记录为 **0 次**；代码提案与手工参数编辑不是 LLM 自主创作证据。 |

当前结果使用 65,536 个二维高斯、524,291 个标量；理论 Float32 参数存储约原 RGB8 的 1.65 倍，公开 JSON 约为 4.18 倍。同函数数量下，联合优化前后 PSNR 29.5831→36.6678 dB，但增加了优化计算；约 48.54 秒的拟合耗时是该记录的 CPU 结果，不能解释成等时间加速或 GPU 性能。

这是对既有真实观察的连续函数外观重建。参考中的几何投影、原有光照、背景和倒影仍编码在同一颜色场中。source-free 重放、全帧数值质量通过和可编辑参数，均不自动证明对象结构分解、物理换光、未见新场景生成、局部小网络泛化或程序级 RSI。2×重采样也不恢复 800 像素参考中未包含的高分辨率信息。

### 当前 CI 事实

55103 上两个 `CRF Verification` 工作流均为 completed / success：

- [push run 44994217395](https://github.com/VIONWILLIAMS/complete-representation-functions/actions/runs/44994217395)，更新时间北京时间 2026-11-22 14:35:12。
- [PR run 44994221619](https://github.com/VIONWILLIAMS/complete-representation-functions/actions/runs/44994221619)，更新时间北京时间 2026-11-22 14:35:07。

[当前 workflow](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/.github/workflows/test.yml) 包含根测试/claim 路径校验、编辑器 base/v10/v11/quality JS 测试、quality12 Python 测试及构建。CI 成功不能替代独立视觉评审、GPU 实测、形式证明或程序 RSI；浏览器与图像验收分别以各自制品记录为证据。

## 3. quality13：新增冻结合同，尚无本轮交付结果

固定链接：[quality13.json](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/contracts/quality13.json)、[CRF_1_1_Detail_Quality_Iteration.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/plans/CRF_1_1_Detail_Quality_Iteration.md)。

合同状态为 `frozen_before_new_fits`，范围为各声明来源尺寸上的有限观察条件重建，**不是正式 CRF 1.3、未知场景生成或物理换光**。55103 tree 中仅有该 quality13 合同与上述计划，未见 quality13 实现、`quality-packs/` 或该轮已通过结果。

| 冻结场景 | 必须直接拟合/评估的尺寸 | 总函数预算 | 冻结 ROI |
|---|---:|---:|---|
| Alpine HD 山林湖泊 | 1280×850 | 196,608 | 树林、水面、岸边建筑 |
| Street 建筑与信号灯 | 667×1000 | 98,304 | 信号灯、墙面、斑马线 |
| Orchard 果皮与高光 | 800×600 | 65,536 | 苹果、梨、接触区域 |

所有来源路径、文件 SHA-256、尺寸和 ROI 均提前固定。全帧必须同时满足：

- PSNR ≥35 dB；
- SSIM ≥0.97；
- MAE ≤3/255；
- 99 分位通道绝对误差 ≤18/255；
- 任一通道误差 >32/255 的像素比例 ≤0.003。

每个 ROI 另须 SSIM ≥0.93、MAE ≤5/255。拟合及评估禁止继续缩小声明尺寸；最小 sigma 仍为 0.35 源像素，总基函数上限 262,144。没有源 RGB 或残差栅格嵌入。

合同的“完整分辨率”指各自明确声明的观察文件。1280×850 Alpine 来源不是 9528 像素相机原图，街景/水果亦为既有 canonical 参考。原生 1280×850 的完整 2×输出为 4,352,000 像素，会超过既有 4,000,000 像素上限，计划要求明确拒绝；局部或较小倍率仍须检查预算。

预算声明为 CPU 数值拟合，每场景最多 3 次拟合尝试；新旧算法以同最终函数数量比较，记录不等的实际耗时，不宣称等时加速。计划提出的新大参数包应与受 250 MiB 约束的历史托管资源包分开；这些是后续实施要求，不是已有 GPU/高分辨率交付。

## 4. 从新开发分支启动当前可用工作台

需 Node.js **22 或以上**。首次使用：

```bash
git clone --branch crf-gpu96-development https://github.com/VIONWILLIAMS/complete-representation-functions.git
cd complete-representation-functions/graphics-editor/editor
npm ci
npm run dev:quality
```

打开 <http://127.0.0.1:4173/quality12.html>。此入口直接运行当前质量工作台，浏览/渲染已交付资产无需 Python、GPU 或模型 API 密钥。端口占用时运行：

```bash
node ../tools/start11.mjs --quality --port 4174
```

上一轮对象函数学习工作台仍可通过 `npm run dev:v11` 和 <http://127.0.0.1:4173/studio11.html> 使用。二者均不是 GPU worker 启动命令。

新分支阅读入口：[README](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/README.md)、[README_QUALITY](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/README_QUALITY.md)、[README_1_1](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/README_1_1.md)、[AGENTS](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/AGENTS.md)。

可用的额外验证入口为 `npm run test:quality`、`npm run verify:quality`、`python3 tests/test_quality12.py`；Python 拟合/测试和构建的依赖分别按 `requirements.txt` / `requirements-build.txt` 安装。完整启动、重拟合、浏览器与构建说明见当前 README_QUALITY。本次没有重新跑上述验证。

## 5. 对 96GB 开发计划的实际影响

新起点已经具备合格的单参考连续颜色场重建、参数求值与质量工作台，可以承接为对照基线；后续计划无需重做“quality12 从无到有”，也不能把它提升为尚未具备的对象结构、材质/光照分离或生成能力。

现有 acceptance 明确 `newSceneGeneration:not_evaluated`、`smallNetworkGeneralization:not_established`、`physicalRelighting:false`、`naturalDynamics:false`、`formalProof:not_implemented`、`programRSI:false`、`fullCRF11PlanAcceptance:false`。当前 tree 没有 GPU/CUDA/96GB 相关实现路径，也没有 RTX PRO 6000 96GB 或 Mac mini M4 的新实测证据。

完整 1.1 的四项条件——计算内核改善、证明层有效、真实程序 RSI 收益、编辑器可运行——仍需同时成立。GPU 开发应固定本次检查点与真实质量基线，新增 CPU/GPU 语义一致性、对象结构与材质干预、多对象新场景、细节/视频一致性等独立验收。2.5D 和显式原生空间函数的边界仍按整合计划执行；算力不会补齐单图中缺失的观测。

## 6. 历史审计附录：f66 快照

**本节完整保留之前 f66 审计的正文。其“当前”“未实现”“实施起点”等表述均指当时 f66 状态，不能用于判断 55103 的当前文件是否存在。当前实现、指标、构建余量和启动入口以上文为准。**

<details>
<summary>展开 f66 历史快照（原审计内容）</summary>

审计日期：2026-11-22（北京时间；引用的 GitHub 原始时间戳保留 UTC）。本文记录本次 96GB GPU 方案整合**发布前**实际读取到的 GitHub 状态，并区分已有实现、历史运行记录、未同步报告与后续工作。发布本文件与技术计划本身不会改变任何能力的验收状态。

**实施起点为 `f66a3e35b1501ef0172b859351a42aa4c03230ee`，新开发入口为 [`crf-gpu96-development`](https://github.com/VIONWILLIAMS/complete-representation-functions/tree/crf-gpu96-development)。现有可运行程序仍是 CPU JavaScript + Worker 的对象函数实验版；96GB GPU 管线尚待实现和实测。**

### 1. 已核对的仓库与提交

仓库：[`VIONWILLIAMS/complete-representation-functions`](https://github.com/VIONWILLIAMS/complete-representation-functions)。

| 发布前远端分支 | 实际 HEAD | 用途与边界 |
|---|---|---|
| `main` | `a04e7a0e85f997b8040bff85783dda89a768e928` | 完整产品 1.0 基线和 1.1 开发工作区入口；该提交不宣称正式 1.1 验收通过。 |
| `crf-editor-1.1` | `a04e7a0e85f997b8040bff85783dda89a768e928` | 与当时 main 相同的开发交接基线。 |
| `feat/crf-1.1-learnable-object-functions` | `f66a3e35b1501ef0172b859351a42aa4c03230ee` | 当前已同步的对象函数实现与后续质量合同；本次 GPU 开发从此处承接。 |

上述 main 状态是发布前快照；整合文档发布后 main 的 HEAD 可以前进，不能因此将历史审计中的 SHA 改成新的实现证据。

- [a04 基线提交](https://github.com/VIONWILLIAMS/complete-representation-functions/commit/a04e7a0e85f997b8040bff85783dda89a768e928)的 Git tree 为 `9db085a83b58f36c105006fc7522c60f65fd630e`。
- [f66 实施起点](https://github.com/VIONWILLIAMS/complete-representation-functions/commit/f66a3e35b1501ef0172b859351a42aa4c03230ee)的 Git tree 为 `c7c6727ecd7e9326c059137b59b0e60c5dcc9c32`。
- f66 相对 a04 领先 3 个提交、落后 0 个，共变更 61 个文件。顺序为 `bed93d8` 冻结对象函数设计、`bd1e99b` 实现对象学习/CPU 内核/工作台、`f66a3e3` 冻结第二轮视觉质量设计与合同。
- 审计时 [PR #1](https://github.com/VIONWILLIAMS/complete-representation-functions/pull/1) 为 open、draft、未合并，目标分支是 `crf-editor-1.1`；其存在不代表 main 已包含功能分支代码。

Git tree SHA 来自 GitHub Git commit API 的原始 `tree.sha`。递归读取 f66 tree 返回 2,248 个条目，`truncated:false`；以下“文件尚不存在”的判断限定在该快照。

### 2. 版本名称与 1.2 报告来源

| 名称 | 本次确认的含义 |
|---|---|
| 历史 `0.10.0 / v10` | 产品 1.0，保留历史页面、案例、资产及证据。 |
| `1.1.0-experimental.1` | f66 中已落地的可学习对象函数、共享 CPU 内核与工作台。 |
| `quality12` / `1.1.0-experimental.2` | 第二轮参考重建的内部模块编号、技术设计与冻结质量合同；不是完整产品 1.2 的交付声明。 |
| 用户提交的《CRF 1.2 技术完成报告》 | 另一个本地实验的报告材料；其引用源码尚不能由当前仓库重放。 |

报告中的两条提交分别为 `0325a1c15f4259732fa49afccba51c956c2c918b`（本地 1.2 实验）和 `9c6ecd6fc56fb3a6520c22951867c0437cea52b7`（报告所称 1.1 基线）。审计时，本仓库 Git commit API 对二者均返回 404，普通 commit 查询均返回 422 / No commit found。**这说明这些 SHA 在本仓库中当时无法解析，不能宣称其源代码已经同步；不据此否认用户本地实验的存在。**

原报告文件名为 `CRF-1.2-技术完成报告.html`，大小 **1,000,756 bytes**，SHA-256：

```text
6fa80548726ca6e9597a5d7e67f9d30edeed4e7c12dfdd85d797b446803a9626
```

原 HTML 包含 7 个互不重复的内嵌媒体资源（JPEG 1、PNG 4、MP4 2）及 17 个可展开记录块。归档文本与原文件摘要用于追溯报告来源，不替代其缺失的源码、依赖、原始运行环境和可重放证据。报告描述的陶杯/订书机实验不得计入 f66 的已验证能力；取得对应代码并完成来源对齐后再单独评审与合并。

### 3. 当前可以承接的真实实现

实现依据为 f66 固定快照中的 [README_1_1](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/f66a3e35b1501ef0172b859351a42aa4c03230ee/graphics-editor/README_1_1.md)、[DELIVERY](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/f66a3e35b1501ef0172b859351a42aa4c03230ee/graphics-editor/editor/docs/v11/DELIVERY.md) 与其源文件。

| 层次 | 已有实现 | 应保持的解释边界 |
|---|---|---|
| 程序表示 | 不可变函数版本、可执行 Scene/Patch IR、固定引用及预算检查。 | 可编辑表示本身不保证 LLM 总能合成高质量新场景。 |
| 对象学习 | 显式函数、历史高斯适配器、真实局部坐标网络；Fourier 特征、有限实例条件、两层 tanh、RGB sigmoid、Adam 训练。 | 单图或有限实例外观重建不是未知对象类别生成。裁剪不是自动分割，网络权重仍可能记住参考外观。 |
| 计算内核 | CPU JavaScript + Worker；直接求值与由函数生成的 64×64 缓存预览；颜色与 alpha 在同一采样位置计算、在线性 RGB 中预乘合成。 | 函数缓存是有误差的近似；不是 WebGPU/CUDA 实现。渲染时不读取源 RGB，不等于已分离几何、材质和光照。 |
| Agent Harness | 轻量函数目录、模型适配器、候选检查、作用域控制与运行记录。 | 适配器存在、真实供应商调用成功、生成质量达标是三项独立证据。 |
| 工作台与导出 | 参考/训练/函数入库、对象与 JSON 编辑、人工反馈、保存重开、PNG 和 WebM。 | 当前视频主要为固定外观的显式二维运动；不代表学习了自然动力学或真实三维新视角。 |

现有学习链路可以把真实参考转成可重放函数；要进一步得到可移植的对象结构、独立材质和可预测换光，仍需新表示、干预实验及独立数据验证。资产复用、参数修改和权重训练均不能直接计作程序级 RSI 晋升。

### 4. 已有证据与尚未验证事项

#### 4.1 仓库记录了什么

[acceptance.json](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/f66a3e35b1501ef0172b859351a42aa4c03230ee/graphics-editor/editor/reports/v11/acceptance.json) 的记录时间为 `2026-11-22T04:45:15.771878+00:00`，状态为 `implemented_scope_verified_for_branch_review`。下列数值是**读取到的既有运行记录**，不是本次整理文档时重新执行的结果：

- Node 测试 166 项通过、0 失败、0 跳过；包含 base 52、v10 64、v11 50。
- 实际浏览器工作流通过；下载 PNG 重放为 exactRGBA，重开工程 PNG 为 exactFileAndRGBA。
- 视频记录为 VP9、640×480、120 帧、24 fps、5 秒。
- 3 次网络参考下载、4 个计算对照案例；885 个历史资产按原字节保留。
- 构建展开体积 261,220,779 bytes，250 MiB 上限为 262,144,000 bytes，仅余 923,221 bytes。新增 GPU 依赖、模型与媒体需要独立规划存储，不能直接塞入原应用包。
- 根级 claim 校验检查了 11 个证据路径；报告明确 `claimTruthProved:false`，不能将路径存在性当作定理证明。

该报告生成时尚无 GitHub Actions 结果；后续读取到 f66 的 [push 工作流](https://github.com/VIONWILLIAMS/complete-representation-functions/actions/runs/44988585065) 与 [PR 工作流](https://github.com/VIONWILLIAMS/complete-representation-functions/actions/runs/44988590455) 均 completed / success。此后续 CI 事实不回写成早期报告已经运行，也不扩大其测试覆盖范围。

报告保留了早期无头 Playwright 启动失败，另记录实际浏览器操作与制品验收；两种证据不能互换。最终 CSS 换行修正由后续浏览器和构建检查覆盖，报告说明 JavaScript 在最终回归后未改变。

#### 4.2 尚不能宣称完成

| 项目 | 基线状态及后续要求 |
|---|---|
| RTX PRO 6000 96GB / CUDA / WebGPU | f66 无对应 GPU 实现或设备实测记录。需实现后记录设备、驱动、精度、显存峰值、耗时与 CPU 对照。 |
| Mac mini M4 / Windows | 目标机器未测试；不能把已有运行环境的结果外推成用户设备性能。 |
| 真实供应商任务 | 已有验收记录为缺少凭据、未执行；GUI 和适配器可用不等于真实 LLM 工作流通过。 |
| 形式证明 | 未实现；需对明确语义、前提和误差界提供可检查证明，不能用有限样例测试代替。 |
| 程序级 RSI | 未执行；需实际候选程序、保留基线、独立评估、净收益与晋升/回滚证据。 |
| 泛化与照片质量 | 未评估独立来源泛化、独立人工视觉评审；当前证据不能证明任意文字的真实场景生成。 |
| 材质、光照、几何分离 | 外观网络本身没有提供可辨识分解。源图像素不参与渲染，也不能排除其照明/背景已被权重记住。 |
| 空间与视频物理一致性 | 原生空间查询、离屏可见性、反射/透射/多次间接光、动态场和跨帧细节一致性均需要各自实现与验收。 |

完整 1.1 的四条件仍是：**计算内核改善、证明层有效、真实程序 RSI 收益、编辑器可运行同时成立。**现有 CPU 与编辑器证据提供实施基础；形式证明和程序 RSI 等缺口使完整验收仍未成立。96GB 显存本身不补足表示缺口、缺失观测或单图隐藏结构的不确定性。

### 5. `quality12` 的确切状态

已有文件为 [第二轮视觉质量设计](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/f66a3e35b1501ef0172b859351a42aa4c03230ee/graphics-editor/plans/CRF_1_1_Visual_Quality_Iteration.md) 与 [冻结合同 quality12.json](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/f66a3e35b1501ef0172b859351a42aa4c03230ee/graphics-editor/editor/contracts/quality12.json)。

合同冻结的是单一 800×531 参考图在原生尺寸下的图像平面有符号各向异性高斯颜色场重建，设定 PSNR / SSIM / MAE 目标及采样、基函数和预算限制。指标是待达成目标，不能写成已经测得。

f66 的完整 tree 中没有 `fitting/quality12.py`、`scripts/fit_quality12.py`、`web/crf-quality12.js`、`web/quality-worker12.js` 或 `web/quality12.html`，也没有报告所述 `experiment12/`、`reports/v12/` 目录。因此当前只能认定 **quality12 已有设计和合同，未见其实现与实测交付**。

新 GPU/4K/新场景任务应建立带新版本的合同与运行证据；保留旧合同原义，不通过降低旧阈值或扩张旧名称来制造完成状态。参考重建、参考辅助新构图、纯文字通用生成需要分别验收。

### 6. 新开发分支的实际启动入口

以下命令运行的是继承的 CPU 对象函数工作台。开发分支中的 GPU 技术计划不意味着这些命令已经启动 GPU worker。需 Node.js **22 或以上**。

```bash
git clone --branch crf-gpu96-development https://github.com/VIONWILLIAMS/complete-representation-functions.git
cd complete-representation-functions/graphics-editor/editor
npm ci
npm run dev:v11
```

浏览器打开 <http://127.0.0.1:4173/studio11.html>。保持终端运行，Control+C 停止。端口占用时，在同一目录运行 `node ../tools/start11.mjs --port 4174`。不要直接以 `file://` 打开工作台 HTML。

已有 checkout 应先保存当前工作，再执行 `git fetch origin` 和 `git switch crf-gpu96-development`，然后进入 `graphics-editor/editor/` 安装并启动；本流程不需要清空已有工作区。

| 新分支入口 | 用途 |
|---|---|
| [README](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/README.md) | 本次整合计划与开发总入口。 |
| [graphics-editor/README_1_1.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/README_1_1.md) | 完整本地启动、学习、编辑、保存与导出说明。 |
| [graphics-editor/AGENTS.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/AGENTS.md) | 开发指令、保留要求与本轮范围说明。 |
| [crf-core11.js](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/editor/web/crf-core11.js) | 当前 CPU 函数内核与 Scene/Patch 语义。 |
| [learn11.js](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/editor/web/learn11.js) | 当前真实局部网络训练实现。 |
| [reports/v11](https://github.com/VIONWILLIAMS/complete-representation-functions/tree/crf-gpu96-development/graphics-editor/editor/reports/v11) | 继承的训练、计算、浏览器与构建证据。 |

无需模型密钥即可进行手工编辑、参考导入、本地训练和导出。自然语言 Agent 任务需要服务环境中的 `DEEPSEEK_API_KEY`；服务不会自动读取 `.env`。提供变量名不是提供密钥，也不是供应商调用已验证的声明。

以下为可用的回归命令，均在 `graphics-editor/editor/` 执行；本次文档整合不把它们标作重新跑过：

```bash
npm test
npm run test:v10
npm run test:v11
npm run build
```

浏览器集成命令为 `npm run verify:browser:v11`，其 Playwright、Chromium、ffmpeg、ffprobe 需在验证环境另外准备。运行失败应保留实际失败原因。

### 7. 96GB 开发承接规则

1. 固定 f66 源码起点和新的方案提交，先建立 CPU/GPU 相同语义、参数、采样与误差预算的可对照实现；每次能力声明绑定实际源码与运行制品。
2. 第一阶段使用 CRF 原生局部深度/法线及材质函数完成可控 2.5D；准确离屏反射、透射和多次间接光以显式原生空间查询扩展为前提。单图未观测的背面、遮挡内部和光照歧义必须保留不确定性。
3. 本轮明确允许对象级局部小网络训练与原生空间函数扩展，保持 LLM 写程序、CRF 内核直接产生像素的路线。旧快照中笼统禁止训练的历史条款应与本次明确范围修订区分；不据此把训练资产或图像记忆冒充结构重用、程序 RSI 或未知场景生成。
4. 第一项真实对象里程碑之后，至少完成一次多对象新场景组合；独立验证材质/几何/光照干预、接触/遮挡、细节与视频一致性。具体阶段、指标和资源预算以本次整合技术计划为准。
5. 在取得报告引用的 1.2 源码前，报告继续作为有来源的材料。若后续取得，先对比 f66 的表示与依赖、重放原证据，再决定迁移哪些实现；不把未获取的提交当作现有依赖。


</details>
