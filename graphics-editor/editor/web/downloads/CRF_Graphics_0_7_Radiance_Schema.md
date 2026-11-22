# CRF 0.7 · 原生图像程序

> 下载版链接说明：本文件的资源链接指向已发布站点。标注“源码包内”的链接下载 [完整源码包](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)，解压后在 `CRF_Graphics_0_7/` 下按所列路径查找；离线阅读请使用包内 `docs/v07/RADIANCE_SCHEMA.md`。


`crf.image_program.v0.7` 是供语言模型编写的声明式场景程序。执行器直接计算几何交点、可见性、光照、反射、折射和程序表面颜色；不读取照片作为生成背景。它与历史高斯观测编辑器并存。

## 最小完整程序

```json
{
  "schema": "crf.image_program.v0.7",
  "id": "my-scene", "title": "窗光下的陶瓷球", "width": 960, "height": 720,
  "seed": 19, "exposure": 1,
  "camera": {"position": [4,3,6], "target": [0,0.8,0], "fov": 38, "aperture": 0, "focusDistance": 7},
  "environment": {"top": [170,195,220], "bottom": [210,205,195], "strength": 0.3},
  "lights": [{"id":"key", "type":"area", "position":[-3,5,2], "target":[0,0.5,0], "size":[3,3], "color":[255,242,220], "intensity":7}],
  "objects": [
    {"id":"floor", "label":"石台", "visible":true, "surface":{"kind":"box","width":12,"height":0.1,"depth":12}, "transform":{"position":[0,-0.1,0],"rotation":[0,0,0],"scale":[1,1,1]}, "material":{"color":[190,185,176],"roughness":0.6,"metalness":0,"transmission":0,"ior":1.5,"texture":{"kind":"stone","scale":4,"strength":0.3},"bump":0.01}},
    {"id":"subject", "label":"陶瓷球", "visible":true, "surface":{"kind":"ellipsoid","radius":0.8,"height":1.6}, "transform":{"position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]}, "material":{"color":[40,105,100],"roughness":0.18,"metalness":0,"transmission":0,"ior":1.5,"texture":{"kind":"ceramic","scale":5,"strength":0.1},"bump":0.002}}
  ]
}
```

## 坐标、几何与材料

世界坐标 Y 向上。对象局部底部 Y=0，顶部 Y=height；椭球中心在 height/2。旋转为 X/Y/Z 欧拉角，单位度。对象空间变换顺序为缩放、旋转、平移。

表面支持 `ellipsoid`、`box`、`cylinder`、`lathe`。前三种默认使用解析交点；`box.bevel` 可添加圆角，半径不可超过最小边长的一半，圆角盒采用有预算的距离场求交。旋转曲面的 `profile` 是从底到顶的归一化半径系数，段间线性插值并计算圆锥段交点，再插值表面法线，避免分段明暗带。`lathe.thickness` 可声明壁厚，使花器口部和内壁参与求交。

材料包括颜色（0–255 sRGB）、粗糙度、金属度、透射、折射率、程序纹理和微表面扰动。透射采用折射与 Fresnel 分支；它不是把对象透明度降低后露出背景。照明含面积光源、环境及多次弹射。面积光采样与 BRDF 方向采样通过多重重要性权重结合，以降低高光方差。执行预算有限，含有为交互性能做出的近似，不等于经过验证的无偏离线物理渲染器。

程序纹理：`none`、`wood`、`stone`、`orange`、`ceramic`、`fabric`、`asphalt`；共同参数 `scale`、`strength`。可在任何纹理上增加函数表达式。

## 可由模型提出的表面函数

`material.function` 是限定语法的数学表达式树，作用于对象局部 x/y/z，输出颜色乘数并限制到0–2。没有 `eval`、动态 JavaScript、网络或文件访问。

```json
{"op":"add","args":[
  {"op":"const","value":0.85},
  {"op":"mul","args":[
    {"op":"const","value":0.25},
    {"op":"fbm","frequency":7,"seed":2}
  ]}
]}
```

叶子：`const(value)`、`x`、`y`、`z`。空间场叶子：`noise`、`fbm`、`voronoi`，可带 `frequency` 与 `seed`。`add` / `mul` 接受2–8个 args，按给定顺序从左到右折叠，二元旧程序的运算顺序不变；`sin` / `abs` / `clamp` 有一个 arg，clamp 可带 min/max。每种材料最多96个节点、深度最多12。应保存模型提出的表达式和验证证据；表达式存在本身不证明已经学会了任意真实材质。

## 公共接口

- `CRFRadiance07.validate(program)` 返回 `{valid, errors}`。
- `CRFRadiance07.assert(program)` 拒绝无效程序。
- `CRFRadiance07.render(program, options)` 同步求值，用于Node。
- `CRFRadiance07.renderAsync(program, options)` 分批求值，浏览器可取消；`onProgress({completed,total,progress})` 报告实际工作量。
- `CRFPhoto07` 门面同时提供上述接口及 `presets()`、`createPreset(id)`、`applyOps(program, ops)`。

渲染返回 `{width,height,rgba,ids,depth,stats}`。`rgba` 是 `Uint8ClampedArray`；ids 为对象数组索引，背景为-1。`options` 含 width、height、samples、bounces、onProgress、signal、denoise。固定程序、种子和选项产生确定像素。预览建议320×240、2samples；静态成品建议960×720、48–96samples，依据实际预算调整。

`denoise:true` 先抑制同一对象内孤立的正向亮度异常，再启用最多三次有界空间双边滤波：不同对象不相互混合，深度与颜色边缘降低邻域权重。柑橘材质只应用第一轮局部滤波，以保留果皮细节。`stats.denoiser` 明确记录是否启用；默认 false 返回未经降噪的采样结果。该滤波可能软化材质微细节，不能把降噪后的像素一致性当作与照片的精确重建证据。它不调用生成模型或外部图片。

## 预算与编辑

对象1–64，面积光源0–8。尺寸64–2048且总像素最多2.1M；每像素样本1–128，弹射1–8，单次最多128M主射线。几何尺寸为正且不超过100（半径不超过20）；轮廓3–64个0–1.5系数；变换缩放0.01–20，位置±200。粗糙度0.025–1，金属度与透射0–1，折射率1–2.5，bump0–0.25。纹理scale0.01–200，strength0–1。光源强度0–120，尺寸0.05–30；exposure0.05–8。

编辑操作数组先应用到副本，再对完整程序校验，成功后返回新程序。支持 `set{id,path,value}`、`add{object}`、`remove{id}`、`camera{values}`、`environment{values}`、`light{id,values}`。set路径以surface/material/transform/label/visible开头。函数树修改通过material.function完成。

## 验收边界

新图生成应评价画面、可控性、结构与细节；与参考复刻的逐像素误差分别记录。代码原生与重放一致性不自动证明照片写实、类别泛化或达到任何指定模型的质量。旧Street等像素观测案例必须继续保留。
