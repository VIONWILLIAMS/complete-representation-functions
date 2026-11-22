# CRF 0.5：LLM 函数操作与复现说明

本指南面向继续实现或操作 **CRF 图形计算编辑器** 的语言模型。工作对象是已注册的场景函数和操作，不是任意执行一段来源不明的 JavaScript。代码层可以扩展生成器，但每个新生成器需要单独实现与验证。

在线编辑器：https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/

## 1. 开始前读取状态

页面加载完成后等待公开 Promise；切换案例是异步的，必须等待完成后再引用对象 ID。

```js
await CRFEditor.ready;
console.log(CRFEditor.getCases());
await CRFEditor.switchCase('street');
console.log(CRFEditor.getState());
console.log(CRFEditor.getStatus());
```

`getState()` 返回副本，直接修改这个副本不会改画面。使用 `applyOps()` 提交操作，或者使用经过校验的 `setState()` / `importScene()`。切换案例会保存各自当前编辑状态，切换回来不会自动恢复原图；需要干净基准时明确调用 `reset()`。

| 案例 | 主要对象 ID | 表示性质 |
| --- | --- | --- |
| `street` | `wall.main`、`pole.main`、`signal.support`、`signal.main`、`signal.side`、`crosswalk.main`，以及窗口等 | 照片观测与深度假设 |
| `fruit_lab` | `studio.backdrop`、`apple.main`、`pear.main` | 原生程序生成 |
| `orchard` | `wall.main`、`table.main`、`apple.photo`、`pear.photo` | 独立水果照片观测 |
| `alpine` | `sky.main`、`mountain.main`、`forest.main`、`shore.main`、`lake.main`、`buildings.main` | 独立风景照片观测 |

始终读取实际对象列表；不要假设用户删除、复制、重新命名后对象仍维持默认状态。对象的 `label` 是展示名称，`id` 才是操作标识。

## 2. 街景：换色、隐藏和核验

以下事务把墙改成蓝色，并隐藏正面信号灯。边界修正与背景补齐由主引擎执行，LLM 不需要另外绘制一块矩形遮住灯体。

```js
await CRFEditor.switchCase('street');
CRFEditor.reset();
CRFEditor.applyOps([
  {op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:0.72}},
  {op:'set',id:'signal.main',path:'visible',value:false}
]);
CRFEditor.select('signal.main');
const edited = await CRFEditor.runPixelCheck();
console.log(edited); // 与未编辑照片有差异是预期结果
```

隐藏对象的选择框不会继续绘制；灯后墙面是带推断标记的背景。换色后原始参考差异增加不能判为失败，应检查目标是否达到、边缘是否更新、对象外是否被误改。

红灯变绿灯使用结构化状态：

```js
CRFEditor.applyOps([
  {op:'set',id:'signal.main',path:'visible',value:true},
  {op:'set',id:'signal.main',path:'signalState',value:'go'}
]);
```

`signalState` 只接受 `observed`、`stop`、`go`。`go` 会处理灯面与图案；不要对整个信号灯外壳施加绿色 tint 来假装切换信号。

## 3. 原生水果：替换、改形、改材质

```js
await CRFEditor.switchCase('fruit_lab');
CRFEditor.reset();
CRFEditor.applyOps([
  {op:'replace',id:'apple.main',prototype:'pear'},
  {op:'set',id:'apple.main',path:'generator.seed',value:23},
  {op:'set',id:'apple.main',path:'generator.shape',value:0.35},
  {op:'set',id:'apple.main',path:'generator.roughness',value:0.55},
  {op:'set',id:'apple.main',path:'color',value:{tint:[143,180,58],amount:0.8}}
]);
CRFEditor.setView('right');
```

替换后 ID 仍是 `apple.main`，只是它的 `prototype` 变成了 `pear`。不要因为物品名称变化而引用不存在的 ID。需要用户看到新名称时，可另设 `label`。

| 生成参数 | 允许值 | 效果 |
| --- | --- | --- |
| `generator.seed` | 0–2147483647 的整数 | 改变可复现的表皮纹理 |
| `generator.shape` | −1–1 | 改变果体鼓度与颈部 |
| `generator.roughness` | 0.08–1 | 改变高光范围 |
| `color.tint` | 三个 0–255 数值 | 果皮目标颜色 |
| `color.amount` | 0–1 | 颜色影响强度；0 保留该原型的自然色 |

新增独立物品：

```js
CRFEditor.applyOps([
  {op:'addPrototype',id:'fruit.extra',label:'新苹果',prototype:'apple',
   x:400,y:340,width:180,height:220,depth:160},
  {op:'set',id:'fruit.extra',path:'generator',value:{seed:91,shape:-0.15,roughness:0.3}}
]);
```

指定新的、合法且不重复的 ID。省略 `color` 时，水果使用自然程序颜色；提供 `color:[R,G,B]` 时，新增操作会将它作为显式 tint。摄影棚有简化动态接触阴影；把水果添加到普通照片不会自动解决照片的支撑面与真实投影阴影。

## 4. 两个额外照片案例

实拍水果与程序水果是不同对象族。下面更改已观测苹果的颜色：

```js
await CRFEditor.switchCase('orchard');
CRFEditor.reset();
CRFEditor.applyOps([
  {op:'set',id:'apple.photo',path:'color',value:{tint:[122,175,49],amount:0.86}},
  {op:'set',id:'pear.photo',path:'exposure',value:0.1}
]);
```

照片果形原本由观测采样给出，`generator.shape` 不会让一个仍处于观测表示的对象自动变成三维参数水果。若要切换为生成器，必须明确 `replace`，并接受观测外观被新物品函数替换。

湖畔案例：

```js
await CRFEditor.switchCase('alpine');
CRFEditor.reset();
CRFEditor.applyOps([
  {op:'set',id:'lake.main',path:'color',value:{tint:[47,151,163],amount:0.7}},
  {op:'setLight',values:{temperature:0.12,exposure:0.05}},
  {op:'setCamera',values:{yaw:7,pitch:0,zoom:1.07}}
]);
```

湖面倒影是已观测颜色；改视角或相对照明不会重算物理正确的水面反射。树林、远山和湖岸的深度也是示例假设。

## 5. 操作协议与事务

`CRFCore.applyOperations(state, ops)` 是纯函数：验证后返回新状态，原状态不变；存在非法操作时抛出错误，不会提交一半事务。`CRFEditor.applyOps(ops)` 在此基础上更新编辑器并加入撤销记录。

| 操作 | 必需字段 | 用途 |
| --- | --- | --- |
| `set` | `id,path,value` | 修改已注册对象参数 |
| `setCamera` | `values` | 修改相机 |
| `setLight` | `values` | 修改相对光照 |
| `setBackground` | `values` | 修改背景模式、颜色或推断显示 |
| `setTimeline` | `timeline` | 替换时间轨迹 |
| `delete` | `id` | 标记对象删除 |
| `duplicate` | `id,newId`；可选 `offset` | 复制可编辑对象 |
| `reparent` | `id,parent` | 改附着关系；`parent:null` 放到根节点 |
| `replace` | `id,prototype` | 替换为注册原型 |
| `addPrototype` | `id,prototype,x,y,width,height` | 新增程序对象 |

注册原型：`ellipse`、`rectangle`、`triangle`、`diamond`、`ring`、`apple`、`pear`。新增其他词语不会自动调用通用生成模型。

主要可写对象路径包括 `transform.x/y/z/scaleX/scaleY/rotation`、`color.tint/amount`、`visible`、`opacity`、`depth`、`depthSlope`、`normal`、`exposure`、`signalState`、`label`、`parent` 和 `generator.*`。相机字段为 `yaw,pitch,panX,panY,zoom`；光照字段为 `exposure,azimuth,elevation,strength,temperature`。以 `dist/crf-core.js` 的验证器作为最终范围契约，不要使用 `NaN`、无限大、未知路径或循环父子关系。

## 6. 五秒轨迹与视频

```js
await CRFEditor.switchCase('street');
CRFEditor.reset();
CRFEditor.applyOps([{op:'setTimeline',timeline:{duration:5,tracks:[
  {id:'$camera',path:'yaw',interpolation:'smooth',keyframes:[
    {time:0,value:0},{time:1.6,value:-7},{time:3.5,value:7},{time:5,value:0}
  ]},
  {id:'$camera',path:'zoom',interpolation:'smooth',keyframes:[
    {time:0,value:1},{time:1.6,value:1.08},{time:3.5,value:1.08},{time:5,value:1}
  ]}
]}}]);
const video = await CRFEditor.exportVideo({fps:24,duration:5,download:false});
console.log(video.frameCount, video.duration, video.blob.size);
```

`download:false` 返回 Blob 而不触发下载；省略该选项会下载 WebM。浏览器逐帧编码能力不足时会明确报告实时回退，不应把回退结果当成已验证的 120 帧文件。导出过程中查询 `getStatus().videoExport` 可读取阶段、进度和实际编码方式。

`CRFEditor.seek(t)` 按时间轨迹求值；`seek(null)` 返回没有时间覆盖的静态状态。对相机或物体操作后，如果当前仍停留在某个动画时刻，同一参数可能由轨迹覆盖。静态验收与截图前可先 `seek(null)`。视角预设名称为 `reference`、`left`、`right`、`elevated`。

## 7. 导出、撤销和验收

```js
CRFEditor.undo();
CRFEditor.redo();
CRFEditor.seek(null);
const report = await CRFEditor.runPixelCheck();
const pixels = CRFEditor.getPixels();
const status = CRFEditor.getStatus();
```

界面“导出”提供 PNG、场景 JSON 和视频。PNG 只包含场景，不包含选择框。JSON 保存对象和函数状态，不包含全部照片 RGB 数组；继续打开它需要配套案例数据。单文件离线编辑器已嵌入四案例数据和独立参考 PNG，源码包也包含这些资料。

原图验收应在 `reset()`、`seek(null)`、原视角和原尺寸执行。照片用精确模式；程序水果基准用交互核 LOD 1。编辑后的验收至少区分四项：目标区域是否按指令变化、混合边界是否处理、非目标区域是否保持契约、关系与遮挡是否合理。对于隐藏背景与新视角，缺少真值时应明确报告“推断”，不能输出凭空的真实性百分比。

## 8. 脱离浏览器调用同一核心

```js
const Core = require('./dist/crf-core.js');
require('./dist/assets/scene-data.js');
let state = Core.initialState(globalThis.CRF_SCENE_DATA);
state = Core.applyOperations(state,[
  {op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:0.72}}
]);
const frame = Core.CPUrender(globalThis.CRF_SCENE_DATA,state,{
  quality:'exact',width:667,height:1000,time:null,lod:1
});
// frame.rgba 是实际输出；编码 PNG 可使用项目的 pngjs 辅助脚本。
```

程序水果可以从 `CRFFruit.createStudioData()` 和 `data.initialOps` 开始，详见 `FRUIT_GENERATOR.md`。CLI 导出脚本和浏览器共用核心，不应各写一套互不一致的场景逻辑。

## 9. 扩展与反馈纪律

修改参数先使用原子操作；调整结构应检查父子关系与遮挡；修改边界、补齐或渲染管线后，重跑冻结参考验收和相关回归测试。保持原始输入与参考哈希，记录是哪一层发生改变。不要通过降低标准、对齐输出、模糊参考图或偷偷替换原图来制造 100%。

当前自动化覆盖固定案例与注册原型；新增照片需要像素扫描与语义适配器，新增物品需要明确生成器。多级反馈是工程接口和验证流程，0.5 尚未实现可自主发明、修改、验证任意管线的 RSI。
