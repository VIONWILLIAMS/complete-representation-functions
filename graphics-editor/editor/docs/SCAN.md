# CRF Street 0.4：像素扫描与辅助语义分组

## 交付内容与声明

这份数据包扫描并保留参考照片全部 **667 × 1000 = 667,000** 个 RGB8 像素，给每个原像素分配一个稳定语义对象编号，并为前端 Gaussian / surfel 重建提供可编辑的深度假设。原始 RGB 是明确存储的**观测数据参数**；这不是压缩结果，也不是从短程序恢复所有照片细节。

语义轮廓由助手查看原照片后制定，并结合已有的原图观察框、条纹边界种子和源像素亮度规则修整。没有使用 0.3 渲染图的语义图，没有下载分割模型，也没有调用 Blender。该案例的 **18 对象分割是 Street 特化的辅助标注**，不代表可以自动分割任意新图。

`scanner.scene_scan.scan_pixels(input_path, labels=None)` 是单独的通用像素统计入口：它接受任意尺寸图片及可选的同尺寸整数标签数组，返回像素数、RGB 统计、包围框和梯度统计。省略标签时只统计整张图片，不自动生成语义或深度。Street 扫描实际使用这个入口计算对象统计。

## 独立重现

在本工程根目录运行：

```bash
python scripts/scan_scene.py
```

依赖为 Python、NumPy、SciPy 和 Pillow。默认输入都位于本工程内：

- `web/assets/reference.png`：原参考 PNG，保留原文件字节。
- `scanner/seed_annotations.json`：原观察记录中的条纹边界种子副本，带原注释文件 SHA-256 溯源。

脚本不依赖相邻的 `crf_street_0_3` 目录。可用 `--reference` 和 `--annotations` 指定替代输入；Street 语义构造器会拒绝非 667 × 1000 的输入，因为它的标注坐标为本案例专用。若只需要通用像素统计，请直接调用：

```python
from scanner.scene_scan import scan_pixels

whole_image = scan_pixels("another_image.png")
# supplied_labels: 整数 H×W 数组，值域 0..255。
grouped = scan_pixels("another_image.png", supplied_labels)
```

输出包含 `width`、`height`、`pixelCount`、文件/RGB 哈希及 `segments`，每段有 `index`、半开 `bbox`、像素中心 `pivot` 和 `statistics`。该函数不输出伪造的物体名称或深度。

## 本次扫描结果

| 项目 | 数值 |
|---|---:|
| 原始观测像素 | 667,000 |
| 已分配对象标签 | 667,000 |
| 未分配像素 | 0 |
| 稳定对象数 | 18 |
| 原 RGB 参数字节数 | 2,001,000 |
| 原像素标签字节数 | 667,000 |
| 推断背景 RGB 数组字节数 | 2,001,000 |
| 推断区域 mask 字节数 | 667,000 |
| 背景宿主标签字节数 | 667,000 |
| 所有原始栅格数组字节合计 | 6,003,000 |
| 实际生成的 scene-data.js | 8,025,325 字节 |
| 推断背景位置 | 99,023，约 14.8460% |
| 保持不变的可见背景位置 | 567,977 |
| 源图边缘样本 | 55,467 |

推断 mask 与标签数组虽然以原尺寸存储，只有 mask 非零的位置才生成额外推断点。背景 RGB 不应被当作一张整图贴片直接覆盖场景。

字节统计是数据数组及 JS 数据文件成本，不包含解释器、UI 源码、浏览器内部数组、GPU 缓冲或渲染成本。Base64 增加了存储体积；没有“高压缩率”主张。

源 PNG SHA-256：

```text
f9544f0a67fb117a6ac7e80980576c53c42e787bdcc67071954fab4bfd786f7b
```

规范化 RGB8 行优先字节 SHA-256：

```text
ce66923ff7c0bd64cc3aaec19ffe951dd30b3c3834843d711dd6ad86aadcf922
```

最终扫描数据 JS SHA-256：

```text
95df9a865bbae0b9e523fa32c312c086eb487e71e868dec3c71dacc924658d8d
```

## 前端数据合同

`web/assets/scene-data.js` 使用：

```javascript
globalThis.CRF_SCENE_DATA = { /* 完整数据 */ };
```

浏览器普通 `<script>` 和 Node `require()` 均可读取全局对象；不需要网络库。

| 顶层字段 | 含义 |
|---|---|
| `schema` | `crf.scene.v0.4` |
| `width`, `height` | 667、1000 |
| `referenceSha256` | 原参考 PNG 文件 SHA-256 |
| `rgbBase64` | 原观测 RGB uint8；行优先、每像素交错 R/G/B |
| `labelsBase64` | uint8；每像素一个 `objects[].index` |
| `backgroundRgbBase64` | 同尺寸推断背景/可见背景 RGB 数组 |
| `backgroundInferredMaskBase64` | uint8 的 0/1；严格等于 `labels != backgroundLabels` |
| `backgroundLabelsBase64` | 推断点绑定的宿主对象编号 |
| `objects` | 18 个有稳定 ID、中文名称、统计和深度假设的对象 |
| `relations` | `attached_to` 及 `stands_on`；均标明辅助推断来源 |
| `source` | 来源、规范化、文件/RGB 哈希及无压缩声明 |
| `metadata` | 坐标、深度、背景推断和限制 |
| `statistics` | 简明像素/字节计数，不包含大数组 |

每个 `objects` 项包含：

```javascript
{
  id: "signal.main",
  index: 9,
  label: "正面行人信号灯",
  kind: "pedestrian_signal",
  group: "信号设施",
  parent: "signal.support",
  bbox: [274, 404, 325, 494],
  pivot: [299.10204324067473, 448.9856260394393],
  depth: 220,
  depthSlope: [0, 0],
  normal: [0, 0, 1],
  signalPanels: {
    upper: [282, 410, 316, 446],
    lower: [282, 454, 316, 488]
  },
  statistics: { pixelCount: 4209 /* RGB、梯度和边缘统计也在实际数据中 */ },
  provenance: {
    segmentation: "assistant_assisted_source_segmentation",
    depth: "editable_single_view_hypothesis_not_measured_depth"
  }
}
```

`bbox=[x0,y0,x1,y1]` 是可见像素的整数半开包围框。`pivot` 是这些像素中心的均值，不是恢复出的物体质心。部分被遮挡的右窗，其可见 bbox 与辅助轮廓的完整窗口范围不同。

## 18 个稳定实体

| index | id | 分组 |
|---:|---|---|
| 0 | `wall.main` | 主墙面 |
| 1 | `wall.base` | 墙脚带 |
| 2 | `road.main` | 沥青道路 |
| 3 | `road.edge` | 路缘线与独立白漆碎片 |
| 4 | `sidewalk.main` | 人行道及后排地面 |
| 5 | `crosswalk.main` | 斑马线白漆 |
| 6 | `pole.main` | 前景主杆 |
| 7 | `pole.arm` | 顶部斜臂与弯管 |
| 8 | `signal.support` | 横臂与吊架 |
| 9 | `signal.main` | 正面双灯 |
| 10–15 | 六个 `window.r0.c0` 至 `window.r2.c1` | 可独立选择的窗 |
| 16 | `signal.side` | 两个侧向灯背与遮罩 |
| 17 | `wall.fixtures` | 左缘三处部分可见设施 |

`wall.fixtures` 把三个小裁切附着物作为一组；这不是断言它们在真实场景中属于同一个机械组件。独立白漆碎片归入 `road.edge`，其与斑马线的真实归属仍未确定。

## 坐标与深度假设

对原图整数像素索引 `(u,v)`：

```text
x = u + 0.5 - width / 2
y = height / 2 - (v + 0.5)
z = depth + depthSlope[0] * (u + 0.5 - pivot[0])
          + depthSlope[1] * (v + 0.5 - pivot[1])
```

单位是参考像素单位，正 z 朝向参考观察者。主墙为 0；窗口为 3；主杆为 200；斜臂/横臂为 210；正面灯为 220；侧向罩为 216。地面假设 `z=(v+0.5−764)×cot(20°)`，白漆比底面高 0.8 单位。主杆深度还设有“高于其最下方可见地面样本至少 2 单位”的下限，避免推断地面盖住原杆脚像素。

这些是保持遮挡顺序的可编辑分层面假设。没有标定真实尺寸、真实相机或真实深度；前景法线大多仍是朝向参考相机的平面法线。换视角后的外观是该分层假设的结果，不是新视角实拍复原。

## 背景填洞：观测与推断分开

只在原可见对象与隐藏宿主不同的位置生成填洞点。具体做法：

1. 主墙洞使用同墙可见像素的归一化 Gaussian 延拓，sigma 为 18 像素。前景周围 5 像素不作为 donor，避免把窗框或灯罩边缘延伸成残影。
2. 地面和墙脚使用同表面可见样本的方向插值，也保留 donor 排除带。
3. 杆/斜臂遮住窗口的交集，隐藏宿主是相应 `window.*`，颜色只从该窗的可见部分延拓。三个窗口分别补入 618、780、1,153 个样本，共 2,551 个。
4. 其他窗口的后景宿主仍是墙。窗口或杆件移动时，填洞点跟随各自宿主对象，而不是随相机滑动的整张背景。

每像素目前**至多一个隐藏面**。同时移走多个互相遮挡的层，可能显露没有建模的更深区域。观察到的墙面阴影已包含在 RGB 中；移动灯杆不会自动恢复真实光源或重算原图阴影。填洞只有合理性假设，没有隐藏面的独立真值。

`scanner/previews/background_inferred.png` 是所有宿主推断样本的统一诊断排列；它不是“删除全部物体后的真实照片”。

## 已执行验证及其边界

`scanner/validate_scan.py` 独立解码实际 JS 数组并与 PNG 对比。本次验证结果：

- 667,000 个 RGB 像素全部一致，最大字节误差 0；源文件哈希匹配。
- 所有数组字节长度正确，所有像素恰有一个有效标签，对象统计和可见 bbox 与数组重算一致。
- 推断 mask 严格等于“观测标签与宿主标签不同”，没有同宿主重复样本。
- 全部推断深度都在相应观测点后面，最小深度差约 0.8 参考像素单位。
- 把杆、臂、灯、支架和裁切设施的 RGB 全改为洋红重新执行填洞后，所有推断点 RGB 不变；这些前景没有被偷偷当作背景 donor。
- 567,977 个非推断位置的背景 RGB 保持原样。

这些验证是数组、数据来源和深度顺序验证，**不是 WebGL 实际输出验证**。前端渲染器的 667,000 像素严格验收仍必须从独立 PNG 解码得到真值，并读取实际渲染缓冲比较，不能只比较数据文件自报的 RGB。

## 人工复查资料

- `scanner/previews/mask_preview.png`：左原照，右语义覆盖预览。
- `scanner/previews/semantic_overlay.png`：原图叠色和对象边界。
- `scanner/previews/semantic_labels.png`：纯标签色图。
- `scanner/masks/*.png`：18 对象 mask、总标签、推断 mask 和源图边缘。
- `reports/scan_report.json`：来源、对象统计、辅助标注定义、填洞统计和实际验证结果。

没有单独标注的语义真值可用于量化分割 IoU。透明或抗锯齿混合像素仍只属于一个硬标签；物体新位置的边缘质量应通过真实交互渲染另行检查。

### 最后一次源边缘复核

在整组隐藏预览中发现侧灯背板与吊架小三角边缘漏标后，依据原图局部补入窄轮廓，并对这两组增加一像素包边。修改仅允许吸收先前标为 `wall.main` 的像素，不覆盖窗口、主杆或其他物体。各组实际新增像素数见 `scan_report.json` 的 `sourceEdgeRefinement`。辅助掩码仍是近似轮廓；抗锯齿混合、微小阴影和墙缝不会被自动分解，极端放大或整组移除时可能存在细小边缘残留。
