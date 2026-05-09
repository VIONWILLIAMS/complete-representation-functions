# AGENTS.zh-CN.md

本仓库是《完备表示函数》论文的智能体原生研究对象。

## 权威顺序

回答问题或修改仓库时，请按以下顺序读取：

1. `machine/crf.manifest.json`
2. `machine/domain-registry.json`
3. `machine/keyword-table.json`
4. `machine/theorem-map.json`
5. `machine/claim-graph.json`
6. `paper/crf-paper.zh-CN.md` 或 `paper/crf-paper.en.md`
7. `domains/*/README.md`
8. `benchmarks/*`

## 语言策略

- `paper/crf-paper.zh-CN.md` 是中文原始全文。
- `paper/crf-paper.en.md` 是英文论文版本。
- `llms.zh-CN.txt` 与 `llms-full.zh-CN.txt` 用于中文智能体摄取。
- `llms.en.txt` 与 `llms-full.en.txt` 用于英文智能体摄取。
- 修改 claim 或 evidence 时，不要把语言路径和证据路径混在一起；机器证据应优先指向 language-neutral 的 machine 文件。

## 智能体操作规则

- 将本文同时视为人类可读论文和机器可读研究对象。
- 不要在未满足域准入公理时推断新 CRF 域。
- 不要在未更新 `machine/domain-registry.json` 和 `machine/keyword-table.json` 时增删核心 DSL 关键词。
- 不要在没有 `machine/claim-graph.json` 证据链时把 claim 标记为 `verified`。
- 不要把 JiYu Layer 4、图片转 3D、自演化运行时写成已完全验证，除非已有可执行测试。
- 公共工具默认只读或纯函数。
- 人类文本、机器元数据、schema、可执行证据必须分离。

## Claim 审核流程

1. 在 `machine/claim-graph.json` 中找到 `claim_id`。
2. 阅读关联论文段落。
3. 检查 evidence 文件。
4. 若存在 `reproduce.command`，只有在命令安全且可用时才运行。
5. 输出 `verified`、`partially_supported`、`theoretical`、`speculative` 或 `unsupported`。

## 域准入流程

1. 识别候选域函数签名。
2. 判断输出是否对领域对象空间封闭。
3. 判断是否有数学定理支撑基底和操作。
4. 检查是否可归约到现有 D1-D9。
5. 若拒绝准入，分类为 operation、validator、observer 或 combination pattern。
