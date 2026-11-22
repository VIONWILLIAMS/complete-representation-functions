# LLM → CRF 操作契约

## 如何接入

编辑器不需要模型密钥，也不会暗中调用模型。内置中文句子走有限规则解析，覆盖页面列出的示例。其他语言模型可以先读取对象目录与状态，再返回注册的 JSON 操作。用户在编辑器的 JSON 操作面板中粘贴并应用，或由受信任的集成调用公开 API。

浏览器 API 的确切参数和返回值见 `EDITOR.md`，底层操作定义见 `ENGINE.md`。以下是核心调用：

```js
const previous = CRFEditor.getState();
CRFEditor.applyOps([
  {op:'set',id:'wall.main',path:'color',value:{tint:[85,135,175],amount:0.72}},
  {op:'set',id:'signal.main',path:'signalState',value:'go'}
]);
```

将语义指令转换成操作时，应区分物体颜色、发光状态、相机和光照。例如“让行人灯变绿”应设置 `signalState`，不能把整个灯壳换成绿色。“向右看”只改相机。“把杆移到右边”修改 `pole.main`，让附着关系传播，而不是分别猜四个子部件位置。

## 推荐给另一个模型的指令

> 你控制 CRF Street 0.4。请依据我提供的 currentState 与 ENGINE.md，只返回一个 JSON 操作数组。对象 ID 必须来自 currentState 或本批新建 ID。不要生成 JavaScript、eval 或未注册字段。保留未指定的对象和参数。改变父对象的几何会影响子对象；颜色只作用于目标对象。新视角依据单图深度假设，不能声称恢复被遮挡的真实几何。请求未受支持时，请指出需要的新原型或数据，不要伪造已经完成的操作。

## 示例

### 保留墙面明暗纹理的蓝色换色

```json
[{"op":"set","id":"wall.main","path":"color","value":{"tint":[85,135,175],"amount":0.72}}]
```

### 移动整套杆与灯

```json
[{"op":"set","id":"pole.main","path":"transform.x","value":20}]
```

### 加宽斑马线

```json
[{"op":"set","id":"crosswalk.main","path":"transform.scaleX","value":1.12}]
```

### 替换成基本几何原型

```json
[
  {"op":"replace","id":"signal.main","prototype":"diamond"},
  {"op":"set","id":"signal.main","path":"color","value":{"tint":[241,171,45],"amount":0.9}}
]
```

这是注册的几何形状替换，不是自动生成任意物品的外观。任意物品标准需要更丰富的原型库或学习系统。

### 三秒相机轨迹

```json
[{"op":"setTimeline","timeline":{"duration":3,"tracks":[
  {"id":"$camera","path":"yaw","interpolation":"smooth","keyframes":[{"time":0,"value":-4},{"time":1.5,"value":4},{"time":3,"value":-4}]},
  {"id":"$camera","path":"zoom","interpolation":"linear","keyframes":[{"time":0,"value":1.04},{"time":3,"value":1.04}]}
]}}]
```

## 反馈给模型的证据

1. 操作前后状态差异及验证错误。
2. 原尺寸 RGB 差异：exactPixels、MAE、最大通道误差。
3. 修改域外变化数量，避免全局分数掩盖无关对象被破坏。
4. 当前相机、采样质量、后端与可见推断像素数量。
5. 图结构约束是否仍成立。

源照片并不是所有编辑后的目标。用户要求墙变蓝以后，蓝墙与原照片的差异是预期变化。若追求新目标的像素级验收，应提供新的目标图，或给出对象级目标与应保持不变的区域；不能要求新编辑同时保持整张原图零误差。
