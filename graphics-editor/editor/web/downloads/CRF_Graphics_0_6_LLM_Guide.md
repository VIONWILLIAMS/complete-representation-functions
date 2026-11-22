# CRF 0.6 · LLM 场景程序操作指南

CRF 0.6 是可以被模型操作的图形运行时。输入可以是参考照片拟合得到的对象，也可以是模型编写的程序对象；输出是同一套场景函数在相机和时间条件下产生的像素。编辑器、Node 渲染脚本和视频导出共用核心模块。

## 1. 先把共同路径说清楚

本版的共同单位是对象程序，不是最终 PNG。一个对象包含：

- `surface`：曲面类型、轮廓系数、尺寸和形变参数。
- `material`：程序材质，或经过拟合的 UV 颜色场。
- `transform`：位置、旋转、缩放。
- `source`：来源与假设，区分 `generated`、`observed_fit` 和 `hybrid`。
- 场景级的 `camera`、`light`、`environment`、`relations`、`timeline`。

`crf-scenes06.js` 将照片拟合苹果和程序梨放进同一个程序。两个对象的形状、位置、缩放与遮挡均由同一渲染器执行。程序中包含运行所需的拟合字段；执行时不加载原照片来贴满画布。

光照能力必须按材料声明理解。`observed_radiance` 字段保留原照片里的明暗和高光，不能解释为已恢复真实反射率；`albedo_hypothesis` 才接受当前程序的显式光照假设。这个区别不能由模型自行抹掉。

## 2. 给另一个 LLM 的任务说明

可以把下面这段文字连同 `PROGRAM_SCHEMA.md`、当前 JSON 和工具清单交给模型：

> 你是 CRF 0.6 场景程序的作者。请读取当前对象 ID、来源、曲面、材质能力和时间轴。将用户意图转为经过校验的 CRF 操作数组，或完整的 `crf.program.v0.6` JSON。优先保留已有对象 ID 和可用字段。修改材质时保留观测来源；替换为新几何时说明来源变化。不要输出可执行任意代码，不要把图片 URL 当成几何，不要将推断背面标为观测事实。先读取当前状态，再提交原子操作，渲染，检查画面与数值结果。失败时根据实际错误修正；不要改验收目标以绕过错误。无法用已支持的函数表达时，说明缺少哪种曲面、材质或生成能力。

模型无需逐像素输出数百万个数字。它应编辑稳定的函数、字段和轨迹参数，然后让运行时求值。

## 3. 浏览器中的公共接口

页面加载完毕后：

```js
const editor = window.CRFEditor06;
await editor.ready;
const current = editor.getProgram();

editor.applyOps([
  { op: 'set', id: 'apple.observed', path: 'surface.shape', value: 0.45 },
  { op: 'set', id: 'apple.observed', path: 'material.color', value: [117,168,52] },
  { op: 'set', id: 'pear.generated', path: 'transform.position', value: [0.7,0,0.8] }
]);
editor.render({ quality: 'final', time: null });
const actualPixels = editor.getPixels();
const programJSON = editor.exportJSON({ download: false });
```

`time: null` 求值当前静态参数。数值 `time` 会先求值时间轨迹，所以相机轨迹可以覆盖静态相机角度。修改之后发现镜头未变时，应先检查是否仍处于时间轴预览。交互预览默认宽 640；精细画布默认宽 `min(program.width,1280)`，可显式指定尺寸。

```js
editor.applyOps([{op:'camera', values:{yaw:22,pitch:15}}]);
editor.render({time:null,quality:'final'});

// 时间动画：相机和对象在同一个场景中连续求值。
editor.render({time:2.5,quality:'final'});

// 按当前场景与时间、program.width/height 重新精细求值，不含选择标记。
await editor.exportPNG({download:true});
await editor.exportVideo({download:true});
```

完整方法和返回值以页面的 `window.CRFEditor06` 为准。核心方法包括 `getProgram`、`setProgram`、`applyOps`、`render`、`getPixels`、`getStatus`、`compileIntent`、`undo`、`redo`、`exportJSON`、`exportPNG`、`exportVideo`。页面的 AI 接口面板同时显示机器可读工具定义。

## 4. 浏览器智能体工具

`crf-ai-tools06.js` 公开 `window.CRF06Agent.execute(name, input)`；支持 `document.modelContext` 的浏览器还可以注册同名工具。普通浏览器没有该能力时，编辑器仍使用公共 API 正常工作。

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `crf_read_scene` | `{includeProgram:false}` | 当前对象、来源、能力、相机、轨迹与渲染诊断 |
| `crf_apply_operations` | `{operations:[...]}` | 原子修改、渲染与新状态 |
| `crf_set_program` | `{program:{...}}` | 校验完整 JSON、替换、渲染 |
| `crf_render_view` | `{time:2.5,quality:"final"}` | 在指定时间求值并返回状态 |
| `crf_undo` | `{}` | 撤销并重新渲染 |

工具没有内置远端 LLM。它们是给已有模型调用的执行接口。页面顶部自然语言输入是公开的有限规则编译器；它支持已有物品、场景、颜色、光照与镜头关键词，复杂意图需要外部模型编写 JSON。不能用这部分规则功能宣称已经实现通用语言到任意高质量世界的模型。

工具输入会经过运行时校验。API 调用成功不等于画面目标成功；下一步必须读取状态、检查真实画面，并根据需要再次修改。

## 5. 在 Node 中用代码生成图片

需要 Node.js 20 或以上，并安装 `pngjs`。浏览器编辑本身不需要 npm。

```sh
npm install --ignore-scripts
node scripts/run_program06.cjs --preset common --output common.png
```

使用模型编写的场景程序：

```sh
node scripts/run_program06.cjs --program scene.json --output image.png --width 960 --height 720
node scripts/run_program06.cjs --program scene.json --output frame_2_5.png --time 2.5
```

直接编写场景代码也可以。下面这个例子使用与编辑器完全一致的模块：

```js
const fs = require('node:fs');
const Core = require('./dist/crf-program.js');
require('./dist/assets/v06/observed-fruit.js');
const Scenes = require('./dist/crf-scenes06.js');

let program = Scenes.create('common');
program = Core.applyOps(program, [
  {op:'set',id:'apple.observed',path:'material.color',value:[117,168,52]},
  {op:'set',id:'apple.observed',path:'surface.shape',value:0.45},
  {op:'camera',values:{yaw:18,pitch:12}}
]);
Core.assert(program);
fs.writeFileSync('scene.json', JSON.stringify(program, null, 2));
```

`Core.validate(program)` 返回 `{valid, errors}`，不抛异常；需要阻断非法输入时使用 `Core.assert(program)` 或显式检查 `valid`。`applyOps` 返回新程序，失败时原程序不被部分修改。

导出的完整 JSON 内含拟合表面的颜色字段。重放这一份 JSON 不需要再加载 `observed-fruit.js` 或原照片。内置 `CRFScenes06.create('common')` 则需要先载入该资产，因为它负责首次组装程序。

## 6. 视频是真实逐帧求值

```sh
node scripts/run_program06.cjs --program scene.json --sequence frames --fps 24 --duration 5
ffmpeg -y -framerate 24 -i frames/%04d.png -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart scene_5s.mp4
```

5 秒、24 fps 对应 120 帧。采样时间是 `0/24, 1/24, …, 119/24` 秒；最后一帧显示至 5 秒。逐帧渲染速度影响导出耗时，不改变成片时长。浏览器使用 WebCodecs 和同一场景渲染器编码 WebM；不支持编码时会报错，不会伪造一个下载文件。

浏览器视频默认宽 640、高度按场景比例，时长固定为 5 秒。若导入程序的 `timeline.duration` 不是 5，编辑器会把完整轨迹映射到五秒；CLI 的 `--duration` 则直接按场景秒数采样。本版交付的三个预设都是五秒轨迹，两条路径不发生时间缩放差异。

原始 PNG 是无损输出；MP4/WebM 是编码视频，不能拿有损压缩后的 RGB 要求逐字节相同。

## 7. 修改与验收的最小闭环

1. 读取当前程序和对象来源。
2. 将意图编译为对象或场景操作。
3. 校验并提交整组操作；失败时保留原状态。
4. 求值目标镜头与时间。
5. 检查图像、对象可见区域、深度、置信度和来源诊断。`CRFEditor06.render` 返回 RGB、ID、深度和统计；逐像素置信度可从 `CRFProgramRenderer.render(program, options).confidence` 读取。
6. 在相同验收条件下修正参数或结构，再次求值。

本版的拟合器还执行实际的轮廓参数优化与 UV 字段迭代。它记录优化曲线及留出像素误差；留出 RGB 不参与颜色系数、均值和背面先验的拟合。轮廓分割使用完整输入，因而该留出测试只衡量已知前景内的颜色插值，不能当作新视角或未知场景的泛化证明。

这是一条可检查的反馈链路。它尚未具备自主改写全部管线源码、重新训练模型并无条件改进的通用 RSI 能力。

## 8. 本版边界与扩展点

当前照片拟合仅覆盖可分离的红苹果、黄绿梨子，必要时用户框选主体。几何使用旋转曲面假设，背面颜色来自低置信度补全。任意街景的全自动语义解析、真实三维恢复、物理材质与照明分解、复杂运动和通用新物品生成仍是后续工作。

可扩展位置是明确的：在 `surface` 加入新的几何函数，在 `material` 加入新的字段与着色函数，在拟合器中增加新的观测约束和优化器，在 `timeline` 增加受支持的动态参数。扩展后仍须遵循同一程序、同一执行器、来源可追溯、独立验收的原则。新增一种曲面不自动获得对应的照片识别和参数恢复能力；两端都需要实现。

目录中的 `editor05.html` 保留 0.5 的 Street、照片精确回放和边缘/背景补齐实验。其密集观测表示与 0.6 的对象函数程序属于不同能力阶段；本版没有将旧照片自动升级成完整三维世界。
