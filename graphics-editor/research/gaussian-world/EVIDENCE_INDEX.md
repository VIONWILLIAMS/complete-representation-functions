# 证据索引、状态与勘误

所有路径相对本目录。历史绝对路径保留为原运行环境记录，重放不要求重建相同 `/workspace/scratch/...` 或 `/opt/codex/...` 路径。

| 需要确认的事实 | 对应文件 | 解释边界 |
| --- | --- | --- |
| 用户原计划 | `input/CRF_CodeNative_Photorealistic_Rendering_v0.1_Plan.md` | 独立实验范围，不改主产品版本 |
| CPU 实现与基础检查 | `crf_render/src/renderer.cpp`、`crf_render/logs/renderer_verification.json` | 有限检查，不是完整物理正确性证明 |
| 五图配置与耗时 | `crf_render/outputs/collection_manifest.json`、`crf_render/outputs/CRF_0*.json`、`crf_render/logs/CRF_0*.log` | CPU 单次实测；无 GPU 加速比 |
| 产品早期源码 | `crf_render/run_sources/product/` | 不同于最终 CPU 源码 |
| 其余四图源码指纹 | `crf_render/run_sources/*/source_hashes.json` | 静物/室内还需 `crf_render/scenes/arch_helpers.py` |
| 单参数对照 | `crf_render/logs/controlled_parameter_check.json` | 玻璃 transmission 颜色一项改变；不能外推任意编辑 |
| 显影偏差 | `crf_render/audit/`、`crf_render/docs/FIREFLY_RECONSTRUCTION.md` | 静物与山水都有有偏处理；原始 HDR 不变 |
| 早期 GPU 准备 | `crf_render/logs/cuda_preparation_status.json` | 历史快照，不是最新编译状态 |
| 最终 CUDA 编译 | `crf_render/logs/cuda_compile_status.json`、`crf_render/logs/cuda_nvcc*.log` | 交叉编译/链接成功；GPU 未执行 |
| 连接/Notebook | `crf_render/logs/cloud_connection_status.json`、`crf_render/logs/colab_connection_status.json`、`crf_render/delivery/CRF_GPU_Colab.build.json` | 仅无凭证状态记录；GPU 单元格未运行 |
| 研究与一手来源 | `gaussian_upgrade_research/CRF_Gaussian_World_v0.2_Research.md`、`gaussian_upgrade_research/notes_*.md` | 最终路线以报告/交接为准；第三方性能不是本项目实测 |
| 相机与 AOV 约定 | `gaussian_upgrade_research/scaffold/ADAPTER_NOTES.md`、`gaussian_upgrade_research/scaffold/fixtures/procedural_v1/metadata.json` | 锁实际后端版本后再次验证 |
| 360 场景定义 | `gaussian_upgrade_research/scaffold/fixtures/procedural_v1/` | 没有训练图或权重 |
| 准备工具实际检查 | `gaussian_upgrade_research/scaffold/validation/` | CPU 代数、包一致性、环境采集 |
| 实验与接口提案 | `gaussian_upgrade_research/scaffold/config/` | 不是可执行训练/调度框架或完整 JSON Schema |
| 文件复制来源 | `records/COPIED_SOURCE_MANIFEST.json` | 字节哈希，不是真实性评分 |
| 本次交接检查 | `validation/handoff_validation.json`、`validation/repository_checks.log` | 文档/来源/路径/语法与根仓库检查 |

## 原始记录的必要勘误

1. **法线空间**：旧 `SCENE_FORMAT.md` 的 Camera normal 文案不准确；实现是 face-forward 世界空间 first-hit 表面/着色法线，编码 `n*0.5+0.5`。没有修改旧文档以伪造历史，接入以本说明及新 ADAPTER_NOTES 为准。
2. **depth / albedo**：depth 是单位射线距离 t；换到相机 Z 需乘射线前向分量。材质色的含义依材质变化，玻璃是 Beer 透射色，不是漫反射率。
3. **CUDA 状态顺序**：先准备、后编译失败、最后 CUDA 13 本地链接成功。所有阶段均无 GPU 执行，不能挑一个 JSON 的状态代表全部进度。
4. **参数不等同**：旧 README 命令是示例，GPU `--full` 的尺寸/深度亦与历史 CPU 五图不同。复现/性能比较必须读取每图实际 JSON，另建同条件配置。
5. **E5b 数据缺口**：当前三面积光不构成远场 PRT 基准；新的光照基底/未见组合数据还未生成。
6. **既有应用 vs 独立实验**：主项目已有 2D Gaussian 外观重建；本轮尚无 3D gsplat 实验。两者分别记录，不能互相替代完成状态。
7. **验证灯光**：固定光照 E2 的 train/val/test 均为 `neutral_top` 的不同视角。`warm_left` 只用于换灯开发验证，`cool_right` 用于 L/VL 换灯测试；过程审阅中简写的“训练/验证/测试灯光”不能覆盖固定光照 V 的协议。

## 来源与收录范围

本目录含全部研究文本、准备脚本/夹具、可复现源码、参数、保留的失败与成功日志及有偏处理审计。机器依赖/工具链、构建二进制、缓存、凭据、上传回执、数 GB 的原始图像不放入源码 Git。大文件有显式索引、大小、SHA 与已有交付入口，见 ARTIFACTS。缺少资产时应报告缺口，不能因有链接/摘要就声称已取得字节。
