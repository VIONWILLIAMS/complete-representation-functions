# CRF 0.6：观测到同一物体程序

本模块把一张照片中的**一个有前景分离条件的水果**转换成 `CRFProgram` 的物体。输出包含旋转体半径函数、紧凑的表面颜色函数、来源与置信信息。该物体和语言规则生成的物体使用相同的几何、材质、变换、编辑与时间轴接口。

这里已经实现“照片证据 → 可执行物体函数 → 共同渲染器”的连接。它没有实现任意照片的自动场景理解，也没有声称从单图恢复真实隐藏表面、真实材质或 100% 像素一致性。

## 文件与复现

| 文件 | 用途 |
| --- | --- |
| `web/crf-observation.js` | 无第三方依赖的浏览器 / Node 拟合器 |
| `scripts/build_observations06.cjs` | 从真实照片重新拟合苹果和梨子，输出资产及指标 |
| `scripts/build_observation_board06.py` | 将独立参考裁剪、掩膜和拟合正视图合成检查图 |
| `web/assets/v06/observed-fruit.js` | 运行时资产；不包含整张来源照片 |
| `web/assets/v06/*-reference.png` | 照片的真实裁剪，仅供对照检查 |
| `web/assets/v06/*-reference-mask.png` | 分割证据，透明处是排除的像素 |
| `web/assets/v06/*-fit-front.png` | 由半径函数与颜色场计算出的正视图 |
| `web/assets/v06/observation-overview.png` | 原图裁剪 / 掩膜 / 函数结果的检查图 |
| `reports/v06/observation_fit.json` | 真实损失曲线、拟合误差、文件哈希与运行时大小 |
| `tests/test_observation06.cjs` | 形状变化、留出隔离、无背景污染、共同编辑接口等测试 |

在仓库根目录运行：

```sh
node --test tests/test_observation06.cjs
node scripts/build_observations06.cjs
python scripts/build_observation_board06.py
```

构建脚本使用项目已有的 `pngjs`。检查图脚本使用 Pillow；它只排版已生成的独立证据图片，不参与拟合。

## 照片来源与辅助信息

输入是 `web/assets/cases/orchard-reference.png`，800 × 600，来自 Yves Geissbühler 的 [Apple and pear](https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg)，CC0 1.0。资产中保存规范化输入的 SHA-256，以区分不同像素版本。

两个矩形 ROI 由人选择，坐标是左闭右开的 `[x0, y0, x1, y1]`：

| 对象 | ROI | 原因 |
| --- | --- | --- |
| 苹果 | `[128, 202, 392, 470]` | 分离可见果体，减少旁边梨子及下方接触阴影的干扰 |
| 梨子 | `[349, 72, 647, 515]` | 包含完整果体，允许算法剔除细果柄与周围背景 |

矩形之外没有手绘轮廓输入；没有使用 0.5 版本的标签图。轮廓由当前像素算法计算。苹果右侧被梨子部分遮挡，部分反光和果柄还留在其观测颜色中。ROI 是明确记录的辅助信息，不能据此声称已经实现无辅助的物体识别。

## 浏览器与 Node API

浏览器加载 `crf-observation.js` 后，使用全局 `CRFObservation`。Node 使用 `require()`。函数是同步的，较大导入应放入 Worker，或先明确地缩小输入。

```js
const result = CRFObservation.fit(
  { width, height, rgba }, // RGBA 字节数组；尺寸必须匹配
  {
    id: 'apple.observed',
    label: '参考苹果',
    kind: 'apple',        // apple / pear / auto
    bbox: [128, 202, 392, 470],
    profileSamples: 32,   // 8…128
    fieldSize: 128,       // 16…256，正方形 UV 场
    // mask: Uint8Array(width * height), // 可选的全图二值掩膜
    // budget: { maxInputPixels: 2000000, maxForegroundPixels: 200000 }
  }
);

const { object, report, preview, mask } = result;
```

`preview` 含 `{width, height, rgba, mask}`，对应拟合物体的正视裁剪。返回的 `mask` 是原输入分辨率下的前景证据。它们用于检查，不会自动写进物体 JSON。

默认输入预算为 200 万像素，前景观测预算为 20 万像素。超出时明确报错，要求先缩小或裁剪。调用者可以显式提高预算，但硬上限是 1600 万输入像素和 40 万前景像素。提高预算会增加时间和内存，绝不是免费提高质量。

输入为空、尺寸错误、ROI 越界、掩膜不匹配、类别不支持、预算越界或找不到足够前景时，抛出 `CRFObservationError`。无法拟合的输入不会被悄悄换成预制苹果。

辅助 API：

```js
CRFObservation.segment({width, height, rgba}, options);
CRFObservation.decodeField(object.material.field); // {rgb, confidence}
CRFObservation.sampleField(object.material.field, u, v); // RGB
```

## 1. 从像素提取证据

默认分割是有范围限制的颜色先验。红色苹果使用红绿差与绿蓝差的比例，保留暗红边缘，同时减少黄色邻物进入。黄色 / 黄绿色梨子还要求蓝绿比足够低，以排除部分灰色投影。算法不是通用语义分割模型；其他颜色的水果、类似颜色的背景、多物体粘连和严重遮挡都可能失败。

如果 ROI 含足够透明区域，可以使用 alpha 前景。调用者也可以提供掩膜，此时该掩膜作为外部观测约束记录。自动分割使用最大连通分量、闭运算、填洞和小尺度开运算清理噪声，再剔除顶部 / 底部很窄的果柄带。

颜色阈值只决定哪些像素可以成为证据；不会把程序的半径轮廓硬编码为某张参考照片。测试对两个不同轮廓运行同一拟合器，验证输出的几何函数确实变化。

## 2. 半径函数：真实最小二乘拟合

对每一行前景，计算左右边界、行半径和中心位置。轴线是按行半径加权的中心平均值，行中心偏离该轴的平均距离另行报告。当前运行时采用直轴旋转体，并没有恢复弯曲中心线。

令输入果体高度为 `H`，最大观测半径为 `R`，底部到顶部的归一化坐标为 `t`。用 `K` 个线性插值系数表示半径函数 `q(t)`，拟合目标为：

```text
平均 (q(t_y) - r_y/R)^2
  + 0.003 × 平均 (q[i-1] - 2q[i] + q[i+1])^2
```

优化从椭球轮廓开始，以有界坐标下降求解系数。每轮记录实际目标值、数据误差和平滑项；上限 48 轮，达到收敛条件提前结束。报告中的曲线不是预设动画。

物体采用任意世界单位：高度固定为 2，最大半径按照片的宽高比换算。没有相机标定、真实尺寸、透视反演或多视图约束。因此，这是与可见轮廓相容的几何假设。

## 3. 紧凑的表面颜色函数

通用导入默认使用 128 × 128 个 RGB 系数，组成双线性 UV 场。其运行时 RGB 数据为 49,152 字节，置信标记为 16,384 字节。两个随附的照片对象使用更细的 256 × 256 场：RGB 为 196,608 字节，置信标记为 65,536 字节；另外只有 32 个半径系数和少量结构参数。这个场是从照片拟合出的外观数据，仍然包含观测信息，并不代表无信息成本地从短公式恢复任意照片。

这次提高场分辨率是根据同一留出规则做的实测选择：苹果 MAE 从 4.1634 降至 3.7400，梨子从 3.6844 降至 2.9439。因为分辨率选择看过留出结果，该留出集也承担了验证集作用，不能再称为完全未接触的最终测试集。两个对象合计的 JavaScript 资产仍小于 1 MB。

几何约定与共同渲染器一致：

```text
local y = 0 在底部；local y = height 在顶部
x = radius(y) × sin(phi)
z = radius(y) × cos(phi)
u = phi / (2π) + 0.5
v = 1 - y / height
```

正面 `z > 0` 对应 `u ∈ [0.25, 0.75]`。观测像素由 `asin(横向位置 / 行半径)` 投射到这个可见半球。初始颜色由训练像素加权累积，随后执行 5 次真正的训练均方误差下降更新；训练 MAE、MSE 与留出误差逐轮记录。

### 留出像素的边界

像素坐标的确定性哈希选择约 20% 作为颜色留出集。其 RGB 不进入颜色系数、平均颜色、缺失值填充或背面先验。测试会单独改变全部留出 RGB，并验证物体 JSON 与函数正视图完全不变。

分割和几何仍使用完整掩膜。这里测试的是同一张照片中未参与颜色拟合的像素，考察局部外观插值能力；它不是新的场景、光照或视角的独立泛化测试。真实运行中颜色分割本身读取原图，因此不能把留出指标误称为端到端独立测试集。

### 未见表面与置信信息

背面颜色来自可见半球的镜像外观先验，置信标记为 `24/255`。正面有训练像素支持的系数标记为 `160…255`，正面邻域补足通常为 `64/255`。这些值表示证据来源与相对支持度，不是经过校准的真实概率。

单图中的亮斑和阴影已经进入颜色场，所以字段明确为 `mode: 'observed_radiance'`。它不是反照率。共同渲染器避免再烘焙一次基础漫反射；改变新光源时，只能得到有限的近似响应。正确的物理重光照需要额外的材质、几何和光源估计。

## 4. 共同物体与编辑接口

输出的 `object` 使用 `surface.kind='lathe'`、`surface.profileInterpolation='linear'`、`material.kind='field'`。显式指定线性插值，让实际渲染的半径函数与拟合 / 检查时使用的函数一致；生成物体可以通过同一个几何接口选择 Catmull-Rom 插值。与生成对象共用 `surface.shape`、颜色、可见性、尺度、位移、旋转、替换操作和时间轴。它不是贴在画布上的整张参考图。

```js
const program = CRFProgram.createPreset('common');
const old = program.objects.find(o => o.id === 'apple.observed');
const fitted = JSON.parse(JSON.stringify(result.object));
fitted.id = old.id;
fitted.transform = old.transform;
program.objects[program.objects.indexOf(old)] = fitted;
CRFProgram.assert(program);

const edited = CRFProgram.applyOps(program, [
  {op:'set', id:fitted.id, path:'material.color', value:[85,170,55]},
  {op:'set', id:fitted.id, path:'surface.shape', value:0.25},
  {op:'set', id:fitted.id, path:'transform.rotation', value:[0,30,0]}
]);
```

`field.referenceColor` 固定为训练像素的平均颜色，初始 `material.color` 与它相等。渲染器用二者的通道比值给颜色场着色，使换色保留已有表面细节。大幅度色相改变仍是颜色变换，不是重新获得真实材质。

导出的物体带来源路径与哈希用于追踪，但渲染所需数据只有函数系数。删除来源照片并不会删除已经拟合的物体外观。验证测试还会改变所有背景像素，证明有固定掩膜时背景不会进入材质。

## 5. 本次真实输入的结果

实际构建报告是 `reports/v06/observation_fit.json`；以下数值以该文件为准。

| 指标 | 苹果 | 梨子 |
| --- | ---: | ---: |
| 旋转体投影与提取掩膜 IoU | 0.95759 | 0.92702 |
| 半径初始目标值 | 0.00562427 | 0.06672482 |
| 半径最终目标值 | 0.00004620 | 0.00014936 |
| 留出 RGB MAE，0…255 | 3.7400 | 2.9439 |
| 训练平均色基线的留出 MAE | 23.5818 | 23.2021 |
| 物体序列化大小 | 351,237 字节 | 351,238 字节 |

**IoU 不是自动分割准确率。** 它把拟合的旋转体投影与提取出的掩膜比较。要判断掩膜是否真的贴合照片，还需要看独立原图和检查图，或者另做人工标注的数据集。

报告的 `pass` 仅表示通过有范围的物体导入检查：IoU 不低于 0.65，且外观误差有限。`acceptance.pixelExactClaim` 始终是 `false`。本版本明确没有满足整张照片的 100% 像素复刻目标。

## 6. 验证覆盖与剩余限制

测试覆盖：实际优化降低目标值；输入轮廓改变会改变几何；留出颜色插值优于常量色；修改留出 RGB 不影响拟合输出；背景不会成为外观供体；背面具有独立低置信标记；序列化后仍可采样；非法输入与预算错误清楚失败；同一对象通过共同编辑与时间轴接口；实际渲染使用相同半径插值；删除来源路径后实际渲染像素不变；换色会改变实际渲染颜色且保持物体覆盖区域。

仍需后续工作的内容包括：更可靠的前景与遮挡分离、非旋转体几何、相机和尺度标定、多视图一致性、真实反照率 / 光照分解、表面高频细节以及从自然语言到复杂对象程序的模型。当前模块为这些能力提供可检查的观测接口；它没有用“完备”一词替代尚未实现的算法。
