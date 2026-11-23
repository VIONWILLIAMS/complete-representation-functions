# 本会话完整技术记录

归档日期：2026-11-23（北京时间）。以下按实际推进顺序整理，具体运行时间与命令以所链接的原始 JSON/log 为准；没有原始时间戳的环节不补造时间。这里保存的是技术工作记录与决策，不是包含登录信息的聊天逐字稿。

## 1. 用户目标及路线澄清

用户先研究扩散模型与代码直接生成图片的区别，随后要求依据上传的 code-native 计划实际生成多类型高清图，并提供 GPU 路线供测试。曾提及的“fable 5.2”名称没有在本实验中被确认为某一具体实现，不能据此推断它的内部结构。

本实验采用程序场景、显式材质、相机和自编路径追踪；确实使用程序化三维几何。它证明可运行图形程序能直接计算像素，不证明通用语言模型内部采用相同方法。原始范围保存在 [`input/CRF_CodeNative_Photorealistic_Rendering_v0.1_Plan.md`](input/CRF_CodeNative_Photorealistic_Rendering_v0.1_Plan.md)。

用户最新目标是将链路升级并引入 Gaussian 世界技术，GPU 随后提供；最新交付要求是把方案和完整记录提交 GitHub，供 Codex 接手。

## 2. 独立 CPU 渲染器

实现 C++17 多线程路径追踪：BVH、球/三角形/平滑法线/四边形、漫反射、GGX 金属、涂层与理想介电玻璃、面积光/太阳/天空、NEE/MIS、俄罗斯轮盘、薄透镜和 PFM 辅助通道。场景与纹理由 Python/数学函数生成，没有使用外部成图、照片贴图、现成模型或扩散 API。

保存基础 Lambert/Beer、确定性、网格与单参数对照等检查；它们只覆盖具体检查，不构成对完整积分器的证明。细节见 [`crf_render/docs/IMPLEMENTATION_REPORT.md`](crf_render/docs/IMPLEMENTATION_REPORT.md) 和 [`crf_render/logs/renderer_verification.json`](crf_render/logs/renderer_verification.json)。

## 3. 五类图片与迭代

| 图像 | 原生尺寸 | spp / depth | CPU 秒数 |
| --- | --- | --- | ---: |
| 静物 | 2048×2560 | 256 / 12 | 557.21309 |
| 日光室内 | 3072×2048 | 256 / 12 | 1692.9349 |
| 产品 | 2048×2560 | 256 / 16 | 508.65089 |
| 山林湖泊 | 3072×2048 | 256 / 10 | 612.78699 |
| 风蚀沙丘 | 3840×2160 | 192 / 6 | 472.32151 |

原记录使用 9 CPU 线程、seed 20261123。总像素 31,363,072，初始相机路径 7,498,104,832；各次运行秒数相加为 3843.90738，不是独占环境基准。产品图来自更早的冻结源码，`run_sources/product/` 完整保留该差异。

程序化场景经过多次预览调整，相关 preview/v2/v3/v4 参数及日志保留。最终图仍有简化几何、纹理规律性与 CG 感，尤其山水。GPU 和更多采样主要提供算力及收敛空间，不能自动补足真实结构。

完整参数/PNG与原始数据摘要见 [`crf_render/outputs/collection_manifest.json`](crf_render/outputs/collection_manifest.json)。完整数据包与 Git 收录边界见 [ARTIFACTS.md](ARTIFACTS.md)。

## 4. 成像、显示重建和有偏步骤

原始线性 PFM 保留，另做 EXR 转换并核对往返。显示链包含传统 AOV 引导滤波、曝光、简化 filmic 与 sRGB，不是完整 ACES。

静物额外抑制 167 个孤立亮点，约占 0.00319%；山水为 2049 个，约占 0.032568%。后者约减少原始估计总亮度的 4.33%，可能削弱未充分采样的真实闪光/焦散。两者都是有偏显示处理；不能说成物理积分精度提升。建筑、产品和沙丘没有采用该额外步骤。

静物 raw-only 显影重放的最终 PNG 逐字节相同，原始 PFM/EXR 未变；山水独立保护策略、mask、局部对照与审计同样保留。具体文件见 `crf_render/audit/`、`logs/raw_only_replay_verification.json` 与 `docs/FIREFLY_RECONSTRUCTION.md`。

## 5. GPU 原型和连接尝试

编写 CUDA 软件 BVH 原型、共享代码生成、数值检查入口及有限 GPU workload。没有 OptiX/RT Core 实现。

编译按实际顺序：CUDA 12.8.93 因本地 glibc 2.41 数学声明冲突失败；CUDA 13.0.88 首次完成设备编译但因库目录布局链接失败；仅修复隔离工具链的 lib64→lib 布局后，sm_120 编译及链接成功（86.6196 秒）。没有为通过编译修改渲染器源码。三份原始日志与完整参数保存在 `logs/cuda_*`。

用户既有云 GPU 的连接没有完成认证；没有发送登录密码。官方 Colab CLI 0.8.0 安装后授权未完成，用户转向 tmate 时授权提示已关闭；没有收到实际 tmate 会话地址，也没有新建 VM。Notebook 已准备并检查格式/嵌入源包，但 GPU 单元格未执行。

这些记录只解释未连接状态。登录口令、具体连接地址、令牌、临时上传 URL、工具环境及上传回执不进入此次提交。当前用户将另提供 GPU，不应复用未核验的历史地址并声称连接成功。

## 6. Gaussian 升级研究

研究汇总 3DGS、gsplat、Mip-Splatting、2DGS、可重光照 Gaussian、3DGRUT/3DGRT/3DGUT、NHT、PPISP、可编辑反射、PRT、入射光缓存与世界生成路线。一手链接、发表/代码与许可边界保存在完整研究报告及过程笔记。

主要决策：

- 保留程序已知的场景、材质、灯光及相机；先建立可解释的合成参考与固定光照基线。
- 普通颜色/SH Gaussian 拟合外观，不自动产生正确 BRDF 或任意换光。
- 抗混叠、细节网络、表面约束和物理混合分别做消融；不将多种论文名称拼接后宣称已实现。
- 固定光照入射缓存（E5a）与限定基底预计算传输（E5b）分开。前者换灯后需失效/重建，后者仅在基底与场景条件内有效。
- GaussianWorld 同名论文是自动驾驶占据预测，本项目“高斯世界”是广义表示目标。
- 照片重建和预训练世界生成作为有额外输入/许可的选项，不替代本独立实验默认路线。
- 原生分辨率、摄影外观、与真实参考逐像素吻合是不同判据；不报告真实度百分比。

## 7. 实际准备物和核查

`prepare_fixture.py` 生成 120 相机 × 3 面积光的 360 个场景文本与元数据，默认 1024×768、Y-up、米制。每种灯光 96 train /12 val /12 test，方位连续块留出，无额外角度保护带。

已有相机矩阵/投影/射线/距离到 Z 的解析核查，365 个夹具文件哈希一致。针对已审阅的 gsplat 源码作了 1080 对 CPU 射线代数比较，确认整数中心到其边坐标约定需要一次 +0.5 主点适配；这不是在 GPU 上执行 gsplat。

`gpu_preflight.py` 在本机实际运行，结果未检测到可用 NVIDIA GPU，PATH 无 NVCC，PyTorch 未安装；不否定此前隔离目录中的 NVCC。Scene IR 和 E0–E6 JSON 是规格/计划，不是解析器、训练器或任务调度实现。

本轮没有夹具图像、训练权重、Gaussian GPU 运行、NHT 接入、物理混合或光照缓存结果。完整研究包之前已通过 CRC、摘要与内容一致性检查；原包清单/验证记录另存 `records/original_gaussian_package_*`。

## 8. 本次 GitHub 交接整理

通过已连接的 GitHub 账户核对到现有仓库与 `crf-gpu96-development@c2b759...`。读取现行根/应用 AGENTS、Codex 入口、整合计划与机器登记格式。建立独立交接分支，并将资料放在 `graphics-editor/research/gaussian-world/`，与现有应用目录区分。

保留旧原始记录的字节与哈希，新解释单列勘误，避免“Camera normal”等旧表述误导。为 Codex 提供实际路径、命令、已实现/未运行状态、E/GPU-T 对应和首个实现提交要求；登记工程实验来源，不把数学 claim 提升为 verified。

本次归档检查见 `validation/handoff_validation.json` 和 `validation/repository_checks.log`。它只核验资料一致性、语法、链接/数据及仓库要求的检查，不代表重新完成五图、主应用、GPU 或 Gaussian 训练验收。远端提交、分支及 PR 的最终身份由 GitHub 自身提供。
