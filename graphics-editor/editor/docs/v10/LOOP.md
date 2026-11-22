# CRF 0.10：目标合约、证据和预算化视觉反馈循环

## 范围

本版本将生成、实际像素渲染、视觉评价、程序校验和候选选择接成同一个可恢复任务。入口为 `web/task-runner10.js`，验证器为 `web/crf-verifier10.js`。它们同时支持浏览器全局 `CRF10Tasks` / `CRF10Verifier` 和 Node CommonJS。

两种表示分别是：

| 表示 | 实际计算路径 | 应当如何理解结果 |
| --- | --- | --- |
| `reference_gaussian` | 已拟合的显式二维高斯资产 → 对象布局与外观参数 → CRFGaussian10 求值 | 参考照片外观的函数化重建、编辑或新组合；资产仍继承原拍摄方向和光照 |
| `native_procedural` | 语义场景参数 → 冻结的 CRF09 二维解析/高斯函数 | 程序合成结果；本轮没有增加经过训练的通用视觉先验 |

循环不会修改语言模型权重，也不会调用旧版 `learnAppearance`、PCA 更新或共享外观学习流程。`mode:'learn'`、`trainingAllowed:true` 和 `learningPolicy:'always'` 被拒绝。可以向渲染器传入既有的冻结模型快照；本任务只读取它。逐张照片的高斯系数拟合由独立数值工具执行，不代表模型已经学会生成同类任意物体。

## 0.9 中本轮修复的问题

审计依据是恢复仓库内的 `web/task-runner09.js`：旧循环只在 `index < max - 1` 时发起 critique，最终候选可能没有视觉评价；相同声明约束数量可以让更新候选直接替换旧候选；修订主要继承紧邻的上一个候选；默认 `auto` 策略还可能进入共享外观更新路径。

0.10 的对应行为：

1. 每个成功渲染的候选都进入 critique，再进入验证，包括预算内最后一个候选。不能评价时保留图像与失败原因，状态为 `blocked`。
2. 选择之前先检查硬约束、观测测量、评价证据是否完整。模型评分只用于候选排序，分数相同保留早期候选。
3. 下一次修订从当前保留的最佳候选出发，同时告知最近一次未改善尝试。
4. 模型与高斯资产在任务开始时留存快照，不进入训练分支。
5. 满足目标必需、且无法用允许替代完成的缺失能力停止为明确缺口；一般表示局限继续记录，不阻止可执行的修复。

## 目标合约与证据类型

目标合约 `crf.goal_contract.v0.10` 在首轮生成前固定。每个候选都保存相同合约的 SHA-256；执行中改变验收标准会停止任务。合约包含 `checks`，每项都有稳定的 `id`、`kind`、`type` 和 `required`。四种状态是 `passed`、`failed`、`unknown`、`blocked`，未知不折算为通过。

| 类别 `kind` | 本轮实现 | 能支持的结论 |
| --- | --- | --- |
| `program` | 有限数值、渲染器 schema 校验、注册能力 | 当前程序参数是否合法、算子是否存在 |
| `pixel` | 实际 RGBA8、尺寸、保护区域 RGBA 恒等、对象可见覆盖 | 指定有限像素上的事实 |
| `measurement` | 对齐参考图的 MAE、PSNR、梯度 MAE、完全相同 RGB 比例 | 这张观测图的重建误差 |
| `declaration` | 对象计数、可见性声明、声明颜色、相对位置 | 场景参数中的声明，不能替代最终像素中的识别 |
| `perceptual` | 当前渲染图上的 realism / semantic / coherence 评分及 major issue | 模型辅助视觉意见，用于反馈，不是形式证明 |
| `provenance` | 带当前帧摘要的外部证据 | 由指定外部生产者提供的记录，生产者身份仍需审阅 |

未知谓词没有隐含实现，会返回 `unknown`。例如仅写一个叫作“照片级真实”的目标，不会自动得到对应判定器。

能力缺口采用 `{capability,description,requiredForGoal}`。只有 `requiredForGoal:true` 自动阻塞；`false` 记为一般局限，旧字符串记为目标相关性未知。比如源苹果右侧缺少被遮挡的表面，但当前构图允许梨放在苹果前方，可以继续用现有位置和遮挡算子修复。若目标明确要求展示从未观测的背面且不允许替代，才属于必需能力缺口。明确的 `action:'unsupported'` 与真正的 `unsupported` issue 仍会停止；不能用普通 warning 掩盖不可完成的目标。

默认视觉阈值为 realism、semantic、coherence 各不小于 4/5，且无 major/critical issue。这些阈值是调度策略，不是客观照片质量标尺。即使这些项全部通过，仍停止为 `CHECKS_PASSED_INDEPENDENT_REVIEW_REQUIRED`，而不是宣布照片级成功。

`photorealisticAccepted` 只有在所需检查全部通过、感知检查通过，并有 `independentReview:{passed:true,reviewer,imageSha256}` 匹配当前帧时才为真。该字段记录独立审阅结果，并不把人的审阅转换成数学定理。自动任务循环不会自行写入独立审阅。

`referenceReconstructionAccepted` 是独立字段，要求至少一项真正的参考重建测量和对应硬约束通过。它不能转换成“新场景生成已具备同等真实感”。

## 像素协议

`measurePixels(reference, output, mask?)` 接收 `{width,height,data}`，其中 `data` 是 `width × height × 4` 个 RGBA8 样本。参考图与输出必须同尺寸；验证器不偷偷缩放或对齐输入。需要对齐时，应在进入验收前明确处理，并记录该处理。

当前协议名为 `aligned_unresized_rgba8_rgb_error_and_forward_difference_v1`：

- RGB 误差以解码后的 8 位 sRGB 数值计算，报告 MAE、RMSE、MSE、PSNR、最大通道误差及 95 分位通道误差。
- `exactRGB` 与 `exactRGBA` 分别统计全部颜色相同、全部颜色和 alpha 相同的像素比例；`alphaMAE` 单独报告。
- `gradientMAE` 比较水平与垂直前向差分。ROI 模式只计两个端点都在 ROI 中的差分。
- mask 以正值表示参与验收，不用未编辑的大背景稀释局部误差。空 ROI 会报错。
- 完全相同的 RGB 用 `perfectRGB:true`、`psnr:null` 表达正无穷，避免把 JSON 的 `null`误读为零。
- 本模块没有实现 SSIM、LPIPS 或自然图像分布质量，因此不会报告这些分数。

`protected_rgba` 对指定保护区域的四个通道作完全恒等检查，需要修改前 RGBA 与 mask。图像颜色主动改变后，与原图的差异可能增大；这应显示为观测差异，不能自动当成质量下降。因此普通编辑和新组合不要设置 `referenceRequired:true`。

`visible_coverage` 只接受内核的 `coverageSemantics:'visible_alpha_contribution'`，即每个对象在最终遮挡顺序后的可见 alpha 贡献。数组必须与输出像素数量一致，所有值位于 `[0,1]`。光是场景中有对象，或者遮挡前投影面积足够，都不满足这个检查。语义身份本身仍来自对象声明；接触阴影不计作对象可见面积。

## 图像证据绑定

任务运行时对三类内容计算摘要：

- `sceneSha256`：规范化场景 JSON，包括当前冻结高斯参数。
- `imageSha256` / `sourceFrameSha256`：最终 RGBA8 样本。
- `submittedImageDataURLSha256`：实际发给视觉评价器的图片 data URL。

视觉意见只有在 `imageEvidence:true` 且 `sourceFrameSha256` 与当前 RGBA 完全相符时才可用于当前验证。重新编辑任意像素后，旧模型意见会变为未知。数据 URL 可能是适当缩小的 JPEG 预览，因此模型意见不等于对每个原分辨率像素的精确检查；完整像素指标始终使用原 RGBA。

该绑定证明本地任务记录指向哪一帧，并不通过密码学证明供应商确实看懂了图片。服务器调用记录、实际请求图片以及反馈文本需共同保留。自定义 `render` 适配器必须诚实地从返回的 RGBA 编码预览。

## 最小集成接口

```js
const V = require('../../web/crf-verifier10.js');
const T = require('../../web/task-runner10.js');
const G = require('../../web/crf-gaussian10.js');

const runner = T.create({
  store: T.createMemoryStore(), // 浏览器使用 createIndexedDBStore()
  renderer: G,
  api: async (path, body, {signal}) => providerRequest(body, {signal}),
  render: async (scene, frozenModel, {signal}) => {
    const result = G.renderScene(scene, {coverage:true, filter:'mip'});
    return {
      ...result,
      image: await encodeActualJPEG(result),
      png: await encodeActualPNG(result)
    };
  },
  capabilities: {
    operations: ['layout','albedo_tint','exposure',
                 'illumination_gradient','mip_filter']
  }
});

const task = await runner.start({
  prompt: '把现有三个水果排成新的自然静物构图，保留其可见表面细节。',
  representation: 'reference_gaussian',
  currentScene: sceneWithLoadedAssets,
  assetSummary,
  reasoningEffort: 'max',
  budget: {
    maxCandidates: 6,
    maxQualityFeedback: 5,
    maxStagnantCandidates: 6
  }
});

const selected = task.candidates[task.selectedCandidate];
const pixelsAndPreview = selected
  ? await runner.getRender(task.id, selected.index)
  : null;
```

`providerRequest`、`encodeActualJPEG`、`encodeActualPNG` 在上例中是宿主适配器，不是内置函数。浏览器可使用内置 `defaultApi` 与 `defaultRender`；Node 需提供编码器。本轮服务器的默认地址为 `/api/crf/native10/generate`。

`create` 还支持 `getAssets`、`getAssetSummary`、`getModel`、`hydrateScene`、`applyOps`、`plan` / `propose` / `evaluate` 三个 API 适配器、`onEvent`、`onCandidate`。回调报错记录为 observer error，不抹除任务证据。

`start` 接受显式 `plan`、`contract`、`reference`、`previousOutput`、`masks`。如果给了已固定的 plan，循环会保留它而不会编造一次模型规划记录。需要按对象可见像素验收时，可给 `contract.checks` 添加：

```js
{
  id: 'apple.visible', kind: 'pixel', type: 'visible_coverage',
  objectId: 'apple', minimumPixels: 400, alphaThreshold: .1,
  required: true
}
```

参考高斯对象必须引用任务快照中已存在的 `assetId`。发送给模型的 `currentScene` 会去掉 `assets`、`assetUrls` 和 `appearanceModel`，模型只接收轻量场景与资产摘要。返回场景在渲染前重新注入冻结 `assets`。缺少资产会停止为 `ASSET_MISSING`，不会生成一个不可执行的假对象。

`reference_gaussian` 的对象 x/y 是图像平面像素坐标，不是 CRF09 的归一化对象坐标。材质编辑只是当前资产的颜色乘法与低频亮度近似；它不能恢复被遮挡表面，也不是物理逆渲染。

显式传入 `editableObjectIds` 时，服务器只允许这些对象被修改或删除，保护画幅、背景、其他对象全部参数及其相互绘制顺序，并禁止新增范围外对象。此检查是参数层的编辑范围约束；若要证明受保护的最终像素没有变化，还须提供 `protected_rgba` 合约、修改前帧和 mask。

## 执行、选择和停止

每个候选都走 `propose → render → critique → verify → select`。任务树 `taskGraph.nodes` 保留真实依赖、状态、request/run ID 和证据摘要。修订节点依赖被选中父候选的验证节点，不伪造未执行任务。

候选比较顺序：

1. 所需程序、像素与声明硬约束中尚未通过的项数。
2. 所需观测测量中尚未通过的项数。
3. 是否已经通过全部 required 检查。
4. 所需感知检查中所有未通过项数，包含 failed、unknown 和 blocked。
5. 所需感知检查中未知或阻塞的项数。
6. 是否存在实际帧评价。
7. 模型建议分数 `(2 × realism + semantic + coherence) / 4`，默认至少相差 0.025 才计改善。
8. 严重视觉问题数量和已声明参考 MAE。
9. 其余相同则保留早期候选。

例如旧候选自评分 4.8，但“没有重大问题”这一必需项失败；新候选只有 4.0，但全部必需检查通过，则选择新候选。这样提前停止时保留的结果也是满足检查的结果，避免因高自评分选回明确失败的旧图。

这是一种确定的搜索选择策略，并不声称分数增长必然带来人眼质量增长。最终选中图、全部候选和未知项都应展示，供独立审阅。

默认预算：6 个候选、5 次质量修订、连续 3 次未改善停止、32 次 API 操作、64 次供应商请求和 250,000 个已报告 token。可显式调整。一次 API 操作最多按两次供应商请求预留，因为服务器可能进行一次 JSON 结构修复。token 限制在下一次调用前检查，单次请求仍可能超过剩余额度，因此它不是绝对账单上限。

参考高斯服务器保留每次结构修复的 `attempts`。上游截断和模型 JSON 结构错误已报告的 usage 不丢弃；HTTP 或网络失败若没有 usage，则记录 `usageComplete:false` 和 `unknownUsageCalls`。`providerCalls` 计实际开始的请求，token 总数的 `totalsScope:'known_provider_reports_only'` 明示其只是已知报告之和；未知用量不解释为零费用。请求尚未发出时的配置错误不会伪计一次 API 调用。

六个候选与五次修订意味着最多六次视觉 critique。达到生成次数上限后，最后一张的评价仍必须执行。若调用预算已耗尽，则该图保留且评价未知，停止原因是 `FINAL_EVALUATION_BUDGET_EXHAUSTED`，不能宣布通过。

其他明确停止原因包括 `QUALITY_PLATEAU`、`CAPABILITY_GAP`、`UNSUPPORTED_REQUIREMENTS`、`NO_ACTIONABLE_REPAIR_WITH_UNRESOLVED_CHECKS`、`CONTRACT_CHANGED`、`HASH_UNAVAILABLE`、`CANCELLED`。改内核功能、增加新资产或更改目标后，应建立新的任务与合约，而不是把旧失败记录改成绿色。

## 保存与恢复

默认浏览器存储为独立数据库 `crf10-tasks`。任务、API 返回、完整渲染结果、参考与保护帧分别存储。`getTask(id)`、`getRender(id,index)`、`listTasks()`、`resume(id)`、`cancel()`、`selectCandidate(id,index)` 是公开接口。

Node 实验使用 `scripts/storage10.mjs`。RGBA、Float32 覆盖及其他受支持的数值数组保存为按内容摘要寻址的二进制，保留类型和字节；高斯资产外置并脱重，恢复后的共享资产缓存为深度只读。旧版数字数组与图片引用可以直接读回，读取不重写旧文件。百万数字数组不再创建百万个 Promise。记录和索引通过临时文件、同步和原子替换提交；同进程内多个适配器按目录串行写入。每个实验目录仍应由一个进程拥有，当前批次为每个案例分配独立目录。

索引损坏、已有记录却缺失索引、非法路径、符号链接、二进制内容摘要不符或缺失引用都明确报错，不自动解释成“没有生成过”。这保护已经完成的模型调用与渲染证据，避免因读回失败擅自重新付费生成。临时测试覆盖百万像素样本、按位恢复、缓存不可变和旧 checkpoint 兼容。

已完成操作优先复用保存的返回值。已验证候选不会在恢复时再次累计“未改善次数”。已经结束且需要审阅的任务，恢复时不继续偷偷调用 API。能力阻塞需要新任务明确改变前提。

对于 `failed`、`blocked` 或 `cancelled` 的未完成任务，可以显式使用：

```js
await runner.resume(taskId, {
  reasoningEffort: 'high',
  reason: 'Previous max-effort evaluation was truncated; reuse the saved frame.',
  budget: {maxTotalTokens: 300000} // 可选；未给字段保留原预算
});
```

调整只影响后续调用，保留原合约、候选、图像和全部 usage。`resumptionHistory` 保存之前的错误与配置，改变档位时产生 `reasoning_effort_changed` 事件。已生成并保存但缺少评价的图像只重做缺失 critique，不重新生成或渲染。失败评价的记录保留在 `evaluationFailures`，恢复成功时移除当前错误并记录恢复时间。明确必需能力缺口和改变合约不能通过此接口绕过。更多推理不是质量保证；高档推理导致输出截断时，降低档位可能使剩余任务完成，但其视觉质量仍需正常验收。

取消客户端请求不能保证远端没有执行或计费；无完整结果的调用记为 `interrupted_outcome_unknown` / `cancelled_outcome_unknown`，在预算中保留请求占位。先前图片不会因取消消失。手动选择候选会更新选择记录，但不会擦掉该候选的失败或未知检查。

## 验证

```sh
node --test tests/test_verifier10.cjs tests/test_task_runner10.cjs tests/test_provider10.mjs tests/test_storage10.mjs
```

54 项专项测试覆盖有限像素算术、ROI、alpha 保护、缺少参考、陈旧评价、独立审阅、实际高斯内核遮挡输出、schema 拒绝、一般局限与必需能力的区分、最优候选保留、必需项优先于自评分、终帧评价、预算中断、冻结模型、资产注入、恢复与取消，以及 high/max 实际请求字段、局部编辑范围、缺失视觉证据、供应商错误用量、结构修复、二进制存储与旧 checkpoint 读回。真实文件适配器与任务循环的联合测试证明：重新打开保存目录、显式改用 high 后，只重新评价缺失的终帧；原生成和渲染不重复，截断调用用量仍保留。

测试中的 API 是明确标记的 fixture，不代表真实 DeepSeek 已调用。真实供应商调用、token、候选图和评价结果由实际运行脚本与报告另外保存。

## 仍然缺失的能力

本轮没有通用生成模型训练、任意新物体先验、未知背面恢复、物理级重光照、完整多视角一致性、可形式化证明的照片真实感、自动修改任意渲染器源代码的递归系统。模块诊断可以指出边缘、遮挡、布局、照明、外观或语义的问题；修复只在当前已注册的算子中执行。更多推理可以改善这些可执行参数的选择，不能代替未实现的计算能力。
