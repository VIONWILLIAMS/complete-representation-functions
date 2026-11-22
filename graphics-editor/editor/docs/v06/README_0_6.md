# CRF 图形计算编辑器 · 0.6

照片拟合和代码生成进入同一个可执行场景程序。编辑器、Node 图片渲染、相机轨迹和逐帧视频使用相同的对象函数与求值器。不使用 Blender、Three.js 或远端图片生成服务。

在线编辑器：https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/

## 这一版的共同路径

默认场景包含从实拍拟合的苹果与程序生成的梨。两者共享旋转曲面、位置、旋转、缩放、轮廓形变、颜色操作、可见性、遮挡和时间求值。照片拟合输出轮廓系数和 UV 颜色/置信度字段；导出的 JSON 内含运行需要的数据，可以不带原照片重新渲染。

另有“函数静物”和“午后庭院”两种原生场景。选择对象编辑属性，或打开“场景程序”提交完整 JSON、对象、原子操作数组与时间轨迹。支持撤销、重做、本地水果照片拟合、PNG、JSON 和浏览器五秒 WebM 导出。

顶部描述框使用公开的有限规则；外部 LLM 通过 JSON 或 `window.CRFEditor06` 操作。`crf-ai-tools06.js` 提供五个智能体工具，在浏览器支持时注册 WebMCP。没有配置远端模型，也没有将有限关键词规则宣称为通用语义模型。

## 打开工程

浏览器运行无需 npm。单文件离线版直接打开 `CRF_Graphics_0_6_Offline.html`。完整源码包解压后，也可以直接打开 `web/index.html`；如需本地 HTTP，使用任意静态服务，例如：

```sh
python3 -m http.server 4173 --directory web
```

打开 `http://127.0.0.1:4173/`。`verify-v06.html` 是可重复执行的真实浏览器验收页。0.5 的四个案例保留在 `editor05.html`，历史复现说明在 `docs/README_0_5.md`。

源码 ZIP 与 Showcase ZIP 解压到同一位置，合并共同的 `CRF_Graphics_0_6` 目录，即可离线播放预制视频和查看图库。单文件版内嵌场景、拟合参考和展示照片，预制视频及下载链接仍指向在线地址；本地编辑和现场导出不依赖在线媒体。

## 用代码生成图片与视频

Node.js 20 或以上；Node PNG 输出使用 `pngjs`。视频转码使用 FFmpeg。安装与渲染：

```sh
npm install --ignore-scripts
node scripts/run_program06.cjs --preset common --output common.png
node scripts/run_program06.cjs --program scene.json --output image.png --width 960 --height 720
node scripts/run_program06.cjs --program scene.json --output time_2_5.png --time 2.5
```

生成 120 个确定时间戳的画面，再编码 5 秒、24 fps 的视频：

```sh
node scripts/run_program06.cjs --program scene.json --sequence frames --fps 24 --duration 5
ffmpeg -y -framerate 24 -i frames/%04d.png -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart scene_5s.mp4
```

浏览器直接使用 WebCodecs 编码 WebM。预览运行速度与导出视频帧率分别计算；本版主要是 CPU 求值，不能据此宣称 GPU 或 60 fps 实时性能。

## 拟合、测试与重建交付

```sh
node scripts/build_observations06.cjs
npm run test:v06
npm run test:legacy
node scripts/render_v06.cjs stills
node scripts/render_v06.cjs frames common
node scripts/render_v06.cjs frames courtyard
```

原始 CC0 照片与固定参考尺寸随工程提供。浏览器验收和真实视频编码需要实际运行；打包脚本只读取已存在的结果，不会伪造报告。最终打包命令：

```sh
python scripts/package_v06.py --site-url https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/
```

## 关键文件

| 路径 | 职责 |
| --- | --- |
| `web/crf-program.js` | 对象协议、校验、原子编辑、预设、有限意图规则、时间求值 |
| `web/crf-program-renderer.js` | 透视投影、表面高斯采样、深度与可见性、着色、分析地面 |
| `web/crf-observation.js` | 有辅助选区的水果分割、轮廓优化、颜色字段拟合与留出验证 |
| `web/assets/v06/observed-fruit.js` | 两个真实照片拟合资产、来源、置信度和误差 |
| `web/crf-scenes06.js` | 将拟合对象与生成对象组装为同一场景 |
| `web/editor06.js` | 可视编辑、输入图片、JSON、画布读取与导出 |
| `web/crf-ai-tools06.js` | 五个公共 AI 操作工具与可选 WebMCP 注册 |
| `web/crf-video.js` | WebCodecs 固定时间戳逐帧编码与 WebM 封装 |
| `scripts/run_program06.cjs` | 合法场景 JSON 的无界面 PNG / 序列渲染 |
| `tests/test_integration06.cjs` | 跨来源编辑、遮挡、孤立目录重放、确定性和原子失败 |
| `reports/v06/` | 拟合、渲染、测试、浏览器与视频证据 |
| `docs/v06/` | 协议、拟合方法、技术报告和模型操作指南 |

## 能力边界

照片拟合目前针对红苹果和黄绿梨子，使用旋转曲面假设。背面是低置信度补全；观测颜色保留原照明。地面为分析光线与平面交点，物品使用表面高斯路径；阴影是近似模型。关系图记录与校验结构，显式变换仍由程序作者给定。

这次验收证明了受限物品上的共同对象路径，不证明任意照片完整三维恢复或通用语言高质量生成。旧版原视角 RGB 严格回放与新版对象拟合使用不同验收目标，不能把旧版的 100% 像素回放成绩挪给新版新视角。Fable 5.2 仍是质量目标，本版没有进行同题盲测，也不宣称达到其水平。

详见 [技术报告](REPORT.md)、[LLM 操作指南](LLM_GUIDE.md)、[程序协议](PROGRAM_SCHEMA.md) 和 [观测拟合说明](OBSERVATION.md)。
