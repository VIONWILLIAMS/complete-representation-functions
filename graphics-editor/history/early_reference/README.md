# CRF 0.1：可执行、可编辑的数字内容表示

这份参考实现把完备表示函数的研究目标落实为一组可运行合同：**观测复刻、对象语义编辑、场景执行、时间轨迹和表示库学习**。

长期目标是从自然语言或参考资料推断可编辑的世界程序，再观察为图像、视频、3D 或声音。当前版本提供可验证的基础部件和一条原生水果场景演示，**尚未完成任意参考照片→语义3D世界的自动绑定**。请先阅读本文的能力表，再使用结果。

## 从这里开始

1. `THEORY.md`：完整研究定义、命题、误差与编辑合同。
2. `LLM_HANDOFF.md`：可交给其他 coding LLM 的开发任务和接入规范。
3. `examples/*.json`：另一模型可直接生成的机器可读程序。
4. `crf/`：解释器、渲染后端和参考工具。
5. `outputs/verification.json`：本次实际验收结果。

## 运行环境

Python 3.10+，依赖 NumPy、Pillow、SciPy。场景渲染与3D导出需要 Blender（本次使用4.3.2）；视频封装需要 ffmpeg。核心像素、高斯基底、音频与库学习不需要GPU、模型权重或API密钥。

```bash
python3 -m pip install -r requirements.txt
python3 -m unittest discover -s tests -v
```

也可用 `python3 -m pip install -e .` 安装 `crf` 命令。下文使用不依赖安装的模块方式，均在项目根目录执行。

## 1. 自然语言 → 小型场景程序 → 图片

```bash
python3 -m crf.cli plan "生成一个红苹果，放在圆形底座上" --out examples/my_apple.world.json
python3 -m crf.cli validate examples/my_apple.world.json
python3 -m crf.cli render examples/my_apple.world.json --out outputs/my_apple
```

输出是 `outputs/my_apple/render.png`。图形、网格、果皮、果梗、叶片、台座和灯光均由代码构造，不读入源图贴图。

**自然语言入口的范围：**当前 `plan()` 是明确标注的关键词／模板适配器，只识别苹果、梨和少数颜色词。它不理解任意长提示词，也不会自动满足提示词中的所有修饰。另一语言模型可直接依照 `world.schema.json` 输出更准确的场景JSON；超出当前原语集合的目标还需要扩展后端。

已提供的 `apple.world.json` 与 `pear.world.json` 使用 EEVEE 输出干净的演示画面。可在 `render.engine` 中选择 `CYCLES` 或 `BLENDER_EEVEE_NEXT`。`samples`、宽高和引擎属于明确的渲染配置；本次不承诺实时生成。

## 2. 精确指定对象，替换真实形状

```bash
python3 -m crf.cli edit examples/apple.world.json "把苹果换成梨" --out outputs/edited_pear.world.json
python3 -m crf.cli render outputs/edited_pear.world.json --out outputs/edited_pear
```

也可使用明确的操作文件：

```bash
python3 -m crf.cli edit examples/apple.world.json examples/apple_to_pear.edit.json --out outputs/edited_pear.world.json
```

操作保留 `fruit.main` 的身份和变换，替换实际lathe几何、材质参数，并记录受影响的轮廓、阴影、反射和显露区域。它不是改类别字符串，也不是对参考图做像素覆盖。

任何绑定旧场景的残差被标记为失效。未知的显露背景需要由场景已有几何、推断模型或用户补充来处理，不能通过旧源图残差抵消编辑。

## 3. 同一场景 → 视频和3D

```bash
python3 -m crf.cli audio-demo --out outputs/chime.wav
python3 -m crf.cli video examples/pear_video.world.json --out outputs/pear_video --audio outputs/chime.wav
python3 -m crf.cli export examples/pear.world.json --out outputs/pear_3d
```

视频使用同一个场景与对象身份，沿显式相机轨迹产生36帧，再封装为3秒／12fps视频。它展示相机环绕，不声称从静态图片预测出了真实物体运动。

输出格式边界：

- `scene.blend` 保留完整场景、程序材质、摄影灯和嵌入的JSON规格。
- `scene.glb` 导出真实实体几何、代码生成的顶点颜色及语义extras；不完整保留Blender程序着色节点，AREA摄影灯也不导出。查看器应提供环境照明。
- 视频尺寸与采样数使用 `pear_video.world.json` 的设置；静图使用各自场景文件中的设置。

## 4. 参考图 → 逐像素精确程序

```bash
python3 -m crf.cli pixel-encode your_photo.png --out outputs/photo.pixel.crf.json
python3 -m crf.cli pixel-render outputs/photo.pixel.crf.json --out outputs/photo.rebuilt.png
```

表示是有明确执行规则的RGBA运行长度指令：`[数量,r,g,b,a]`。解释器按行填充像素。它不需要重新访问源图片，不嵌入PNG/JPEG或base64文件。

精确性相对于 `EXIF转正 → Pillow RGBA8` 后的规范像素数组；不保证保留原文件字节、元数据、16位通道、ICC显示效果或物理光谱。

该模式声明为 `pixel_exact`。它可以修改任意指定像素，但没有因此自动获得“苹果”“梨”或遮挡后的几何。

## 5. 参考图 → 二维高斯基底 → 可选精确残差

```bash
python3 -m crf.cli gaussian-fit your_photo.png --grid 12 --fit-size 64 --out outputs/photo.gaussian.crf.json
python3 -m crf.cli gaussian-render outputs/photo.gaussian.crf.json --out outputs/photo.gaussian.rebuilt.png
```

这里实现的是**固定中心／尺度的二维归一化高斯颜色基底**，以有界最小二乘拟合RGB颜色系数。默认优化在最长边64的缩小观测上进行；输出报告另列全分辨率误差。

它不是原论文的2DGS，也不是3D Gaussian Splatting。当前没有深度、真实3D协方差或多视角场景优化。

可选有符号残差使规范RGB像素精确回环；alpha不在这一模块的精确合同中，RGBA精确性请使用pixel模块。残差记录参数、观察、基底和目标的哈希，参数或观察变更时拒绝继续应用旧残差。

```python
from crf.core import load_json
from crf.gaussian import render_gaussians
p = load_json("outputs/photo.gaussian.crf.json")
base_only = render_gaussians(p, apply_residual=False)
```

误差必须同时报告“基底自身”和“基底＋残差”，不能用残差后的零误差冒充高斯模型或语义世界已经准确恢复。

## 6. 从程序样本提取一个可复用的新语言构件

```bash
python3 -m crf.cli learn-library examples/apple.world.json examples/pear.world.json --out outputs/learned_library.json
python3 -m crf.cli expand-library outputs/learned_library.json --index 0 --out outputs/expanded.world.json
```

`library.py` 使用结构反统一：共同子结构保留，不同部分提取为参数。只考察一个共享根模板；只有将库定义、参数和调用全部计入后UTF8序列化更短，才采用新宏。否则保留原字面程序。

宏展开必须精确恢复规范JSON值，包含类型区分；`true`、`1`、`1.0`不会混同。`$param` 和 `$call` 是保留键，输入中出现时明确拒绝，避免与宏标记冲突。

这是可执行的**语言学习基线**。它未搜索所有语言，也没有训练神经程序提议器；“最适合AI的语言”仍需在指定任务与编辑分布上评估码长、生成成本、渲染成本和编辑成功率。

## 已实现与尚未实现

| 能力 | 当前状态 |
| --- | --- |
| 任意受支持图片的规范RGBA8精确回环 | 已实现通用pixel基线 |
| 小型二维高斯颜色基底＋精确RGB残差 | 已实现，固定中心/尺度 |
| 苹果/梨原生3D生成、几何替换、相机环绕 | 已实现有限对象族 |
| 导出GLB/BLEND与程序声音WAV | 已实现 |
| 参数化宏提取及精确展开 | 已实现单模板基线 |
| 任意自然语言→任意场景 | 需要LLM规划器与扩展原语 |
| 任意参考照片→可编辑语义3D世界 | 需要实际视觉／重建适配器，当前未贯通 |
| 真实3DGS／4DGS训练及语义绑定 | 目标后端接口，当前未实现 |
| 自动选择真实的不可见场景、真实未来运动 | 无单图唯一保证，应维护候选及来源 |
| 跨GPU／渲染器逐字节一致 | 未承诺；像素回环与固定实现数值合同分开 |
| 最优AI原生语言的自动发现 | 开放研究目标，当前仅有局部宏基线 |

## 复现整套验收

```bash
python3 scripts/run_demo.py
```

已有渲染产物时，可以使用 `--reuse-rendered` 跳过耗时的Blender步骤；只应在确认产物对应当前演示程序时使用。
脚本重新验证像素、Gaussian残差、对象编辑、宏展开和文件结构，并写出 `outputs/verification.json`。

所有演示参考图来自本项目自身的程序化渲染；本次没有使用用户实拍参考图或运行预训练单图重建模型。

## 下一步应打通的接口

最优先的连接是 `reference observations → inferred world hypotheses → reference-to-scene binding`。接入后须分别验证重投影、对象身份、深度/遮挡、跨视角和语义编辑；不能把本项目的像素回环与独立程序场景演示合并宣传为已经完成这条连接。

完整的研究目标与实施任务见 `THEORY.md` 和 `LLM_HANDOFF.md`。
