# CRF 0.8：模型、参考学习与可验证输出

这里的“学习”指运行时参考收集、视觉语义整理和独立的高斯函数拟合；它不改变 DeepSeek 权重。搜索次数、来源数、下载图像数、已拟合函数数分别记录。

## 路由接入

Worker 为下列函数提供 `apiKey`（只在服务端）、`signal`，并将 `catalog` 传入生成函数。函数本身不修改已有场景，也不执行模型代码。

| 路由建议 | 导出函数 | 文件 |
| --- | --- | --- |
| `POST /api/crf/gaussian/generate` | `generateGaussian08(input, options)` | `server/gaussian08.mjs` |
| `POST /api/crf/gaussian/research` | `researchGaussian08(input, options)` | `server/learning08.mjs` |
| `POST /api/crf/gaussian/semantics` | `learnSemanticDescriptors08(input, options)` | `server/learning08.mjs` |

### 生成与修改

```js
const result = await generateGaussian08({
  prompt: '把已学习的苹果和梨排列在桌面上，保留自然光照',
  mode: 'generate',
  search: false,
  assetDescriptors: localLibraryMetadata
}, { apiKey, catalog, signal });
```

`mode` 为 `generate`、`edit` 或 `critique`。后两者需要 `currentScene`；`critique` 还需要实际画布的 `image`（PNG/JPEG/WebP data URL）。`feedback` 接受文字。`edit` 可指定 `editableObjectIds`，服务会阻止候选改变其余对象、画幅和背景。失败响应不携带可替换场景，调用方保留当前画面。

目录中的资产元数据需要 `id`、`width`、`height`，并可包含 `label`、`description`、`role`、`tags`、`limitations` 和 `defaultPlacement`。`assetDescriptors` 允许将浏览器新拟合的函数加入当次目录；这里只处理语义元数据，不获取网址或代码。渲染前，客户端必须在本地库解析所有 `assetId`，缺失时不能用其他图片悄悄替代。

`result.scene` 是 `crf.gaussian_scene.v0.8`，没有高斯系数和原图。客户端解析资产后交给共享高斯渲染器。模型只能编排已存在的函数及其变换；完整照片函数的裁切、缩放或整体调色应标为观测图变体。

默认生成启用 `thinking: {type: 'enabled'}`、`reasoning_effort: 'high'`。不支持时返回错误，不静默切换到非推理模式。最多自动修正一次 JSON 结构；这不等同于图像质量已经提高。响应保存请求 ID、token 数、是否观察到推理字段，但不返回或记录推理正文。

### 逐轮检索

```js
const round = await researchGaussian08({
  topic: '苹果、梨与橙子的自然摄影外观',
  round: 1,
  sessionId: 'fruit-learning',
  subtopic: '单个主体，轮廓清楚，优先开放许可证来源',
  priorSummary: '',
  excludeSourceUrls: [],
  collectImages: true,
  maxImages: 4
}, { apiKey, signal });
```

每次请求只执行一轮，`round` 为 1–10。调用方保存 `checkpoint` 后再发下一轮，将已遇到的来源与失败情况传回。只有真实工具调用成功才计入搜索轮数。单纯的模型文字声明或引用链接不能证明联网搜索已执行。

`collectImages: true` 会请求已有的受限来源下载器，返回通过图片容器和尺寸校验的 `images[].url` data URL。它可能返回零张图片；这时搜索仍可成功，但下载和拟合不能计为完成。优先来源页为 Wikimedia Commons 和 Pexels。当前运行中 Unsplash 返回 401，停止该来源并重新搜索公开替代来源，不绕过访问限制。Commons 通过公开 imageinfo API 请求缩略图，并接受实际返回的 thumb.wikimedia.org 官方 CDN；768 px 请求可能映射为 960 px 桶，记录实际解码尺寸。Pexels 删除 OG 图的强制高度和裁切参数，保留主体原始宽高比。单张仍限制 1.8 MB；许可证仍需逐来源核验，搜索命中不等于取得再发布授权。

### 真实图像语义提取

```js
const semantics = await learnSemanticDescriptors08({
  topic: '提取可复用的水果外观和光照特征',
  round: 1,
  images: downloadedPreviewImages.map(x => ({
    id: x.id, url: x.dataURL, sourceUrl: x.sourceUrl, sha256: x.sha256
  }))
}, { apiKey, signal });
```

每批 1–6 张，全部 data URL 合计小于 6 MB。推荐使用实际下载图像的 384 px 预览。`items` 逐项绑定输入 ID，包含主体名称、类别、角色、估计边界框、调色板、光向、可见描述、标签和局限。

`bbox` 顺序为 `[x0,y0,x1,y1]`，坐标归一化到 `[0,1]`。它是模型估计框，不能作为精确 alpha 蒙版或逐像素分割结果。语义提取响应不含输入图片字节，也不把查看图片记作高斯拟合。原图拟合在独立的数值优化步骤执行。

### 计数与汇总

`aggregateLearningRounds08(roundResults, {downloads, fits})` 去重同轮重试、来源 URL、请求 ID、下载图片 SHA-256 和函数 ID。下载记录必须 `status: 'downloaded'` 且有有效 SHA-256 与正数字节数；拟合记录必须 `status: 'fitted'` 且有 `assetId`、正数 `gaussianCount`。调用方必须提供真实完成记录。

## 结果边界

JSON 校验、真实联网调用、已查看图像、数值拟合完成和视觉质量验收是不同证据。成功生成接口返回 `rendered: false`、`validation.renderer: false`。客户端必须实际渲染，才能反馈图片或导出。模型自评不是独立的真实感评分，原图拟合误差也不能评价任意新场景是否真实。

## 检查命令

```sh
node --test tests/test_gaussian_provider08.mjs tests/test_learning08.mjs tests/test_references08.mjs
```

这些测试验证推理请求设置、数据限界、资产允许列表、局部编辑保护、错误回退、真实搜索计数、图像语义绑定和隐私边界；它们使用模拟网络，不能替代实际 DeepSeek 调用和画面检查。

## 官方接口依据

接口参数于 2026-11-21 对照官方资料核对：

- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [Vision](https://api-docs.deepseek.com/guides/vision/)
- [Web Tools](https://api-docs.deepseek.com/guides/web_tools/)
- [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)

缩略图 API 依据：[MediaWiki API:Imageinfo](https://www.mediawiki.org/wiki/API:Imageinfo)，`iiprop=url` 配合 `iiurlwidth`，返回的 `thumburl` 为实际获取目标。
