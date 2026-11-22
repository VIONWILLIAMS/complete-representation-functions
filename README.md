# Complete Representation Functions / 完备表示函数

## CRF 图形计算编辑器｜1.1 开发入口

**当前实验分支已加入可学习对象函数工作台：真实本地训练、固定函数版本、统一 CPU 内核、Agent Harness，以及图片/二维视频导出。**

- **[1.1 实验分支启动与使用](graphics-editor/README_1_1.md)**
- [开发前完整技术设计](graphics-editor/plans/CRF_1_1_Learnable_Functions_Design.md) · [本分支交付与实测验收](graphics-editor/editor/docs/v11/DELIVERY.md)

下面保留原整体 1.1 计划的开发入口；本实验分支的局部验收不代表其中形式证明、WebGPU、程序级 RSI 和独立来源泛化已完成。

**完整工程已接入：可运行的产品 1.0 基线（历史 0.10.0/v10）＋最新 1.1 开发计划＋Codex 交接说明。1.1 尚未完成验收。**

- **[打开 1.1 开发工作区](graphics-editor/README.md)**
- [完整源码与历史资源](graphics-editor/editor/) · [1.1 开发计划](graphics-editor/plans/CRF_1_1_Implementation_Plan.md)
- [1.1 执行任务](graphics-editor/plans/CRF_1_1_Execution_Plan.json) · [Codex 交接提示词](graphics-editor/CODEX_HANDOFF_PROMPT.md)
- [本地启动](graphics-editor/README_START_HERE.md) · [验证报告](graphics-editor/verification/verification-summary.json)

应用代码和资源位于 `graphics-editor/`，原有论文与研究对象资料继续保留。开发编辑器时，请让 Codex 打开 `graphics-editor/` 目录并阅读其中的 `AGENTS.md`。

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

- 最新完整工程与 1.1 计划：[graphics-editor/](graphics-editor/README.md)
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
