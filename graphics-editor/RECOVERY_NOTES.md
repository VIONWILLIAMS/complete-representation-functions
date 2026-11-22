# 恢复与交接记录

记录日期：2026-11-22，北京时间。

## 原始任务

用户在上一段 CRF 图形计算编辑器对话达到长度上限后，要求在新对话继续工作。上一段末尾的明确任务是：整理完整最新的 1.0 版本、最新 1.1 开发计划和历史记录，提交 GitHub，制作经检查可在本地使用的压缩包，并提供 Codex 开发启动说明。

本轮追加的明确交付是：把目前找回的项目材料实际压缩，在对话中提供可下载文件，并给出可直接交给 Codex 的提示词。本包完成这一下载与开发交接；不把尚未进行的 GitHub 同步写成已完成。

## 恢复来源与版本

- 在线编辑器：<https://crf-street-04-lab-4d86.laterafter950.chatgpt.site>
- 从该编辑器对应的源码仓库恢复，提交为 `0b2fa1c044d073bd8349ef941cc1b213cbe1cfe1`。
- 该提交包含 1,934 个受版本管理的文件，源文件总字节数为 520,985,677。打包时保留每个文件的原字节，清单见 `provenance/source-manifest.json`。
- 最新 1.1 开发计划也明确引用上述审查提交；源码恢复与计划基线一致。
- 产品版本为 1.0，历史源码标识为 0.10.0/v10，下一产品版本为 1.1。原文件名、schema 与报告未批量改写。

## 恢复的独立文档

原始文档共八份，放入 `plans/` 和 `history/`，各文件的大小和 SHA-256 见 `provenance/recovered-document-manifest.json`：

1. CRF_1_1_Implementation_Plan.md
2. CRF_1_1_Execution_Plan.json
3. CRF_0_8_Development_Plan.md
4. CRF_Review_and_Iteration_Plan_v1.md
5. CRF_Review_and_Iteration_Plan_v1.html
6. LLM_HANDOFF.md
7. THEORY.md
8. README.md（早期参考资料，未覆盖当前源码的 README）

两份 1.1 计划仍是研究与开发计划；历史资料用于解释沿革，较早的技术路线或验收提案不能覆盖最新用户约束。

## 已恢复的关键文件

截图显示的三个附件均存在于完整源码中：

- `editor/reports/v10/kernel/evidence-summary.json`
- `editor/web/crf-gaussian10.js`
- `editor/web/crf-verifier10.js`

同时保留 `editor/web/task-runner10.js`、`editor/server/generative10.mjs`、高斯拟合脚本、当前与历史界面、观察资产、报告和旧版下载包。当前 verifier 的存在不能证明已实现形式证明；当前循环的存在不能证明已实现程序级 RSI。

## GitHub 状态

已只读核实仓库：<https://github.com/VIONWILLIAMS/complete-representation-functions>。

核实时主分支为 `main`，HEAD 为 `57f23c7fb86d0c4fbbfda5fafb05ca5bbea07201`，包含论文、研究对象与编辑器 0.8 计划，尚未收录本包的完整 1.0 编辑器工程及 1.1 交接内容。本轮没有修改远端仓库或上线原编辑器。

这个仓库与在线编辑器源码仓库是两个来源。不要把仓库中 0.8 计划的“文档版本 1.0”误认作编辑器产品 1.0。后续同步应保留原研究资料，使用清楚的应用目录或开发分支，并以提交回执验证结果。

## 完整性边界

本包包含已恢复基线提交的完整当前文件快照、八份原始文档、本次新增交接说明与可复现验证记录。没有拿到能够确认完整性的上一段逐字聊天，也无法保证未提交的临时文件全部恢复。24 条可读取提交的文本记录已保存；Git 对象数据库、开发依赖、临时构建目录和本机凭据不作为交接文件收录。

独立解压检查的最终回执单独随 ZIP 提供；它记录完整性和启动情况，不改写原始实验报告，也不代表 1.1 已完成。
