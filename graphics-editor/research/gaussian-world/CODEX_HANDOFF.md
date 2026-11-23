# Codex 接手：Gaussian 世界与代码原生真实图景

## 任务与边界

用户要求升级整体技术链路，引入 Gaussian 世界相关技术，继续追求可控、可编辑、可追溯的高清真实图景；GPU 将随后提供。请承接现有实现和本交接资料，进入可验证的代码开发。

首先读取仓库根 `AGENTS.md`、`graphics-editor/AGENTS.md`、`graphics-editor/CODEX_START_HERE.md` 及整体计划。主应用是 `graphics-editor/editor/`，本目录是补充研究与独立实验。不能用这组 C++ 样片替代已有工作台，不把研究文档数量当作产品能力完成。

保留 17 个历史入口、原 URL、现有资产、quality12/quality13 冻结合同、原 V11 的证明/RSI/WebGPU 要求及 250 MiB 历史静态包限制。新增研究资产放在应用静态包外。本次没有修改应用运行时代码、核心域/DSL 或 claim 验证状态。

`v0.1/v0.2` 属于独立实验文件版本，不是产品版本。现有 GPU96 开发与用户既有 1.2 报告的来源边界仍以主入口和基线状态文件为准。本目录没有补回那些尚未取得的 1.2 报告提交。

## 1. 取得正确代码

新工作区可执行：

```bash
git clone --branch codex/gaussian-world-handoff-20261123 https://github.com/VIONWILLIAMS/complete-representation-functions.git
cd complete-representation-functions
git status --short
git rev-parse HEAD
git merge-base --is-ancestor c2b759b9d9d0ee56ccef7a47dbe540f80c07d952 HEAD
git merge-base --is-ancestor 55103cc7399cef3bb5eb7d9e7875f3785dedd9cd HEAD
```

已有工作区先保护未提交修改，再 fetch 并按项目规范建立工作分支/worktree。浅克隆需先取得所需历史。这里的 clone/祖先检查是接手命令，不是应用/GPU 验收。

## 2. 必须区分的三组状态

1. **主应用既有证据**：已有 CPU 对象函数/quality12 实现和历史报告；按主入口独立复现。quality13 合同/设计不自动等于交付。
2. **本会话 CPU 实验**：五图、物理近似、显示滤波、源码与运行记录已存在。CUDA 只有交叉编译证据。
3. **新 Gaussian 实验**：设备采集脚本、夹具生成器和接口规格已准备；无训练图、训练器、权重、GPU 数值/性能或混合光传输结果。

`STATUS.json` 与 `EVIDENCE_INDEX.md` 记录这三组边界。不要把仓库里已有的二维 Gaussian 重建误作本轮三维 gsplat 训练已经完成；也不要反过来把主应用已有二维实现说成不存在。

## 3. 技术路线与融合方式

默认研究分支采用：程序化场景/材质/灯光 → 独立物理参考 → 固定光照 Gaussian 外观基线 → 抗混叠/细节/表面约束消融 → 显式材质与光照混合 → 限定域光照缓存/传输。

程序已知的几何和光学参数要保留。标准 RGB/SH Gaussian 不自动分离几何、材质与光源。gsplat/3DGRUT 等是待锁版本的外部对照或候选后端；接入主 CRF 必须提供明确的场景/对象算子适配、来源、支持域、误差合同和真实工作台路径。原生 CRF 输出、外部 oracle、候选加速表示分开登记。

本独立实验默认不使用外部照片/纹理/现成网格或扩散生成。主工程 quality12/quality13 已有合法观察来源与合同继续保留。照片重建、世界生成、预训练先验和 LPIPS 权重都要单独登记依赖，不能无声混入本实验的默认输入。

## 4. 与唯一活动任务账本的对应

E0–E6 是本研究的实验编号，不是第二份产品开发任务账本。请在主 `CRF_Integrated_Execution_Plan.json` 相应任务下追踪实现与证据，不能凭此表直接把主任务标为完成。

| 本研究 | 对应主任务 | 首项具体交付 |
| --- | --- | --- |
| E0 真实设备与小型前后向 | GPU-T00、GPU-T03、GPU-T04 | 版本锁、设备事实、前后向/保存恢复、资源记录 |
| E1 场景/相机/AOV 与物理参考 | INT-T02、GPU-T01、GPU-T05 | 可运行适配器、少量标定图、独立核查 |
| E2 固定光照 Gaussian | GPU-T03、GPU-T06 | 训练/重放入口、固定数据划分、留出视角 |
| E3a 抗混叠、E3b NHT/细节 | GPU-T07、GPU-T09 | 分开消融，同预算质量及成本 |
| E4 显式 PBR / 表面归属 / 混合 | GPU-T07、GPU-T08、GPU-T15、GPU-T16 | 清晰的可见性、辐射量、材质输入及能量合成 |
| E5a 固定灯光入射缓存 | GPU-T15、GPU-T16 | 缓存失效、重建及成本，不冒充零重算换灯 |
| E5b 有限基底预计算传输 | GPU-T15、GPU-T16 | 新生成的基底/未见光照组合夹具及域内验收 |
| E6 高清多题材与工作台接入 | GPU-T12、GPU-T13、GPU-T14、GPU-T20 | 同场景对照、原生裁剪、轨迹、实际编辑与导出 |

## 5. 无 GPU 时先完成的代码

按依赖持续推进，无需重复撰写方案或等待不存在的设备结果：

1. **相机适配**：OpenCV 坐标、row-major w2c、像素中心和缩放约定。对当前审阅的 gsplat 接口只加一次 `cx,cy += 0.5`，后续固定具体 commit 后再验证。
2. **AOV 适配**：PFM bottom-to-top、线性颜色、mask、t→Z、世界空间 face-forward 法线、类型相关的材质色。不能把玻璃透射颜色当 diffuse albedo。
3. **有限渲染任务执行器**：消费 `render_jobs.json`，先生成少量低成本标定图；记录实际命令、输入输出哈希、失败与恢复。它当前不存在。
4. **数据协议**：固定光照 E2 的 train、val、test 全部使用 `neutral_top`，分别取其 96/12/12 视角；V 是 `neutral_top × test views`。只有换灯开发才用 `warm_left` 验证，L/VL 才用 `cool_right × train/test views` 测试。各组使用按冻结配置，测试 RGB 不用于颜色、曝光、颜色矩阵或检查点挑选。
5. **主工程适配设计与实现**：将可迁移组件接到真实 Scene/Operator/Job/Evidence 语义；既有 2D Gaussian 数据和本轮 3D 资产有不同格式/作用域，禁止悄悄复用同一类型名。

先读 [`gaussian_upgrade_research/scaffold/ADAPTER_NOTES.md`](gaussian_upgrade_research/scaffold/ADAPTER_NOTES.md)。当前夹具是 96/12/12 视角、三灯共享划分，留出块无保护角带，不能据此声称任意外推。

## 6. 当前可执行命令

以下命令均给出真实现有入口；它们不是 Gaussian 训练命令。新运行写到 `runtime-runs/`，历史 `validation/`、`logs/` 和 `audit/` 保持原记录。

从本目录执行只读设备检查：

```bash
python3 gaussian_upgrade_research/scaffold/tools/gpu_preflight.py --torch --torch-timeout 20 --output runtime-runs/device/preflight.json
```

只生成程序夹具定义，不渲染或训练（目标目录需为空/不存在）：

```bash
python3 gaussian_upgrade_research/scaffold/tools/prepare_fixture.py --output runtime-runs/fixture-reproduction
```

可选 CPU 小图执行，工作目录切入独立实验：

```bash
cd crf_render
python3 -m pip install -r requirements.txt
make
mkdir -p ../runtime-runs/cpu-smoke
python3 scenes/still_life.py ../runtime-runs/cpu-smoke/still_life.scene
./crf_render ../runtime-runs/cpu-smoke/still_life.scene ../runtime-runs/cpu-smoke/still_life 160 240 8 124 10 2
python3 tools/develop.py ../runtime-runs/cpu-smoke/still_life --atrous 1
```

原项目部署/应用验证命令仍从 `graphics-editor/editor/` 按主入口执行，不在这里替换或假报结果。

## 7. GPU 接入后的顺序

1. 核实型号、可见字节数、驱动、工具链与实际可用空间；用户截图只是资源预期。
2. 根据实际设备固定 PyTorch/CUDA/gsplat 的版本与源码 commit。先小型前后向、保存恢复和 CPU 数值对照；不把 import、设备枚举或编译成功当运行正确。
3. 用少量夹具图确认投影和辐射语义，再生成真实训练集、训练固定光照基线并保存最差视角。
4. 逐项实施抗混叠、表面约束、NHT、PBR 混合的消融，记录时间、显存、数据与依赖。
5. E5a 与 E5b 分开。当前三组有限距离面积光不是远场环境 PRT 夹具；E5b 的基底、未见组合数据尚未生成。
6. 原生高清/4K 与多题材输出最后在相同场景对照；包含未滤波 HDR、100% 裁剪、轨迹与实际编辑流程。

预算以主工程的有效工作集、整卡 guard 和有限任务合同为准。研究配置里的 70% 软预算、2/6 小时建议不是自动覆盖主预算或启动长时任务的命令。GPU 利用率和显存占满不是质量成绩。

旧 CUDA 原型可在目标环境从源重建，用于独立 CPU/GPU 对照；它是软件 BVH，尚无 OptiX/RT Core。`run_gpu_workload.sh --full` 的尺寸/深度与历史 CPU 五图不同，必须另建同条件配置才能比较性能。`build_cuda.sh` 的默认架构需与实际设备核对。

## 8. 首个可评审实现提交

交付真实相机/AOV 适配、有限任务入口、划分约束及少量标定图检查；设备可用时追加实际前后向和最小 Gaussian 基线。将命令、环境、输入/输出摘要、原生图、失败与支持域绑定。

不要直接提升主任务状态：本实验解析误差通过不等于质量通过；合成教师一致不等于真实摄影一致；局部参数训练是 L0，不是 L2 RSI。新的物理/空间/GPU 路径不自动继承旧形式证明。

用户将自行让 Codex 接手。本次 GitHub 提交不会自动派发云任务、发送 @codex 评论、购买算力或启动长时训练。后续连接凭证通过运行环境安全注入，不写入源码、日志或 PR。
