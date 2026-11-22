# CRF 0.9：语义编译与持续任务

0.9 使用同一个声明式场景内核产生画面。DeepSeek 编译语义、检查实际渲染图并提出有限修订；CRF 数值内核生成像素。此版本的共享学习是从真实观测估计跨图像外观统计，不改变 DeepSeek 权重，也不等于通用照片生成器训练。

## 服务接入

增加 `POST /api/crf/native/generate`，调用 `generateNative09(input, options)`。已有 0.7/0.8 路由保持不变。服务端 `options.apiKey` 只用于现有受限 DeepSeek transport；浏览器没有密钥输入、保存或读取接口。

支持四种模式：

| 模式 | 输入 | 输出 |
| --- | --- | --- |
| `plan` | prompt、seed、共享模型摘要 | 有限形态能力范围、类别、可检查语义条件、学习主题和不能表达的要求 |
| `generate` | prompt、seed、category、plan、modelSummary | `crf.generative_scene.v0.9` 完整可编辑参数 |
| `edit` | 上述条件及 currentScene，可选 editableObjectIds | 保持未授权对象和全局条件的完整场景 |
| `critique` | currentScene、实际渲染 image data URL | 可见问题、待修模块及模型辅助分数；无场景修改 |

返回的 `scene` 不含图片 URL、原图、可执行代码或外部资产引用。实际渲染之前 `rendered:false`；质量字段始终注明需要独立检查。

```js
import {generateNative09} from './server/generative09.mjs';
const result = await generateNative09({
  mode: 'generate',
  prompt: '自然侧光中的苹果与梨，苹果在左边',
  category: 'still_life',
  seed: 42,
  modelSummary: {id: appearanceModel.id, categories: appearanceModel.categories}
}, {apiKey, signal});
// 验证结果后交给 CRF09.renderScene(result.scene, {model: appearanceModel})。
```

完整字段和范围由 `nativeSystemPrompt09`、`validateNativeScene09` 以及共享内核 `CRF09.validateScene` 定义。对象坐标是归一化中心坐标。当前支持 window、pole、signal、tree、ridge、apple、pear、orange、vase、rock；搜索新照片不会自动创造新的几何形态算子。缺少此类能力时任务明确停止。

## 一次任务的实际闭环

`web/task-runner09.js` 暴露 `CRF09Tasks.create(options)`。浏览器应按顺序载入 `crf-gaussian08.js`、`crf-generative09.js`、`task-runner09.js`。

```js
const runner = CRF09Tasks.create({
  renderer: CRF09,
  getModel: () => activeAppearanceModel,
  setModel: async model => { activeAppearanceModel = model; },
  onEvent: (event, task) => showTaskProgress(event, task),
  onCandidate: (candidate, rendered, task) => showActualCandidate(candidate, rendered)
});
const task = await runner.start({
  prompt: userPrompt,
  seed: 42,
  learningPolicy: 'auto',
  budget: {maxCandidates: 3, maxQualityFeedback: 2}
});
// 中断恢复：await runner.resume(task.id)
// 停止：runner.cancel()
// 取出真实 PNG：await runner.getRender(task.id, task.selectedCandidate)
```

默认流程会执行：

1. DeepSeek 将原始要求编译为语义计划，不能表达的要求显式停止。
2. 检查该类是否已有至少两个独立来源组的共享外观观测；已有时复用。
3. 缺少时执行十轮 `research`，每轮下载数量有限；再把真实解码图片提交 `describe`。来源、下载、看图、拟合分别记录。
4. 对真实像素提取线性 RGB 矩与四个高斯频带 RMS，形成共享外观参数；对每张参考执行已有高斯拟合。浏览器默认拟合属于预览等级，整图观测不伪称独立对象函数，也不自动准入高保真组合库。
5. 调用原生语义生成接口，实际渲染并保存画面；把真实画面提交评价。
6. 按边缘、接触、照明、布局、纹理或语义错误进行有限参数修订，最多三候选、两次质量反馈。
7. 保留全部候选、失败、调用记录和当前选择，结束状态为 `review_required`。

`learningPolicy` 为 `auto`、`always` 或 `never`。始终学习用于明确的新学习批次；普通编辑/生成不要求每次重复十轮。

### 统计更新与对象函数族分开记账

当前在线 `extractAppearance` / `learnAppearance` 估计的是跨图线性颜色矩与高斯频带幅度，保存为 `observations` 和 `categories`。虽然这些参数会参与新纹理采样，它们没有自动完成对象分割、部件对应或对象形状生成学习。

已存在的 H2 水果表面高斯系数基保存在 `functionFamilies`，由独立离线实验拟合规范坐标中的系数均值及 PCA 模式。在线十轮保留该基，标记 `generatorBasisRetrained:false`，不把新增参考计入其训练数量。独立预览拟合、在线共享统计、H2 函数族训练以及 DeepSeek 权重，是四种不同的状态；报告不得混合计数或以全模型 ID 变化宣称四者都已训练。

## 持久化与恢复

默认使用 IndexedDB，分别保存任务、实际参考、拟合资产、共享模型、渲染图和 API 结果。任务的成功 API 响应可在恢复时重用，避免再次调用已完成的阶段。因页面关闭而未保存结果的请求标为 `interrupted_outcome_unknown`；不假装该调用没有发生。

无 IndexedDB 的环境必须显式提供存储适配器；不会静默把内存状态称为持久任务。Node 端可提供 `get/set/keys` 的文件存储和 PNG 编解码器，使用同一个任务运行时。`createMemoryStore()` 仅供明确的临时任务和测试，`durable:false`。

重型拟合可通过 `fitReference` 替换为独立执行器；浏览器默认是 256 像素最长边、2048 核、12 次几何优化的预览配置。质量等级如实记录。`render`、`decodeImage`、`fitReference` 均可替换，但必须返回实际结果；不能返回未渲染的占位图作为成功。

## 编辑、评价与预算

- 局部编辑保护未选对象以及环境、光照、相机、画幅和固定种子。依赖阴影由渲染器随合法对象变化计算。
- 语义计数、位置和指定颜色检查只检查程序参数，不冒充图像识别或人工真实感判断。
- 模型评分标为辅助结果；系统不自动声称达到照片级或已通过发布合同。
- 默认每任务最多 40 次 API 操作、80 个可观察的 provider 请求预算。每次服务最多一次 JSON 结构修复；没有无限网络重试。真实 token 和请求 ID 保留，内部推理正文不保存。
- 搜索失败、下载失败、拟合失败、空候选、预算耗尽、取消均进入记录，不从验收分母删除。
- 最后选中候选只表示“没有已声明语义条件回退的最新候选”；不等于自动证明视觉提升。用户可选择其他已渲染候选，发布前仍需独立质量验收。

## 验证

`node --test tests/test_pipeline09.mjs` 检查有限语法、编辑保护、真实图像反馈、十轮流程、共享统计更新、持久恢复、预算和失败记录。测试使用模拟网络，不代替真实 DeepSeek 与生产环境验证。

官方 API 参数复用 0.8 当日已核对的 `requestGaussianJson08`：推理开启、JSON 输出、实际图片输入、手动重定向策略、有限响应大小和取消。模型标识沿用现有 `DEFAULT_MODEL`；没有静默切换到不支持的模型。
