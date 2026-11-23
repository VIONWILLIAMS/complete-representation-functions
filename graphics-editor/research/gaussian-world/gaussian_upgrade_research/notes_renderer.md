# Gaussian 表示、几何、重光照与物理渲染混合：技术核查笔记

核查日期：2026-11-23。范围：官方论文、作者项目页、官方代码与许可证。仅调研；没有训练、下载模型、启动 GPU 或修改 CRF 项目。以下优先级是针对本项目的工程判断，不是论文排名。

## 一、建议先确定的技术边界

**保持程序生成内容为主线；把 Gaussian 技术作为表示、加速与优化工具。** 我们已知的程序几何、材料、灯光，不必先渲染成照片，再丢失这些信息去做一次病态的逆向重建。应保留显式场景作为真值，由程序输出多视角 RGB、深度、法线、材料参数以及 diffuse/specular 等分量，用这些数据初始化、约束和验证 Gaussian 表示。真实照片重建是另一个可选输入轨道，不默认纳入。[S1,S2,S10]

需要区分三个目标：

1. **外观重现**：从某一光照下的图像拟合新视角的颜色。原版 3DGS 擅长这个任务。
2. **几何正确**：表面位置、法线、厚度、遮挡在不同视角下合理。2DGS、SuGaR、GOF 重点处理这一层。
3. **光学可编辑**：把反射率、粗糙度、入射光、可见性、折射率等分开，改灯或改物体后重新计算正确光传输。可重光照 GS、混合光线追踪处理这一层，但仍有假设与近似。

原版 3DGS 的参数主要是位置、协方差/尺度/旋转、不透明度与视角相关颜色。颜色表示的是训练光照条件下的出射外观，不是已经独立求出的物理反射率。把这些颜色直接当作 albedo 重新照明，会把旧阴影、旧高光混进新光照；简单改变 SH 颜色也不等于重新解了渲染方程。[S1,S2,S7,S9]

Gaussian splatting 的透明度混合沿给定的观察射线合成颜色。玻璃与水除了透明，还会改变光线路径，涉及界面法线、Snell 折射、Fresnel 反射、全反射、厚度吸收以及可能的多次反射/焦散。因此，原版 alpha 混合无法直接代替这些光学过程。把难以解释的镜面内容拟合成镜后“虚假几何”虽可能得到好看的训练视角，也不保证物体移动和反射编辑时正确。[S10,S11]

## 二、12 组高价值一手来源

### S1. 原版 3D Gaussian Splatting — SIGGRAPH / TOG 2023

- 论文：https://arxiv.org/abs/2308.04079
- 官方项目：https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- 官方代码：https://github.com/graphdeco-inria/gaussian-splatting
- 许可证：https://github.com/graphdeco-inria/gaussian-splatting/blob/main/LICENSE.md
- 技术贡献：各向异性 3D Gaussian、优化/密度控制、快速可微 splatting，实现多视角辐射场重建和新视角渲染。
- 许可证证据：官方 Gaussian-Splatting License 限制为非商业研究/评估；其他用途需要许可，不能称为可任意商用的宽松开源协议。
- 对本项目的价值：理解表示与训练过程；作为新视角拟合的对照。
- 局限：不自带物理材质与光源分解；更高重建分数不自动证明几何或新光照正确；不能凭空增加程序场景中缺失的细节。
- 优先级：**基础参考 P0；原仓库不作为默认可分发主依赖。**

### S2. gsplat — 官方工程库；JMLR 2025，持续更新至 2026

- 官方代码：https://github.com/nerfstudio-project/gsplat
- 官方文档：https://docs.gsplat.studio/
- Rasterization API：https://docs.gsplat.studio/main/apis/rasterization.html
- 许可证：https://github.com/nerfstudio-project/gsplat/blob/main/LICENSE
- 许可证证据：Apache-2.0。依赖、数据、权重仍需按各自许可核对。
- 技术价值：CUDA/Python 可微 Gaussian 光栅化，3DGS 与 2DGS API、批处理、深度和附加通道等；适合做可测量的工程基线。
- 当前版本注意：本次官方 README 将 v1.6.0 描述为 v1.5.3 后的 main 分支变化，并明确尚未发布到 PyPI。2026 更新包括稀疏 tile、SH 算子、相机和性能改进；不能把 main 文档与已安装发行版混用。
- 抗混叠注意：`rasterize_mode="antialiased"` 在文档中对应 Mip-Splatting 的屏幕空间 opacity 补偿；不能据此声称完整实现了论文所有 3D 平滑与训练频率约束。
- 局限：它是基础设施，不会自动产生真实资产，也不会自动把 RGB 拆成物理材料和灯光。Blackwell 上具体可用性、速度、显存必须实际验证。
- 优先级：**P0，默认 Gaussian 实验后端候选。**

### S3. Mip-Splatting — CVPR 2024

- 官方项目：https://niujinshuchong.github.io/mip-splatting/
- 官方代码：https://github.com/autonomousvision/mip-splatting
- 许可证：https://github.com/autonomousvision/mip-splatting/blob/main/LICENSE.md
- 证据：README 明确继承 3DGS 许可证，属于非商业研究许可链。
- 技术贡献：3D smoothing filter 与 2D Mip filter，针对焦距、距离、采样率变化产生的高频伪影和尺寸膨胀/侵蚀。
- 对本项目的价值：用户要高清和近距离检查，必须评估不同分辨率/焦距下的稳定性；抗混叠应进入第一版实验。
- 局限：过滤不能补出输入和程序资产中不存在的真实纹理；同一场景的锐度/细节上限仍受表示与采样覆盖限制。
- 优先级：**P0 方法原则；采用兼容许可证的实现或独立实现，不直接拼接受限代码。**

### S4. 2D Gaussian Splatting — SIGGRAPH 2024

- 官方项目：https://surfsplatting.github.io/
- 官方代码：https://github.com/hbb1/2d-gaussian-splatting
- 许可证：https://github.com/hbb1/2d-gaussian-splatting/blob/main/LICENSE.md
- 已读取的官方原文：https://raw.githubusercontent.com/hbb1/2d-gaussian-splatting/main/LICENSE.md
- 技术贡献：把体积椭球改成有方向的平面 Gaussian 圆盘，采用透视准确的 ray–splat intersection，加入深度畸变与法线一致性约束。
- 许可证证据：Gaussian-Splatting 非商业研究/评估许可。
- 对本项目的价值：表面语义比自由体积椭球更接近已有程序网格；可用已知法线和深度监督，提高几何可解释性。
- 局限：几何改善不等于材质/光照分解；对复杂体积与透明光学仍需要专门表示。官方几何对比属于其测试数据，不能推成所有场景必然优胜。
- 优先级：**P1；有表面/网格交互需求时与 3DGS 对照。**

### S5. SuGaR — CVPR 2024

- 官方项目：https://anttwo.github.io/sugar/
- 官方代码：https://github.com/Anttwo/SuGaR
- 许可证：https://github.com/Anttwo/SuGaR/blob/main/LICENSE.md
- 技术贡献：把 Gaussian 与表面对齐，提取网格，并通过与网格绑定的 Gaussian 做进一步优化、编辑和动画。
- 许可证证据：官方 LICENSE 为 Gaussian-Splatting 非商业研究许可；仓库还包含上游代码。
- 对本项目的价值：GS 与传统 mesh 工作流之间的桥梁，适合研究局部编辑与混合表示。
- 局限：提取网格/纹理不等于恢复独立的 BRDF；网格颜色仍可能带捕获时阴影和高光。纯程序场景已有准确网格时，不应无必要地通过图像重新提取。
- 优先级：**P1 可选桥接；不作为主线必须经过的环节。**

### S6. Gaussian Opacity Fields / GOF — SIGGRAPH Asia / TOG 2024

- 官方项目：https://niujinshuchong.github.io/gaussian-opacity-fields/
- 官方代码：https://github.com/autonomousvision/gaussian-opacity-fields
- 许可证：https://github.com/autonomousvision/gaussian-opacity-fields/blob/main/LICENSE.md
- 发表题名：*Gaussian Opacity Fields: Efficient Adaptive Surface Reconstruction in Unbounded Scenes*。早期预印本题名略有不同。
- 技术贡献：通过 Gaussian opacity field 的等值面提取表面，结合几何正则与自适应 Marching Tetrahedra，面向无界场景重建。
- 许可证证据：官方 LICENSE 为 Gaussian-Splatting 非商业研究许可。
- 对本项目的价值：可选照片/GS 输入转网格后接入 BVH 路径追踪；也可评估 GS 表示的几何偏差。
- 局限：抽出的表面、法线、孔洞与薄结构需要独立验证；没有自动提供物理 albedo、roughness、IOR。
- 优先级：**P1，可选输入与几何测量分支。**

### S7. Relightable 3D Gaussian — ECCV 2024（预印本 2023）

- 官方项目：https://nju-3dv.github.io/projects/Relightable3DGaussian/
- 官方代码：https://github.com/NJU-3DV/Relightable3DGaussian
- 论文：https://arxiv.org/abs/2311.16043
- 许可证：https://github.com/NJU-3DV/Relightable3DGaussian/blob/main/LICENSE.md
- 技术贡献：给 Gaussian 加法线、BRDF 参数和入射光；区分局部/全局光照，使用基于 BVH 的点云光线追踪预计算可见性，支持重光照。
- 许可证证据：Gaussian-Splatting 非商业研究许可。
- 对本项目的价值：明确示范“可以换灯”还需增加哪些未知量与可见性运算；程序真值可减少其逆问题歧义。
- 局限：亮度、材质、法线与照明分解存在歧义；烘焙的可见性对几何编辑需重新处理。不能把某些数据集上的实时重光照等同于任意场景的完整多次光传输。
- 工程注意：官方安装示例仍指定 PyTorch 1.12.1 / CUDA 11.6；不能照搬到新 GPU 环境而声称已兼容。
- 优先级：**P1，作为材料/照明分离的受控实验与参考。**

### S8. GaussianShader — CVPR 2024

- 官方代码：https://github.com/Asparagus15/GaussianShader
- 官方论文补充材料：https://openaccess.thecvf.com/content/CVPR2024/supplemental/Jiang_GaussianShader_3D_Gaussian_CVPR_2024_supplemental.pdf
- 许可证：https://github.com/Asparagus15/GaussianShader/blob/main/LICENSE.md
- 技术贡献：为 Gaussian 增加简化 shading function 与可学习环境光，改善高反射物体的视角相关外观。
- 许可证证据：官方代码是 Gaussian-Splatting 非商业研究许可；项目网页的 CC 许可不能替代代码许可。
- 对本项目的价值：反射材质基准与环境光参数化的参考。
- 局限：简化环境反射模型与完整多次反射、折射和焦散不同；外观改善不能直接证明参数就是唯一真实物理材料。
- 优先级：**P2 对照方法；不同时引入多个重叠实验框架。**

### S9. DeferredGS — IEEE TPAMI 2025

- 官方论文页：https://ieeexplore.ieee.org/abstract/document/10964878/
- 官方代码：https://github.com/IGLICT/DeferredGS
- 年份证据：论文页列出 2025-04-14 发表，TPAMI 47(8)，2025-08。
- 技术贡献：把 texture/illumination 解耦，使用环境光、法线监督与 deferred shading，减少 Gaussian forward shading 在新光照下的混合伪影。
- 代码/许可证证据：官方 Jittor 实现公开，当前顶层目录未看到总 LICENSE；README 致谢 3DGS 等上游，不能据此推定宽松商用授权。需逐文件/上游核对。
- 对本项目的价值：支持“先合成 G-buffer，再按像素着色”这一路线；说明重光照质量不仅取决于 Gaussian 数量。
- 局限：论文摘要与当前 Jittor README 的法线来源描述有差异（摘要强调联合 SDF，README 默认 2DGS）；实现复现必须记录具体版本。研究代码不是已验证产品依赖。
- 优先级：**P2 方法借鉴；只有 P1 实验出现对应伪影时再引入。**

### S10. Editable Physically-based Reflections in Raytraced Gaussian Radiance Fields — SIGGRAPH Asia 2025

- 官方项目：https://repo-sam.inria.fr/nerphys/editable-gaussian-reflections/
- 官方论文：https://www-sop.inria.fr/reves/Basilic/2025/PHLD25/paper.pdf
- 官方代码：https://github.com/graphdeco-inria/editable-gaussian-reflections
- 许可证：https://github.com/graphdeco-inria/editable-gaussian-reflections/blob/main/LICENSE.txt
- 技术贡献：分离 diffuse/specular 重建，用路径追踪产生可编辑、多次反射；不再用镜后虚假几何去纯粹拟合镜面影像。
- 许可证证据：**新增代码 MIT**，但官方 LICENSE 明确其他组件仍受 3DGS、NVIDIA、viewer 等原协议约束；不能将整个仓库统称纯 MIT。
- 与本项目的直接关系：官方主要结果采用合成场景的真值 diffuse/specular/geometry/BRDF buffers。程序场景可以直接提供这些已知量，避免必须先运行单目材料/法线预测网络。
- 局限：作者称其为 proof of concept；真实场景结果依赖尚不完善的学习先验。README 明说网络预测输入效果较差，当前代码不支持 densification、建议密集初始化；不存在“随便一组照片就可靠完成所有反射编辑”的保证。
- 优先级：**P1 高价值研究分支，先在自生成、已知真值的小场景验证。**

### S11. WSGS / Through the Water — AAAI 2026

- 官方项目：https://cau-vilab.github.io/WSGS/
- 官方代码：https://github.com/CAU-VILab/WSGS
- 官方许可证文件位置：https://github.com/CAU-VILab/WSGS/blob/main/LICENSE
- 技术贡献：以可训练平面表示水面，2D Gaussian ray tracing 处理折射，以双 Gaussian 集合与软 mask 分别处理反射/折射，可编辑折射率。
- 代码/许可证证据：仓库存在 LICENSE，本次读取正文遇到服务错误，因此**不对其具体许可证作确定判断**。README 明确 Water Real/Water Synthetic 数据集仅学术用途；不能把代码、数据、模型许可证混为一谈。
- 成熟度：官方 README 的 2025-12-16 说明仍在，作者表示代码重构后因 CPU 问题未完成运行测试，并提示 CRC 错误可能影响文件。不能作为已证实稳定的即用模块。
- 对本项目的价值：说明水面为何需要独立折射建模；可做平静水面实验。
- 局限：训练水面是平面这一假设，不足以直接覆盖任意波浪、厚玻璃器皿、多界面折射和完整焦散。我们的湖面主渲染应继续保留显式几何与真实折射路径。
- 优先级：**P2，限定场景研究；不进入首轮主线。**

### S12. PhysGaussian — CVPR 2024

- 官方项目：https://xpandora.github.io/PhysGaussian/
- 官方代码：https://github.com/XPandora/PhysGaussian
- 论文：https://arxiv.org/abs/2311.12198
- 技术贡献：通过 Material Point Method 与连续介质力学，使 Gaussian 同时参与形变/应力模拟和显示，支持多种机械材料行为。
- 代码/许可证证据：顶层目录未找到独立 LICENSE；官方 README 确认依赖原版 gaussian-splatting 子模块。网页 CC BY-SA 4.0 是网页许可，不能当成程序许可。
- 对本项目的价值：未来动画、柔体、颗粒/塑性形变路线。
- 局限：这里的 physics 主要是**运动/力学**，不意味着解决了入射光、BRDF、玻璃折射和重光照。其重建起点仍是多视角图像与相机参数。
- 优先级：**P2，静态真实度稳定后再做动态。**

## 三、推荐的混合实现方式（工程建议，尚未实施）

### 1. 程序场景真值与 GS 预览分开保存

保持可编辑的显式 mesh/curve/volume、程序纹理、PBR 参数、灯光、相机作为场景源数据。导出已知相机的线性 HDR 与各类 AOV，作为训练和对照依据。不要用已经 tone-map、抑制亮点或锐化过的 PNG 当作物理真值。已有山水显示重建曾压低约 4.33% 的原始估计亮度，该显示滤波不能成为新材质或照明学习的唯一依据；需用原始 HDR，并先解决采样方差。[本轮项目记录；S7,S10]

Gaussian 分支先拟合固定灯光下的辐射场，用于相机导航、构图迭代与近似预览。训练成本只有在重复新视角访问足够多时才可能抵消；不承诺单张离线图一定更便宜。程序源场景没有的细节，不会因为把网格换成 Gaussian 自动出现。

### 2. 物理关键部分保留显式几何

玻璃器皿、金属主物体、水面、强反射/近景接触区域继续交给 PBR 路径追踪。场景稳定的远景/复杂遮挡外观可以尝试 GS 缓存。混合时必须统一坐标/尺度、线性颜色、曝光、透射率、深度、边界遮挡和射线方向。

若主光改变，固定光照训练的 GS 缓存应重建或失效；要持续任意改灯则进入明确的可重光照表示。不能在同一个区域同时把已有照明的 GS 颜色当自发光又加一次 PBR 光照，否则可能重复计能量。也不能仅把两幅 RGB 图硬叠加就声称是统一光传输。

### 3. 利用已知真值做可重光照 GS 实验

以 S10 的可编辑反射分离思路为优先研究对象，直接用程序材质、几何和光传输分量监督，先不引入外部预训练先验。可重光照 Gaussian 要显式携带/关联法线、BRDF、可见性与照明，而不只是 RGB。

NVIDIA 3DGRUT 的 primary raster / secondary ray tracing 混合方法由主代理进一步核查；它提供射线与 PBR mesh 混合的工程参考，但“能查询二次射线”本身不意味着已从任意 RGB 重建出了真实材料。这里不重复其 2026 新特性研究。

## 四、建议按以下可证伪实验排序

| 阶段 | 最小实验 | 必须观察的结果 | 失败说明什么 |
|---|---|---|---|
| P0 | 一个自生成场景，用程序已知相机/几何生成多视角 HDR；gsplat 拟合 | 留出视角误差、镜头运动稳定性、训练/渲染耗时与显存 | 表示或优化问题；不能由训练视角好看推断成功 |
| P0 | 固定场景测试多个分辨率、距离、焦距 | 细线/叶片/纹理是否闪烁、变粗、消失 | 抗混叠与尺度过滤不足 |
| P1 | 同一程序几何的 3DGS/2DGS 对照 | 与真实深度/法线/轮廓比较 | 外观拟合掩盖几何错误 |
| P1 | 保持物体不变，仅移动/旋转灯光；保留新灯光真值 | 高光、阴影、间接反射是否跟随物理预期 | 材质与灯光没有正确分离，或缓存失效策略不完整 |
| P1 | 金属球/镜面/玻璃厚壳/水面四类受控场景 | 多次反射、折射位移、吸收、遮挡，与路径追踪参考比较 | 二次射线或光学表示不充分 |
| P2 | 动画、复杂水面与重光照同时改变 | 跨帧几何/高光稳定性，计算成本 | 动态表示与光传输尚未协同 |

评测要分开报告：固定灯光新视角、换灯、换材质、几何编辑、跨时间稳定性。PSNR/SSIM/LPIPS 只有在相机和参考图像配准、颜色空间/曝光一致时才有明确意义；不能把一个分数包装成“现实度 95%”。

## 五、主代理可直接复核的网页证据索引

以下为本次搜索返回的证据标识；主代理在最终回答引用前应自行打开对应 URL。笔记中的 S 编号以官方 URL 为持久引用。

| 证据 | 本次引用标识 |
|---|---|
| 原版 GS 项目与论文 | turn156535216view2；turn621393027view1 |
| 原版代码许可 | turn829805179search1 |
| gsplat 当前版本/2026 更新 | turn503598213view3 |
| gsplat Apache 2.0 | turn645904174view1 |
| gsplat 抗混叠与 2DGS API | turn621393027view2；turn621393027view3 |
| Mip 方法与上游许可 | turn156535216view1；turn503598213view2 |
| 2DGS 方法与许可 | turn759539136view1；turn108597995view0 |
| SuGaR 方法与许可 | turn330638312view0；turn872398244view0 |
| GOF 方法与许可 | turn759539136view2；turn645904174view2 |
| Relightable3DGaussian 方法与许可 | turn872398244view2；turn872398244view1 |
| GaussianShader 方法与许可 | turn715287138search6；turn270166335view3 |
| DeferredGS 论文/官方代码 | turn715287138search3；turn270166335view2 |
| Editable Reflections 方法/合成真值限制 | turn270166335view0；turn298272808view3 |
| Editable Reflections 混合许可 | turn156535216view3 |
| WSGS 平面水面方法与代码警告 | turn715287138search9；turn759539136view0 |
| PhysGaussian 力学范围与源码依赖 | turn872398244view3；turn330638312view2 |

## 六、已准备的程序标定夹具（2026-11-23 实际生成）

标准库工具：`gaussian_upgrade_research/scaffold/tools/prepare_fixture.py`。

实际生成目录：`gaussian_upgrade_research/scaffold/fixtures/procedural_v1/`，包含 `metadata.json`、`cameras.json`、`geometry.scene`、`render_jobs.json`、`validation.json`、`manifest.json`，以及 3 组光照共 360 个可独立送入现有 CRF 的 `.scene` 文本文件。

- 程序内容：matte/metal/glass 三球、地面、面积光；米制、Y 向上，没有外部模型、图像或神经网络权重。
- 相机：3 个仰角 × 40 个方位，共 120 个视角，1024×768、竖直视场 50°、针孔。
- 分割：96 train / 12 val / 12 test；按连续方位块留出，三个仰角与三个灯光配置使用相同分割。没有随机相邻帧混分，也没有额外保护间隔；边界相邻视角仍可能相差 9°。
- 外参：OpenCV c2w 与 w2c，列向量轴为右、下、前；K 采用整数像素中心，cx=(W−1)/2、cy=(H−1)/2，与 CRF `(x+0.5,y+0.5)` 的边界坐标完全匹配。
- 验证：正交性、行列式和逆矩阵最大误差约 4.44e−16；目标投影中心最大误差约 1.14e−13 像素；OpenCV/CRF 射线方向最大差约 4.44e−16；完整结果在 `validation.json`。
- 状态：**仅准备了场景/元数据，未渲染、未训练、未使用 GPU。**

新目录再现命令（不覆盖已有夹具）：

```bash
python3 gaussian_upgrade_research/scaffold/tools/prepare_fixture.py \
  --output gaussian_upgrade_research/scaffold/fixtures/procedural_reproduction
```

现有 AOV 的真实语义已写入 manifest：beauty 是线性 RGB 采样估计；depth 是射线距离 t，需要除以 `sqrt(1+((u-cx)/fx)^2+((v-cy)/fy)^2)` 才是 OpenCV Z；normal 是朝相机翻转的世界空间法线；所谓 albedo 对金属和玻璃分别是模型的反射参数及每米 Beer 透射参数，不能统一当 diffuse albedo。Direct/indirect/specular/diffuse-component、material-ID 和 BRDF 图通道尚未实现，不能把它们作为当前可用的训练标签。

**当前最小实施集**：固定版本 gsplat + 这套已知相机的程序夹具 + 明确的抗混叠开关与尺度测试。3DGS 为第一对照；2DGS 仅在需要表面法线/深度约束时作第二对照。3DGUT 处理非线性相机或与二次射线兼容的需求，不作为一开始同时拼装的必要模块。P1 editable-reflections 分支必须先实现并核对真实光传输分量 AOV，再训练；程序真值可以减少逆向推断歧义，却不能绕过缓存失效、采样方差、许可证和实现成熟度问题。

