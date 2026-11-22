# CRF 0.5 — 苹果与梨子的程序表示

本例是从函数生成物品，不是对一张水果照片做剪贴。`web/crf-fruit.js` 没有图片、外部纹理、网格资产、模型调用或 Blender 依赖。参考图由同一公开代码重新求值而来，因此参考图的逐像素一致性证明的是确定性复现，不是对外部水果照片的 100% 重建。

## 几何与材质

`surface(kind, θ, φ, shape)` 构造闭合的三维旋转曲面。苹果包含上部凹陷和五瓣轻微起伏；梨包含较细的上部、较宽的下部。曲面的差分导数产生法线，而不是在二维轮廓上画渐变。果梗是弯斜的圆柱采样，叶片是带折面的曲面，具有独立颜色与叶脉。

采样保留每个点的三维位置与法线。相机改变后，代码重新进行可见面选择、三维投影以及逐点深度计算。材质由固定种子的多尺度噪声、条纹、皮孔和局部颜色变化产生；粗糙度控制高光，物体颜色仅修改果肉外皮的底色，保留叶片和果梗的独立材质。

投影结果进入 CRF 主引擎的高斯核累积与深度合成，使用和街景相同的函数编辑协议。此处是参数曲面生成的 surfel / 高斯采样，不是训练得到的 3DGS，也不是物理精确的路径追踪。

## 可编辑字段

| 字段 | 范围 | 效果 |
| --- | --- | --- |
| `prototype` | `apple` / `pear` | 重建物品几何与默认材质 |
| `generator.seed` | 0–2147483647 整数 | 确定性改变表皮纹理 |
| `generator.shape` | −1–1 | 调整果体鼓度与局部起伏 |
| `generator.roughness` | 0.08–1 | 调整表皮高光范围 |
| `color.tint` + `color.amount` | RGB8 + 0–1 | 改变果皮颜色 |
| `transform.*` | 主引擎范围 | 移动、缩放、旋转 |

```js
const data = CRFFruit.createStudioData({width:800,height:600});
let state = CRFCore.applyOperations(CRFCore.initialState(data), data.initialOps);
state = CRFCore.applyOperations(state, [
  {op:'replace', id:'apple.main', prototype:'pear'},
  {op:'set', id:'apple.main', path:'generator.seed', value:23},
  {op:'set', id:'apple.main', path:'generator.shape', value:0.3},
  {op:'setCamera', values:{yaw:12,pitch:5,zoom:1.1}}
]);
const frame = CRFCore.CPUrender(data,state,{quality:'interactive',lod:1,time:null});
```

替换默认保留物体的 ID、位置、缩放、关联及用户参数。`color.amount=0` 使用每种水果自己的默认色；已经显式修改的颜色继续保留。

## 接触阴影

摄影背景也是数值函数。水果的接触阴影随对象位置重新生成，以独立的乘法透射场合成到背景上；多个阴影相乘，不会用一块不透明背景盖住另一个阴影。阴影不会把背景的对象 ID 改成水果，选择操作仍然落在实际物品上。该简化地面假设仅用于 `metadata.proceduralStudio=true` 的摄影棚案例，不会擅自套到用户照片上。

## 接口与验证

- `CRFFruit.createStudioData({width,height,seed})`：产生主引擎兼容的数值背景与 `initialOps`。
- `CRFFruit.studioOps({width,height})`：产生添加两种水果的操作数组。
- `CRFFruit.prepareLayer(object,hierarchy,state,{width,height,step})`：供主引擎调用，返回屏幕高斯采样、逐点深度和接触阴影层。
- `node --test tests/test_fruit.cjs`：检查确定性、三维深度、视角变化、种子、形态替换、粗糙度与阴影对象归属。

CPU 路径已经用于生成与验收；包含这类程序物品的帧会明确采用 CPU。极端相机角度、非凸凹陷的精确自遮挡、真实多次反射与投影阴影仍有进一步完善空间。当前相机展示采用有限角度，避免把这些简化当作已恢复的真实场景。
