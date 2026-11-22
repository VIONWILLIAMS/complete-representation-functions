# CRF 0.7 · DeepSeek 场景程序服务

> 下载版链接说明：本文件的资源链接指向已发布站点。标注“源码包内”的链接下载 [完整源码包](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)，解压后在 `CRF_Graphics_0_7/` 下按所列路径查找；离线阅读请使用包内 `docs/v07/DEEPSEEK_API.md`。


本模块把自然语言、可核验的网页参考、实际照片和当前渲染结果转换为声明式图像程序。它由宿主注入测试凭据，在服务端调用 DeepSeek；浏览器只接收经过验证的程序、操作、来源与用量记录。

`server/deepseek07.mjs` 是不依赖 Node 内置模块的纯 ESM，可用于 Worker 或 Node。HTTP 路由、密钥配置、参考照片下载和渲染器由宿主提供。该模块不执行模型生成的 JavaScript，不把参考照片直接铺到新场景画布。

## 已核实的官方能力

核实时间：2026-11-21。版本和能力以实际 `/models` 返回及官方文档为准，不应沿用旧版“DeepSeek API 不支持搜索或图像”的判断。

| 能力 | 本版本的选择与依据 |
|---|---|
| API 地址 | `https://api.deepseek.com`，聊天入口 `/chat/completions`；参见[创建聊天补全](https://api-docs.deepseek.com/api/create-chat-completion/)。 |
| 模型 | 默认 `deepseek-flash`；当前官方文档对应 DeepSeek-V4.1-Flash-1017，支持文本和图像输入、文本输出。`deepseek-v4-pro` 当前为文本输入，故不用于视觉反馈。参见[模型和价格](https://api-docs.deepseek.com/quick_start/pricing/)及[模型列表接口](https://api-docs.deepseek.com/api/list-models/)。 |
| 原生搜索 | 聊天请求声明 `deepseek_web_search` 和 `deepseek_read_url`，服务端执行工具并返回 `server_tool_calls`、来源与用量。参见[Web Tools](https://api-docs.deepseek.com/guides/web_tools/)。 |
| 独立搜索 | 若聊天没有可核验的搜索调用，最多补充一次 `/v1/tools/search`，`count:8`、`need_content:true`，查询最多128个Unicode字符。该独立接口目前不是图片搜索接口。参见[Search API](https://api-docs.deepseek.com/guides/search/)。 |
| JSON 程序 | Web Tools 与非文本 `response_format` 不能用于同一个请求。先做参考研究，再单独使用 `response_format:{type:'json_object'}` 编写程序。JSON模式不代替本地协议校验。参见[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)与[Web Tools](https://api-docs.deepseek.com/guides/web_tools/)。 |
| 视觉输入 | 用户消息中的 `image_url` 内容块，支持图像URL或base64 data URL。本模块使用经过宿主校验的PNG/JPEG/WebP字节；实际渲染图与参考照片分别计数。参见[视觉理解](https://api-docs.deepseek.com/guides/vision/)。 |

DeepSeek 在此输出文字和场景JSON。最终像素由 CRF 执行器计算。视觉模型内部会处理和缩放输入图片，视觉反馈不能替代确定性的逐像素误差计算。

## 请求与返回

宿主可分别暴露 `research`、`compose`，或调用 `generate` 完成参考研究与程序生成。三个函数均返回 Promise，成功时 `ok:true`，失败时返回可显示的错误对象。

```js
import { generate, research, compose, buildSystemPrompt } from './server/deepseek07.mjs';

const result = await generate({
  prompt: '自然窗光下的青色陶瓷花器、木桌和布料，具有真实接触阴影',
  history: [],
  mode: 'generate',
  engine: 'radiance07',
  search: true
}, {
  apiKey: runtimeSecret,
  validateProgram: Radiance.validate,
  collectReferences,
  signal: request.signal
});
```

`runtimeSecret` 由服务端配置注入，示例没有真实凭据。默认端点和模型固定；浏览器输入无法改写上游地址、认证头或模型。`fetchImpl` 可用于测试和宿主网络适配。

### 请求字段

| 字段 | 含义 |
|---|---|
| `prompt` | 1–8000字符的场景意图或编辑要求。 |
| `history` | 至多16条 user/assistant 文本，总长度至多24000字符；不接受来自浏览器的 system 指令。 |
| `mode` | `generate`、`edit`、`critique`。 |
| `engine` | 新生成统一使用 `radiance07`；编辑和检查保留 `radiance07`、`program06` 或 `legacy05`。 |
| `currentScene` | 编辑或检查时必需。可以是场景本体或 `{state:...}`、`{program:...}`。 |
| `search` | 是否执行参考搜索；新生成默认true，编辑/检查默认false。 |
| `image` | 当前实际渲染图的PNG/JPEG/WebP data URL，供视觉检查使用。 |
| `originalPrompt` | 可选，视觉改进时保留初始场景目标。 |
| `referenceImages` | 可选，最多8条 `{url:dataURL,sourceUrl,title,sha256?,imageUrl?,bytes?,mime?,width?,height?}`，用于重用已检查容器结构、尺寸和哈希的参考图像。 |

图像限制：每张data URL至多5500000字符，渲染图和参考图合计至多12000000字符，请求总量至多14500000字节。场景输入至多1600000字符，移除像素系数后的语义上下文至多100000字符。二进制和 `*Base64` 字段不会放入场景文本上下文；原始像素仍留在真实客户端中。

### 成功返回的关键字段

```js
{
  ok: true,
  runId: 'crf07_...',
  model: 'deepseek-flash',
  servedModel: '实际响应中的模型标识',
  action: 'program',
  engine: 'radiance07',
  message: '实际构造或修改的内容',
  program: { /* crf.image_program.v0.7 */ },
  qualityNotes: ['尚需视觉验收的具体项目'],
  warnings: [],
  research: {
    searched: true,
    nativeSearchObserved: true,
    toolCalls: [],
    sources: [],
    summary: '有来源的参考摘要',
    referenceImages: [
      { sourceUrl: 'https://...', title: '...', sha256: '...', submittedToVision: true }
    ],
    referenceImagesSubmitted: 1,
    referenceCollection: {
      sourcePageCount: 8,
      downloadedCount: 1,
      attempts: [],
      submittedToVision: true,
      submittedCount: 1,
      method: '实际采集方法'
    }
  },
  vision: { renderedImageProvided: false, referenceImagesProvided: 1 },
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, providerCalls: 2, requests: [] },
  validation: { declarative: true, envelope: true, renderer: true, clientValidationRequired: false }
}
```

上例的数字只说明字段含义。实际用量来自供应商响应，不预估为实际记录。`requests` 分别保留研究、补充搜索、生成或检查的 requestId、model、elapsedMs、token数及 `server_tool_use`。响应不包含认证头、搜索内部推理、签名或图像base64字节。

旧引擎返回 `operations`，不返回新程序替换其历史场景。0.5操作为 `set`、`delete`、`setCamera`、`setLight`；0.6操作为 `set`、`remove`、`camera`、`light`。服务器校验对象ID、白名单属性和数值边界，客户端再使用完整原始场景执行权威校验。服务器不会因为上下文省略了像素系数而错误地拒绝旧街景。

## 参考研究、照片采集与视觉生成

`generate` 按顺序执行以下步骤：

1. 研究请求启用官方Web Tools，优先检索与用户主体相符的Pexels、Unsplash、Wikimedia照片详情页和必要的形态资料。
2. 读取真实 `server_tool_calls`。仅当搜索调用确实完成，才设置 `searched:true`；模型自述“已搜索”、引用标记或供应商工具计数本身都不足以证明这件事。
3. 若没有原生搜索证据且允许补充搜索，只调用一次独立搜索接口。空结果仍表示搜索确实执行，但状态为 `completed_empty`，并显示没有可用结果。接口失败则报告 `unavailable`，不会编造搜索完成。
4. 若宿主提供 `collectReferences`，收集公开照片实际字节、来源和校验信息。页面401/403或下载失败记录在 `referenceCollection.attempts` 中，不绕过访问限制。如果第一轮没有取得任何照片，最多再执行一次实际Pexels来源搜索，再收集一次；用量阶段为 `reference_search_fallback`，两轮的页面尝试都会保留。仍无照片时明确报告零张视觉参考。
5. 将有效照片作为真实视觉输入提交给 `deepseek-flash`，同时提供来源和研究摘要。程序请求不启用Web Tools，使用JSON模式。
6. 校验JSON、IR、表达式和渲染预算，再把程序交给执行器。

参考采集钩子的接口：

```js
async function collectReferences(research, { signal, prompt }) {
  // 此处由宿主完成域名限制、网络超时、字节上限和格式核验。
  return {
    images: [{url: verifiedDataURL, sourceUrl, title, imageUrl, sha256, bytes, mime}],
    attempts: [{sourceUrl, title, status: 'downloaded', imageUrl, sha256, bytes, mime}],
    sourcePageCount: 1,
    downloadedCount: 1,
    submittedToVision: false,
    method: 'public source-page image metadata, verified image bytes',
    warnings: []
  };
}
```

钩子也可直接返回图像数组。最多选取8张。服务记录已下载数量与实际提交数量，不能把搜索来源数、下载数和视觉输入数混为一谈。只有生成请求成功返回后，才设置 `referenceImagesSubmitted` 和各项 `submittedToVision`。这表示照片已进入成功的模型请求，不证明模型在某个内部注意力位置使用了它，更不代表训练了模型权重或完成了像素拟合。

下载/验证失败时，生成可继续使用已有文本参考，响应会清楚提示。文字参考和图像参考在记录中分开。照片字节不进入生成IR，原生渲染器不会把它们当作直接贴图背景。

再次使用同一批照片时，应由服务端持有已验证字节的短期缓存，按sha256找到图像并重新填入 `referenceImages`。返回的元数据本身无法重建图像字节，也不应该把未取得的照片报告为再次提交。`compose` 只信任宿主 `options.researchResult` 的搜索证据；浏览器任意添加的 `input.research` 不会升级为搜索完成记录。

## 实际渲染反馈

生成完整程序后，先由CRF执行器渲染。编辑器可再发送：

```js
{
  mode: 'edit',
  engine: 'radiance07',
  search: false,
  originalPrompt: originalUserIntent,
  prompt: '检查这张实际渲染结果，修复遮挡、悬浮、过曝与材质问题，保留主体。',
  currentScene: renderedProgram,
  image: actualCanvasDataURL
}
```

这次模型看到的是实际候选图，而不仅是JSON文字。返回的新程序仍需通过同一套验证，再渲染并检查。宿主负责设置有限的改进轮数和保留上一版可用结果；服务不启动无限递归或无限重试。`critique` 同样支持视觉输入和返回修正程序。未提供图像时，系统提示要求模型承认只进行了结构检查。

## 验证、预算和失败行为

0.7程序需要匹配 [RADIANCE_SCHEMA.md](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Radiance_Schema.md)。表达式仅允许限定的数学节点，最多96节点、深度12。`add` / `mul` 接受2–8个参数，按左到右顺序求值；`sin` / `abs` / `clamp` 接受一个参数。这项有限的语法扩展来自实际模型候选中的合法多项数学表达式，没有静默改写原始模型程序。结果不能包含任意JS、外部shader或可执行HTML。宿主应注入执行器的 `validate` 方法，桥接模块还会做基础协议校验；注意 `assert` 返回程序本身，不符合 `{valid,errors}` 验证器契约。

研究默认最多2000输出token，上限3000；程序默认11000，上限12000。单次上游请求默认60秒，上限90秒，支持外部AbortSignal。响应上限2MB。JSON语法错误或已解析程序的协议错误，默认最多增加一次自动修正：把原始候选与准确校验错误交给同一个模型，重新返回完整JSON并再次校验。材质错误尽量列出稳定对象ID、字段名和边界。可用 `schemaRepair:false` 关闭。不会在服务器静默截断、改色、补填或钳制程序数值；执行器协议允许的可选字段按其既有默认语义执行。

修正结果在 `repair:{attempted,passes,recovered}` 中单独记录。所有已取得的供应商用量，包括第一份失败程序和第二份修正程序，均进入 `usage.requests`。JSON空白、长度截断、拒绝输出和不安全认证内容不会触发这一自动重试。修正后仍不合法则失败，不返回可提交的部分程序。不存在无限修复循环。

参考搜索补充、零照片时的替代来源搜索和程序协议修正是三个不同的有限步骤。它们可能增加网络耗时和实际调用量，记录中分别可见。宿主可用 `searchFallback:false` 或 `referenceSearchFallback:false` 关闭对应搜索补充。

诊断时可注入 `onProviderResponse(record)`。该钩子只接收 `{phase,runId,model,requestId,finishReason,content,usage}`，其中content是已检查认证内容的候选输出；不包含密钥、认证头、内部推理或签名。它适合保存真实模型候选及修正记录，不能用于执行模型代码。诊断写入失败不会抹掉已经付费取得的有效响应。

失败形态：

```js
{
  ok: false,
  runId: 'crf07_...',
  model: 'deepseek-flash',
  httpStatus: 502,
  error: {code: 'INVALID_MODEL_PROGRAM', message: '程序未通过校验。', retryable: false}
}
```

HTTP路由可用 `result.ok ? 200 : result.httpStatus`。认证拒绝、余额不足、限流、超时、取消、非JSON响应和截断具有独立错误码；原始上游错误正文不会直接返回，以免泄露密钥或内部信息。密钥没有默认值，不从客户端场景、历史消息或程序中读取。

## 测试与实际质量的区别

运行离线集成测试：

```bash
node --test tests/test_deepseek07.mjs
```

测试覆盖搜索证据与伪造搜索自述的区别、独立搜索补充、照片视觉提交、无字节回传、真实渲染反馈、历史引擎协议、无效程序和操作、输出截断、密钥脱敏、取消与超时。测试不使用真实凭据或发起付费请求。实际API调用及生成效果须另行保存供应商响应元数据、程序、渲染图与视觉验收结果；通过mock测试不等于达到照片真实度目标。

本版本提供了可执行的“资料与照片参考 → 场景函数 → 代码渲染 → 图像反馈修正”链路。它没有证明能从任意图片恢复唯一三维世界，也没有证明所有自然语言场景都能达到扩散模型或用户指定旗舰模型的质量。网页文字检索、照片视觉理解、图形函数组合、逐像素拟合、模型训练是不同环节，报告应分别陈述实际完成的环节。
