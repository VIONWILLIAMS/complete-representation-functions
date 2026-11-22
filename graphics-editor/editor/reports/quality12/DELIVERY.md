# 第二轮交付结果

当前版本 `1.1.0-experimental.2`；内部模块标识 quality12。入口、操作说明、公式、限制与复现请看 [README_QUALITY.md](../../../README_QUALITY.md)。

## 验收状态

| 项目 | 实际结果 | 证据 |
|---|---|---|
| 800×531 真实参考全帧 | PSNR 36.6677525 / SSIM 0.9728077 / MAE 2.1342954；通过 | `../../web/assets/quality12/alpine.quality.json`（完整路径从 editor 起） |
| 固定山林、水面、岸边 ROI | 三处均通过原冻结门槛 | `review/independent-audit.json` |
| 序列化后参数计算 | 无参考输入，JS 与 Python 全部 RGBA 相同 | `kernel/verification.json` |
| GUI PNG 与独立内核 | 原生、2×、编辑后、重开后全部相同 | `browser/artifact-verification.json` |
| 实际 Harness | JSON 调色/视口执行；越界资产修改拒绝 | `browser/edit-session.json` |
| 项目/反馈重开 | 内容摘要验证通过，1 条明确 AI 开发验收反馈保留 | `browser/reviewed-browser.crf.json` |
| 视频 | 真实 VP9、800×531、24fps、120 帧、5s；取消后可重新完成 | `browser/video-export.json` 与独立 ffprobe 记录 |
| 测试 | JS 187/187，Python 9/9 | `test-results.json` |
| 兼容与构建 | 885 旧文件、901 公共文件及9旧归档逐字节一致 | `build_verification.json`, `archive_packing.json` |
| 模型实际调用 | 本轮 0 次；未宣称实际 LLM 自主生成 | `browser/observed-acceptance.json` |
| 正式全量 CRF 1.1 | 未完成；证明/自主程序 RSI/通用生成各自保持未完成 | 设计范围与 README |

质量门槛和设计已先提交到 `f66a3e35b1501ef0172b859351a42aa4c03230ee`，没有在看到最终候选后降低门槛。实现和证据在其后的提交交付。

## 改进原因

同 65,536 个二维高斯，从固定几何的颜色拟合到中心、尺度、方向、颜色联合优化与回修，PSNR 29.5831→36.6678 dB、MAE 5.0471→2.1343。相同函数数量下质量显著提高，但增加了优化时间。最终拟合约48.54秒，参数容量524,291标量；不是压缩效果或跨场景泛化证明。

核心执行通过有限支持域求值，避免逐像素扫描全部函数；2×重算不使用已有 RGB 缓存插值。GUI、代码提案、保存与导出消费同一项目和内核。参考图严格留在拟合和单独对照阶段。

## 实际限制

- 主结果只针对既有 canonical 800×531 参考，不等于9528×6328相机原图的完整信息。
- 全帧最大通道误差80/255，细小高对比边缘仍可能失真；已经给出局部和误差图。
- Float32参数理论存储约原RGB字节1.65倍，JSON约4.18倍；小型泛化网络尚未完成。
- 图像曝光/对比/饱和修改不是物理重光照，镜头视频不包含学得的自然动态。
- 主质量测量、跨运行时一致性、视频有损编码误差与性能耗时分别报告。
- UI意见是明确标注的AI开发检查，不冒充独立多人盲评或用户认可。

## 修正过的实际问题

- 旧交付把工程执行和缓存一致性当成主验收；本轮冻结真实参考质量门槛。
- 内核极窄ROI的支持域整数溢出风险已修复，并有专门回归检查。
- PNG编码等待期间的项目变化会使导出记录摘要错配；现在摘要绑定导出帧的项目快照。
- 编辑或2×输出不再显示“当前原生重建通过”，而显示明确的未重验状态。
- 新代码修改尺寸后同步倍率选择，避免界面与实际尺寸不一致。

GitHub分支 `feat/crf-1.1-learnable-object-functions`，草稿 [PR #1](https://github.com/VIONWILLIAMS/complete-representation-functions/pull/1)。未合并主分支。
