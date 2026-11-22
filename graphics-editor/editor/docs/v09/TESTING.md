# CRF 0.9 实验运行与冻结任务

## 冻结协议

`benchmarks/v09/protocol.json` 在新 DeepSeek 生成任务前写入，配有 SHA-256 文件。`scripts/freeze_protocol09.mjs` 使用排他写入，不能覆盖现有协议。

- 10 个预选展示任务：建筑 3、自然风景 4、静物 3。
- 每任务固定文字、种子、1024×768 输出目标，以及部分独立编写的数量/关系条件。
- 正式终测：60 条不同描述，每条三个种子，共 180 个任务。
- 正式终测状态目前为 `not_run`。展示任务不等于终测，少量成功图不代替整个分母。

`node scripts/run_benchmark09.mjs --prepare` 仅生成未运行状态表，不读密钥、不调用模型。`--run` 必须提供真实 P3 通过证据文件，其结构为 `{gate:"P3",status:"passed",independentEvidence:[...]}`。禁止为了运行而伪造该文件。

## 共享执行路径

浏览器编辑器和 Node 实验均使用 `web/task-runner09.js`。Node 的 `scripts/experiment_runtime09.mjs` 仅替换存储、图片编解码和服务调用适配器：

- DeepSeek 调用实际 `generateNative09`、`researchGaussian08`、`learnSemanticDescriptors08`。
- 生成画面实际由 `CRF09.renderScene(scene,{model})` 求值。
- 图片通过 PNG 编码输出，JPEG 只用于模型观察和缩略图。
- 保存每个候选的真实 PNG/JPEG、场景、像素哈希和辅助评价。
- 默认共享模型为 `web/assets/v09/shared-appearance.json`；可用 `--model` 指定经过核验的模型文件。
- 场景工程嵌入当时的共享模型快照，后续模型变化不会改变原工程依赖。
- 若模型包含学习得到的高斯基，在线外观统计更新保留该基；不会假称新增参考已经重新训练了它。

## 凭据与断点

运行器只从 stdin 读取一行 `{ "apiKey": "..." }`。不接受命令行密钥，不创建密钥文件，不记录推理正文。可通过已有的隐藏输入启动包装器执行。

完整任务断点放在项目目录之外的 `../crf09_runs/`，其中实际图片 data URL 会拆成按内容哈希保存的二进制文件。代码、公开报告和公共资源没有隐藏的原图 data URL。

恢复必须使用 `--resume`；已完成服务响应直接复用。未保存结果的中断请求保留“结果未知”的记录，不当作没有发生。再次使用同一实验编号但没有 `--resume` 会明确拒绝。

如果任务在 `planning` 阶段失败、没有任何候选，且确认是能力描述需要修正，可以显式使用 `--resume --replan`。同一 task 最多一次重审，采用独立的 `plan_replan_1` 缓存键；原 plan/error、调用历史和费用元数据保存在 `planningHistory`、`usage`、`apiOperations` 中。原 prompt、seed 与全部预算不变。真正未实现的人物等条件仍会拒绝；已有对象的照片真实感不足写成质量限制，生成候选不会改变真实感验收门槛。

`node scripts/recover_reports09.mjs --run-id showcase-v1 --start 1 --limit 2` 仅重新导出已保存任务的真实报告与图片，恢复因本地导出异常遗漏的 paid 请求证据，不继续任务、不调用 API。旧导出异常保留在 `additionalRunnerFailures`。没有模型快照的规划失败使用 `model.sha256:null`。

## 生成案例

```sh
node scripts/run_generation09.mjs --run-id showcase-v1 --start 1 --limit 3
node scripts/run_generation09.mjs --run-id showcase-v1 --start 4 --limit 4 --resume
node scripts/run_generation09.mjs --run-id showcase-v1 --start 8 --limit 3 --resume
```

这些命令等待隐藏 stdin 凭据。`--start` 从 1 开始，`--limit` 最大 10。默认最多三个候选、两次实际画面反馈。`--candidates` 和 `--feedback` 可在允许范围内降低预算，报告保留真实配置。

输出：

| 路径 | 内容 |
| --- | --- |
| `web/assets/v09/generated/index.json` | 实际案例画廊，包含失败项 |
| `web/assets/v09/generated/<runId>/` | 选中 PNG、缩略 JPG、可重绘场景与报告 |
| `reports/v09/generation/<runId>/<caseId>/` | 所有真实候选 PNG/JPEG、场景、完整脱敏任务证据 |
| `reports/v09/generation/<runId>/summary.json` | 实际请求、token、任务和失败汇总 |

`review_required` 仅表示已有可检查的候选。相机/几何、参考图重建和照片真实感门槛仍需独立验收。

## 十轮参考学习

```sh
node scripts/run_learning09.mjs --category architecture --run-id learning-v1 --images 4
node scripts/run_learning09.mjs --category landscape --run-id learning-v1 --images 4 --resume
node scripts/run_learning09.mjs --category still_life --run-id learning-v1 --images 4 --resume
```

`--category all` 依次处理三类；每类独立十轮。可用 `--topic` 明确补学主题。每轮最多 1–6 张下载，实际不足时保留不足，不用重复裁切凑数。

流程复用任务运行时的 `mode:'learn'`：真实检索、下载、图像语义、数值拟合、共享统计更新，结束后不额外生成展示图。节点端预览拟合采用最长边 192 像素、1024 高斯、8 步几何优化，报告为 `preview`，不能算最终高保真或精确物体分割。

原始参考保存到 `fitting/learning09/<runId>/<category>/originals/`，拟合函数另存。所有来源与原图 SHA、实际提交给视觉模型的 JPEG SHA、尺寸、下载失败、拟合失败及共享参数变化均可追溯。

40 张独立参考是计划中的初始覆盖目标。十轮结束只有较少来源时，可以得到明确标为 pilot 的有限统计先验，但 `plannedMinimumMet:false`，不能把这当作完整数据目标通过。

### 在线十轮究竟更新什么

在线十轮目前更新的是 **每类图像的线性 RGB 均值、标准差和四个高斯频带的 RMS 幅度统计**。同一轮还会保存 DeepSeek 对真实图片的语义描述和每张图片的独立高斯拟合。三者是不同结果：

| 机制 | 当前会变化的参数 | 没有完成的内容 |
| --- | --- | --- |
| 在线十轮统计学习 | `observations`、`categories` 中的跨图颜色矩与频带幅度；来源记录和模型修订 | 不建立对象间的规范对应；不自动分离精确 alpha；不更新可采样对象高斯系数基 |
| 在线独立参考拟合 | 各张预览观测函数自己的高斯位置、尺度与颜色系数 | 这些独立数组不会直接平均成类别生成器；拟合成功不证明共享生成学习 |
| H2 对象函数族实验 | 已有 `functionFamilies.fruit_skin`：规范坐标中的固定高斯基、均值系数与 PCA 变化模式 | 当前在线十轮不会重新训练此函数族，不会把新参考自动纳入它的训练样本 |
| DeepSeek 语义与视觉调用 | 返回的场景程序、可见特征和反馈 | 不更新 DeepSeek 本身的模型权重 |

H2 的已有水果表面实验由单独离线流程构建，使用小样本规范对应和高频外观系数。它仍是有限研究结果，不能因为在线十轮成功就称为已经扩展到新类别，不能把 `observations` 数量当作 H2 训练样本数。其实际训练数量、来源和秩保留在 `functionFamilies` 内。

在线更新会保留已有函数族，并标记 `generatorBasisRetrained:false`。学习完成后，全模型的 ID 可以变化，但函数族的内容哈希应保持不变；变化来自新增统计参数。要让新参考真正更新 H2，后续还需独立完成对象提取、规范化对应、系数拟合、训练/留出划分和基更新，并重新评测。当前没有完成这些步骤时，必须把“在线共享统计更新”与“H2 对象系数基学习”分别报告。

### 并行类别任务

不同类别可用同一 runId 在不同进程运行，任务和报告目录按类别分开。共享模型提交时使用短时独占锁、重新读取最新模型并合并观测，保留最新函数族。不要同时运行同一类别的恢复任务。

新进程发布生成 gallery 时，共享锁覆盖读取所有独立 case report、重建和原子写入全过程。每个案例的独立报告是权威记录；最终 `node scripts/rebuild_gallery09.mjs --run-id showcase-v1` 从全部实际报告重建索引，可消除旧进程在锁机制引入前的并发写入遗漏。

已经启动的 `--category all` 若没有 `--resume`，到达另一个进程已创建的类别时，会拒绝重复批次，不再次调用 API，也不覆盖该类别报告。其进程退出码可能因此为 2；汇总时应把这类调度重叠拒绝与实际检索/视觉/拟合失败区分，读取各类别真实任务状态。显式按类别启动三进程比与 `all` 混用更清楚。

## 停止条件

当前形态或地形函数未实现的要求必须明确报错。冻结任务含海岸和森林；只有其实际函数可用后才能完成这些案例，不得把山湖结果换个标题冒充。

P3 没有通过时不运行 180 个终测任务，不制造完整盲评分数。API 返回成功、画面能导出和模型自评分数均不能代替独立真实感评价。

## 实际证据汇总

三类学习和十个展示任务均结束后执行：

```sh
python scripts/summarize_experiments09.py
```

该命令不需要密钥、不调用 API，默认拒绝把缺失或正在变化的报告写成最终汇总。`--dry-run` 只读检查；`--allow-incomplete` 可显式写出标为 incomplete 的快照。完整运行时会先从全部真实 case report 重建 gallery，再输出 `reports/v09/experiment_summary.json` 和 `web/assets/v09/experiments.json`。不会改动 acceptance 根报告。

统计区分检索返回图、去重来源、实际解码、描述符提取、已保存的独立预览高斯拟合和共享更新；不使用下载器内部多余 attempt 数冒充学习图数。API 依 requestId 去重，保存真实 token 和时长；没有账单时不估造金额。初始执行、重规划后的首张候选、最后选择和全部候选分别报告，失败任务仍在十个任务分母中。

独立冻结语义检查读取实际导出的 scene，重新核对预先写好的数量/关系条件，并解析 attachment。它只检查场景参数，不是看图识别、完整描述验收或照片质量评分。脚本不会授予照片级通过；180 终测保持未运行。

数据 split 审计以原离线 `shared_learning.json` 和 `appearance_observations.json` 的固定划分为基准，对在线来源进行原图 SHA、规范化照片 ID/来源页以及 dHash 保守近似重复检查。确切来源交集与启发式疑似交集分开。新增在线观测没有自动取得新的 train/validation/test 划分；学习前的留出指标仅属于旧模型历史快照，不会移用为在线更新后模型的成绩。H2 函数族内容哈希与在线 moments/bands 更新另外报告。

## 自动化检查

```sh
node --test tests/test_pipeline09.mjs tests/test_experiment09.mjs
python -m unittest discover -s tests -p 'test_experiment_summary09.py'
```

测试验证协议、语法、断点、实际像素编解码与运行边界。模拟网络测试不算实际模型调用证据。实际调用结果由上述实验运行器生成。
