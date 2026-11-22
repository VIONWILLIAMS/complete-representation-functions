# CRF 0.8 高斯函数与场景格式

本文件定义当前可执行的二维视觉表示，便于其他 LLM 编写场景 JSON、修改对象和复现像素输出。它描述已实现的协议；不包含未实现的三维几何、相机轨迹、物理材质或隐藏面推断字段。

## 三个层次

| 层次 | schema | 职责 |
| --- | --- | --- |
| 函数资产 | `crf.gaussian_asset.v0.8` | 一块局部二维观测的高斯 RGB 场，以及可选 alpha 覆盖率 |
| 场景 | `crf.gaussian_scene.v0.8` | 画幅、底色、对象引用、变换和层级 |
| 目录 | `crf.function_catalog.v0.8` | 将语义、来源和文件位置映射到稳定的资产 ID |

LLM 通常只输出场景；高斯系数由数值拟合器生成。浏览器根据目录载入资产后，再运行共享渲染器。来源图片、比较缩略图和重建预览可以与资产同时保存，但 `renderScene` 不读取这些 RGB 图片文件。

## 高斯资产

以下是一个格式完整、可由引擎执行的简化测试场；它不是照片级物体模型。

```json
{
  "schema": "crf.gaussian_asset.v0.8",
  "id": "example.field",
  "width": 64,
  "height": 64,
  "base": [220, 220, 220],
  "splats": [
    [32, 32, 12, 9, 0.25, 20, -110, -120],
    [27, 26, 4, 3, 0.25, 15, 30, 32]
  ],
  "kernel": {
    "type": "signed_additive_gaussian",
    "cutoffSigma": 4,
    "sample": "pixel_centres",
    "colorSpace": "srgb_encoded_0_255"
  }
}
```

### 数学定义

像素中心为 `p = (x + 0.5, y + 0.5)`。每个条目有八个数：

```text
[cx, cy, sx, sy, theta, cr, cg, cb]
```

`cx,cy` 是局部像素坐标中心；`sx,sy` 是正标准差，单位为像素；`theta` **以弧度计**；`cr,cg,cb` 是允许为负的 RGB 系数。

令：

\[
\begin{aligned}
u &= \frac{\cos\theta(x+0.5-c_x)+\sin\theta(y+0.5-c_y)}{s_x},\\
v &= \frac{-\sin\theta(x+0.5-c_x)+\cos\theta(y+0.5-c_y)}{s_y},\\
g(p) &= \begin{cases}\exp[-(u^2+v^2)/2],&u^2+v^2\le16,\\0,&u^2+v^2>16.\end{cases}
\end{aligned}
\]

局部颜色场为：

\[
F(p)=b+\sum_i g_i(p)c_i.
\]

这里的 `b` 就是 `base`。这是**有符号加和的二维高斯基函数**。不要将 `cr,cg,cb` 当成单个半透明物体的最终颜色，不要在每个高斯后提前截断，也不要替换为常规 alpha splat 叠加。先累加完整场，再按渲染器规则截断到 `0..255`。

当前颜色计算在编码后的 sRGB 数值范围内进行，未声明线性光学辐射度。颜色相近、曝光修改或层合成不等于完整物理光照模拟。

### Alpha 覆盖率

没有 `alpha` 字段时，整个局部矩形为不透明。存在时使用：

```json
{
  "alpha": {
    "encoding": "rle8",
    "runs": [0, 20, 128, 5, 255, 35]
  }
}
```

每对数字依次为 `[覆盖率字节值, 连续像素数]`，按逐行、从左至右的顺序展开。覆盖率必须是整数 `0..255`，长度必须精确等于 `width × height`。上例只展示编码方法，需与对应资产实际尺寸匹配。

Alpha 可以来自输入透明通道、人工辅助分割或自动估计。它保存的是覆盖率，不是 RGB 残差。`pixelMaskVerified: false` 表示没有逐像素真实蒙版验收；不得因为蒙版存在就把它称为精确物体边界。

### 优化与来源字段

常见可追溯字段包括：

- `provenance.kind`、`algorithm`、`budget`。
- `sourceRGBEmbedded: false`、`losslessResidualEmbedded: false`。
- `sourceSHA256`、原始尺寸、拟合尺寸和规范化像素哈希。
- `representationScope: "full_frame" | "semantic_object"`。
- `fit.history`、几何优化是否可用、最佳检查点规则。
- `segmentation`：估计框、GrabCut 配置、裁切区域、覆盖率来源、人工修正。

这些字段帮助解释数据如何生成，不能改变渲染公式。`sourceRGBEmbedded: false` 不意味着没有利用原图学习；它意味着输出函数的 RGB 重建由系数求值，不在渲染时回放原图数组。

当前离线拟合包括稀疏最小二乘、残差引导的新增高斯、解析几何梯度及 Adam 更新。中心、尺度、方向与系数均参与可选几何优化，并保留全状态较优检查点。浏览器拟合使用同一资产格式，采用自身的残差初始化与数值优化配置；二者的执行参数和质量应分别报告。

## 场景 JSON

以下场景引用目录中真实存在的 `fruit.apple` 与 `fruit.pear`。它说明字段用法，最终位置仍需按目录中的原始尺寸和画面检查调整。

```json
{
  "schema": "crf.gaussian_scene.v0.8",
  "id": "fruit.arrangement",
  "title": "苹果与梨的函数组合",
  "width": 960,
  "height": 640,
  "background": [232, 232, 225],
  "objects": [
    {
      "id": "apple",
      "label": "苹果",
      "assetId": "fruit.apple",
      "x": 220,
      "y": 290,
      "scaleX": 1,
      "scaleY": 1,
      "rotation": 0,
      "opacity": 1,
      "visible": true,
      "hue": 0,
      "exposure": 0,
      "zIndex": 2
    },
    {
      "id": "pear",
      "label": "梨子",
      "assetId": "fruit.pear",
      "x": 445,
      "y": 137,
      "scaleX": 1,
      "scaleY": 1,
      "rotation": 0,
      "opacity": 1,
      "visible": true,
      "hue": 0,
      "exposure": 0,
      "zIndex": 3
    }
  ]
}
```

### 对象参数约定

| 字段 | 含义 | 默认值与模型接口范围 |
| --- | --- | --- |
| `id` | 场景内唯一、可持续编辑的对象 ID | 必填，避免修改时重新命名 |
| `assetId` | 函数目录中的资产 ID | 必填，不得编造不存在的资产 |
| `label` | 用户可读名称 | 可选 |
| `x,y` | 缩放后、旋转前的局部矩形左上角位置，单位像素 | `0`；模型接口 `-8192..8192` |
| `scaleX,scaleY` | 局部横纵缩放 | `1`；`0.01..20` |
| `rotation` | 绕缩放后矩形中心的旋转，**单位为度** | `0`；模型接口 `-360..360` |
| `opacity` | 整个对象的覆盖率倍率 | `1`；`0..1` |
| `visible` | 是否参与合成 | `true` |
| `hue` | YIQ 空间中保亮度的色相旋转，单位为度 | `0`；`-180..180` |
| `exposure` | 曝光档，颜色乘以 `2 ** exposure` | `0`；`-4..4` |
| `zIndex` | 层级，较大的对象后绘制 | `0`；模型接口 `-1000..1000` |

不要混淆资产高斯的 `theta` 弧度与对象的 `rotation` 度。`zIndex` 是叠放顺序，不是三维相机深度。比例不一致会拉伸外观；没有明确需要时保持 `scaleX == scaleY`。

模型接口限制画幅为每边 `64..2048`，总像素数不超过 `2,100,000`，对象数最多 24。共享本地引擎为了已有与本地导入案例，允许更大的有限范围；**用于 LLM 接口时应遵守较严格的模型协议**，不要利用引擎上限绕过服务校验。

### 资产解析

用于交换的场景可省略 `assets`，由目录解析资产 ID。执行 `renderScene` 之前，完整场景必须具备：

```js
scene.assets = {
  'fruit.apple': appleGaussianAsset,
  'fruit.pear': pearGaussianAsset
};
```

这是函数资产对象，不是图片 URL。目录项的 `assetUrl` 指向本地高斯 JSON；`referenceUrl` 和 `thumbnailUrl` 供检查和展示。不得使用比较图替代高斯求值，也不得把缺失资产悄悄替换成其他对象。

Node 中可使用现有解析与导出工具：

```js
const { hydrate, render } = require('./scripts/render_v08.cjs');
const fullScene = hydrate(scene);
const output = render(fullScene, '/tmp/crf08-scene.png');
```

`hydrate` 根据当前 `web/assets/v08/catalog.json` 读取缺失函数；已有内嵌资产继续使用。完整可复现交付必须包含场景引用的全部函数，只有 `assetId` 而没有相应目录和资产文件并不足以复现。

## 渲染顺序

1. 按高斯公式得到每个资产的浮点 RGB 场，并展开 alpha 覆盖率。
2. 初始化场景底色，按 `zIndex` 升序处理对象；相同层级保持对象数组顺序。
3. 将目标像素中心逆变换至资产局部坐标，对局部颜色和 alpha 做边界一致的双线性采样。颜色按覆盖率加权，再归一化，以减轻透明边缘的背景污染。
4. 应用对象色相、曝光和整体透明度，按 alpha 将对象颜色合成到底层。
5. 最终 RGB 使用 `floor(value + 0.5)` 后截断为 `0..255`；场景 PNG 的 alpha 为 255。

修改某个对象不会自动重新求解其他对象的光照。阴影若需要可编辑，必须用现有阴影函数资产独立表达；当前场景协议没有任意 `light`、`material` 或三维 `camera` 字段。

## 对象操作与事务

本地编辑可调用共享引擎的 `applyOps`：

```js
const CRF08 = require('./web/crf-gaussian08.js');
const edited = CRF08.applyOps(fullScene, [
  { op: 'set', id: 'apple', values: { hue: 18, exposure: -0.1 } },
  { op: 'set', id: 'pear', values: { x: 480 } }
]);
const image = CRF08.renderScene(edited);
```

支持 `set` / `update`、`add`、`remove`。`add` 提供完整 `object`；`remove` 指定已有 `id`。只允许协议中的可编辑属性。操作先作用于新对象列表，再整体校验；校验失败不会将半完成候选写回原场景。

服务端 LLM 编辑返回完整候选场景，而不执行任意 JavaScript。若传入 `editableObjectIds`，其余对象及画幅、背景必须保持原值。客户端应在实际渲染和审阅候选后决定保留；请求失败或候选校验失败时保留原场景。

## 语义与学习记录

图像语义结果绑定下载图 ID 和来源哈希：

```json
{
  "id": "reference.apple01",
  "label": "红色苹果",
  "category": "apple",
  "role": "object",
  "bbox": [0.12, 0.08, 0.86, 0.94],
  "palette": [[176, 38, 30], [230, 215, 190]],
  "lightDirection": "left",
  "description": "可见表皮、高光和轮廓；只有当前视角。",
  "tags": ["apple", "red", "side-light"],
  "limitations": ["背面不可见", "估计框不是精确分割"]
}
```

`bbox` 为归一化 `[x0,y0,x1,y1]`，不是 `[x,y,w,h]`。`role` 可为 `object`、`background`、`reference-frame`、`material`；完整多对象照片不应自动标成一个干净的单体函数。`lightDirection` 是描述性线索，并非测量出的物理光源。

检索记录、下载记录、视觉描述和拟合结果通过 ID、来源 URL、哈希与轮次衔接。应保留具体使用的来源及许可信息。失败来源须明确记录，并通过真实补查寻找公开替代来源；不得为凑数量猜图片 ID 或把重复裁切算作新实例。

## 验收与范围

`calculateMetrics` 对同尺寸 RGB 输出 MAE、RMSE、PSNR、最大误差与 RGB 完全相同比例；`PSNR: null` 在该实现中可表示零误差，不代表一般数据缺失。完整 SSIM 在离线验收中计算，浏览器即时指标中的 `ssim: null` 则明确表示未测，必须结合相应说明字段解释。

数值验收必须说明目标图是否缩放、是否只评估 alpha 内部、是否包含推断补全区域。编辑保护比较应针对修改前后的输出；参考图重建比较应针对声明的观测。两者不能混为同一“100%”指标。

本格式没有训练语言模型权重、通用生成先验、度量深度、真实新视角或视频时空一致性的完成声明。Depth Pro 2 研究权重没有接入当前执行路径。未来扩展格式必须显式增加版本、坐标定义和验证规则，不能让旧字段悄悄具有新的三维含义。
