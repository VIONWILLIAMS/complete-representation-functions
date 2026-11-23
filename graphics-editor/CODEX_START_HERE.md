# Codex 从这里开始：CRF 整体开发与 96 GB GPU 升级

**任务是实现和验证产品能力。请直接进入开发，不要把重新编写计划作为本次任务的完成结果。**

## 2026-11-23 补充：Gaussian 世界研究交接

本次新增 [Gaussian 世界接手任务](research/gaussian-world/CODEX_HANDOFF.md)、[完整工作记录](research/gaussian-world/WORK_LOG.md) 和 [研究与实验目录](research/gaussian-world/README.md)。它们位于从 `crf-gpu96-development@c2b759b9d9d0ee56ccef7a47dbe540f80c07d952` 派生的 `codex/gaussian-world-handoff-20261123` 交接分支；合入前要使用包含这次交接提交的工作树。

该目录提供独立 CPU 渲染样片、CUDA 本机交叉编译记录，以及尚未训练/渲染的 Gaussian 夹具与技术路线。主应用仍在 `editor/`，下文的整体任务、quality12/quality13、证明/RSI/WebGPU 责任全部保留。研究文件 `v0.1/v0.2` 不改变产品版本；独立 C++ 实验不代表已有工作台完成 GPU 或三维 Gaussian 集成。E0–E6 实验编号已映射到现有 GPU-T 任务，不另立唯一活动任务账本。

## 1. 选择正确的仓库与开发分支

| 项目 | 本轮固定值 |
| --- | --- |
| 唯一仓库 | `VIONWILLIAMS/complete-representation-functions` |
| 开发分支 | `crf-gpu96-development` |
| 已核对的源码基线 | `55103cc7399cef3bb5eb7d9e7875f3785dedd9cd` |
| 应用目录 | `graphics-editor/editor/` |
| 基线产品状态 | `1.1.0-experimental.2`：对象函数、CPU 内核、GUI，以及已实现的 quality12 真实参考重建、编辑和导出；仓库有质量/浏览器验收报告，本次仍须复现。另有 quality13 冻结设计与合同，须继承并核对实施状态 |

`main` 同步了完整计划，便于阅读，但其应用代码仍是恢复的产品 1.0。**执行本轮开发必须选择 `crf-gpu96-development`，不能在 `main` 的旧应用上运行后称已复现最新基线。** 发布计划后的开发分支 HEAD 可以比上述基线更新；应验证基线是当前开发历史的一部分，而非要求 HEAD 永远等于基线。

先检查工作区、当前分支、HEAD 与远端仓库身份，保护用户现有未提交修改；必要时建立隔离 worktree。可在仓库根目录执行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 55103cc7399cef3bb5eb7d9e7875f3785dedd9cd HEAD
```

最后一条命令成功表示祖先关系成立；浅克隆缺少历史时先取得所需历史再核对。分支、源码或历史不匹配时记录具体差异并定位正确工作树，不能用 1.0 替代。

用户提供的 1.2 报告引用 `0325a1c15f4259732fa49afccba51c956c2c918b` 与 `9c6ecd6fc56fb3a6520c22951867c0437cea52b7`；本次发布核查未在该 GitHub 仓库取得这些提交。报告可用于追溯研究目标，不能视为本分支已有的 1.2 源码或已复现结果。旧方案的版本设想与实验提交引用应结合基线状态文件解释。

## 2. 按此顺序读取

以下路径除根 `AGENTS.md` 外均相对 `graphics-editor/`：

1. [仓库根 AGENTS.md](../AGENTS.md) 和 [应用 AGENTS.md](AGENTS.md)。
2. [GPU96 基线状态](verification/GPU96_BASELINE_STATUS.md)。
3. [整体开发计划](plans/CRF_Integrated_Development_Plan.md)。
4. [整体执行计划 JSON](plans/CRF_Integrated_Execution_Plan.json)。
5. [96 GB GPU 技术方案](plans/CRF_96GB_GPU_Technical_Plan.md)。
6. 原 [1.1 实施计划](plans/CRF_1_1_Implementation_Plan.md) 与 [1.1 执行计划 JSON](plans/CRF_1_1_Execution_Plan.json)。
7. [1.1 对象函数启动说明](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_1_1.md)，开发分支内路径为 `README_1_1.md`。
8. [1.1 对象函数历史交付报告](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/docs/v11/DELIVERY.md)，开发分支内路径为 `editor/docs/v11/DELIVERY.md`。
9. [quality12 冻结合同](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/contracts/quality12.json)，开发分支内路径为 `editor/contracts/quality12.json`。
10. [当前质量工作台说明](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_QUALITY.md) 与 [quality12 验收索引](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/reports/quality12/acceptance.json)，分支内路径分别为 `README_QUALITY.md`、`editor/reports/quality12/acceptance.json`；继续读取索引关联的质量、独立重放与浏览器证据。
11. [quality13 冻结合同](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/contracts/quality13.json)，分支内路径为 `editor/contracts/quality13.json`。
12. [高分辨率与细节迭代计划](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/plans/CRF_1_1_Detail_Quality_Iteration.md)，分支内路径为 `plans/CRF_1_1_Detail_Quality_Iteration.md`。

最后执行 [CODEX_HANDOFF_PROMPT.md](CODEX_HANDOFF_PROMPT.md) 的完整开发任务。整体计划协调本轮范围与依赖，GPU 技术方案保留详细算法、显存、质量与测量要求；原 1.1 的证明、RSI 和编辑器责任继续保留。历史交付报告中的“已通过”只描述其当时的具体运行，不能替代本次复现。

统一使用 `GPU-M0`–`GPU-M6` 标识新增 GPU 阶段；原 1.1 阶段引用为 `V11-M0`–`V11-M5`，任务引用为 `V11-T00`–`V11-T26`。原文件内部的 `M0`、`T00` 等标识保留，跨计划记录时加前缀，避免把两组里程碑混为一组。

原 `V11-T19` 的 WebGPU 要求仍单独列项和验收；新增 CUDA 后端不自动完成或撤销该子项。

## 3. 实际可用的启动和复现命令

按 [README_QUALITY.md](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_QUALITY.md) 使用 Node.js 22 或以上。从**仓库根目录**运行：

```bash
cd graphics-editor/editor
npm ci
npm run dev:quality
```

当前质量工作台地址：<http://127.0.0.1:4173/quality12.html>，对象函数入口仍为 `/studio11.html`，历史案例为 `/studio10.html`。已有 `npm run dev:v11` 仍可启动对象函数入口。保持一个服务终端运行；回归命令在另一终端的 `graphics-editor/editor/` 中执行：

```bash
npm run test:quality
npm run verify:quality
npm run test:v11
npm test
npm run test:v10
```

完整质量复核与构建按当前质量说明准备 Python、NumPy、SciPy、Pillow、编译器及构建依赖；仅浏览/重放已交付参数不要求重新拟合。以下均为现有命令：

```bash
python3 -m pip install -r requirements.txt -r requirements-build.txt
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=2 python3 tests/test_quality12.py
python3 scripts/review_quality12.py
node scripts/verify_browser_quality12.cjs
npm run build
```

`verify_browser_quality12.cjs` 检查已有浏览器下载制品；本轮真实 GUI 操作与新导出另行保存证据，不能仅重读旧制品就记作本轮浏览器流程完成。已有 `npm run fit:quality` 调用 `scripts/fit_quality12.py`，重拟合时按 `README_QUALITY.md` 与 `editor/reports/quality12/FITTING.md` 提供输入、输出和预算，不假定空参数即可执行。

同目录还已有以下对象函数实验命令，可按基线复现需要执行并保存本次结果：

```bash
npm run train:v11
npm run benchmark:v11
npm run verify:browser:v11
```

浏览器集成脚本另需 Playwright、Chromium、ffmpeg、ffprobe；具体依赖和 `CRF_CHROMIUM_PATH` 见原启动说明。缺少依赖或环境阻止浏览器启动时记录实际失败，继续完成可运行的检查。基础训练、手工编辑与导出可以独立于外部模型调用进行。

这些命令启动或验证的是现有 CPU 实验版，包括已经交付的 quality12。其验收索引记录了声明参考上的通过结果及浏览器制品，当前交接状态为“已实现、有既有证据、本次待复现”，不能仍当成待从零编写的模块。复用现有拟合器、参数求值器、Harness、GUI 与资产，基于实际差距增量开发；新结果单独记录，保留原始报告。

**当前说明没有预设任何已经存在的 GPU CLI、CUDA 服务或远端 GPU 连接。** 新 GPU 入口须在实现后提供真实脚本、帮助、测试和复现命令；不能在文档中先写一个不存在的命令再把它当作已接通。

## 4. 第一批必须产生的代码与证据

先完成基线核对与复现，再交付以下相互连接的实现：

1. **真实计算后端接口。** 接续现有 Scene/函数资产、版本、色彩和采样语义，区分 CPU 参考与 CUDA 后端。状态接口返回实际能力和不可用原因。
2. **至少一个真实 CUDA 核心路径。** 优先选择实测的拟合或渲染热点，例如覆盖与颜色联合求值、分块高斯累积或损失归约。它必须参与实际输出，不能只是空接口、GPU 名称探测或无用张量运算。
3. **CPU/GPU 差分入口。** 固定输入、种子、色彩、采样、预算与误差合同；保留独立 CPU 参考、逐例结果和失败输出。分别报告 GPU 阶段计时与端到端耗时。
4. **显存账本与预算接口。** 以 bytes 记录设备可见总量、设备使用量、allocated、reserved、框架外缓冲、有效资产/任务归属及峰值；allocated 已包含于 reserved，不得相加。默认至少 10% 余量，并计入新旧资产同时驻留和临时峰值。
5. **可重放的开发记录。** 提交实际运行命令、代码与输入摘要、输出、环境、通过/失败/未测状态，并说明这些实现怎样进入现有工作台。

若尚无服务器接入，继续实现真实后端代码、CPU 参考、资源模型、接口、失败处理及能独立执行的测试。将需要设备的差分、性能、显存与稳定性结果标为 `not_run` 或明确阻塞；CPU 回退不能冒充 CUDA 成功。代码已提交与 `GPU-M0/GPU-M1` 实测通过是不同状态。

## 5. 后续范围和完成判据

持续推进 `GPU-M0`–`GPU-M6`：设备与合同、GPU 原算法、对象与材质、整卡调度、真实场景与原生 4K、必要的空间光传输、RSI 与正式封存。与 `V11-*` 依赖并行推进，最终汇合为同一条真实用户流程：工作台创建/载入场景 → 修改对象几何、材质或光源 → 实际任务与渐进预览 → 取消/恢复 → 原生图片或视频 → 保存、重开和继续编辑 → 查看绑定本次输出的证据。

基础语言/视觉模型保持冻结；允许逐对象、逐观察、逐资产的小网络训练，记录来源、参数、权重、成本和适用域，该优化属于 L0。程序级 L2 RSI 必须有结构变更、真实执行、冻结评价、晋升与新任务继承。形式证明、有限检查、数值测量、模型意见和人工评价分别报告。

`quality12.json` 的 `maxOutputPixels=4000000`，而 3840×2160 为 8,294,400 像素。保留其已实现的 800×531 参考任务、质量门槛、资源合同和结果；为 GPU 原生 4K 建立独立、预先冻结的合同和新证据。不能通过修改旧合同、缩小评价图或放大旧输出完成 4K 验收。

同时继承 quality13 的冻结计划与合同，保持 `noDownsampleDuringFitOrEvaluation:true`、各来源摘要/尺寸、函数预算、ROI 和残差尾部门槛。当前声明的原尺寸分别为 Alpine 1280×850、街景 667×1000、水果 800×600；Alpine 合同明确只覆盖已下载的 1280px 观察，不能冒称 9528px 相机原图。quality13 的设计/合同存在不等于其实现和验收通过，须逐项核对并完成对应任务。GPU 4K 目标与原图质量目标独立保留；任何用户指定或后续冻结的原图大于 4K 时，不得缩成 4K 充作原图任务完成。超过旧运行时上限应采用明确的新合同与分块执行，或报告阻塞，不静默降低尺寸。`quality12`/`quality13` 是内部模块名，不能据此宣称产品 1.2/1.3 已完成。

整卡使用以有效画质、吞吐、缓存复用和工作集收益衡量，不以填满显存或固定利用率作为成绩。保留 17 个历史入口和原资源。最终完成须同时满足计算内核改善、证明层有效、真实程序 RSI 收益、编辑器可运行，并逐项完成本轮 GPU 与质量合同；必要项未通过时保持候选状态。

按已有授权持续开发，无需逐阶段等待确认。外部服务、模型调用和计算费用遵循实际授权与持久预算；方案中的建议额度不构成自动付费授权。缺少外部条件时准确记录，并继续可独立完成的工作。
