# CRF 图形计算编辑器 · 0.5

可操作的原生图形计算研究原型：扫描照片、语义对象、边界混合、背景补齐、高斯渲染、程序物品、时间轨迹与像素验收使用同一条函数编辑路径。运行原生 HTML/CSS/JavaScript，不依赖 Blender、Three.js 或远端模型服务。

**在线编辑器：** https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/

## 开始使用

选择午后街角、程序苹果与梨子、水果实拍或阿尔卑斯湖畔。点击画布或对象树选中对象，再改颜色、位置、比例或深度；程序水果还可改形态、种子和粗糙度。使用“案例展示”查看四个角度与五秒示例视频；通过“函数 JSON”提交结构化操作。修改支持撤销、重做、恢复，输出支持 PNG、场景 JSON 和浏览器逐帧 WebM。

0.5 修复了换墙色的混合边缘、隐藏信号灯后的纹理与墙缝补齐、隐藏物体的选择框残留。三个照片案例在各自冻结参考尺寸下共 1,571,800 像素严格一致；这仍是保留稠密 RGB 系数的原视角重建，不代表完整真实三维或压缩恢复。程序水果的基准检查单独报告。

## 下载包与离线运行

- `CRF_Graphics_0_5_Offline.html`：四案例单文件编辑器，包含代码、数值场景及独立参考 PNG。需要支持 `DecompressionStream` 的浏览器。编辑和导出可离线运行；预制图库、视频播放及下载清单指向在线地址。
- `CRF_Graphics_0_5_Source.zip`：完整源码、输入照片、数值数据、文档和验收记录。
- `CRF_Graphics_0_5_Showcase.zip`：多角度 PNG 与五秒视频。与源码包解压到同一位置，合并共同的 `CRF_Graphics_0_5` 文件夹，即可使用完整本地图库。

完整目录可使用任意静态服务运行，例如：

```sh
python3 -m http.server 4173 --directory web
```

随后打开 `http://127.0.0.1:4173/`。浏览器运行本身无需 npm 安装。实际浏览器验收页为 `http://127.0.0.1:4173/verify-v05.html`。

## 复现扫描、渲染与检查

Node.js 20 或以上；Python 依赖见 `requirements.txt`；视频转码需要 ffmpeg / ffprobe。Node 依赖仅用于 PNG 辅助输出与检查。

```sh
npm install --ignore-scripts
python -m pip install -r requirements.txt
python scripts/scan_scene.py
python scripts/build_cases.py
node scripts/build_registry.cjs
npm test
node scripts/render_v05.cjs stills
node scripts/verify_delivery.cjs
node scripts/verify_v05.cjs
python scripts/pixel_gate.py
```

两张新增照片的原始下载文件随工程提供，无需重新下载。`build_cases.py` 在扫描前固定参考尺寸为 800 × 600 和 800 × 531；比较阶段不重新缩放、模糊或对齐。冻结 Street 检查器位于 `verification/pixel_acceptance.py`。

生成两个五秒视频：

```sh
node scripts/render_v05.cjs frames street
ffmpeg -y -framerate 24 -i build/v05_frames/street/%04d.png -vf 'pad=ceil(iw/2)*2:ceil(ih/2)*2' -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart web/downloads/crf_0_5_street_5s.mp4
node scripts/render_v05.cjs frames fruit_lab
ffmpeg -y -framerate 24 -i build/v05_frames/fruit_lab/%04d.png -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart web/downloads/crf_0_5_fruit_lab_5s.mp4
```

每个视频产生 120 帧，24 fps，5 秒。Street MP4 右侧补一列至 668 × 1000；原始画布和 WebM 为 667 × 1000。编码视频是有损格式，不用于静态 RGB8 完全一致验收。浏览器的“导出视频”也调用同一场景核心，并优先逐帧编码 WebM。

重新打包交付：

```sh
python scripts/package_v05.py --site-url https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/
```

该命令需要已有静态图、视频和报告；它不会把未执行的浏览器验收伪造为新的结果。交付清单包含真实文件大小和 SHA-256，压缩包执行 CRC 检查。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `web/crf-core.js` | 状态验证、原子操作、关系、时间轨迹、CPU 高斯渲染 |
| `web/crf-renderer.js` | 浏览器渲染桥接、WebGL 路径与明确的 CPU 回退 |
| `web/crf-fruit.js` | 三维参数水果、程序材质、叶片、果梗与接触阴影 |
| `web/crf-video.js` | WebCodecs 逐帧编码与 JavaScript WebM 封装 |
| `web/editor.js` | 四案例、编辑、命令、导出与实际画布验收 |
| `web/assets/scene-data.js` | Street 观测、标签、边界混合与推断背景 |
| `web/assets/cases/` | 新案例数据与独立参考 PNG |
| `web/assets/source_photos/` | 两张 CC0 照片的下载输入 |
| `scanner/`、`scripts/build_cases.py` | 像素扫描、案例标签和背景构造 |
| `tests/` | 核心、边界与程序物品回归检查 |
| `verification/` | 冻结的严格 Street RGB8 检查器 |
| `reports/v05/` | 0.5 逐像素、浏览器、补齐、渲染和视频证据 |
| `web/downloads/` | 单文件编辑器、两个压缩包、媒体、报告及清单 |

## 技术报告与模型接入

- [0.5 技术与验收报告](CRF_0_5_Report.md)
- [0.5 LLM 操作指南](LLM_0_5.md)
- [程序水果生成器](FRUIT_GENERATOR.md)

`docs/ENGINE.md`、`docs/EDITOR.md`、`docs/CRF_MODEL.md`、`docs/LLM_OPERATIONS.md` 以及旧 `render_deliverables.cjs`、`package_delivery.py` 保留 0.4 研究历史。当前入口、案例及交付操作以本 README、0.5 文档和 `render_v05.cjs` / `package_v05.py` 为准。

## 验收与边界

本次交付核心、边界和水果测试 24/24，独立引擎检查 13/13，0.5 专项检查 15/15，实际浏览器检查 10/10。三个实际解码视频均为 120 帧、24 fps、5 秒。证据在报告目录，可通过对应脚本复查。

本次浏览器 WebGL 2 不可用，已验证的是 CPU 路径；不要把这些结果写成 GPU 性能。照片新视角与遮挡后方是单图假设，原照片阴影和倒影仍属于观测颜色。边界混合也是估计值。原生水果是程序物品，不是实拍照片重建。内置中文命令使用有限规则，外部 LLM 通过结构化操作接入；尚未实现任意语义物品生成或自主递归改写管线。
