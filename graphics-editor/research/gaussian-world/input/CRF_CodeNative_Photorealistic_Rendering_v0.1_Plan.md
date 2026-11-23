# CRF Code-Native Photorealistic Rendering v0.1 — 技术实施方案

**性质：** 技术设计与验收计划；不是已经完成的渲染器，也不代表已生成照片级成品。  
**生成约束：** 图片中最终像素须由可追溯、可复现的计算程序生成；首轮不调用扩散模型、文生图 API，不使用外部照片贴图、现成三维模型、图片合成偷换结果。允许使用常规编译器、标准数学库及计算加速 SDK；若使用 NVIDIA OptiX，明确它是光线追踪加速与运行时框架，而非成品图像生成器。

## 1. 验证目标

制作一张真实摄影风格的竖幅静物：**午后日光照射的浅色木桌，粗陶花瓶、透明玻璃瓶、干枝与麻质背景**。不使用人像、森林或城市作为第一个场景，以缩小材质与几何复杂性，并确保能集中验证玻璃透射、陶瓷微表面、木纹、布料纤维、阳光阴影和相机景深。

首轮画面规格建议：
- 调试：320×480、低采样，查几何与材质；
- 可评审：768×1152 或 1024×1536，渐进式采样；
- 最终目标：至少 2048×3072、EXR 高动态范围主图 + 色彩管理后的 PNG。更大分辨率应以实测质量、显存占用与算时决定。

**成功必须同时满足：** 能由源文件完整复现；至少 4 类材质表现可信；存在可见的多次反射/间接光、玻璃折射与软阴影；逐模块记录样本数、配置及中间渲染数据；人工放大检查无明显结构穿模、法线错误、重复纹理和后期抹糊。

注意：没有与同一场景严格对齐的真实照片，就不能使用 PSNR/SSIM 声称“95%真实”。可采用盲评与局部质量清单；有参考图时才报告严格配准后的 SSIM/PSNR/LPIPS，同时记录几何/光照偏差。

## 2. 完整技术链路

`Prompt / Scene Brief → Agent 规划 → Scene DSL / Python 场景代码 → Geometry + Materials + Lights + Camera → C++17 物理渲染内核（CPU 基准）→ CUDA/OptiX GPU 后端 → 多通道 AOV / HDR EXR → 透明的降噪、曝光与色彩变换 → PNG/EXR → 质量审计 → Agent 修改场景代码 → 再渲染`

要严格区分三个层次：
1. **模型（LLM）**：生成和修改代码，选择构图与参数，不假设它拥有直接像素生成的能力；
2. **图形计算程序**：执行射线求交、材质求值、采样、光路积分、相机曝光等算法；
3. **算力执行环境**：CPU/GPU 运行程序，产出图像、辅助渲染通道和审计报告。

## 3. 必须实现的六大模块

### A. 场景表示与代码编译
- 场景对象、坐标系、单位、层次、实例化、参数表，采用可版本化 Scene DSL（JSON/Python）定义。
- LLM 输出结构化场景配置，不允许直接改写渲染后的 PNG 作为“优化”。
- 参数例子：`camera.focal_length`, `window.sun_angle`, `vase.wall_roughness`, `wood.grain_frequency`。

### B. 程序化几何生成
- 基础：triangle mesh、球、平面、圆柱、曲面旋转体、SDF；
- 扩展：花瓶车削轮廓、树枝分叉、叶片曲线、桌面板缝、织物褶皱；
- 精细几何：位移/法线扰动及多尺度表面缺陷；
- BVH 空间加速结构、相交鲁棒性和模型法线校验。

### C. 物理材质
- 漫反射、微表面 GGX、高光菲涅耳反射、金属、介电玻璃的反射/折射；
- 程序纹理：Perlin/fBm/Worley、方向性木纹、边缘磨损、陶瓷釉面随机粗糙度、织物纤维；
- 材质参数必须保持物理上合理：粗糙度、折射率、吸收、反射率；
- 后续可加入次表面散射、各向异性与薄膜干涉，但非 v0.1 必要。

### D. 光照与相机
- 从相机发射光线，求交、追踪路径，并将多条路径的能量统计为像素颜色；
- Path Tracing、直接光源采样、MIS、Russian roulette、软阴影、间接反射；
- 太阳/天空或面积光源，HDR 线性色彩计算；
- 实体相机：焦距、光圈、景深、快门、曝光与色调曲线。

### E. 计算内核与输出
- P0 使用 C++17 CPU 参考版做逐像素正确性测试；
- P1 使用 CUDA/OptiX 构建专用 GPU ray-generation / hit / miss / material shader；
- 逐步提升采样，保存 beauty、albedo、normal、depth、direct/indirect、sample count 等 AOV；
- 采用 OpenEXR / 线性 HDR 中间结果，再做曝光、色调映射与 PNG 编码；
- 低采样图可先使用传统、可审计的空间/时域滤波；若使用学习型降噪器，要明确披露它与最终渲染结果的关系。

### F. Agent 反馈修复闭环
- 自动诊断：噪声、几何穿插、法线朝向、黑斑/亮点、材质不连续、火萤点、曝光溢出；
- 区分两种错误：**渲染器数值错误** 和 **场景内容不真实**；前者修内核，后者改场景参数/形体；
- 允许 LLM 更新源码或场景参数并重新计算；每轮记录 `commit`, `config`, `seed`, `render hash`, `quality notes`；
- 不以“模型自称修好了”作为验收，必须重新执行和查看输出。

## 4. 开发阶段与验收门槛

| 阶段 | 最小交付 | 必须验收 |
|---|---|---|
| P0：数学与成像正确性 | 自研 CPU 最小 Path Tracer | 球体/平面/光源可重复渲染；法线和阴影正确；给定 seed 可复现 |
| P1：静物场景 | 玻璃、陶瓷、木材与布料程序资产 | 物体轮廓、折射方向、材质和局部阴影可信；给出 AOV 与放大细节 |
| P2：GPU 加速 | CUDA/OptiX 自定义 renderer backend | 与 CPU 基准在容差内一致；单独报告 GPU 显存、吞吐、samples/pixel 和 render time |
| P3：照片级迭代 | 高采样 HDR 成品与多轮修订 | 逐图审计：物理合理、材质微细节、镜头语言、无明显假纹理、无作弊贴图 |
| P4：Agent 自动优化 | 自动质检→改代码/参数→再渲染 | 连续多轮可运行、有代码 diff、质量改进有证据、失败能回滚 |

## 5. 仓库结构建议

```text
crf-photoreal/
  README.md
  docs/
    architecture.md
    quality-gates.md
    provenance.md
  renderer/
    include/
    src/
      math/           # 向量、矩阵、变换、随机采样
      geometry/       # 求交、曲面、BVH
      bsdf/           # 材质、菲涅耳、GGX
      integrators/    # path tracing、MIS
      camera/         # 成像与景深
      film/           # HDR、AOV、色彩管理
    cpu/
    gpu/              # CUDA/OptiX 后端
  scenes/
    afternoon_still_life/
      scene.py
      materials.py
      geometry.py
      config.json
  agent/
    plan_scene.py
    inspect_render.py
    propose_edits.py
  tests/
    render_regression/
    materials/
    geometry/
  outputs/
    previews/
    final/
    aov/
    audits/
  scripts/
    build.sh
    render.sh
    verify_provenance.sh
```

## 6. 96GB 显存使用原则

- 显存用来承载几何/BVH、不同材质表、光路状态、HDR 累积缓冲和辅助渲染通道，不应为了占满 96GB 而人为扩大工作集。
- 先测吞吐、GPU occupancy、显存带宽、光路分歧与内核性能，再决定波前路径追踪、材质分组、tile/queue 设置。
- 高分辨率、复杂几何和多通道缓冲可以吃到更多显存，但是否提质仍取决于场景和积分器正确性；采样数增加主要减少蒙特卡洛噪声，无法修复错误几何/材质。
- **本轮环境事实：** 当前可执行容器无可用 NVIDIA GPU；因此尚未验证用户的 RTX PRO 6000 是否可从此会话远程调度。

## 7. 严格反作弊与溯源

任何交付图片必须一起提供：
- 生成代码、场景定义、版本标识、随机种子及明确的启动命令；
- 原始 HDR/EXR、最终 PNG、AOV、渲染日志、耗时和硬件信息；
- 输入资产清单：区分完全程序化、程序生成后缓存、外部引用的资产；首轮外部资产清单必须为空；
- 可由全新环境执行生成，不使用原图像素、现成生成图片、网络图作为最终纹理；
- 至少一张放大局部，以及一轮修改参数后重新渲染的对照，证明内容受代码控制。

## 8. 主要风险与应对

1. **仅提高 spp 不能让错误的几何变真实：** 优先修改模型/材质/光照，而非盲目加算力。
2. **程序噪声无法自动等同真实材质：** 使用分层频谱、方向性、多尺度几何缺陷、透射等可解释规则。
3. **自研渲染器可能出现隐藏偏差：** 使用独立参考框架（pbrt-v4 / Mitsuba 3）作为校验 oracle；参考图不冒充自研代码渲染成品。
4. **绝对的“照片级”没有单一数值阈值：** 同时采用盲评、局部结构检查、多视角一致性与可计算质量指标。
5. **GPU 不可用不应阻断逻辑验证：** 先完成 CPU 参考版，再独立移植 GPU 并比较结果。

## 9. 参考实现与技术依据

- PBRT v4 与第四版免费教材： https://pbrt.org/
- NVIDIA OptiX 9 Programming Guide： https://raytracing-docs.nvidia.com/optix9/guide/optix_guide.250703.LTR.pdf
- Mitsuba 3，可微渲染与场景优化： https://mitsuba.readthedocs.io/en/latest/src/inverse_rendering/gradient_based_opt.html
- 公开的 Fable 5.2 完全由代码绘制案例：https://github.com/BubbleBrainBB/awesome-fable-5.2

## 10. 结论

路线可行，且应优先采取 **“LLM/Agent 生成场景程序 → 自研计算渲染内核 → 真实的图像输出 → 有证据的局部反馈优化”**。本方案属于设计阶段；第一张可复现的高质量样片、渲染内核和 GPU 性能数据均需实际运行验证，不能提前视为完成。
