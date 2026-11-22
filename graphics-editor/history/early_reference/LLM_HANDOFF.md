# CRF 开发交接：给下一位编程 LLM 的执行规范

版本：0.1  
日期：2026-11-21  
适用项目：本文件所在的 crf_world 项目  
目标：把自然语言或参考信号转成可执行、可编辑的原生内容表示，并由它生成图像、视频、3D 与声音。

## 1. 接手时先知道什么

这是一个已有可运行子集的研究原型。继续开发应保留它已建立的表示合同，在真实后端上增加能力。当前代码不是通用的文字到世界模型，也没有完成任意照片到可编辑 3D 场景的逆向重建。

项目的核心资产是**可验证的程序与参数**。一张图片、一段视频、一段声音是执行这些资产后得到的观测。像素复刻、语义编辑、世界重建必须分别验收。

请优先阅读：

1. 本文：操作、接口、扩展方法与交接约束。
2. README.md：交付包的运行说明；以实际存在的文件为准。
3. THEORY.md：数学合同与目标架构。其中更完整的 IR、假设图、自动语言学习机制不能直接视作已实现能力。
4. crf/core.py、crf/cli.py、crf/raster.py、crf/gaussian.py、crf/library.py。
5. crf/blender_backend.py、crf/audio.py、tests/test_contracts.py。
6. world.schema.json、capabilities.json、examples/、scripts/run_demo.py 和 outputs/verification.json（若已生成）。代码、schema、文档冲突时，先复现冲突，再修正三者的一致性。

本文描述的是上述源文件在交接时的实际实现。**下文命令是要求接手者执行的步骤，不是已经执行成功的结果声明。** 测试结果、渲染时间、文件大小、拟合误差与视觉质量必须由接手者实际测量。

研究重点是内容表示与生成系统；不需要继续讨论 P=NP。

## 2. 三种合同与当前实现

### 2.1 合同必须分开报告

| 合同 | 要回答的问题 | 必要证据 |
|---|---|---|
| 观测复刻 | 指定观察条件下，输出与参考样本相差多少？ | 输入规范、尺寸、颜色/采样规则、误差或样本哈希 |
| 语义编辑 | 指定对象与属性是否被正确改变，保留项是否保留？ | 稳定对象 ID、实际参数变化、依赖失效、编辑后重新执行 |
| 世界重建与预测 | 同一资产能否解释多视角、多时间或动作结果？ | 多观测约束、留出视角、时间一致性、未观测部分的假设说明 |

从单张图逐像素复刻成功，不能推出真实几何、材质、光照或背面已恢复。生成了旋转视频，也不能自动证明旋转后露出的结构来自原始参考图。

### 2.2 真实能力表

| 模块 | 当前实现 | 当前边界 |
|---|---|---|
| core.plan | 苹果/梨及少量颜色关键词生成 JSON 场景 | 关键词与固定模板；没有调用通用 LLM |
| core.validate_world | 验证 crf-0.1 world 子集 | 几何只接受 fruit_lathe 的 apple/pear；不是所有模态的统一验证器 |
| core.edit_world | 按 entity_id 替换苹果/梨，修改几何与材质，保留 ID、变换与相机 | 单一编辑操作 replace_entity；没有通用空间关系求解 |
| Blender 后端 | 实际旋转体网格、果梗、叶片、程序材质、灯光；静图、相机轨迹帧、3D 导出 | 程序化创作的水果场景；不是照片重建 |
| raster.py | canonical RGBA8 的行优先 RLE 与精确回环 | 保证规范化像素，不保证原始文件字节或元数据；没有对象语义 |
| gaussian.py | 固定中心/尺度的归一化二维高斯基、RGB 有界最小二乘、可选精确残差 | 只拟合二维观测；不是论文中的 2DGS 或 3DGS |
| audio.py | 谐波振荡器、包络、事件时间与声像生成 WAV | 没有语音合成、参考声音重建、接触声学或物理声音推断 |
| library.py | 多个 JSON 的结构反统一，学习一个共享根模板；完整编码变短才接受 | 单模板搜索基线；没有全局最优、子程序挖掘或任务分布泛化保证 |
| core.reconstruct_reference | 明确抛出 CapabilityUnavailable | 任意参考图片到语义 3D 的适配器尚未实现 |
| 假设图推断 | 目标设计见 THEORY.md | 当前没有推断引擎、置信度校准或分支融合 |

必须保留这些边界的机器可读表达。例如现有 world 的 claims 中明确给出 photo_reconstruction、exact_reference_pixel_match、general_natural_language_planner 为 false。能力真正落地并通过相应验收前，不得改成 true。

## 3. 先运行基线，再改代码

### 3.1 环境与最小验收

从项目根目录执行以下命令。Python 包需要 Python 3.10 或以上，依赖以 pyproject.toml 与 requirements.txt 为准。Blender、ffmpeg 和整套验收使用的 ffprobe 是外部程序，不会由 pip 自动安装。

如果已有可用环境，直接使用；需要独立环境时：

~~~bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -e .
~~~

先记录版本与运行现有测试：

~~~bash
python --version
python -m crf.cli --help
python -m unittest discover -s tests -v
blender --version
ffmpeg -version
ffprobe -version
~~~

不要把“环境缺少 Blender”记录为“3D 渲染通过”。可以先完成不依赖该程序的检查，再明确标记尚未执行的集成验收。不要为使基线看起来通过而删除断言、扩大容差或移除功能。

整套演示入口是独立脚本，而不是一个 crf demo 子命令：

~~~bash
python3 scripts/run_demo.py
~~~

脚本执行 Blender 静图、相机视频与 3D 导出，再检查像素回环、Gaussian 残差、语义编辑、单模板展开、音视频/GLB 结构及合约测试，写出 outputs/verification.json 和演示图。它使用固定的 outputs 目录，会重写同名产物；需要保留上一版证据时，在独立工作副本运行。

当前总脚本显式采用 Gaussian grid=12，即 144 个基元，fit_size=64；对 640×480 参考图，优化尺寸为 64×48。函数默认 grid=8 与下面手动小例的 grid=4 是另外两套配置，不是随包验收的实际配置。

已有**确认对应当前示例程序**的渲染产物时，可以使用：

~~~bash
python3 scripts/run_demo.py --reuse-rendered
~~~

该选项跳过 Blender 渲染/导出和演示音频生成，复用既有文件，继续其余验收。当前脚本不会完整证明既有渲染与当前场景内容一致，因此不能只凭文件存在就使用此选项宣称当前代码渲染已通过。

下面的分步命令有助于理解各条执行路径，并使用新的输出目录。示例中的 outputs/handoff_baseline 若已存在，应换成新的目录名称，并同步修改后续命令。运行总脚本已覆盖的流程无需无目的重复；在定位问题或验证本次变更时选择相关步骤。

### 3.2 生成场景、真实几何编辑、静图与导出

~~~bash
python -m crf.cli plan "红苹果" --out outputs/handoff_baseline/apple.world.json
~~~

为这次基线显式使用 EEVEE。默认 planner 没有写 render.engine，后端默认值是 CYCLES；两者都属于当前允许的后端选项。下面只修改本次生成的 JSON：

~~~bash
python - <<'PY'
from pathlib import Path
from crf.core import load_json, save_json
p = Path("outputs/handoff_baseline/apple.world.json")
world = load_json(p)
world["render"]["engine"] = "BLENDER_EEVEE_NEXT"
save_json(world, p)
PY
~~~

~~~bash
python -m crf.cli validate outputs/handoff_baseline/apple.world.json
python -m crf.cli render outputs/handoff_baseline/apple.world.json --out outputs/handoff_baseline/apple
python -m crf.cli edit outputs/handoff_baseline/apple.world.json "把苹果换成梨" --out outputs/handoff_baseline/pear.world.json
python -m crf.cli validate outputs/handoff_baseline/pear.world.json
python -m crf.cli render outputs/handoff_baseline/pear.world.json --out outputs/handoff_baseline/pear
python -m crf.cli export outputs/handoff_baseline/pear.world.json --out outputs/handoff_baseline/pear_3d
~~~

预期产物名称由当前代码确定：

- 静图目录内是 render.png 与 blender_still.log。
- 编辑报告是 pear.world.json.edit-report.json。
- 导出目录内是 scene.blend、scene.glb 与 blender_export.log。

“预期名称”不是“已经生成成功”。必须检查进程退出码、日志及产物。查看苹果与梨的实际轮廓，并在 3D 查看器或 Blender 中检查真实网格及不同观察方向。

Blender 文件保存程序材质与灯光。GLB 使用便携材质与数值生成的顶点颜色，不携带等价的完整 Blender 着色节点；它也不导出工作室的面光源。不同查看器中的外观不应被承诺为像素一致。

### 3.3 原生音频与同一场景的相机轨迹

~~~bash
python -m crf.cli audio-demo --out outputs/handoff_baseline/chime.wav
python -m crf.cli video outputs/handoff_baseline/pear.world.json --audio outputs/handoff_baseline/chime.wav --out outputs/handoff_baseline/video
~~~

当前 planner 默认 duration_s=3、fps=12、camera_orbit_degrees=35；因此演示是 3 秒、35 度的相机轨迹，并不是默认 360 度环绕。具体帧数以当前场景与后端输出为准。

audio-demo 还会写出 chime.wav.program.json。视频目录包含 frames/frame_0001.png 等帧及 video.mp4。ffmpeg 使用 H.264/YUV420P，存在视频压缩损失，不能把视频编码宣称为像素无损。

音频目前是独立的程序化旋律。将其封装进视频，只证明音视频能共同播放，不证明声音由水果的接触、运动或材料属性产生。

### 3.4 两条参考图观测复刻路径

可使用刚渲染的苹果图进行自包含基线。它是**合成参考观测**，这一步不构成照片到 3D 的证据。

~~~bash
python -m crf.cli pixel-encode outputs/handoff_baseline/apple/render.png --out outputs/handoff_baseline/apple.pixel.json
python -m crf.cli pixel-render outputs/handoff_baseline/apple.pixel.json --out outputs/handoff_baseline/apple.pixel.png
python -m crf.cli gaussian-fit outputs/handoff_baseline/apple/render.png --out outputs/handoff_baseline/apple.gaussian.json --grid 4 --fit-size 48
python -m crf.cli gaussian-render outputs/handoff_baseline/apple.gaussian.json --out outputs/handoff_baseline/apple.gaussian_exact.png
python -m crf.gaussian render outputs/handoff_baseline/apple.gaussian.json outputs/handoff_baseline/apple.gaussian_base.png --base-only
~~~

注意两个 CLI 的差异：主 CLI 的 gaussian-render 使用 --out，没有 --base-only；独立 gaussian 模块的 render 接受两个位置参数，并提供 --base-only。

必须同时检查 Gaussian 基础图与加残差图。加残差后完全一致，不代表少量高斯本身已准确解释图像。报告至少包括基础误差、残差误差、全部程序字节数、残差占比、求解器状态。

RGBA 与 RGB 的验收范围不同：

- Pixel 路径：EXIF 转正，然后 Pillow 转 RGBA8，精确比较四通道。
- Gaussian 路径：同样转正与转换，随后直接丢弃 alpha，精确合同只针对 RGB；不进行 alpha 合成。
- 两者当前均没有显式执行 ICC 色彩变换；原始文件元数据、HDR、光谱信息不在精确合同内。

### 3.5 单模板库学习与展开

为避免渲染设置差异干扰这个小演示，另外创建一组 planner 输出：

~~~bash
python -m crf.cli plan "红苹果" --out outputs/handoff_baseline/library/apple_red.json
python -m crf.cli plan "绿色苹果" --out outputs/handoff_baseline/library/apple_green.json
python -m crf.cli plan "黄色梨" --out outputs/handoff_baseline/library/pear_yellow.json
python -m crf.cli plan "绿色梨" --out outputs/handoff_baseline/library/pear_green.json
python -m crf.cli learn-library outputs/handoff_baseline/library/apple_red.json outputs/handoff_baseline/library/apple_green.json outputs/handoff_baseline/library/pear_yellow.json outputs/handoff_baseline/library/pear_green.json --out outputs/handoff_baseline/library/bundle.json
python -m crf.cli expand-library outputs/handoff_baseline/library/bundle.json --index 0 --out outputs/handoff_baseline/library/expanded_0.json
~~~

读取 bundle.json.report.json，并对每一个索引验证展开结果。比较规范化 JSON 值，而不是缩进或原始文件字节。例如：

~~~bash
python - <<'PY'
import json
from pathlib import Path
from crf.core import load_json
from crf.library import expand_program
base = Path("outputs/handoff_baseline/library")
names = ("apple_red.json", "apple_green.json", "pear_yellow.json", "pear_green.json")
bundle = load_json(base / "bundle.json")
def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")
for index, name in enumerate(names):
    assert canonical(expand_program(bundle, index)) == canonical(load_json(base / name))
print("All canonical JSON values round-trip exactly.")
PY
~~~

候选模板若不节省完整序列化字节，正确结果是退回 literal_program_bundle；这属于正常选择，不是失败。不要为了显示压缩率而只计算调用参数、忽略模板体与库元数据。

### 3.6 随包验收快照

以下数据已从本次 outputs/verification.json 读取，用于说明交接基线；它们不能代替接手后对修改代码重新运行验收：

| 项目 | 本次记录 |
|---|---|
| 合约测试 | 12 项，失败 0、错误 0、跳过 0 |
| 参考观测 | 本项目程序生成的 640×480 苹果图；没有执行实拍照片到场景推断 |
| Pixel | canonical RGBA8 最大通道误差 0 |
| Gaussian 基础模型 | grid=12，144 基元，拟合尺寸 64×48；完整参考分辨率 MAE=9.01314453125，PSNR=22.966529250281074 dB |
| Gaussian + 残差 | RGB 最大误差 0；alpha 不在该模块精确合同内 |
| 单模板库 | 4 份程序、9 个参数；完整规范化 UTF-8 码长 4,376 → 4,139 字节，节省 237 字节，全部精确展开 |
| 视频 | 36 帧、480×360、12 fps、3 秒，含音频 |
| GLB | 15 个网格、0 张图像、0 个纹理；保留 fruit.main / pear 语义 extras |
| 声音 | 44,100 Hz、双声道、132,300 个采样帧、3 秒 |

基础 Gaussian 的 MAE 使用 0…255 RGB 通道值口径。报告中的 reference_to_scene_binding_verified 为 false；不要把观测复刻演示与独立的程序化世界演示合并解释成已经打通了参考图到语义世界。

## 4. 实际接口与不能混用的表示

### 4.1 世界 JSON

世界文档顶层至少包含：

~~~json
{
  "version": "crf-0.1",
  "kind": "world",
  "artifact_mode": "scene_program",
  "seed": 7,
  "coordinate_system": {"units": "metres", "up": "Z", "handedness": "right"},
  "camera": {"position": [4, -6, 3.2], "target": [0, 0, 1.05], "lens_mm": 50},
  "render": {"width": 640, "height": 480, "samples": 24, "engine": "BLENDER_EEVEE_NEXT"},
  "entities": [{
    "id": "fruit.main",
    "semantic": "apple",
    "geometry": {"op": "fruit_lathe", "kind": "apple", "radius": 0.78, "height": 1.55},
    "material": {"base_color": [0.62, 0.025, 0.016], "roughness": 0.32},
    "transform": {"translation": [0, 0, 0.24], "rotation": [0, 0, 0], "scale": [1, 1, 1]},
    "editable": ["geometry.kind", "material.base_color", "transform.translation"]
  }],
  "environment": {"pedestal_radius": 1.4, "pedestal_height": 0.24, "floor_color": [0.72, 0.66, 0.54]},
  "timeline": {"duration_s": 3, "fps": 12, "camera_orbit_degrees": 35},
  "provenance": {"planner": "explicit_json", "reference_observations": [], "hidden_surfaces": "procedurally_authored"},
  "claims": {"source_images_embedded": false, "photo_reconstruction": false, "exact_reference_pixel_match": false, "general_natural_language_planner": false}
}
~~~

该示例是当前子集，不是通用 IR 的最终定义。变换旋转由 Blender 的 Euler 接口使用，单位为弧度；camera_orbit_degrees 则明确是角度。扩展时需要把单位与坐标约定写入统一 schema，不能依靠变量名猜测。

render.engine 由 Blender 后端检查为 CYCLES 或 BLENDER_EEVEE_NEXT；当前 core 验证器并没有覆盖后端使用的每一个字段。新增能力时应补齐前端与后端的合同，而不是假设 validate_world 已经执行全部深层校验。

### 4.2 可直接调用的 Python API

| API | 返回或行为 |
|---|---|
| core.plan(prompt) | 当前关键词规划器返回 world 字典 |
| core.validate_world(world) | 有效则 True；无效或不支持时抛异常 |
| core.edit_world(world, request) | 返回新 world 与 edit report，不原地修改输入 |
| core.parse_edit(text, entity_id="fruit.main") | 小型目标词解析器，返回 replace_entity 请求 |
| core.observe_camera(world, time_s) | 当前轨迹上的相机描述 |
| core.reconstruct_reference(...) | 当前明确抛出 CapabilityUnavailable |
| raster.encode_array(rgba_uint8) | 返回 raster_exact 文档 |
| raster.decode_program(program) | 返回 H×W×4 uint8 |
| raster.encode_image(image_path, program_path) | 写程序并返回回环报告 |
| raster.edit_pixel(program, x, y, rgba) | 单像素编辑，返回重新编码的观测程序 |
| gaussian.fit_gaussians(image_path, program_path, grid=8, fit_size=64, residual=True) | 写二维基程序，返回拟合与精度报告 |
| gaussian.render_gaussians(program, apply_residual=True, scene_fingerprint=None) | 返回 H×W×3 uint8；program 可为映射或路径 |
| gaussian.validate_program(program, ...) | Gaussian 专用验证；详细参数以函数定义为准 |
| gaussian.scene_fingerprint(program) | 返回当前二维观测程序的依赖指纹 |
| library.learn_library(documents) | 返回 bundle 与 report |
| library.expand_program(bundle, index) | 返回展开后的独立 JSON 值 |
| audio.demo_score() | 返回程序化声音事件示例 |
| audio.render_audio(program, output_path) | 写立体声 16-bit PCM WAV，返回采样报告 |

不要把 world、raster_exact、gaussian_basis_2d、audio_program、macro_library_bundle 当成同一种表示。它们有不同执行器、观察合同和编辑能力。当前 crf validate 只验证 world。

### 4.3 Gaussian 与残差的真实语义

基础表示使用二维规则网格中心与固定尺度，计算归一化的各向同性高斯权重，RGB 系数限制在 [0,1]。fit_size 控制优化所用缩小图的最长边；输出与最终误差仍针对完整参考尺寸。

可选残差是完整分辨率、带符号整数的 RGB 差值。该实现校验：

- 程序依赖指纹；
- 基础渲染的 RGB 哈希；
- 残差数据校验值；
- 加残差后的参考 RGB 哈希与数值范围。

不同数值后端若使基础量化像素改变，旧残差不能被默认为仍然有效。render_gaussians 的 apply_residual=False 提供明确的基础渲染路径。

raster 的 RLE 是每行记录一个像素游程：[length, r, g, b, a]；Gaussian 残差 RLE 是展平 RGB 数值流的 [value, count]。两种格式不可互换。

raster 文档存有 canonical_pixel_sha256，但当前 decode_program 主要验证游程合法性与长度，没有像 Gaussian 那样在解码中强制核对存储哈希。调用者如需要输入完整性保证，应显式比较输出哈希；后续可把这一合同做成版本化能力。

### 4.4 单模板库学习的严格范围

library.py 对同结构字典与等长列表递归反统一，共同部分留在模板体，不同部分提为参数。只搜索一个共享根模板，名字为 world_template；名称不表示它已经理解了世界语义。

当前实现已包含以下边界处理：

- 使用规范化 UTF-8 JSON 字节判断相同值，区分 true、1 与 1.0。
- 输入递归出现保留键 $param 或 $call 时明确拒绝，避免普通数据与宏标记冲突。
- 比较完整 candidate bundle 与完整 literal bundle 的规范化字节长度。
- 只在 candidate 严格更小时选模板，并逐份验证规范化展开结果相同。

规范化比较忽略字典键顺序与缩进，也不保留输入数字的原始词法写法。报告里的 literal_utf8_bytes 与 candidate_utf8_bytes 是紧凑、排序后的完整 JSON 体积；core.save_json 写出的美化文件体积可能不同。若展示磁盘体积，请另测实际文件，不要混用两种码长。

这个模块没有证明发现了最优语言，也没有证明更短的模板一定更易被 LLM 预测、更易编辑或更快执行。将这些目标纳入下一阶段评估。

## 5. 不得破坏的实现原则

### 5.1 原生几何与来源必须真实

继续保持水果为真实网格、材质与空间变换。不得把整张参考图贴在平面上，再把相机轻微移动后称作已经完成 3D 重建或可编辑世界。

图像平面、billboard、深度图层可以作为公开标注的 2D/2.5D 原语加入，但必须保留能力标签，不能满足“真实几何重建”的验收门槛。纹理贴图可以作为真实几何的一种表面表示；禁止的是用单张整图贴片代替承诺中的世界恢复。

任何由先验模型或人工规则补出的背面、遮挡区域与细节，都应记录来源。参考图不能约束的内容保留为假设，不应被伪装成观测事实。

### 5.2 编辑要改生成原因

稳定对象 ID 是用户意图的绑定点。苹果换梨必须修改对应对象的实际几何与材质，再重新渲染。

当前编辑以同一个 entity_id 保留被替换对象的身份，保留其 transform 与 camera，替换几何类别、尺寸和材质。随着系统扩展，需明确定义“身份保留”是否也保留约束、附件、动画、声音发射点与外部引用。

图像中未直接选中的像素也可能因阴影、反射、遮挡或显露的背景发生变化。“只改一个对象”不能直接解释成“只允许改变原对象掩码中的像素”。验收应检查因果依赖及声明的不变量。

### 5.3 旧残差不能覆盖新语义

当前 world 编辑会保守地把所有 world.residuals 标记为 invalidated；尚未实现最小依赖失效集合。Gaussian 使用严格指纹与内容哈希来拒绝失效残差。

语义编辑后的处理必须是以下明确策略之一：

1. 删除或停用受影响的残差，展示重新执行的基础结果。
2. 在有效的新目标观测上重新拟合残差。
3. 若未来有经过验证的局部依赖图，只保留可证明依赖未变的部分。

禁止只改残差指纹来强迫旧残差通过，也禁止用旧像素补丁把苹果重新覆盖回已改成梨的几何。对相机、时间、曝光、渲染器版本或输出规范的改变，同样要检查依赖范围。

### 5.4 结构化生成与有限执行

接入 LLM 后，让模型产出受约束的 JSON/IR，再由已知执行器处理。不要把模型返回文本直接交给 eval、exec 或任意 shell。

为新增原语定义有限数据类型、尺寸/时长/粒子数/网格数预算、单位、种子、错误类型及能力标识。越过预算应报告具体原因，不能用静默裁剪制造“已实现”的错觉。

导入模型权重、外部资产或数据集时，记录来源、版本、许可证与所需环境；未下载或未运行的权重不能被写成已验证适配器。

## 6. 从 JSON 协议扩展新的物理域原语

一次新增能力至少完成下面七步。优先选择一个能端到端验收的垂直切片，不要只堆未来接口。

### 第一步：先写执行与编辑合同

明确输入、输出、单位、坐标系、前置条件、可编辑属性、精度范围和预算。例如新增刚体动作要说明几何与质量从何而来、初速度单位、接触如何处理、观察哪些时间点，以及结果是否满足确定性要求。

### 第二步：设计版本化节点

为原语分配明确 op，给参数定义类型与界限，并区分 authored、observed、inferred 的来源。当前 world 验证器只允许 fruit_lathe，因此必须同步修改验证器；在 planner 中添加一个名称不会自动得到新的可执行能力。

目标 IR 可以逐步形成以下对象，但当前未完整实现：

| 目标类型 | 应承载的信息 |
|---|---|
| Entity | 稳定 ID、层级、局部坐标系、来源 |
| Geometry | 网格、解析形状、SDF、体场或 splat 的有类型引用 |
| Material/Light | 表面与发光属性、作用域、单位 |
| Constraint | 接触、附着、关节、空间关系或目标观察约束 |
| Motion/Event | 时间、作用对象、状态转移、连续性要求 |
| AudioSource | 发声过程、频谱/包络、声源坐标及事件关联 |
| Observation | 相机/麦克风、时间、采样规范、输入哈希 |
| Residual | 所属观测、依赖指纹、有效范围、编码与误差 |

### 第三步：接到真实后端

新增执行节点必须产生相应的几何、数值场、动画或声音。保持稳定 ID 穿过编译与导出；若目标格式损失材质、约束或物理信息，导出报告必须列出损失。

先用显式 JSON 可控地执行，再开放自然语言规划。后端不支持的节点应拒绝执行，不能自动变成一个外观相似但合同不同的图片补丁。

### 第四步：定义编辑与依赖

编辑应返回修改后的资产及 dirty/invalidation 报告。把新原语加入依赖规则：例如质量变更影响动力学、轨迹、接触事件与声音；材质变更可能影响图像，也可能影响声学参数。

### 第五步：创建最小可解释示例

至少一个正例、一个参数变化例、一个不支持或不合法输入例。示例要小到可定位问题，同时确实经过新执行路径。

### 第六步：验收行为

验证输入输出合同、保存与重载、编辑保留项、失效缓存、物理单位和实际产物。对图形后端补真实渲染/导出检查；不能只测试 JSON 多了一个字段。

### 第七步：最后开放规划能力

在能力注册表、schema、规划提示与文档中登记新节点。只有这时 LLM 才可把该 op 用于用户请求。记录它解决的任务范围与仍然失败的情况。

## 7. 接入真实 LLM 与参考图重建适配器

### 7.1 LLM 规划适配器

保留现有 keyword_template_demo 作为可离线重现的基线。新适配器应具有显式标识，不得悄悄把旧函数的能力说明改成通用智能。

建议请求输入包括：

- 用户指令与目标合同；
- 当前资产、可编辑对象 ID 和已有约束；
- 执行器允许的原语与参数 schema；
- 参考观测的结构化描述和可用工具结果；
- 资源预算与必须保留的不变量。

建议输出包括：

- 完整 world 或有类型编辑请求；
- 采用的来源与假设；
- 无法执行的部分；
- 需要检查的后置条件。

推荐执行循环为：生成 → schema/语义校验 → 执行 → 检查观察结果 → 根据明确错误修复。修复次数与预算应有限；记录模型、提示版本、种子（若可控制）及每次候选的校验结果。

“JSON 合法”与“用户意图已满足”分别测试。苹果请求输出一棵树即使 schema 合法，仍然不通过意图验收。

### 7.2 Vision / Reconstruction 适配器

当前 reconstruct_reference 是刻意保留的能力缺口。新增适配器时先限定可验收子域，例如“已知是单个苹果或梨、简单背景、透视相机、有限视角变化”，再扩展到一般场景。

适配器输入至少要固定：

- 参考图或视频的哈希、尺寸、alpha/颜色处理规则；
- 相机已知项、时间戳、尺度信息与缺失项；
- 要拟合的对象、可使用的先验模型和允许的假设。

适配器输出建议为候选集合，而不是一个未经说明的唯一真相：

~~~text
ReconstructionResult
  observations: 已规范化观测及其采样规格
  candidates:
    - world: 可被当前或新增后端执行的资产
      correspondences: 参考区域/轨迹与 entity_id 的绑定
      camera_estimate: 相机参数与来源
      losses: 分项观察误差与测量条件
      assumptions: 遮挡、尺度、材质、光照等未确定因素
      provenance: 模型、权重、输入与运行版本
  unsupported: 仍未覆盖的目标
~~~

上面是目标接口草案，不是当前 Python 类或已有返回值。需在实际实现时版本化，并给无结果、部分结果、候选互相矛盾等情况定义错误行为。

参考图 → 语义场景绑定的最低验收是：对象 ID 真正关联参考区域；拟合世界能在估计相机下解释该区域；编辑对应 ID 会修改生成结构；相机移动后的结果来自同一资产。单图无法证明的背面结构仍需标明先验或程序化补全。

当前 pixel-encode 与 gaussian-fit 都是观测编码/拟合路径，不可直接作为这个适配器的成功实现。

## 8. 分阶段路线与每阶段交付条件

### 阶段 A：真实参考 → 可编辑场景绑定

**实现内容：** 为受限参考域增加观测对象、分割/对应关系、相机拟合、形状与材质参数拟合。可先用当前水果几何建立可控实验，再接外部重建模型。

**交付条件：** 同时展示参考图、基础场景重渲染、误差图、对象 ID 绑定、语义编辑前后及新视角；分别报告可见区域拟合和隐藏区域假设。若使用残差，再单独展示加残差结果与成本。

**未达条件时的表述：** “参考视角拟合”“受限参数反演”或“先验补全”，不能直接称任意照片精确世界重建。

### 阶段 B：多候选世界与可控路径

**实现内容：** 引入 hypothesis graph 保存互相竞争的世界解释；图节点携带候选资产、观察损失和假设，边标识替换解释或增加约束。没有校准证据时使用分数，不冒称概率。

另建 scenario/event graph 表达已选择世界中的动作与时间演化。不要把“可能是另一种几何”与“物体随时间变形”混成一类边。

连续视频应先选定一致世界或明确的状态转移，再对同一世界的相机、对象、光照及声音沿时间采样。固定拓扑内插值要声明位置、旋转及速度连续性；不同拓扑之间需要显式 morph、birth/death、遮挡切换或镜头切换规则。

**交付条件：** 分支选择可回放；新增观测能筛选或重估候选；同一分支的对象 ID 与时间轨迹稳定；拓扑变化点有明确记录。把多个不一致候选各渲染一帧后顺序拼接，不满足这一条件。

**当前技术债：** core.observe_camera 以 time_s/duration_s 计算相位；Blender 帧循环使用 i/(frame_count-1) 包含轨迹终点。扩展通用时间轴时应统一“帧呈现时间”和“轨迹采样时间”的约定，并对两条执行路径进行一致性验收。

### 阶段 C：真正的 3D Gaussian Splatting 与实体绑定

**实现内容：** 添加独立的 3DGS 后端/适配器。三维 splat 至少包含中心、空间尺度或协方差、旋转、不透明度、颜色或方向相关外观参数，并具有相机投影和可见性处理。

从校准多视角拟合，或使用明确披露的单图先验模型生成候选。记录每个实体与哪些 splats、坐标系、运动节点或约束相关。把 world→entity→splat groups 的绑定做到编辑可追踪。

**交付条件：** 留出视角评价、实体选择/移动或替换、背景与遮挡处理、稳定 ID、残差失效、资产保存重载。仅把二维高斯参数添加 z=0，不构成完成 3DGS。

**需要保持的界限：** 高斯渲染资产不自动提供封闭网格、碰撞体、表面法线或可重照明材质；若动作/物理需要这些量，必须增加可验证的代理或转换。

### 阶段 D：动作与声音共同生成

**实现内容：** 共用时间轴与事件 ID；几何运动、接触或用户动作驱动相应声音程序。先做可解释的刚体/振子子域，再考虑学习式声音生成。

**交付条件：** 视觉事件与发声时间对齐；改变事件速度、材料或位置会按合同改变声音；采样率与帧率重采样规则明确；重复执行与导出不丢失事件绑定。

**当前起点：** camera orbit 与 harmonic audio 已可执行，但没有建立动作到发声原因的关联。接视频背景音乐不是此阶段的替代品。

### 阶段 E：任务分布上的语言与库学习

**实现内容：** 从单模板基线扩展到子程序/子图挖掘、参数类型、组合库、规划器学习和候选评估。通过训练任务发现抽象，在留出任务上衡量压缩、规划成功率、编辑代价与执行成本。

候选目标可写为：

$$
\min_{\mathcal L,\phi}
\lambda_L L(\mathcal L)
+\mathbb E_{\tau\sim\mathcal D}\left[
\lambda_P L(p_{\phi,\mathcal L}(\tau)\mid\mathcal L)
+\lambda_R L(\rho_\tau)
+\lambda_D D_\tau
+\lambda_E C_{\mathrm{edit},\tau}
+\lambda_S C_{\mathrm{search},\tau}
+\lambda_X C_{\mathrm{execute},\tau}
+\lambda_F \mathbf 1\{\text{任务失败}\}
\right].
$$

其中任务分布 D 必须明确包含输入模态、目标观察与编辑序列；每个权重 lambda 非负，数值、量纲与归一化规则应写入实验配置。违反硬合同的候选应直接拒绝，不宜仅靠一个可被压缩收益抵消的失败罚分。

**交付条件：** 完整库、程序与残差计费；训练/验证/测试分离；报告不同权重下的权衡；避免按测试任务挑库；保留无宏基线、当前单模板基线和失败案例。

完备性不能唯一推出最优 AI 原生语言。短编码、可预测性、语义编辑、数值稳定与执行速度可能要求不同抽象。这里学习的是特定任务分布和预算下有证据支持的语言选择。

## 9. 持续验收与提交报告

### 9.1 每次改动的验收范围

先重跑现有合约测试，再针对真正新增或受影响的行为补检查。不要为每个赋值写镜像测试；应测试用户可观察合同及具体风险。

| 改动区域 | 必须覆盖的风险 |
|---|---|
| 像素编码 | 规范化规则、任意 RGBA 样本回环、异常游程、声明尺寸/预算 |
| Gaussian | 基础误差、求解器状态、RGB 精确回环、alpha 边界、指纹与内容校验、base-only |
| 语义编辑 | 对象定位、实际几何变化、保留项、其他对象、残差失效 |
| Blender/导出 | 实际静图、网格/身份、至少一个变化视角、GLB 能打开、材质降级说明 |
| 时间轴 | 帧数与时长、轨迹连续性、采样约定、跨后端一致性 |
| 音频 | 格式、样本数、峰值、非空信号、事件时间与新增声学合同 |
| 库学习 | 所有训练输入精确展开、类型区别、保留键行为、完整码长、无收益回退 |
| LLM/重建 | 结构合法性、意图正确性、能力边界、来源记录、实际执行及留出数据 |

对像素级合同使用样本精确比较；对路径追踪、近似物理或学习式模型使用预先声明的误差规则。不要因为跨硬件浮点差异而悄悄放弃本来承诺的数字精确合同：应修改合同版本或提供确定性执行方式。

当前合约测试不是完整的 Blender 集成测试。Python 单元测试全部通过后，仍需执行与你修改相关的真实渲染、导出或视频路径。

### 9.2 交付报告模板

每次交付至少说明：

1. **完成能力：** 用户现在能做什么，经过哪一条真实执行路径。
2. **改动范围：** 涉及哪些文件、协议版本、资产与依赖。
3. **实际执行：** 命令、退出码、环境版本、日志及输出位置。
4. **结果证据：** 合约测试、样本误差、编辑不变量、可视化/试听或 3D 查看结果。
5. **表示成本：** 基础程序、库、参数、残差分别占多少；测量的是哪种序列化。
6. **剩余边界：** 未运行项目、失败案例、只在受限域成立的保证。
7. **下一步：** 一个可验收的垂直切片及完成标准。

不能把“写好了脚本”写成“已执行成功”，不能把“输出存在”写成“语义正确”，不能把一张漂亮图写成“多视角重建已验证”。

## 10. 可直接复制给任意编程 LLM 的任务提示

以下提示可直接使用。使用者可在末尾添加本次具体目标；若没有指定目标，优先完成“阶段 A：受限真实参考到水果场景的绑定”，并先评估当前环境可用的输入与模型。

~~~text
你正在接手 CRF 可执行多模态表示项目。项目根目录含 crf/、tests/、
THEORY.md、LLM_HANDOFF.md；用户希望从自然语言或参考信号生成原生程序，
再得到可编辑图像、视频、3D 与声音。

先读 LLM_HANDOFF.md、README.md、THEORY.md 的合同与实现状态，
以及 core.py、cli.py、raster.py、gaussian.py、library.py、blender_backend.py、
audio.py、tests/test_contracts.py 和 scripts/run_demo.py。先运行现有 tests
和 python3 scripts/run_demo.py 基线，再修改代码。需要保留既有 outputs 时
使用独立工作副本；只有确认产物对应当前程序才用 --reuse-rendered。
记录真实命令、退出码与产物；缺少依赖时明确哪些检查未执行，不得编造结果。

保留三种独立合同：观测样本复刻、语义编辑、世界重建与预测。
当前已实现：关键词苹果/梨规划；真实 fruit_lathe 网格与材质；按稳定 ID
替换几何/材质；静图、相机轨迹、blend/GLB；canonical RGBA8 RLE；
固定二维 Gaussian basis + 有界 RGB 拟合 + 指纹残差；谐波 WAV；
完整规范化 UTF-8 编码变短才接受的单模板结构反统一。

当前没有：通用 LLM planner、任意参考图片到语义世界绑定、
真正 3DGS、假设图推断、接触驱动声音或最优语言发现。
先核对代码是否已变化，再据实更新这一状态。

不要把图片贴片当作完成 3D 重建。保留真实网格与可执行生成原因；
2D/2.5D 原语必须标注自身能力边界。苹果换梨须改实际几何和材质，
不能只改标签。语义编辑后，失效残差必须停用或重新拟合；
不能只改指纹让旧像素补丁通过。

LLM 只能通过受验证的 JSON/IR 选择已实现原语。
不要直接 eval/exec 模型文本。新增原语须同时完成：
输入/输出与单位合同、版本化 schema/validator、真实 backend、
稳定对象 ID、编辑与依赖失效、示例、合约及集成验收、能力文档。

参考重建适配器要记录观测规范、相机、对象对应关系、来源与隐藏区域假设。
单图多解时保留候选或明确先验；不要声称恢复了唯一真实世界。
3DGS 应作为独立后端，具有三维参数、相机投影与实体分组，
不得把现有二维 Gaussian 拟合重命名为 3DGS。

选择本次目标的一条端到端可验收路径，实际实现并完成相关测试/demo。
不要停在接口草图或泛化计划。若遇环境限制，完成可完成的部分，
清楚指出阻塞点与未验证边界，不隐瞒失败。

交付时报告：完成能力、改动文件、实际运行记录、证据与误差、
程序/库/残差成本、保持的不变量、剩余边界和下一阶段验收条件。
不要宣称未经测量的实时性能、通用能力、最优压缩或完美重建。

本次具体目标：
【在这里填写，例如：限定单个水果与简单背景，实现参考图区域到 entity_id
的绑定、相机/形状参数拟合，并展示苹果换梨与一个新视角。】
~~~

## 11. 研究依据与后续阅读

实现接口以本项目代码为准；数学合同与推导详见 THEORY.md。以下是一手研究资料，用于理解扩展方向，并不表示本项目已复现其系统：

- [3D Gaussian Splatting 原作者项目页](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)
- [3D Gaussian Splatting 官方代码](https://github.com/graphdeco-inria/gaussian-splatting)
- [DreamCoder 论文](https://people.csail.mit.edu/asolar/papers/EllisWNSMHCST21.pdf)

完成每个阶段后，更新“已实现能力”和“仍未实现”两份清单，并用实际验收替换原先的设计假设。交接的最终资产应包括可运行程序、明确合同、可复现实验和可继续编辑的内容。
