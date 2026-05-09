# Complete Representation Functions / 完备表示函数

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
