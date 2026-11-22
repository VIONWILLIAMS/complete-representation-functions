# CRF 图形计算编辑器｜整体开发计划与 GPU96 工作区

**目标：让模型编写和修改场景程序，由 CRF 原生计算几何、材质、光照和细节，生成可编辑的高质量图片与视频。** 本轮按用户已有 RTX PRO 6000 / 96 GB 设计云端计算能力，同时保留原 1.1 的内核、证明、真实程序 RSI 和编辑器验收。

## 当前入口

| 文件 / 分支 | 内容 |
| --- | --- |
| **[整体开发计划](plans/CRF_Integrated_Development_Plan.md)** | 当前完整目标、范围变更、继承关系与交付次序 |
| **[Codex 启动说明](CODEX_START_HERE.md)** | 按实际代码开始开发，首批工作与复现命令 |
| [96 GB GPU 技术方案全文](plans/CRF_96GB_GPU_Technical_Plan.md) | 19 节技术方案、显存账本、几何/材质/光传输和质量实验 |
| [活动执行账本](plans/CRF_Integrated_Execution_Plan.json) | 任务依赖、预期制品、状态与验收 |
| [Codex 交接提示词](CODEX_HANDOFF_PROMPT.md) | 可直接复制给开发任务的完整指令 |
| [开发分支](https://github.com/VIONWILLIAMS/complete-representation-functions/tree/crf-gpu96-development) | 包含最新可读取对象函数实现与整合计划 |
| [基线核对](verification/GPU96_BASELINE_STATUS.md) | 可用代码、报告依据、未测能力与来源 |
| [现行工程约束](AGENTS.md) | 训练范围、版本、兼容、证据、预算与里程碑命名 |

## 先选对代码

本计划同时发布到默认 `main` 和开发分支，但应用源码基线不同：

- `main` 保留原恢复工程；在这里阅读计划并不表示已获得对象函数实验或 GPU 实现。
- **`crf-gpu96-development`** 以对象函数分支的实际提交 `55103cc7399cef3bb5eb7d9e7875f3785dedd9cd` 为基础，包含 1.1 实验内核、训练器、Harness、GUI、quality12 完整参考重建实现与既有运行证据，以及 quality13 全分辨率细节设计/合同。
- `quality12` 是内部模块编号，不是用户报告中的“1.2 已完成版”。quality12 实现已经在当前基线中，需先复现并继续改进；quality13 的新增实现尚待完成。
- 用户 1.2 报告中的 `0325a1c…` 和 `9c6ecd6…` 尚不能在本仓库解析。报告作为 `reported_only` 输入保留，代码定位与独立重跑是显式任务。
- GPU96 是当前开发项目名，可能服务后续候选版本；没有提前发布“1.3 完成版”。

## 启动已有参考重建与对象函数实验

在干净的开发分支检出中，使用 Node.js 22 或以上：

```bash
cd graphics-editor/editor
npm ci
npm run dev:quality
```

打开 <http://127.0.0.1:4173/quality12.html>。对象函数实验仍可用 `npm run dev:v11` 打开 `/studio11.html`。参考重建说明见[质量工作台](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/README_QUALITY.md)，对象函数说明见[当前实验启动说明](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/crf-gpu96-development/graphics-editor/README_1_1.md)。这里启动的是已有 CPU 实验；GPU 服务及其端点需按本轮任务实现，不能把启动旧页面记作 GPU 验收。

已有基线命令：

```bash
cd graphics-editor/editor
npm test
npm run test:v10
npm run test:v11
npm run test:quality
npm run verify:quality
npm run build
```

这些命令在源分支有真实脚本定义。本次计划发布没有重跑应用测试；请记录实际执行环境和结果。GPU、真实模型调用与服务器凭证不能用示例数据替代。

## 与历史资料的关系

原 [1.1 完整方案](plans/CRF_1_1_Implementation_Plan.md) 和 [T00–T26 原始任务](plans/CRF_1_1_Execution_Plan.json) 保留，整合账本负责追踪继承要求，不把旧 `planned` 或既有报告自动改为通过。

[1.0 本地启动与恢复说明](README_START_HERE.md)、`provenance/`、`verification/verification-summary.json` 和 `MANIFEST.json` 记录历史交接时的状态；`MANIFEST.json` 不是新分支全部文件的现行清单。新的计划文件不改写原始恢复证据。

[1.2 报告文本](history/CRF_1_2_Technical_Report.txt) 和[来源摘要](history/CRF_1_2_Report_Provenance.json) 可由 Codex 直接读取；文本副本不含原 HTML 内嵌媒体，不能用它冒充完整可复现实验源码。
