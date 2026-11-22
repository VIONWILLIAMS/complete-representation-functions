# 可直接复制给 Codex 的开发任务

以下正文是一份完整任务提示词；将其复制到选定本仓库与开发分支的 Codex 任务中。路径均相对仓库根目录。

---

请在唯一仓库 `VIONWILLIAMS/complete-representation-functions` 的 `crf-gpu96-development` 分支实施 CRF 整体开发计划。目标是交付可运行、可编辑、可验证的图形计算产品，并充分利用用户已有的 RTX PRO 6000 / 96 GB 云端 GPU 改善几何、材质、光照、多尺度细节、拟合和候选评价。请实际编写代码、运行可用的验证并持续推进；不要止于重写计划、生成静态演示或填写通过清单。

## 一、先确认真实基线

本轮已核对的源码基线是 `55103cc7399cef3bb5eb7d9e7875f3785dedd9cd`，版本为 `1.1.0-experimental.2`，包含对象函数、CPU JavaScript/Worker 内核与 GUI，以及已实现的 quality12 真实参考重建、参数编辑和图片/视频导出。仓库已附质量与浏览器验收报告，本次交接仍须实际复现；应将 quality12 作为已实现的继承基线。另有 quality13 冻结设计和合同，需继承并逐项核对实施与验证状态。开发分支包含该基线和本轮计划。先核对远端仓库、工作区、当前分支、HEAD 与基线祖先关系；保留用户未提交修改，必要时使用隔离 worktree。

`main` 的完整计划供阅读，其应用仍是恢复的产品 1.0；运行和开发必须使用 `crf-gpu96-development`，不得用旧应用代替最新基线。1.2 报告所引 `0325a1c15f4259732fa49afccba51c956c2c918b`、`9c6ecd6fc56fb3a6520c22951867c0437cea52b7` 未在本次 GitHub 发布核查中取得，只能作为报告中的追溯信息，不能声称已检出或复现这份 1.2 源码。当前 HEAD 可以比基线更新，记录实际提交即可。

## 二、按顺序阅读并落实同一套要求

1. 根 `AGENTS.md` 与 `graphics-editor/AGENTS.md`。
2. `graphics-editor/verification/GPU96_BASELINE_STATUS.md`。
3. `graphics-editor/plans/CRF_Integrated_Development_Plan.md`。
4. `graphics-editor/plans/CRF_Integrated_Execution_Plan.json`。
5. `graphics-editor/plans/CRF_96GB_GPU_Technical_Plan.md`，完整保留其中算法、显存、采样、质量和测量细节。
6. `graphics-editor/plans/CRF_1_1_Implementation_Plan.md` 与 `graphics-editor/plans/CRF_1_1_Execution_Plan.json`。
7. `graphics-editor/README_1_1.md`。
8. `graphics-editor/editor/docs/v11/DELIVERY.md`。
9. `graphics-editor/editor/contracts/quality12.json`。
10. `graphics-editor/README_QUALITY.md`、`graphics-editor/editor/reports/quality12/acceptance.json` 及其关联质量、重放和浏览器证据（[固定基线说明](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_QUALITY.md)、[验收索引](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/reports/quality12/acceptance.json)）。
11. `graphics-editor/editor/contracts/quality13.json`（[固定基线合同](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/editor/contracts/quality13.json)）。
12. `graphics-editor/plans/CRF_1_1_Detail_Quality_Iteration.md`（[固定基线计划](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/plans/CRF_1_1_Detail_Quality_Iteration.md)）。

整体计划协调当前范围；原 1.1 的计算内核、证明、真实程序 RSI 和完整编辑器责任继续执行。新增 GPU 阶段写作 `GPU-M0`–`GPU-M6`；原阶段与任务分别引用为 `V11-M0`–`V11-M5`、`V11-T00`–`V11-T26`，不混淆两组 M 编号。历史报告是特定版本的记录，本次必须实际复现后再判断当前状态。

原 `V11-T19` 的 WebGPU 要求仍单独列项和验收；新增 CUDA 后端不自动完成或撤销该子项。

## 三、立即完成首批实现

先按 `README_QUALITY.md` 复现当前质量工作台，同时保留 `README_1_1.md` 的对象函数流程。使用 Node.js 22 或以上，在仓库根目录执行：

```bash
cd graphics-editor/editor
npm ci
npm run dev:quality
```

地址为 `http://127.0.0.1:4173/quality12.html`；对象函数工作台仍为 `/studio11.html`，原 `npm run dev:v11` 入口继续保留。在另一终端的同一应用目录运行已有 `npm run test:quality`、`npm run verify:quality`、`npm run test:v11`、`npm test`、`npm run test:v10`。完整质量复核按当前 README 执行 Python 测试、`python3 scripts/review_quality12.py`、`node scripts/verify_browser_quality12.cjs`，构建前准备 `requirements.txt` 与 `requirements-build.txt` 所列依赖，再运行 `npm run build`。浏览器制品检查与本轮实际 GUI 操作、重新导出分别保存。

`npm run fit:quality` 已存在并调用 `scripts/fit_quality12.py`，其输入、输出、预算及来源设置按 `README_QUALITY.md` 和 `editor/reports/quality12/FITTING.md` 提供；不要求为了复现已保存参数而重新拟合全部资产。对象函数的 `train:v11`、`benchmark:v11`、`verify:browser:v11` 仍可按需要运行，浏览器依赖与路径设置见 `README_1_1.md`。保留真实失败与原始历史证据；这些命令验证 CPU 基线，并非 GPU 已经接通。

把 quality12 记作“已实现、有既有证据、本次待复现”。继承现有 CPU 拟合、独立参数重放、受限 Harness、GUI、导出和冻结质量合同，基于复现差距修复并迁移真实热点；不要重复从零实现已交付模块。其有限参考质量与跨运行时一致性不自动证明通用新场景生成、物理重光照、形式证明或 L2 RSI。

首个可评审代码提交应共同包含：

- 真实 CPU/CUDA 后端接口，衔接现有场景、固定函数资产和统一成像语义，返回实际能力及失败原因。
- 至少一个参与实际输出的 CUDA 核心计算路径。先测量现有热点，优先迁移覆盖/颜色联合求值、分块高斯累积、拟合或损失归约；禁止仅分配张量或返回预制图片。
- 固定输入、种子、色彩、采样、精度和预算的 CPU/GPU 差分入口；CPU 参考独立保存，逐例记录误差、输出摘要、阶段时间和端到端时间。
- 显存账本、预算管理接口、取消与失败的明确状态，以及真实可执行的复现命令。新 GPU CLI/API 必须随代码实现，不能把计划中的接口写成现成能力。

有服务器访问条件时，先只读记录 GPU 完整型号、UUID、实际可见显存、计算能力、共享/切分状态、驱动/runtime、功率限制和主机资源，并验证目标设备兼容的软件组合。不要仅凭“96 GB”假定具体卡型、独占状态或 96 GiB 可用量。

没有服务器或 CUDA 时，继续编写后端、CPU 参考、合同、资源管理和可独立测试的实现；设备相关项目标为 `not_run` 并给出具体缺口，不伪造日志、不用 CPU 回退冒充 GPU 通过，也不因此停止所有其他开发。首批代码完成不等于 `GPU-M0/GPU-M1` 的实机验收通过。

## 四、完整开发范围

按依赖推进 `GPU-M0` 设备/合同、`GPU-M1` GPU 原算法、`GPU-M2` 对象与材质函数、`GPU-M3` 整卡调度、`GPU-M4` 真实场景与原生 4K、`GPU-M5` 必要的空间光传输、`GPU-M6` RSI/正式封存。相互独立的模块可并行，最终必须在 GUI Service、Agent Harness、Compute Kernel 的同一工程中汇合。

统一 PyTorch/CUDA 主路径，保留 CPU 参考。经剖析确认热点后再选 Triton/CUDA 优化；OptiX 只用于已定义且已验证的 CRF 空间查询，不引入无关框架堆叠。几何实现对象/部件、局部坐标、轮廓、深度、法线、接触和遮挡；材质分离固有色、粗糙度、法线细节及显式反射响应；木纹、织纹、拉丝和磨损附着于对象坐标，随尺度正确过滤。

基础语言/视觉模型保持冻结。允许逐对象、逐观察、逐资产的小网络训练，明确披露数据来源、输入域、参数量、权重、优化成本、适用域和保留观测结果；这属于 L0 参数优化，不算 L2 程序 RSI。几何、低频材质/光照、细节及联合微调分阶段求解，不能让 RGB 网络掩盖几何错误。

实现面积光与可见性、受控换光、线性 HDR 和统一输出编码。完整反射、透射、厚度吸收和多次间接光须先具备 CRF 空间函数、求交/介质边界及独立验证；缺失信息返回 unknown，不把 unknown 当 miss。有限视角 2.5D 不冒充任意新视角或完整光传输。

最终像素来自声明的 CRF 程序与函数资产；不转用 Blender/外部三维产品流水线，不贴源照片、不引入隐藏 RGB 残差或外部完整生成图。外观重建与材质分解使用不同能力标签。保存来源、版权/许可记录和重放所需资产；无源图重放还须结合换光、形变和保留观测验证，不能仅凭断网或权重哈希证明材质正确。

## 五、整卡资源与公平测量

一个主要 GPU 所有者统一管理资源，共享不可变资产、候选保存增量；默认云卡 LLM 权重预算为 0。按 GPU 技术方案完整实现 Fit/Render/Search 软预算、分块/微批、缓存、取消、恢复和检查点，不在启动时预分配全部池。

所有预算以 bytes 计算，GB/GiB 分开显示。记录 device-used、allocated、reserved、框架外缓冲、有效工作集、可回收缓存和峰值；allocated 是 reserved 的一部分，不能相加。令实际可见显存为 M，未计入 CRF 池的外部占用为 E，安全余量为 G，应用预算为 B=M−E−G。默认 G 至少为 M 的 10%，还要覆盖未计入任务峰值的额外需求；同一缓冲不重复记账。只有独立压力验证后才调整 guard。

逐步增加有收益的样本微批、并行对象、候选和局部细节容量。改变微批时保持逻辑批、总样本、样本 ID 与更新规则，正确归约尾批。OOM 先降低同时活跃工作量，不静默减少承诺质量。禁止无效填充、重复模型、无命中缓存、全像素×全部高斯巨型矩阵或把所有视频帧常驻显存。显存占用率和 GPU 活跃率不能单独作为成绩。

分别比较 CPU-Ref、GPU-A 同算法同设置、GPU-B 更多计算、GPU-C 同预算新算法、GPU-D 同预算受限 RSI；换提议模型另设对照。按方案做同卡 24/48/72 GB 逻辑容量限制与完整预算对照，记录实际工作集，不能描述成不同型号 GPU 测试。报告冷/热延迟、中位数/P95、有效样本与合格候选吞吐、GPU 时间、传输/编码、全部候选及失败成本，并解释实际瓶颈。

## 六、质量合同、证明、RSI 与用户流程

保留 `quality12.json` 原合同、已交付实现、质量报告及失败历史：其参考任务为 800×531，输出上限为 4,000,000 像素，不能覆盖 3840×2160 的 8,294,400 像素。为 GPU 原生 4K 新建并预先冻结独立合同、资源界限与证据，不修改旧门槛、不缩小评价图、不把插值放大计为原生求值。

继续执行 quality13 冻结细节计划，保持 `noDownsampleDuringFitOrEvaluation:true`、参考摘要与尺寸、函数预算、ROI 和残差尾部门槛；设计与合同已存在，具体实现和验收须核对，不自动标为通过。当前合同是 Alpine 1280×850、街景 667×1000、水果 800×600 的声明观察；Alpine 1280px 不能冒称 9528px 相机原图。GPU 4K 与原图目标分别验收，任何用户指定或后续冻结的原图大于 4K 时，不得降成 4K 充作完成。超过旧运行时上限，明确建立新增合同与分块执行或报告阻塞，不能静默缩小。内部 `quality12`/`quality13` 编号不等于产品 1.2/1.3 发布。

保留线性/未去噪结果、100% 裁切、诊断通道、分块接缝、尺度与时序检查。重建质量和新创作质量分轨评价；正式人类盲评由真实评审产生。

继承原 1.1 的 P1–P6：P1/P2/P3/P5 核心定理实际检查，P4/P6 提供有限实例证据；拒绝 sorry 和未允许公理。区分抽象语义证明、实现符合性、数值测量、模型意见与人工评价；CPU 或固定点证明不能自动覆盖 CUDA/HDR。更改代码、颜色协议、ROI、参考或后端后使旧证据失效。局部编辑影响域纳入阴影、反射、滤波及显露背景；物理传播与用户冻结区冲突时报告冲突，不暗中解除保护。

实现真实 L2 闭环：系统依据自然图像失败提出非参数算子/程序结构变更，经类型、作用域、有界执行、证明、固定评价和预算检查后试用；最终冻结后完成正式封存、原子晋升、回滚以及新任务实际继承。保存提议来源、代码差异、`executedOperatorHash`、实际调用/fallback 和成本。人工内核开发、权重训练与参数搜索分别记录，不冒充自主程序 RSI。候选不能改自己的验证器、合约、参考、晋升规则或预算账本；正式封存不用于反复选赢家。

保留 17 个历史入口、旧 URL、原资源及工程重放。用阅读角、雨后庭院、工具材料静物等场景开展真实流程：在工作台提交场景 → 修改局部几何/材质或移动光源 → 真实 GPU 任务、进度与渐进预览 → 取消/恢复 → 原生图片/视频 → 保存重开继续编辑 → 查看绑定本次输出的证据。视频固定资产与随机协议，使用有限缓冲和流式编码，检查独立时刻重算与编码前帧一致。原案例继续回归；报告引用但源码未取得的杯子/订书机实验不能假装已加入回归。

## 七、执行和最终交付

按已有授权自主推进，不要求用户逐阶段批准。外部调用和计算费用遵循实际授权与持久预算；计划数字不是新增付费授权。凭证仅通过适当运行环境配置，不进入代码、工程、报告或 Git。遇到无法推断的访问条件或外部阻塞，准确列出缺口并继续独立任务。

每批提交附代码变更、真实命令、代码/输入/资产/输出摘要、环境、原生制品、验证结果和未完成项；绑定任务预算、失败、取消/恢复及版本信息。分别使用通过、失败、未测/阻塞状态，不改写历史结果。

最终必须同时满足**计算内核改善、证明层有效、真实程序 RSI 收益、可用编辑器**，并逐项满足整体计划中的 GPU96、画质、性能、稳定性和资源合同。必要项未通过则保持候选状态，明确下一项可证伪的工作，不宣称正式完成、通用照片级或未经实测的实时/加速倍数。现在从基线核对和首批代码实现开始。
