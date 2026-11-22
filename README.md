# Complete Representation Functions / 完备表示函数

## CRF 图形计算编辑器｜整体计划与 96 GB GPU 开发入口

**当前任务：把原生 CRF 计算推进到可编辑真实场景、高质量几何/材质/光照/细节，以及原生 2K/4K 输出。目标设备为用户已有的 RTX PRO 6000 / 96 GB。**

计划、当前约束和 Codex 开发任务已在本仓库统一。GPU 实现与正式验收仍需按计划完成；分支名称和文档提交不代表产品已完成。

| 入口 | 用途 |
| --- | --- |
| **[最新整体开发计划](graphics-editor/plans/CRF_Integrated_Development_Plan.md)** | 继承 1.1 要求、实际版本映射、几何/材质/光照/细节和整体交付门槛 |
| **[Codex 开发启动说明](graphics-editor/CODEX_START_HERE.md)** | 应用代码基线、阅读顺序、启动命令、首批实现任务 |
| **[开发分支：crf-gpu96-development](https://github.com/VIONWILLIAMS/complete-representation-functions/tree/crf-gpu96-development)** | 当前对象函数与 quality12 参考重建实现，加上整合计划；实际开发从这里开始 |
| [96 GB GPU 完整技术方案](graphics-editor/plans/CRF_96GB_GPU_Technical_Plan.md) | CUDA、三模式显存预算、并行拟合、采样、原生高分辨率和真实性验证 |
| [活动任务账本](graphics-editor/plans/CRF_Integrated_Execution_Plan.json) · [可复制交接提示词](graphics-editor/CODEX_HANDOFF_PROMPT.md) | 依赖、交付物、实现/验证状态与执行要求 |
| [基线与证据状态](graphics-editor/verification/GPU96_BASELINE_STATUS.md) | 已上传代码、未同步的 1.2 报告提交和未测项目的明确边界 |

**代码位置请区分：**`main` 保留恢复基线并同步最新计划；`crf-gpu96-development` 基于已核实的对象函数与参考重建提交 `55103cc7399cef3bb5eb7d9e7875f3785dedd9cd`。报告中的 1.2 实验提交目前不能在本仓库解析，原始报告文字与来源已归档，不能据此声称代码同步或复现完成。原 1.1 的计算内核、证明、真实程序 RSI、可运行编辑器四项完成条件继续有效。

应用开发约束见 [graphics-editor/AGENTS.md](graphics-editor/AGENTS.md)。论文、数学域、机器元数据与历史证据仍遵循根目录 `AGENTS.md` 的事实和验证规则。

---

> **Free Dancing in the Rabbit Hole.**  
> **But first, fries at the pier.**

_An independent researcher's epigraph._  
_独立研究员题记。_

**Complete Representation Functions: Paper, Proof Objects, DSL Runtime, and Agent Interface**

**完备表示函数：论文、证明对象、DSL 运行时与智能体接口**

This repository publishes the CRF paper as an **Agent-Native Research Object**: readable by humans, indexable by agents, and structured for future executable verification.

本仓库将《完备表示函数》论文发布为一个 **Agent-Native Research Object**：人类可阅读，智能体可检索，后续可调用、验证和复现实验。

---

## Language Versions / 语言版本

| Version | README | Full Paper | Agent Entrypoints |
| --- | --- | --- | --- |
| English | [README.en.md](README.en.md) | [paper/crf-paper.en.md](paper/crf-paper.en.md) | [AGENTS.en.md](AGENTS.en.md), [llms.en.txt](llms.en.txt), [llms-full.en.txt](llms-full.en.txt) |
| 中文 | [README.zh-CN.md](README.zh-CN.md) | [paper/crf-paper.zh-CN.md](paper/crf-paper.zh-CN.md) | [AGENTS.zh-CN.md](AGENTS.zh-CN.md), [llms.zh-CN.txt](llms.zh-CN.txt), [llms-full.zh-CN.txt](llms-full.zh-CN.txt) |

Default canonical files:

- `README.md`: bilingual repository entry.
- `paper/crf-paper.zh-CN.md`: Chinese original paper.
- `paper/crf-paper.en.md`: English paper version.
- `AGENTS.md`: default English agent instruction file.
- `llms.txt`: default English agent index.
- `llms-full.txt`: default English expanded agent context.

---

## Agent-Native Research Object

Core machine-readable files:

- [machine/crf.manifest.json](machine/crf.manifest.json)
- [machine/domain-registry.json](machine/domain-registry.json)
- [machine/keyword-table.json](machine/keyword-table.json)
- [machine/theorem-map.json](machine/theorem-map.json)
- [machine/claim-graph.json](machine/claim-graph.json)
- [machine/experiment-index.json](machine/experiment-index.json)
- [machine/dlm-map.json](machine/dlm-map.json)
- [machine/morphism-registry.json](machine/morphism-registry.json)

Schema contracts:

- [schemas/](schemas/)

Executable evidence roadmap:

- D4-D8 parser/evaluator/tests are planned under [domains/](domains/).
- Benchmark metadata is under [benchmarks/](benchmarks/).
- MCP server design is under [packages/crf-mcp-server](packages/crf-mcp-server).

---

## Graphics Editor History / 图形计算编辑器历史计划

- 当前整体计划与开发导航：[graphics-editor/](graphics-editor/README.md)
- 原始 1.1 需求：[CRF 1.1 完整计划](graphics-editor/plans/CRF_1_1_Implementation_Plan.md)
- 历史归档：[CRF 图形计算编辑器 0.8 研发计划](docs/graphics-editor/CRF_0_8_Development_Plan.md)

The plan covers image-plane Gaussian reconstruction, semantic object editing, and bounded language-driven generation. Its milestones and metrics are proposed research targets; this document does not change the verification status of the paper or runtime.

该计划围绕二维高斯重建、语义对象编辑与受限语言生成推进。里程碑和指标为拟定研究目标，文档归档不改变论文或运行时的验证状态。

---

## Minimal Verification

```bash
npm test
npm run validate:claims
```

Current release status:

- `v0.1`: readable paper and bilingual entrypoints.
- `v0.3`: agent-readable metadata and schemas.
- `v0.2`: executable D4-D8 evidence layer is planned next.
- `v0.4`: MCP server is planned after the executable layer.

---

## Core Thesis

For any formalizable domain `D`, if there exists a mathematically grounded complete representation function `F_D` with basis `B_D` and closed operations `Omega_D`, then the domain's AI-native DSL core can be derived from `B_D` and `Omega_D` rather than being designed only by expert convention.

The complete CRF chain is:

```text
Natural Language
-> BDI Intent Semantics
-> Intent IR
-> CRF-derived DSL
-> Verified Runtime
```

中文核心命题：

对于任意可形式化领域 `D`，若存在由数学完备性定理支撑的完备表示函数 `F_D`，并且该领域对象能够由基底 `B_D` 与封闭操作 `Omega_D` 生成，则该领域的 AI-native DSL 核心可以从数学结构中推导，而不是只依赖专家经验设计。
