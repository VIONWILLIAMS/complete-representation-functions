# CRF Studio 0.4 · 编辑器使用与集成

本页说明已经实现的浏览器编辑器，以及另一个开发者或模型如何通过 JSON 操作继续编辑场景。页面由原生 HTML、CSS、JavaScript 组成，不需要构建步骤、外部字体或模型服务。

本版输入是一张 667 × 1000 的街景照片及其配套的 18 个语义对象。输出是可操作的观测高斯表示：对象、颜色、变换、关系、深度假设、相对光照和轨迹共同决定画布。原照片不会作为固定背景图叠在渲染结果后面。

## 1. 打开项目

在线版直接打开项目主页。完整工程目录可以用任意静态 HTTP 服务提供，例如在项目根目录运行：

```sh
python3 -m http.server 4173 --directory web
```

然后打开 `http://localhost:4173/`。浏览器加载顺序是：

```text
assets/scene-data.js
crf-core.js
crf-renderer.js
crf-video.js
editor.js
```

单文件离线版 `crf_street_0_4_offline.html` 由交付打包脚本生成，包含上述程序、样式、观测数据和独立的参考 PNG。离线编辑、PNG 导出、浏览器支持时的 WebM 导出和 JSON 导出均在本地进行。下载面板中的预制工程、视频和报告通过在线地址获取，仍需要网络。

页面底栏显示实际渲染后端、观测数据状态和参考 PNG 状态。WebGL 2 或所需浮点能力不可用时，引擎使用 CPU 高斯求值，界面明确显示“CPU 回退”。这是一条可用的回退路径，不代表 GPU 性能或固定实时帧率。

## 2. 基本编辑

### 对象与生成函数

在左侧对象树点击对象，或直接点击画面拾取对象。对象树支持中文名称和稳定 ID 搜索。“生成函数”标签显示该对象使用的观测高斯函数或已注册的几何原型。

右侧可以修改：

| 控件 | 实际作用 |
|---|---|
| 颜色、着色强度 | 调整目标对象的 RGB 混合着色；保留程度由强度控制 |
| 位移 X/Y | 修改参考图像坐标中的位移；向右、向下为正，单位为参考像素 |
| 缩放、旋转 | 修改对象相对于自身枢轴的二维变换 |
| 深度假设 | 修改朝向观察者的假设深度，影响新视角和遮挡 |
| 不透明度、眼睛按钮 | 调整对象透明度或显隐 |
| 复制、删除 | 复制对象状态及观测绑定，或把该对象标为删除 |
| 添加原型 | 新增椭圆、矩形、三角形、菱形或圆环的解析高斯形状 |
| 替换原型 | 用上述注册形状替换目标对象的生成函数 |
| 信号灯状态 | 在原始、红灯、绿灯之间切换，使用注册的发光与行人符号函数 |

新增原型的 `sourceId` 为 `null`，由解析函数生成；复制原有对象仍引用该对象的源观测。两者不是同一种操作。五种形状原型也不等于任意语义物品生成，例如“苹果换梨”需要另一个已实现的原型或生成适配器。

工具栏的移动工具支持拖动对象。拖动时采用交互 LOD；对象发生位移、缩放或旋转后默认继续使用交互 LOD，避免原采样窄核在非整像素位置形成空洞。位移参数以参考像素记录；在有父级旋转、缩放或倾斜观察时，数值仍是表示中的局部变换，不是测量出的真实世界距离。

### 撤销与重做

编辑器保存最多 50 个完整状态快照。一次操作数组作为一次事务，一次连续滑条或拖动作为一次撤销步骤。校验失败的操作数组不会部分改变场景。

重置恢复最初的对象、光照、相机与默认轨迹，也可以撤销。当前状态只保存在当前页面会话；需要保存时导出 JSON。界面的“本地修改”不是云端自动保存声明。

| 快捷键 | 操作 |
|---|---|
| `V` | 选择工具 |
| `G` | 移动工具 |
| `Ctrl/⌘ Z` | 撤销 |
| `Ctrl/⌘ Shift Z` 或 `Ctrl Y` | 重做 |
| `Delete` / `Backspace` | 删除所选对象 |
| `Space` | 播放或暂停轨迹 |

在输入框或 JSON 对话框内，这些全局快捷键不会接管文字编辑。

### 关系

“对象关系”面板可以修改所选对象的父级，并查看其子对象。修改父对象的位移、缩放、旋转、深度位移和显隐会传播给后代。颜色不会自动传播。

删除父对象会让其后代在渲染时一起隐藏，但后代状态仍保留在场景中；可以撤销，或通过 JSON/父级选择重新组织。核心拒绝未知父级和关系环。

父级关系是可执行的表示约束，不能从这张照片证明物理连接真实存在。原始扫描中的其他关系注释与当前执行的 `objects[].parent` 也应区别看待：公开 `getRelations()` 返回的是当前状态中的父级关系。

## 3. 光照、视角和精度

### 相对光照

曝光、冷暖、方向光强度、方位和高度属于独立的 `light` 管线。它们调整当前观测辐射及其假设法线的响应。

原图中的照明和阴影已经包含在 RGB 观测里。本版没有从单图分离真实材质、环境光和阴影，因此这里叫“相对光照”，不承诺换一个灯位就得到物理正确的新阴影。

### 视角

预设包括原视角、左侧、右侧和抬高。原视角恢复零 yaw/pitch、零平移与单位缩放；若对象几何也保持初始变换，则自动选择精确观测模式。已有几何编辑时以及其他视角预设使用交互 LOD。滑条把常用观察范围限制在较保守的角度，JSON 可以使用核心验证范围内的其他值。

当前相机是正交投影下的转动和缩放，不是已标定焦距的透视相机。场景主要由带深度和斜率假设的观测表面组成，属于 2.5D 表示。未观测到的背面、遮挡后方和深度都不能当成已恢复的真实世界。

### 两种精度

| 模式 | 用途 | 输出与限制 |
|---|---|---|
| 精确观测 | 原视角、原尺寸的逐 RGB 采样核验 | 原始 667 × 1000；非整像素变换或新视角可能出现采样空洞 |
| 交互 LOD | 变换、视角和时间预览 | 更宽的高斯核及抽样；静态画布仍为原尺寸 |
| CPU 动态半尺寸预览 | CPU 回退下拖动、播放或实时录制回退 | 实际 334 × 500；标签和尺寸栏明确显示，停止后恢复原尺寸；逐帧视频导出不使用该降采样 |

几何质量策略同时覆盖控件、拖动、`applyOps`、JSON 和完整状态导入。任何对象的变换或相机不再是初始恒等变换时，默认选择并保持交互 LOD；撤销、重做和重置会重新判断，回到原始几何时恢复精确观测。用户仍可主动选择 exact，但画布提示会明确说明它只适合原采样。暂停在非原视角的动画帧也默认保持交互 LOD。

显示缩放中的“适合画布 / 100% / 125%…”只改变画布在界面中的显示大小。它不改变保存的场景坐标，也不是原图配准。

## 4. 原图差异与观测重建验收

像素面板有两个不同的含义：

1. **初始观测核验**：初始化时实际渲染基态，并与独立参考 PNG 比较。结果保留为初始基线。
2. **当前编辑差异**：显示当前对象、相机、光照或时间状态与原始照片的差异。用户要求墙变蓝之后出现差异是正确的编辑结果。

参考真值通过 `assets/reference.png` 独立解码到离屏 Canvas。单文件版可以用 `CRF_SCENE_DATA.referenceImageDataURL` 提供同一参考。验收不把 `rgbBase64` 系数数组作为唯一真值，不用参考图修补渲染结果。

“核验当前画布”会停止播放，恢复原始 667 × 1000 的输出尺寸，并从 `renderer.readPixels()` 读取实际求值结果。它保留当前所选的 exact 或 interactive 模式，并在结果中记录实际模式和时间。若需要原始精确采样，请先选择“精确观测”，或在 API 中传入 `quality: 'exact'`。

设参考与输出均为原尺寸的 RGB8 图像，像素数为 (N)。判定使用：

\[
\operatorname{MAE}=\frac{1}{3N}\sum_{p,c}|I_{p,c}-R_{p,c}|,
\qquad
\operatorname{RMSE}=\sqrt{\frac{1}{3N}\sum_{p,c}(I_{p,c}-R_{p,c})^2}.
\]

“完全相同像素”要求该像素的 R、G、B 三个通道都相等。`exact100` 同时要求尺寸一致、每个像素一致、每个 RGB 通道一致。没有 resize、仿射配准、模糊、近似阈值或颜色容差。参考 PNG 未载入时会明确显示无法核验，不会退回自比较后报告成功。

这里的 100% 只证明稠密观测系数及求值路径能够回放参考采样。因为本版显式保留每个观测像素的 RGB，它不证明压缩、真实三维恢复、语义自动发现或对未知视角的正确预测。0.3 的无稠密图像载荷条件与本版不同，两个实验不能混用验收解释。

原始评分公式位于编辑器程序中，不在场景 JSON 中。`set`、`setCamera`、`setLight` 等操作不能改变评分公式。独立的浏览器验证页面为 `web/verify.html`；工程的完整批处理验收与冻结检查器另见根目录说明及 `reports/`。

## 5. 时间轴与导出

默认时间轴为 3 秒：yaw 从 0° 到 −8°、再到 +8°、最后回到 0°；pitch 在中点达到 2°。插值为平滑插值。播放和拖动时间游标把数值时间交给引擎求值一次。

静态编辑使用 `time: null`，不让时间轨迹覆盖当前相机或对象参数。点击“回到起点”恢复静态基态。通过“编辑轨迹”可以直接修改 `setTimeline` 操作中的目标、关键帧和时长。

### PNG

PNG 由实际输出 RGBA 缓冲区编码，包含场景，不包含选择框、对象面板或其他 UI。导出恢复原尺寸，并使用当前所选精度；新视角建议使用交互 LOD。PNG 不会额外贴入参考图像。

### 浏览器 WebM

视频优先使用 `crf-video.js` 的 WebCodecs 编码与 WebM 封装，逐帧渲染当前时间轴。默认完整生成 **72 帧、24 fps、3 秒、667 × 1000**，CPU 回退也保持这一导出尺寸。每一帧通过实际场景渲染器求值，不按墙钟时间跳过计算；界面显示“渲染第 n/72 帧”。设备较慢时需要等待更久，而不是少算中间帧。

默认的第 `i` 帧在 `i / 24` 秒求值，其中 `i = 0…71`。输出通过固定帧时间戳形成 3 秒片段，最后一帧对应 71/24 秒；它不是把渲染花费的几十秒录成几十秒视频。自定义轨迹与 API 中的帧率、时长改变时，`duration × fps` 必须是整数帧数，否则编码器明确拒绝。帧数与实际编码输出数量都会在返回值中报告。

编码能力按实际原始尺寸检测，先尝试 VP8，再尝试 VP9，不静默补边或缩放。只有逐帧编码不可用时才回退到 `canvas.captureStream` / `MediaRecorder`，并明确显示“实时录制（可能掉帧）”。实时回退在 CPU 上使用实际 334 × 500 动态画布，不承诺完整 72 帧或精确时长；返回的 `renderedFrames` 是渲染调用次数，不能冒充封装文件解码得到的帧数。逐帧渲染或其他编码错误会直接报告，不能借实时回退掩盖程序错误。

逐帧导出的 `deterministicFrames: true` 表示固定时间网格与帧数，不表示不同浏览器的有损编码文件逐字节相同。WebM 不用于静态 RGB8 完全相等验收。工程中的预制 MP4 与本页按当前状态现场生成的 WebM 是两种独立交付。

视频导出期间对象修改被拒绝。无论成功、编码器报错还是初始化失败，编辑器都会结束导出状态；实时回退还会取消后续回调并停止媒体轨道。最后恢复导出前的时间、质量和可编辑状态。

### JSON

JSON 保存完整可编辑状态、对象关系与轨迹，不重复嵌入大体积观测数据：

```json
{
  "schema": "crf.project.v0.4",
  "reference": {
    "scene_schema": "crf.scene.v0.4",
    "width": 667,
    "height": 1000,
    "asset": "assets/scene-data.js"
  },
  "state": {
    "schema": "crf.state.v0.4"
  }
}
```

上面只展示外层结构，实际导出包含 `state` 的全部字段。导入接受这类工程包，也接受裸状态。尺寸必须与配套观测一致，非空 `sourceId` 必须能在当前数据包中找到。界面的文件导入限制为 5 MB，避免把观测数据脚本误当场景状态导入。

## 6. 语义操作示例

命令栏实现的是有限的本地语法，不调用 LLM。未知句子会明确报错，也不会偷偷映射成“最接近”的操作。

| 示例语句 | 执行结果 |
|---|---|
| 把墙改成蓝色 | `wall.main` 的 RGB tint 与混合强度改变 |
| 红灯变绿灯 | `signal.main.signalState = "go"` |
| 斑马线加宽 | `crosswalk.main.transform.scaleX` 乘以 1.15 |
| 隐藏信号灯 | `signal.main.visible = false` |
| 向右看10度 | 相机 yaw 为 +10°，选择交互 LOD |
| 光照暖一点 | 相对色温增加 0.2，限制在 [−1, 1] |

外部模型可以把自然语言转成下面的注册操作数组，但模型调用、账号或密钥没有内置到本页。进一步的模型提示协议见 [LLM_OPERATIONS.md](LLM_OPERATIONS.md)。

## 7. `window.CRFEditor` 公共接口

初始化是异步的。调用状态、渲染和编辑接口前，先等待：

```js
await window.CRFEditor.ready;
const status = CRFEditor.getStatus();
const before = CRFEditor.getState();
```

`getState()` 和 `getInitialState()` 返回深拷贝的未求值基态，外部修改返回对象不会立即改变编辑器。`applyOps()` 返回新的完整状态，并把重新绘制合并到下一次动画帧；需要立即获取结果时主动调用 `render()`。

| 方法 | 主要参数 | 返回 / 行为 |
|---|---|---|
| `getStatus()` | 无 | 后端、质量、实际尺寸、参考状态、选择、导出/播放状态、基线、最近像素报告、视频能力与 `videoExport` 进度/结果 |
| `getState()` | 无 | 当前可编辑基态的副本 |
| `getInitialState()` | 无 | 初始基态副本，含默认三秒轨迹 |
| `applyOps(ops)` | 注册操作数组 | 原子校验并应用；失败抛错；纳入撤销历史 |
| `setState(stateOrProject)` | 裸状态或工程包 | 校验尺寸、源 ID 及状态后替换，纳入撤销历史 |
| `importScene(value)` | JSON 文本、裸状态或工程包 | 异步导入，返回状态 |
| `render(options)` | `{quality,time,lod,native}` | 同步实际渲染，返回统计与 `actualWidth/actualHeight` |
| `getPixels()` | 无 | `{width,height,rgba}`，读取实际最近输出 |
| `runPixelCheck(options)` | `{quality?}` | 异步在原尺寸核验，返回完整 RGB 差异报告 |
| `setQuality(quality)` | `exact` / `interactive` | 设置所选精度并立即渲染 |
| `select(id)` | 存在的对象 ID | 选择对象并更新属性面板 |
| `setView(name)` | `reference` / `left` / `right` / `elevated` | 应用视角预设，纳入撤销历史 |
| `executeCommand(text)` | 已支持的示例语句 | `{operations,state}`；不调用模型 |
| `getRelations()` | 无 | 当前未删除对象的 `attached_to` 父级关系 |
| `undo()` / `redo()` / `reset()` | 无 | 历史操作；重置可以撤销 |
| `play()` / `pause()` | 无 | 播放或暂停当前轨迹 |
| `seek(t)` | 轨迹范围内的秒数，或 `null` | 数值时预览轨迹；`null` 恢复静态基态 |
| `exportPNG(options)` | `{download,filename,quality}` | Promise：`{blob,width,height,quality}` |
| `exportVideo(options)` | `{download,filename,fps,duration}` | Promise：`{blob,method,width,height,frameCount,fps?,duration?,targetFps,requestedDuration,renderedFrames,deterministicFrames,codec?,mimeType,fallbackReason?}` |
| `exportJSON(options)` | `{download,filename}` | `{document,text,blob}` |

三个导出方法默认触发浏览器下载。测试或集成时传入 `download: false` 获取 Blob，不打开下载。

逐帧成功时 `method` 为 `framewise-webcodecs`，`frameCount/fps/duration` 来自编码器；实时回退时为 `media-recorder-realtime`，`frameCount` 为 `null`，且 `deterministicFrames` 为 `false`。`getStatus().videoExport` 可在导出进行中轮询，记录阶段、进度及完成后的尺寸、帧数和文件字节数。逐帧编码器是否支持当前尺寸，会在实际导出前通过异步能力检查确认，未检查时不把“存在 API”当成已通过编码能力验收。

### 用函数编辑并验收

```js
await CRFEditor.ready;

CRFEditor.applyOps([
  {
    op: 'set', id: 'wall.main', path: 'color',
    value: {tint: [53, 119, 195], amount: 0.7}
  },
  {op: 'set', id: 'signal.main', path: 'signalState', value: 'go'}
]);

const renderStats = CRFEditor.render({quality: 'exact', time: null});
const difference = await CRFEditor.runPixelCheck({quality: 'exact'});
const png = await CRFEditor.exportPNG({download: false, quality: 'exact'});
const project = CRFEditor.exportJSON({download: false}).document;

// 编辑后的 difference.mae 通常非零；这不是编辑失败。
console.log(renderStats.actualWidth, difference.exact_pixel_count, png.blob.size);
```

### 新增和修改关系

```js
CRFEditor.applyOps([
  {
    op: 'addPrototype', id: 'shape.demo', label: '新增圆环',
    prototype: 'ring', x: 330, y: 600, width: 100, height: 100,
    depth: 450, color: [91, 203, 174]
  },
  {op: 'reparent', id: 'shape.demo', parent: 'pole.main'}
]);
```

父子状态会参与几何变换，重新指定父级并不自动计算“保持当前世界姿态”的补偿矩阵。集成方若需要这一行为，应显式计算并提交相应的局部变换。

### 自定义轨迹

```js
CRFEditor.applyOps([{
  op: 'setTimeline',
  timeline: {
    duration: 3,
    tracks: [{
      id: '$camera', path: 'yaw', interpolation: 'smooth',
      keyframes: [
        {time: 0, value: -6},
        {time: 1.5, value: 6},
        {time: 3, value: -6}
      ]
    }]
  }
}]);

CRFEditor.seek(1.5);             // 引擎对基态求值一次
CRFEditor.seek(null);            // 返回静态基态
const clip = await CRFEditor.exportVideo({download: false});
```

## 8. 开发与验收边界

前端界面文件为 `web/index.html`、`web/editor.css`、`web/editor.js`；逐帧视频编码模块为 `web/crf-video.js`。状态、求值和验证范围由 [ENGINE.md](ENGINE.md) 中的核心接口决定。UI 不接受任意 JavaScript 作为模型输出，不使用 `eval`，也不把对象 JSON 当代码执行。

扩展新原型应先在核心注册函数、参数验证、CPU/GPU 求值及测试，再把对应操作加入 UI。仅添加一个下拉选项不会使尚未实现的能力存在。扩展模型规划可以调用 `applyOps`；不应让模型重写独立像素检查公式。

建议每次修改至少实测以下用户路径，并记录实际浏览器和后端：

1. 初始原尺寸核验，及误差不为零时的诚实显示。
2. 对象拾取、墙体换色、信号灯状态、撤销和重做。
3. 原型新增/替换、父级移动后的子对象变化、非法父级环的原子拒绝。
4. 原视角与新视角的精度标签、动态半尺寸到原尺寸的恢复。
5. 独立 PNG 加载失败、未知示例语句和无效 JSON 的可恢复错误。
6. 真实 PNG/JSON 下载，以及 WebM 的独立解码帧数、帧率、时长与尺寸；不能只凭 Blob 非空判定完整视频通过。检查不支持编码时的明确回退及失败后的状态恢复。
7. 小屏侧栏、滚动、JSON 对话框、键盘操作和实际控件可读性。

`node --check web/editor.js` 只检查语法；它不能替代真实浏览器交互、Canvas、WebGL 或 MediaRecorder 验收。最终运行证据由交付报告与 `reports/` 中的实测记录提供。
