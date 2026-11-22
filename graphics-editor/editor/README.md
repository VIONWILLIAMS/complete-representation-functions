# CRF 图形计算编辑器 0.10

0.10 研究版：保留全部历史案例，新增二维高斯直接求值、像素足迹过滤、近似材料/高光编辑、冻结模型的 DeepSeek 语义编排与逐候选验收循环。

- 工作空间：`web/studio10.html`（根首页同一入口）。
- 论文借鉴与能力边界：[说明](docs/v10/PAPER_INTEGRATION.md)。
- 循环与证据契约：[说明](docs/v10/LOOP.md)。
- 实跑、完整画面与旧版本兼容：[交付报告](docs/v10/DELIVERY.md)。
- 新内核：`web/crf-gaussian10.js`；逐图求解：`scripts/fit_gaussian10.py`。
- 本轮不训练模型；照片观察拟合、物品重组、纯语义生成能力分别说明。SHARP、GS-IR、GaussianAnything 的训练网络没有被冒充为已运行组件。

```sh
npm run test:v10
python3 -m unittest discover -s tests -p 'test_gaussian10.py'
npm run build
```

## 历史版本说明（保留）

# CRF 图形计算编辑器 · 0.9 研发候选

0.9 已实现可编辑语义场景、解析图像平面与共享高斯外观、DeepSeek 搜索/看图/有界修订、精确模型快照、像素重建与逐帧导出。**照片真实感与泛化尚未通过，完整发布合同没有完成。** 原 0.8 仍为首页，所有历史案例保留。

- 新编辑器：`/studio09.html`；旧高斯入口：`/gaussian08.html`。
- 完整实现与限制：[0.9 实验报告](web/downloads/CRF_0_9_Report.md)。
- 语义接口及另一 LLM 的接入：[Provider API](docs/v09/PROVIDER_API.md)。
- 表示与求值器：[Generative Core](docs/v09/GENERATIVE_CORE.md)。
- 冻结协议：`benchmarks/v09/protocol.json`；实际实验：`reports/v09/experiment_summary.json`。
- 完整离线包：`web/downloads/CRF_0_9_Render_Kit.zip`，包含真实场景及精确模型，不需要 API 即可重绘。

```sh
npm install
npm run dev
# 在原站地址后打开 /studio09.html
npm run test:v09
npm run build
npm run verify:v09
node scripts/render_v09.cjs --all web/assets/v09/generated/index.json outputs
```

本地模型接口需要服务端 `DEEPSEEK_API_KEY`；不在浏览器中配置或保存。新生成是有限解析形态＋高斯外观的混合表示，没有使用 Blender、网格或外部完整成图接口。旧观测高斯与新生成分别验收。4:3场景的视频导出在1080p容器中保留原比例、左右留边。

## 保留的 0.7 使用说明


用自然语言描述场景，经真实 DeepSeek 搜索与参考图片输入，生成可编辑的图像程序，由 CRF 在本地计算像素，再把实际渲染画面交给模型反馈。红绿灯 Street、苹果与梨子、实拍水果、湖畔以及全部 0.6 案例持续保留；首屏默认进入 Street。

在线编辑器：https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/

## 如何使用

1. 在左侧选择已有案例，或在对话区选择“生成新图片”并描述构图、物品、材质和光线。
2. “搜索参考”会实际调用 DeepSeek 的搜索能力。参考面板分别显示网页来源、取图尝试、成功取得的图像与提交视觉模型的数量。
3. 模型返回完整 `crf.image_program.v0.7`，校验后由本地渲染器计算画面。默认可再进行一轮实际图片反馈，失败时保留初稿。
4. “修改当前画面”对当前表示操作；“检查并改进”会提交实际画布与当前程序。颜色、粗糙度、曝光和 JSON 也可直接编辑，并可撤销。
5. “模型实测对比”展示本次真实 API 初稿和反馈后的程序/图片，可继续打开编辑。人工编写的原生场景与模型实测分开标注。
6. 导出 PNG 和场景 JSON 保存作品。高采样渲染需要时间，可观察真实进度并停止。旧案例的视角、五秒视频和像素检查仍在其编辑区。

## 本地运行与复现

Node.js 20 或以上：

```sh
npm install
npm run dev
```

打开 `http://127.0.0.1:4173/`。本地案例和原生渲染无需 API；对话调用需要服务端运行时的 `DEEPSEEK_API_KEY`。隐藏输入方法、源码与图片包合并方法见 [本地运行](docs/v07/RUN_LOCAL.md)。密钥不放在前端、下载包或场景 JSON 中。

直接执行由其他语言模型编写的合法场景 JSON：

```sh
node scripts/run_program07.cjs --program scene.json --output image.png --width 960 --height 720 --samples 48
node scripts/run_program07.cjs --preset ceramics --output ceramics.png --samples 32
```

同一程序、种子和渲染选项可确定性重放。输出旁边的 `.render.json` 记录采样、后处理、PNG/RGBA/程序校验值。`--raw` 关闭空间降噪。0.6 的 Gaussian 场景和视频继续使用 `scripts/run_program06.cjs`；历史完整说明见 [0.6 说明](docs/v06/README_0_6.md)。

## 表示与执行

| 模块 | 实际职责 |
| --- | --- |
| `server/deepseek07.mjs` | 搜索、视觉输入、结构化程序输出、一次受限协议修正、实际请求证据 |
| `server/references07.mjs` | 公开照片页、受限来源取图、容器/尺寸/哈希检查、取消与失败记录 |
| `server/worker07.mjs` | 同源服务端 API、运行时密钥、请求大小边界、静态资源 |
| `web/crf-radiance07.js` | 原生几何求交、面积光、可见性、反射/折射、程序表面函数、采样与可选降噪 |
| `web/crf-photo07.js` | 图像程序接口与四个人工编写的原生场景 |
| `web/editor07.js` | 历史案例整合、对话、实际画布反馈、原子提交、导入导出与前后对照 |
| `web/assets/v07/generated/` | DeepSeek 实际输出的初稿及反馈程序 |
| `web/media/v07/` | 本次图像和对应渲染证据 |
| `web/verify-v07.html` | 点击运行的 19 项真实浏览器验收 |

图像程序可声明安全数学表达式树，例如多尺度噪声、正弦纹理及 2–8 项加法/乘法。执行器没有 `eval`，也不执行模型返回的 JavaScript。原生生成不会读取参考照片当作背景或纹理；参考图像用于模型上下文。此版本不使用 Blender 或远端扩散图片接口。

0.5 的密集高斯观测、0.6 的观测拟合与生成曲面共同路径、0.7 的光线求值路径目前共享工作台与语义操作入口，底层执行器仍有区别。没有把旧照片的光照自动分解为完整真实材质，也没有证明单张图可唯一恢复完整三维。

## 验收与质量结论

程序可运行、像素回放一致、图像具有摄影真实感是不同的验收目标。0.7 已提供真实模型交互和视觉反馈链路；本次结果仍有采样噪声、材质细节和复杂场景表达不足。**当前没有证明达到指定旗舰模型或传统扩散模型的整体画质。** 参考条件下的函数合成不等于基础模型权重训练。

```sh
npm test
npm run test:v07
npm run build
python scripts/package_v07.py
```

测试报告和实际 API 记录位于 `reports/v07/`。打包只收录实际存在的文件，检查 ZIP 完整性、大小与 SHA256，不生成虚构的通过结果。

进一步说明：[图像程序协议](docs/v07/RADIANCE_SCHEMA.md) · [DeepSeek API](docs/v07/DEEPSEEK_API.md) · [工作台接口](docs/v07/EDITOR.md) · [技术说明](docs/v07/TECHNICAL_NOTES.md)。
