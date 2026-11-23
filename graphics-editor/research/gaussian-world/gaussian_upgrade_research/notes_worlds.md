# 生成式高斯、几何前端与世界模型：选型研究备忘

核实日期与资料截止日期：2026-11-23。仅依赖作者论文、作者项目页、官方代码/模型仓库和公司官方文档。以下是资料研究与工程判断；没有下载大权重、训练模型、调用收费服务或执行 GPU 推理，也没有修改 CRF 旧项目。

## 1. 对当前项目最有用的结论

1. **“GaussianWorld”有具体同名论文，但它并不是输入文字就生成照片级世界的引擎。** CVPR 2025 的 GaussianWorld 面向自动驾驶的流式三维语义占据预测；ICCV 2025 的 Gaussian-based World Model 也主要是占据、运动和规划。[W01][W02]
2. **高斯表示、几何重建、生成先验和动态模拟是不同模块。** 高斯表示让已经获得的几何/外观能高效渲染；DUSt3R、MASt3R、VGGT 类模型估计输入图像中的几何；世界生成模型补出未观察区域；视频世界模型预测画面随动作如何变化。不能把四者合成一句“换成高斯就自动真实”。
3. **保持原计划约束时，优先把自有程序场景生成的 RGB、深度、法线和相机参数，转换/拟合成高斯场景，做多视角与实时预览。** 这不需要真实照片或现成三维资产，也无需让模型重新猜测我们已经知道的几何。高斯拟合能提供交互速度，但不能凭空补充原场景缺少的几何和材质细节。这一条是基于数据来源与表示能力的工程判断，不是论文宣称。
4. **若另行允许外部预训练模型，最值得优先试的两类是：** 场景级生成与重建的 HY-World 2.0 / WorldMirror 2.0；以及可把少量图像转成几何初始化的 VGGT 系列。单物体补全可考虑 SAM 3D Objects。它们对输入、许可证和显存的要求不同，不能作为一个统一依赖安装。[W07–W14][W19–W23]
5. **Marble/Atlas 是闭源服务参照，动态视频世界模型是后续研究。** World Labs 的官方公开接口确实能生成、重建并导出三维场景，但本轮未发现开放生成模型权重；开放的 Spark 是渲染库。HY-WorldPlay、Cosmos 与 Genie 的核心输出主要是预测视频，不能默认等同于可编辑、有真实碰撞和物理材质的三维资产。[W26–W32][W38–W46]

默认约束继续保持：**程序生成几何与材质、无外部照片、无现成三维资产。** “代码调用一个预训练生成模型”仍然引入了该模型的训练先验；“输入自有程序图”也不会自动把一个生成模型变成原计划中的纯代码物理渲染。以下依赖预训练模型或闭源服务的路线，均列为条件性选项，没有默认放开。

## 2. 名称核实：GaussianWorld 到底是什么

| 名称 | 可核实的正式出处 | 输入与任务 | 与本项目的关系 |
|---|---|---|---|
| GaussianWorld: Gaussian World Model for Streaming 3D Occupancy Prediction | Zuo 等，CVPR 2025，2025 年 6 月，6772–6781 页 | 当前 RGB 观测和时序场景；在三维高斯空间建模自车运动、动态物体运动、新观测区域，预测语义占据；评估 nuScenes | 可参考时序状态维护；不是照片级外观生成或路径追踪替代品 |
| Gaussian-based World Model: Gaussian Priors for Voxel-Based Occupancy Prediction and Future Motion Prediction | Feng 等，ICCV 2025，2025 年 10 月，25239–25249 页 | 多模态驾驶传感器；语义占据、未来运动和规划 | 同属驾驶感知/预测，不能因名字有 Gaussian 就当作生成式三维世界方案 |
| “Gaussian world / 高斯世界”作为泛称 | 不是唯一产品名称 | 可以指三维高斯场景、生成式高斯世界、四维高斯动态场景等 | 项目方案中应明确到表示、数据来源、算法和输出格式 |

证据：[W01][W02]。GaussianWorld 官方仓库提供训练、评估入口，并要求 nuScenes、SurroundOcc 标注和预训练图像 backbone；所读根目录没有明确 LICENSE。没有核实到它具有开放域照片级世界生成能力。[W03]

## 3. 十条值得考虑的技术路线

成熟度是针对“我们能否把它纳入可复现渲染链路”的工程评价，不是论文排名。跨视角风险段落中没有直接引述作者的部分，均为根据输入信息和输出表示作出的工程推断。

### 路线 1：DUSt3R / MASt3R → 几何与相机初始化 → 高斯拟合

- **已核实能力：** DUSt3R（CVPR 2024）从图像对预测点图，多个视角通常再做全局对齐；MASt3R（ECCV 2024）增加局部匹配特征与度量点图，官方还列出 MASt3R-SfM（3DV 2025）。这些是几何估计和匹配前端，不是照片内容生成器。[W04][W05]
- **输入/输出：** 同一场景有重叠的图像，最好有足够视差；输出点图、匹配、相机/重建初始化，后续还要得到可渲染表示。单张图推测的背面和不可见空间缺少直接证据。
- **代码/权重/许可：** 官方代码和多个预训练 checkpoint 已发布；代码为 CC BY-NC-SA 4.0。权重另要求遵守训练数据与基础模型许可，MASt3R 的 CHECKPOINTS_NOTICE 特别提示数据许可约束，不能把它写成可自由商用。[W04–W06]
- **成熟度与风险：** 开放研究实现较成熟；重复纹理、无纹理、镜面/玻璃、动态区域可能造成匹配或几何误差。全局对齐一致并不保证几何正确。
- **对当前项目：** 若输入是自有程序场景，我们已知相机和深度，不应先渲染再用网络猜回来；只有接纳未知相机的外部图像时才更有价值。默认不启用预训练模型。

### 路线 2：VGGT / VGGT-Ω → 前馈几何 → 可选优化与高斯训练

- **已核实能力：** VGGT（CVPR 2025）一次前向预测相机内外参、点图、深度和轨迹。官方提供 COLMAP 格式导出与可选 bundle adjustment，导出后可以训练 gsplat。它不等于直接输出一张高质量照片。[W07][W08]
- **2026 进展：** 2026-05-18 发布 VGGT-Ω，改善静态和动态场景重建、架构与显存效率。官方 512 模型的 A100 基准在约 624×416 输入时，10 帧峰值约 6.67 GB、100 帧约 13.37 GB；这是特定条件下的官方数值，不能换算成任意高清场景的保证。[W09][W10]
- **许可必须分版本：** 原 VGGT 代码自 2025-07-29 改用允许商业用途的专用 VGGT License，但仅 VGGT-1B-Commercial checkpoint 同步适用；原权重仍非商业。VGGT-Ω 当前代码/模型采用 FAIR Noncommercial Research License，且权重需要申请访问。[W07][W11][W12]
- **基准证据注意事项：** 作者 2026 年 9 月公开额外重训版；因原训练流程存在未能确定影响的数据污染风险，官方要求后续 benchmark 使用 416 reproduction checkpoint，而 512 checkpoint 用于实际开放场景、不用于基准比较。[W10][W13]
- **成熟度与风险：** 前馈几何有实际集成价值，仍是统计估计；少视角、遮挡和域外画面会失真。对于本项目已知几何的程序场景，主要作为未来外部输入适配器或对照实验，默认不是主链。

### 路线 3：SAM 3D Objects → 单图物体/布局重建 → 组合成场景

- **已核实能力：** Meta 于 2025-11-19 发布 SAM 3D Objects；输入图像及目标 mask，可预测物体姿态、形状、纹理与布局；官方示例直接导出 Gaussian PLY。SAM 3D Body 是另一条人体重建路线，不能混用其能力和许可描述。[W14][W15]
- **代码/权重/许可：** 代码和 checkpoint 公开，权重需 Hugging Face 访问批准；采用专用 SAM License，不是 Apache/MIT。官方安装前提是 Linux 和至少 32 GB NVIDIA 显存。[W15–W17]
- **成熟度与风险：** 适合“从一幅图补齐单物体”，不代表任意大场景都能可靠建好。被遮挡的背面、真实厚度、支撑关系和材质只能估计；一个输出可绕着看，并不能证明补全与真实物体一致。
- **对当前项目：** 可作为未来单物体资产提议工具；使用自有渲染图仍会引入外部生成先验。默认不引入，也不复用示例中的照片或资产。

### 路线 4：WonderWorld → 分层 Gaussian surfels → 可扩展静态漫游场景

- **已核实能力：** CVPR 2025 Highlight。单图启动，用户用文字和相机位置决定接下来扩展的内容；采用 FLAGS（Fast Layered Gaussian Surfels）及有条件的深度扩散，让新增区域接入已有场景。项目称 A6000 上单个新场景生成少于 10 秒；项目展示视频注明加速播放。[W18]
- **代码/权重/许可：** 作者代码已公开，依赖预训练图像/深度/分割组件；GPT 自动描述为可选项。README 明确要求 48 GB 显存。所读仓库根目录与 README 未见明确顶层 LICENSE，因此不能把公开代码视为已给出宽松再分发许可。[W19]
- **成熟度与风险：** 可复现研究原型；跨视角复用显式 surfels 可减少每帧改形，但新增隐藏面仍是生成，可能出现薄壳、空洞、层边界、长距离闭环矛盾。
- **对当前项目：** 适合参考“分层表示 + 局部扩展”的结构；若严格不引入生成模型，则只借鉴表示与工程思路，不使用其生成管线。

### 路线 5：HunyuanWorld / HY-World 2.0 → 生成与重建双入口 → 持久三维世界

- **版本核实：** HunyuanWorld 1.0 于 2025-07-26 发布，其核心是全景生成、语义分层和 mesh 重建，公开版基于 FLUX；HunyuanWorld-Mirror / 1.1 于 2025-10-22 发布，能前馈预测相机、深度、法线、点云和三维高斯。不能把 1.0 的全景 mesh 系统直接称为原生 3DGS 世界生成器。[W20][W21]
- **2026 主路线：** HY-World 2.0 在 2026-04-16 发布报告与 WorldMirror 2.0；5 月开放 HY-Pano 2.0、WorldStereo 2.0 和生成推理代码。生成入口是文字/单图 → 全景 → 导航与扩展 → 多视图几何与高斯优化；重建入口是视频/多视图 → WorldMirror 2.0 → 几何和 Gaussian 属性。[W22][W23]
- **代码/权重/许可：** 主组件代码和权重链接可核实，采用 Tencent HY-WORLD 2.0 Community License。其地域范围排除 EU、UK 和韩国；版本发布日对应的前月总月活超过 100 万需额外许可；条款限制用 Works/输出改善其他 AI 模型。基础模型和第三方组件还需分别核对。官方 README 的 2026 年 7 月 2.1 提示指向产品，本轮不据此假定存在等价完整的 2.1 开源权重。[W22][W24]
- **成熟度与风险：** 是与“可漫游显式场景”目标最相近的公开研究框架之一。已生成的三维资产能重复渲染，但全景背后的深度、遮挡补全、无证据的空间和局部细节可能只是合理想象。文档存在多阶段组件与仍未补全的生成章节，需要做小规模端到端验证，不能把论文演示当安装成功。
- **对当前项目：** 若明确允许预训练生成模型，建议先测 WorldMirror 2.0 的重建小样，再测一间室内或一处庭院生成；默认纯代码链路不引入。我们有原始相机、深度时可注入约束，但仍不能默认把模型输出用于训练另一个系统而忽略许可。

### 路线 6：WorldGrow → 分块的直接三维生成 → 可扩展大场景

- **已核实能力：** 2025-10-24 arXiv，作者仓库标记 AAAI 2026 Oral；2025-11-14 开放推理与预训练权重。采用从种子块开始的分层、逐块生成和粗到细细化，输出 Gaussian PLY、mesh GLB 和渲染视频。[W25][W26]
- **输入与依赖：** 官方基础示例从模型与 world_size 启动；没有据此假定它接受任意详细文字并精确生成整个世界。基于 TRELLIS 路线及学习到的三维先验，不需要每次提供真实照片，但仍依赖预训练模型和训练资产先验。
- **许可/成熟度：** 仓库 README 仍写 License: TBD，链接的模型仓库没有 model card。属于有代码和权重的早期研究方案，许可与部署文档不适合作为当前默认生产依赖。[W26][W27]
- **一致性风险与适用性：** 原生三维分块比逐帧画图更容易维持已有空间，但“无限”是可以继续扩展的算法形态，不是无限显存、无限细节或全局正确的保证。大范围布局、接缝、重复、语义控制需实测。适合借鉴分块增长，不作为本轮首选实现。

### 路线 7：World Labs Marble → Atlas → 托管生成/重建与导出

- **已核实时间线：** Marble 于 2025-11-12 公布广泛开放，支持文字、图像、视频或粗三维布局，并能导出 splats/meshes/videos；World API 于 2026-01-21 发布。到截止日期已有 Atlas：2026-09-01 技术介绍，官网 11 月 12 日列出新一代发布；11 月 5 日 Frameboy 发布实时研究预览。[W28–W31]
- **技术公开程度：** Atlas 官方介绍多模态自回归扩散 Transformer，输入含相机位姿与深度；既能产生新视图，也能产生点云/高斯。它明确说看不到的区域会由模型想象。对“pixel-perfect camera control”的描述应理解为相机控制能力，不应改写成所有像素都真实。[W30]
- **代码/权重/许可：** 官方提供托管网页与开发者 API，本轮未发现开放生成权重。Spark 渲染器公开、MIT，可渲染与编辑高斯；Spark 的开放不等于 Marble/Atlas 生成器开放。Marble 导出受套餐与条款约束，不能直接套用其早期套餐信息到 Atlas。[W31–W33]
- **成熟度与风险：** 产品化程度较高，适合质量标杆和快速场景原型；可控重现、服务费用、版本变化、导出权限与不可见区域想象均需要记录。Frameboy 官方说明使用云 GPU 串流，最高约 15 fps，不能当成本机 splat 渲染性能。[W32]
- **对当前项目：** 闭源服务不是默认路线。若后续单独授权，可拿自有程序图做同条件对照；不要声称这种结果全部来自我们自己写的图形计算引擎。

### 路线 8：4D Gaussian Splatting → 从时间序列拟合动态场景

- **已核实能力：** CVPR 2024 的 4D-GS 组合三维高斯、四维神经体素/HexPlane 式编码与小 MLP，预测不同时刻的 Gaussian 形变，避免每帧完全独立拟合。官方训练输入包括有相机与时间信息的合成或真实动态数据。[W34][W35]
- **代码/权重/许可：** 代码公开，顶层 Apache-2.0；光栅器与其他子模块许可还需逐项核对。它的主要产物是按场景训练出的参数，不是一个拿来就能无条件生成任意世界的大权重模型。[W35][W36]
- **成熟度与风险：** 动态重建研究实现较成熟；更适合观测时间段及附近的视角/时间插值，不能直接推导未见过的任意物理未来。时空覆盖不足、拓扑变化和遮挡仍会产生错位或漂浮。
- **对当前项目：** 与默认约束相容的方式是我们自己用程序模拟运动、渲染带标定的时间序列，再优化四维表示；也可直接按确定性变换驱动高斯。应先做好静态，再引入动态；它不会单独提高静态照片的细节真实性。

### 路线 9：WonderPlay → 物理求解器 + 视频生成反馈 → 动态三维场景

- **已核实能力：** ICCV 2025 Highlight。单图重建与材质估计后，用物理求解器产生粗动态，再用动作/运动信号控制视频生成，生成结果反过来细化动态三维场景。这比只播放预测视频更接近显式三维与物理结合。[W37]
- **代码/权重/许可：** 作者仓库已经有实现（项目页部分旧文本仍写将公开）。README 目前只给 Venice 一个完整示例，依赖修改版 Genesis、Gaussian 光栅器、分割/重建和 flow-conditioned 视频生成组件；示例可能直接复用预计算中间结果。本轮未见明确顶层 LICENSE，也不能确认全部组件都以统一宽松许可发布。[W38]
- **成熟度与风险：** 早期研究原型，适合方法参考。物理求解器提供约束，但图像中材质参数不可直接观测，视频细化也可能改变质量、形状或接触关系；不能把生成结果当严格物理真值。
- **对当前项目：** 默认不启用扩散反馈。可以借鉴“确定性物理状态作为主状态、渲染器只消费状态”的接口设计；引入学习式外观修正必须明确标记来源和几何误差。

### 路线 10：可控视频世界模型 → 轨迹条件生成 → 可选几何重建

这是一类路线，列出三个有明确官方证据的实现。它们通常输出视频/状态预测；将视频重建成高斯是额外步骤，会把生成误差带入三维，不是天然完成了可重光照、可碰撞的世界。

| 实现 | 截止日期内的公开状态、输入与输出 | 代码/权重/许可 | 风险与本项目优先级 |
|---|---|---|---|
| HY-World 1.5 / WorldPlay / WorldCompass | 2025-12-17 发布 WorldPlay；2026-01-06 开放训练和 5B 轻量分支；3 月发布 RL 后训练。图像/文字与动作 → 分块自回归视频，利用长期上下文记忆 | 代码和多个 checkpoint 有链接，部分 RL distilled 项仍标待发布；Tencent HY-WorldPlay Community License；还依赖 HunyuanVideo、Qwen、FLUX vision encoder 等各自条款 | 官方 125 帧 Hunyuan 路线单卡推理显存约 72 GB，分布式另算；24fps 官方结果不能直接套到用户 GPU。适合未来交互研究，不是当前高清静帧升级第一步。[W39][W40] |
| NVIDIA Cosmos Predict2.5 → Cosmos 3 | 2.5 于 2025-10 发布；Cosmos 3 于 2026-05-31 发布，官方仓库还记录 7 月 Edge、10 月交互世界模拟。文字/视觉/音频/动作 → 推理与生成，多模态架构 | 2.5 代码 Apache-2.0、权重 NVIDIA Open Model License；Cosmos 3 当前官方仓库和 Nano 模型卡为 OpenMDW-1.1，不能沿用旧版许可判断。Nano 为 16B、Super 64B、Edge 4B，不等于任意显卡实时 | 官方模型卡明确承认时序不一致、相机/物体运动不稳、动作状态漂移与不精确物理；无显式物理求解器。适合受控数据生成/后续动态研究，主链应保留显式几何与物理约束。[W41–W44] |
| Google Genie 3 / Project Genie | Genie 3 于 2025-08-05 研究预览；Project Genie 2026-01-29 推出实验产品。动作条件逐帧生成世界；最初产品说明的单次探索上限 60 秒，后续帮助页已改为依模型/体验决定，不能把初始限制当永远现状 | 官方服务；未发现开放代码/权重许可。模型初始描述 720p/24fps/数分钟记忆，是服务研究指标 | 官方明确提到地理真实性、物理、控制、文本与长时程限制。可作为交互体验参照，不能作为自有可复现高斯渲染引擎。[W45][W46] |

## 4. 建议的默认升级顺序

以下为基于上述证据的工程建议，没有执行或批准任何模型下载、服务调用。

### 第一阶段：保留程序世界作为可验证的来源

1. 固定场景种子、单位、相机内外参、材质 ID 和光照版本。
2. 从自有几何生成多视角 RGB、深度、法线、物体 ID；保存线性 HDR 与显示版本的区别。
3. 直接由几何/深度初始化高斯，再用自有视图优化外观；不插入猜测相机的前馈模型。
4. 用保留视角评估高斯图与同相机物理渲染的误差，并做完整绕行、遮挡后再出现、近距离、玻璃和金属专项检查。
5. 保留原三角网格与物理材质为主数据；把高斯作为交互渲染表示。仅由颜色/球谐参数拟合出的高斯，不自动具有可靠的材质分解和重光照能力。

目的应写清楚：**新增一个可漫游、可测误差的显式场景表示**。若原始程序山体过于简单、树木重复、材质欠细节，先改善这些来源；重建、压缩或换渲染表示不会自动消除这些内容问题。

### 第二阶段：把外部学习模块作为可切换适配器

| 条件 | 建议最小实验 | 需要独立记录 |
|---|---|---|
| 允许未知相机的真实/用户图像 | VGGT 商用 checkpoint 或经过许可确认的几何前端 → 小规模 GS | 输入授权、模型/权重版本、几何误差、不可见范围 |
| 允许预训练生成模型，但仍不使用外部照片 | 自有程序图 → HY-World 2.0 或 SAM 3D Objects 小样 | 哪些像素/几何由模型补全、许可证、显存、固定随机种子 |
| 允许闭源服务 | 自有输入 → Atlas/Marble 可用接口，只做相同相机对照 | 服务版本、费用、导出许可、不可复现因素 |
| 需要动态可回放场景 | 自有模拟时间序列 → 4D-GS | 训练时间范围、时间插值、碰撞/形变误差 |
| 需要开放式动态交互 | 再评估 WorldPlay/Cosmos/Genie 或 WonderPlay | 动作延迟、回访一致性、物理违例、上下文退化 |

### 不应承诺的结果

- 不承诺“只要引入高斯就达到像素级真实”；没有真实参考图时，像素级一致性并无确定目标。
- 不把 4K 输出分辨率等同于 4K 有效几何或纹理细节。
- 不把同一高斯场景可重复渲染等同于隐藏面、材质、尺度都真实。
- 不把视频 world model 的暂时记忆等同于持久三维状态。
- 不把官方演示的帧率、单场景生成时间或显存数字，直接当作当前 GPU 上的测量结果。

## 5. 一手来源登记

所有链接均在本轮直接检索或打开；时间基于页面内明确发布日期，当前仓库内容按核实日观察。目录中的 web ref 供主代理重新打开后引用，不是外部 URL。

| 编号 | 一手来源与准确 URL | 关键证据 / 页面日期 | web ref |
|---|---|---|---|
| W01 | [CVF: GaussianWorld](https://openaccess.thecvf.com/content/CVPR2025/html/Zuo_GaussianWorld_Gaussian_World_Model_for_Streaming_3D_Occupancy_Prediction_CVPR_2025_paper.html) | CVPR 2025；驾驶占据任务 | turn661573056search1 |
| W02 | [CVF: Gaussian-based World Model](https://openaccess.thecvf.com/content/ICCV2025/html/Feng_Gaussian-based_World_Model_Gaussian_Priors_for_Voxel-Based_Occupancy_Prediction_and_ICCV_2025_paper.html) | ICCV 2025；占据、运动、规划 | turn661573056search2 |
| W03 | [GaussianWorld 作者仓库](https://github.com/zuosc19/GaussianWorld) | nuScenes、标注、backbone 依赖 | turn463745323view1 |
| W04 | [DUSt3R 官方仓库](https://github.com/naver/dust3r) | 模型、权重、训练数据许可、全局对齐 | turn726263929view2 |
| W05 | [MASt3R 官方仓库](https://github.com/naver/mast3r) | MASt3R、SfM、checkpoint 与许可提示 | turn726263929view3 |
| W06 | [DUSt3R LICENSE](https://github.com/naver/dust3r/blob/main/LICENSE)；[MASt3R LICENSE](https://github.com/naver/mast3r/blob/main/LICENSE) | CC BY-NC-SA 4.0 | turn411618628search0 / turn411618628search1 |
| W07 | [VGGT 官方仓库](https://github.com/facebookresearch/vggt) | 几何前馈；2025-07-29 商用 checkpoint 变更 | turn411618628search6 |
| W08 | [VGGT Gaussian integration](https://github.com/facebookresearch/vggt#integration-with-gaussian-splatting) | COLMAP → gsplat；优化仍独立 | turn726263929view4 |
| W09 | [VGGT-Ω 作者项目页](https://vggt-omega.github.io/) | CVPR 2026；静态/动态重建架构 | turn150606714view0 |
| W10 | [VGGT-Ω 官方仓库](https://github.com/facebookresearch/vggt-omega) | 2026 年 5 月和 9 月模型；显存表 | turn381337741view1 / turn340061269view4 |
| W11 | [VGGT LICENSE](https://github.com/facebookresearch/vggt/blob/main/LICENSE.txt) | 原 VGGT 专用许可，2025-07-29 | turn411618628search8 |
| W12 | [VGGT-Ω LICENSE](https://github.com/facebookresearch/vggt-omega/blob/main/LICENSE) | FAIR Noncommercial Research License | turn736568739view4 |
| W13 | [VGGT-Ω reproduction](https://github.com/facebookresearch/vggt-omega/blob/main/reproduction.md) | 2026 年 8 月重训、9 月发布；benchmark checkpoint 边界 | turn736568739view6 |
| W14 | [Meta: Introducing SAM 3D](https://ai.meta.com/blog/sam-3d) | 2025-11-19 发布、Objects/Body 区分 | turn661573056search10 |
| W15 | [SAM 3D Objects 官方仓库](https://github.com/facebookresearch/sam-3d-objects) | 图像+mask → 几何/纹理/布局/GS；2026 encoder 更新 | turn150606714view5 |
| W16 | [SAM 3D Objects setup](https://github.com/facebookresearch/sam-3d-objects/blob/main/doc/setup.md) | 32GB；Linux；gated checkpoints | turn317865787view1 |
| W17 | [SAM License](https://github.com/facebookresearch/sam-3d-objects/blob/main/LICENSE) | 2025-11-19 专用许可 | turn461845569view2 |
| W18 | [WonderWorld 作者页](https://kovenyu.com/wonderworld/) | CVPR 2025；FLAGS；A6000；展示视频加速 | turn508711532view0 |
| W19 | [WonderWorld 作者代码](https://github.com/KovenYu/WonderWorld) | 48GB；可选 GPT；模型依赖；未见顶层许可 | turn381337741view0 / turn972402981view6 |
| W20 | [HunyuanWorld 1.0 README](https://github.com/Tencent-Hunyuan/HunyuanWorld-1.0/blob/main/README.md) | 2025-07-26；全景 mesh；FLUX 基础模型 | turn583857698view1 |
| W21 | [HunyuanWorld-Mirror 官方仓库](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror)；[许可](https://github.com/Tencent-Hunyuan/HunyuanWorld-Mirror/blob/main/License.txt) | 2025-10-22；前馈多表示预测 | turn765559606search6 / turn765559606search4 |
| W22 | [HY-World 2.0 官方仓库](https://github.com/Tencent-Hunyuan/HY-World-2.0) | 2026-04-16、05-11、05-18 发布；2.1 仅产品提示 | turn495884040view0 |
| W23 | [HY-World 2.0 DOCUMENTATION](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/DOCUMENTATION.md) | 生成/重建分离、完整 GS 属性、先验注入、多模型后端 | turn340061269view2 |
| W24 | [HY-World 2.0 License](https://github.com/Tencent-Hunyuan/HY-World-2.0/blob/main/License.txt) | 2026-04-15；地域、MAU、其他模型训练限制 | turn508711532view1 |
| W25 | [WorldGrow 论文](https://arxiv.org/abs/2510.21682) | 2025-10-24；三维分块生成 | turn726263929view0 |
| W26 | [WorldGrow 作者仓库](https://github.com/world-grow/WorldGrow) | 2025-11-14 推理/权重；AAAI 2026；License TBD | turn240800232search8 / turn726263929view5 |
| W27 | [作者链接的 WorldGrow 权重页](https://huggingface.co/UranusITS/WorldGrow) | 有仓库；没有 model card | turn736568739view1 |
| W28 | [Marble 发布](https://worldlabs.ai/blog/marble-world-model)；[World API 发布](https://worldlabs.ai/blog/announcing-the-world-api) | 2025-11-12、2026-01-21；多模态、导出、API | turn661573056search5 / turn972402981view1 |
| W29 | [World Labs 发布索引](https://worldlabs.ai/blog) | Atlas 2026-09-01/11-12；Frameboy 11-05 | turn317865787view0 |
| W30 | [Atlas 官方技术介绍](https://worldlabs.ai/blog/atlas) | 2026-09-01；自回归扩散、相机/深度、隐藏区想象 | turn549524829view1 |
| W31 | [Atlas 产品](https://worldlabs.ai/atlas)；[Marble 导出文档](https://docs.worldlabs.ai/marble/export/gaussian-splat) | 服务/API/导出；套餐与模型开放程度不同 | turn549524829view0 / turn972402981view2 |
| W32 | [Frameboy 发布](https://worldlabs.ai/blog/atlas-realtime) | 2026-11-05；云 GPU，至多 15fps，研究预览 | turn549524829view2 |
| W33 | [Spark 官方仓库](https://github.com/sparkjsdev/spark)；[MIT LICENSE](https://github.com/sparkjsdev/spark/blob/main/LICENSE) | 开放的是渲染器；无需使用厂商场景资产 | turn765559606search0 / turn765559606search1 |
| W34 | [4D-GS 作者项目页](https://guanjunwu.github.io/4dgs/) | CVPR 2024；时空表示和形变机制 | turn463745323view0 |
| W35 | [4DGaussians 作者仓库](https://github.com/hustvl/4DGaussians) | 动态场景数据、逐场景训练、依赖 | turn340061269view5 |
| W36 | [4DGaussians LICENSE](https://github.com/hustvl/4DGaussians/blob/master/LICENSE.md) | 顶层 Apache-2.0，子模块另核 | turn317865787view2 |
| W37 | [WonderPlay 作者项目页](https://kyleleey.github.io/WonderPlay/) | ICCV 2025；物理 + 视频反馈 | turn381337741view2 |
| W38 | [WonderPlay 作者仓库](https://github.com/kyleleey/WonderPlay) | 实现已公开；单个 Venice 示例；中间资产与依赖 | turn583857698view3 |
| W39 | [HY-WorldPlay 官方仓库](https://github.com/Tencent-Hunyuan/HY-WorldPlay) | 2025-12-17/2026-01/03；记忆、动作、显存、权重 | turn972402981view5 |
| W40 | [HY-WorldPlay License](https://github.com/Tencent-Hunyuan/HY-WorldPlay/blob/main/License.txt) | Tencent 专用社区许可 | turn240800232search1 |
| W41 | [Cosmos Predict2.5 官方仓库](https://github.com/nvidia-cosmos/cosmos-predict2.5) | 2025-10-06；代码 Apache、模型 NVIDIA license；转向 3 | turn583857698view4 / turn583857698view5 |
| W42 | [NVIDIA Cosmos 3 发布](https://nvidianews.nvidia.com/news/nvidia-launches-cosmos-3-the-open-frontier-foundation-model-for-physical-ai/)；[官方仓库](https://github.com/NVIDIA/Cosmos) | 2026-05-31；7 月 Edge、10 月交互更新 | turn886982793search0 / turn886982793view0 |
| W43 | [Cosmos3-Nano 官方模型卡](https://huggingface.co/nvidia/Cosmos3-Nano) | 16B、OpenMDW1.1、模型限制与测试硬件 | turn317865787view3 / turn463745323view4 |
| W44 | [Cosmos 3 当前仓库 LICENSE](https://github.com/NVIDIA/cosmos/blob/main/LICENSE) | OpenMDW-1.1，不能套旧版模型许可 | turn463745323view5 |
| W45 | [Genie 3 发布](https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/) | 2025-08-05；逐帧生成、720p/24fps、明确限制 | turn240800232search4 |
| W46 | [Project Genie 发布](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/)；[当前官方帮助](https://support.google.com/labs/answer/16875695?hl=en) | 2026-01-29 初始 60 秒；当前期限依模型/体验，实验性质 | turn240800232search5 / turn240800232search6 |

## 6. 证据边界与未完成项

- 本轮未运行这些模型；成熟度、集成成本和风险是资料研判，不能作为本机实测结果。
- 有的项目页与仓库状态不同步：WonderPlay 项目页仍保留将公开代码字样，但官方链接的仓库已经有代码；以实际仓库状态描述，保留差异。
- HY-World 2.0 的代码/权重发布与 DOCUMENTATION 的生成章节进度不完全同步，需真实小样验证，不凭“Open-source plan”复选框判定全部链路已顺利跑通。
- 许可证结论限定到本轮读到的具体仓库/版本；代码、权重、第三方基础模型和生成资产不自动共享同一许可。
- Marble 站点能看到未来停服日期安排，但公告发布时间未在本轮核实，不把 2027 事件写成截至 2026-11-23 已经发生的事实，也不据此替用户执行迁移。
- 下一步应由主项目定义一套小而明确的观测指标：相同相机的保留视图误差、深度/法线一致性、完整回访、近距离薄结构、反射/透射、固定种子再现、内存与耗时；再选择一个候选运行，而不是一次装入所有世界模型。
