# CRF 0.6 · 可执行场景程序规范

本版本把「照片拟合的物体」和「程序生成的物体」送入同一个对象程序、同一个空间、同一个采样与遮挡过程。JSON 是可移交给其他语言模型的执行接口；完整程序自带所需的颜色场系数，无需在渲染时加载原始照片。

这是一套有明确范围的图形程序，不是关于所有物理世界的完备性证明。照片拟合、未知背面的假设、程序纹理和几何重放必须分别标注。当前编辑器的自然语言入口是公开的有限规则，未连接远程 LLM；外部 LLM 可按下列规范输出任意受支持对象组合。

## 1. 程序结构

```json
{
  "schema": "crf.program.v0.6",
  "id": "my.scene",
  "title": "可编辑场景",
  "seed": 17,
  "width": 960,
  "height": 720,
  "camera": {
    "yaw": 0,
    "pitch": 8,
    "distance": 8.2,
    "fov": 35,
    "target": [0, 1.15, 0]
  },
  "light": {
    "azimuth": -40,
    "elevation": 48,
    "intensity": 1.05,
    "ambient": 0.34,
    "temperature": 0.12
  },
  "environment": {
    "background": [212, 219, 222],
    "floor": {"color": [205, 211, 210], "roughness": 0.72, "texture": "stone"}
  },
  "objects": [],
  "relations": [],
  "timeline": {"duration": 5, "tracks": []}
}
```

RGB 使用 0–255 数值。角度均为度。世界坐标为右手系，地面 `y=0`，正面相机位于 `+z`。对象的位置是世界坐标，不是屏幕偏移；相机是透视相机。

## 2. 共享对象

```json
{
  "id": "pear.generated",
  "label": "程序梨子",
  "visible": true,
  "opacity": 1,
  "source": {
    "kind": "generated",
    "method": "native_surface_and_material_functions"
  },
  "surface": {
    "kind": "lathe",
    "height": 2.65,
    "radius": 0.78,
    "profile": [0, 0.64, 0.92, 1, 0.83, 0.52, 0.25, 0],
    "shape": 0,
    "detail": "pear",
    "stem": true,
    "leaf": true
  },
  "material": {
    "kind": "pear",
    "color": [166, 177, 54],
    "roughness": 0.3,
    "seed": 17
  },
  "transform": {
    "position": [1, 0, -0.1],
    "rotation": [0, -18, 0],
    "scale": [1, 1, 1]
  }
}
```

`id` 是持久标识；物体增删、材质更换和视角变化不应重新分配其身份。`source.kind` 支持 `generated`、`observed_fit` 和 `hybrid`，允许附加来源、拟合方法和误差等元数据。

### 曲面函数

| kind | 参数与意义 |
|---|---|
| `lathe` | `height`、`radius`、8–256 个 `profile` 半径样本，支持任意合法轮廓，不限于内置水果 |
| `ellipsoid` | 水平半径 `radius`，垂直全高 `height`，可再用非均匀 scale 拉伸 |
| `cylinder` | 半径 `radius`、高度 `height`，包括端面 |
| `box` | `width`、`height`、`depth`；`radius` 保留为统一对象字段 |

所有曲面局部坐标均从底部 `y=0` 起。旋转采用 X、Y、Z 欧拉旋转顺序，然后平移；法线使用逆尺度校正。`rotation` 与 `scale` 作用于整个物体，包括果柄和叶片。

旋转曲面由下至上采样 `profile(t)`，`t∈[0,1]`。`profileInterpolation` 支持 `linear` 和 `catmull_rom`；缺省用 Catmull–Rom，负插值截断为零。观测拟合显式使用 `linear`，保证拟合时与运行时采用同一个轮廓函数：

```text
y = height × t
r = radius × profile(t) × (1 + 0.30 × shape × (1 − 2t)) × organic_detail
x = r × sin(phi)
z = r × cos(phi)
```

`shape∈[-1,1]` 对观测拟合和生成对象完全相同：正值加宽下部、收窄上部。`detail: apple | pear | none` 仅添加小幅原生表面起伏；观测对象通常用 `none` 保留拟合轮廓。

有果柄或果实 detail 的旋转体会封闭非零端点；这是对截断轮廓的几何封口假设，不表示从照片中观测到了端面。花器的顶部为低于口沿的暗色内盘近似，不是具有厚度与折射的完整器皿模型。

### 统一材质与观测颜色场

材质种类：`apple`、`pear`、`ceramic`、`stone`、`metal`、`field`、`foliage`、`wood`、`plaster`。共同可编辑参数为 `color`、`roughness` 和 `seed`。

`field` 材质附带：

```json
{
  "width": 128,
  "height": 128,
  "rgbBase64": "BASE64_OF_RGB_BYTES",
  "confidenceBase64": "BASE64_OF_CONFIDENCE_BYTES",
  "referenceColor": [154, 40, 31],
  "mode": "observed_radiance"
}
```

| 字段 | 含义 |
|---|---|
| `rgbBase64` | 恰好 `width × height × 3` 字节，逐行 RGB |
| `confidenceBase64` | 可选，恰好 `width × height` 字节，0–255 对应置信度 0–1 |
| `referenceColor` | 固定的原始参考色，用于估计换色时的漫反射色成分；缺省时使用场的平均 RGB |
| `mode` | `observed_radiance` 或 `albedo_hypothesis` |

UV 方向：`phi∈[-π,π]`，`u=phi/(2π)+0.5`，`v=1−t`。纹理第一行是顶部；正面为 `u=.5`，正面可见半球约为 `u∈[.25,.75]`。颜色双线性插值，置信度取邻近样本。

观测与生成对象都由同一个 `material.color` 操作修改。观测颜色场换色时，将参考色和像素各减去自身 RGB 均值，在色度子空间中估计漫反射量 `k`，随后计算 `newRGB = fieldRGB + k × (material.color − referenceColor)`。纯中性高光的 `k=0`，因此白色反光不会因参考色的绿色/蓝色通道较低而被放大为青色。遇到颜色空间边界时统一缩小此次颜色偏移，不独立削顶三个通道。

参考色接近中性时，单张图不能区分中性漫反射与中性高光；此时仅保守调整中间调，接近白色的像素保留。换色保留原像素的纹理残差与估计中性反光，但不是物理反射率分离。未编辑的 `material.color===referenceColor` 分支保留原有运算次序，确保既有基准图和视频帧的渲染字节不变。

`observed_radiance` 保留照片已经包含的光照，不再套一遍程序漫反射与高光。只有很小的全局曝光/色温变化。`albedo_hypothesis` 会接受原生材质着色，但该名称明确表示反射率是假设，不是由单张照片严格分离出来的结果。

## 3. 操作与时间

```js
const edited = CRFProgram.applyOps(program, [
  {op: 'set', id: 'apple.observed', path: 'material.color', value: [117,168,52]},
  {op: 'set', id: 'apple.observed', path: 'surface.shape', value: 0.45},
  {op: 'set', id: 'pear.generated', path: 'transform.position', value: [-0.75,0,0.9]},
  {op: 'camera', values: {yaw: 22, pitch: 12}}
]);
```

| op | 载荷 |
|---|---|
| `set` | `id`、白名单 `path`、`value` |
| `add` | 完整 `object` |
| `remove` | `id`；关联关系与动画轨道同时清理 |
| `replace` | `id`，可选完整 `surface`、`material`、`source` |
| `camera` / `light` | 对应的 `values` 字段更新 |
| `environment` | `values.background` 或完整 `values.floor` |
| `timeline` | 完整 `timeline` |

`applyOps` 先复制，执行所有操作后验证；任一操作失败则抛错，输入程序不变。路径不能修改对象 ID，不能访问原型，不能执行 JavaScript。导入程序和操作没有 `eval` 或脚本字段。

动画轨道：

```json
{
  "duration": 5,
  "tracks": [{
    "target": "camera",
    "path": "yaw",
    "interpolation": "smooth",
    "keys": [{"time": 0, "value": 0}, {"time": 2.5, "value": 24}, {"time": 5, "value": 0}]
  }]
}
```

相机支持 yaw、pitch、distance、fov、target；光源支持其五个数值参数；物体支持 transform 的三个向量和 `surface.shape`。数值或三元向量逐分量插值。`smooth` 使用 smoothstep，`linear` 使用线性插值。关键帧导入时按具体属性的范围与类型验证。

关系 `supported_by`、`attached_to`、`near` 是可检查的语义记录。当前物体变换使用显式世界坐标，关系不是自动求解约束；改变父物体位置不会自动驱动子物体。`attached_to` 的循环会被拒绝。

## 4. 模块 API

浏览器脚本顺序：先加载 `crf-program.js`，再加载 `crf-program-renderer.js`。Node 可以直接 require 两个文件，无渲染依赖。

| API | 返回 / 行为 |
|---|---|
| `validate(program)` | `{valid, errors}`，不抛出验证失败 |
| `assert(program)` | 验证后返回输入；失败抛错 |
| `clone(program)` | JSON 深复制 |
| `makeObject(kind, overrides)` | `apple / pear / vase / sphere / box / column` 原生对象 |
| `profile(kind, count=65)` | `apple / pear` 的 8–256 个轮廓样本；自定义轮廓可直接写入 surface |
| `createPreset(id)` | `common / stilllife / courtyard`；`studio` 是 stilllife 别名 |
| `presets()` | 场景菜单元数据 |
| `applyOps(program, ops)` | 返回全新的有效程序 |
| `atTime(program, time)` | 确定性的时间状态；time 为 null 时返回静态复制 |
| `compileIntent(text, options)` | `{program, recognized, interpretation, warnings, mode:'local_rules', compiler}` |

`common` 的稳定对象 ID 为 `apple.observed` 和 `pear.generated`。核心预设中的 `apple.observed` 是明确标注 `source.kind:generated` 的占位体；真正观测场由独立场景装配模块替换。标识名称本身不能充当观测证据。

本地意图规则识别场景、冷暖环境、白色背景、木/石表面、苹果/梨子各 1–5 个、特定换色/替换、左右/俯视和五秒相机轨迹。它不理解任意对象、任意图像风格或物理行为。`recognized` 为空时没有识别到执行要求，应保留当前编辑状态并展示 warnings。`interpretation` 可包含所用基准场景的信息，不等于所有描述已被理解。

## 5. 渲染器

```js
const frame = CRFProgramRenderer.render(program, {
  width: 960,
  height: 720,
  time: null,
  quality: 'final',
  normals: false
});
```

返回值：

| 字段 | 类型与含义 |
|---|---|
| `rgba` | `Uint8ClampedArray`，不透明输出 RGB+A |
| `ids` | `Int32Array`，当前 objects 数组的零基索引；地面/背景 `-1` |
| `depth` | `Float32Array`，沿相机正向的深度；背景 Infinity |
| `confidence` | `Float32Array`，观测 UV 来源的置信度；非观测对象为 1 |
| `normals` | 可选 `Float32Array`，可见物体世界法线 |
| `stats` | 采样数量、来源分类、耗时、后端及近似方法说明 |

`time:null` 或省略时渲染静态程序；只有数值 time 才求值 timeline。图像与视频帧完全共享入口。

每个对象都先求值三维曲面、材质、变换与法线，再做透视投影。旋转曲面沿子午线弧长采样，避免顶部/底部斜率大时出现缺环。屏幕 Gaussian 使用两遍过程：先建立深度与对象归属，再累加属于该可见表面的颜色权重，避免后来的近点清掉此前有效颜色。相邻采样做归一化并计算边缘覆盖。没有画布图片贴回、原图平移或按对象名称定制的遮挡捷径。

地面为解析射线与平面的交点，纹理按投影像素足迹进行低通控制；这是公开的混合部分。接触阴影使用物体范围导出的软椭圆近似。环境漫反射与 Blinn 型高光用于原生材质，不是光线追踪、全局光照或经物理标定的 BRDF。没有声称实现与 3D Gaussian Splatting 论文相同的可训练各向异性协方差优化。

`opacity` 0 会移除对象，1 是正常不透明对象；中间值是最近可见对象对背景的预览混合，不支持多层折射或正确的透明物体排序。需要严格物体遮挡时使用 0 或 1。

### 边界和预算

对象不超过 96 个，单个 UV 场不超过 256×256；画面边长不超过 4096，总像素不超过 800 万；渲染最小尺寸 32×32。程序默认尺寸最小 64×64。轮廓样本、物体变换、相机、颜色、材料参数、关键帧和操作路径均进行有限数值与范围校验。局部几何缓存预算约 65 MB；输出尺寸和对象数量仍直接影响浏览器内存与帧率。

## 6. 正确验收范围

1. **程序重放一致性**：同一程序、同一渲染器、同一运行环境和参数，RGBA 字节应一致；这不等于与输入照片逐像素相同。
2. **共同操作一致性**：生成和观测对象均接受相同颜色、轮廓、位置、旋转、尺度操作，来源元数据保留。
3. **三维遮挡与时间**：物体前后关系、相机运动与轮廓动画必须改变实际投影和深度，不能只平移原图。
4. **观测误差**：另行比较源照片、分割、投影拟合；低分辨率颜色场及旋转体假设不能宣称无损恢复。
5. **未知信息**：背面、遮挡区域、端面、真实反射率和真实三维结构仍依赖假设。置信度应随导出一起保留。

当前程序提供可检验的共同执行路径和 LLM 可调用的数据协议。多视图重建、可微优化、更丰富几何、物理材质、真实模型调用和自动递归改进仍是后续工作，不作为本版本已经完成的能力。
