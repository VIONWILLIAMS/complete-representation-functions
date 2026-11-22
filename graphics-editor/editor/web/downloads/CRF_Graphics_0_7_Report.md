# CRF 图形计算编辑器 0.7 · 真实调用与交付报告

> 下载版链接说明：本文件的资源链接指向已发布站点。标注“源码包内”的链接下载 [完整源码包](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)，解压后在 `CRF_Graphics_0_7/` 下按所列路径查找；离线阅读请使用包内 `docs/v07/REPORT.md`。


## 交付结论

0.7接通了可实际运行的链路：**自然语言 → DeepSeek真实搜索 → 公开参考图像 → 模型编写场景函数 → 代码渲染图片 → 把实际画面回传模型修正。** 本轮保存了四组模型实测，覆盖橙子静物、陶瓷与玻璃静物、自然采光客厅、雨夜街角，保留初稿、后续候选、程序、请求记录和渲染证据。红绿灯Street及此前案例没有删减。

**用户要求的扩散模型 / Fable 5.2级照片品质，本版尚未达到。** 实际图像仍有简化形状、光照不稳、几何连接、材质与采样噪点问题，也没有进行与外部模型同题、同尺寸、同预算的公平对比。本次可以确认的是真实模型驱动的程序生成与编辑闭环，不能把链路接通或程序验证通过写成照片品质目标已经完成。

另有两项概念边界必须保留：当前工作台包含不同执行器，**并非所有场景都已统一到一个高斯后端**；旧Street的100%成绩是已存储观测像素在原视角的严格回放，不能迁移为新生成图片的写实成绩。参考图进入模型上下文后用于函数合成，本轮没有训练或更新DeepSeek的模型权重。[共同路径技术说明](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Technical_Notes.md)

## 1. 本次新增了什么，保留了什么

| 项目 | 本版实际行为 |
|---|---|
| 图形计算工作台 | 同一入口选择旧案例与新场景，操作对象、材质、镜头、程序导入导出、撤销及前后对照。 |
| DeepSeek对话 | 服务端实际调用 `deepseek-flash`；运行时凭据不写入前端源码、场景JSON或本报告。 |
| 参考研究 | 使用官方Web Tools；未观察到原生搜索时，明确调用独立搜索接口，保存实际工具与来源记录。 |
| 参考图像 | 从公开来源取得图像字节并记录来源、哈希、容器与尺寸检查；不可访问来源如实记录，不把网页摘要算成已看过图片。 |
| 新图程序 | 模型返回完整 `crf.image_program.v0.7`，包含几何、材质表达式、变换、面积光、环境和相机，不局限于选择预设ID。 |
| 实际画面反馈 | 将刚渲染的图像和场景程序回传模型，重新验证、渲染候选，并保留前后结果。 |
| 旧案例连续性 | Street、程序苹果/梨子、果园、山湖、观测与原生共同场景、静物、庭院均仍可操作；旧视频与像素工具继续由对应编辑器提供。 |

固定案例列表共11项：`street`、`fruit_lab`、`orchard`、`alpine`、`common`、`stilllife`、`courtyard`、`citrus`、`ceramics`、`interior`、`rainstreet`。其中前7项继承既有版本，后4项是人为编排的原生展示场景。四组真实模型实验另行保存与展示，不能用展示预设的画面替代真实模型输出。[工作台说明](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Editor.md)、[实际浏览器案例清单](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/crf_0_7_browser_acceptance.json)

## 2. 人工展示与模型实测分开列示

| 类型 | 来源 | 文件与用途 |
|---|---|---|
| 原生能力展示（showcase） | 开发时手工编排、调试的代码场景，由CRF执行器渲染。 | `web/media/v07/*_showcase.png`及相应程序、哈希，展示渲染器能执行的材料和场景。 |
| 真实模型初稿 | 实际DeepSeek返回的完整JSON；其中两个候选经表示能力扩展后原样恢复。 | `web/assets/v07/generated/*_initial.crf.json`、`reports/v07/api_*_initial.json`。 |
| 真实模型反馈候选 | 在实际图像回传后，模型重新返回的程序。 | `*_refined*.crf.json`、`api_*_refined*.json`及实际PNG。 |

模型对比索引位于 [experiments.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/crf_0_7_experiments.json)，四组总览为 [model_comparison.png](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/model_comparison.png)。逐轮执行记录使用 `web/media/v07/{id}_execution.json`。网页中的“模型实测对比”读取这些实际材料，不以人工预设填补失败或未完成的轮次。

## 3. 四组真实生成实验

### 3.1 初稿、搜索和视觉输入

以下数量来自对应请求记录，表示这一轮保存的来源和图像输入，不是训练数据集规模。

| 场景 | 目标与初稿结构 | 可核验搜索 | 记录来源数 | 提交参考图像 | 初稿取得方式 |
|---|---|---|---:|---:|---|
| `citrus` 橙子静物 | 三枚橙子、绿叶、白釉浅盘与木桌；初稿11个对象、6个表达式材质。 | 原生搜索，6条查询。 | 12 | 3 | 同一真实模型候选经AST扩展后本地重新校验，未新增HTTP调用。 |
| `ceramics` 陶瓷静物 | 石台、孔雀青花器、烟色玻璃球、黄铜球与书；初稿23个对象、5个表达式材质。 | 两组原生搜索，共14条查询。 | 21 | 4 | 同一真实模型修正候选经AST扩展后本地重新校验，未新增HTTP调用。 |
| `interior` 客厅 | 沙发、靠垫、木茶几、杯书、地毯、窗与绿植；初稿35个对象、5个表达式材质。 | 两组原生搜索，共14条查询。 | 24 | 3 | 实际HTTP 200，接口全过程约59.4秒。 |
| `rainstreet` 雨夜街角 | 湿沥青、斑马线、信号杆/横臂/灯面、建筑与店铺；初稿26个对象、6个表达式材质。 | 未观察到原生搜索；两次明确的独立搜索，其中一次为零图像后的照片来源补充。 | 15 | 6 | 实际HTTP 200，接口全过程约39.4秒。 |

原始记录：[橙子初稿](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_citrus_initial.json`）、[陶瓷初稿](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_ceramics_initial.json`）、[客厅初稿](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_interior_initial.json`）、[雨街初稿](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_rainstreet_initial.json`）。

这些参考并非每组几十张照片，也不全是完整场景照片；例如室内记录含织物近景参考。图像数量表示实际提交的视觉内容，不保证模型提取了期望的所有特征。模型个别自述与实际接口能力、请求内容存在不一致，本报告以代码、实际请求和渲染结果为依据，不把模型的质量说明当作独立验收。

### 3.2 两份初稿怎样恢复

真实候选中出现了3–5项的加法或乘法材质表达式。初始协议仅接受二元 `add` / `mul`，因此拒绝了有明确数学语义的候选。本次扩展服务与执行器，使这两个运算接受2–8个操作数，按左到右顺序求值，仍保留每个材质96节点与12层深度预算。

随后使用 [recover_candidates07.mjs](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/recover_candidates07.mjs`） 重新校验保存的候选，并检查程序序列化前后完全不变：

| 场景 | 原始候选请求ID | 原始响应阶段 | 恢复记录 |
|---|---|---|---|
| `citrus` | `b4c314c0-a4fb-4178-a973-65e42d788ca6` | `compose` | `unchangedProgram:true`、`paidCallsThisStep:0`、`httpStatus:null`。 |
| `ceramics` | `ab62be28-2727-4374-a793-ba82f6ef0fcd` | `schema_repair` | `unchangedProgram:true`、`paidCallsThisStep:0`、`httpStatus:null`。 |

这属于根据真实失败改进表示语言后，恢复已经取得的模型输出。**它不是一次新的HTTP成功，也不是把人工场景伪装成模型输出。** 原来的失败尝试保存在 `attempt*_api_*_initial.json`，原始候选保存在 `diagnostic_*`；恢复记录引用此前已计费用量，不能再次计费或当作零成本生成。

### 3.3 四组首轮反馈都发送了真实画面

四组均在初稿实际渲染后，将图像和当前程序回传，首轮反馈请求均返回HTTP 200，且记录 `inputImageProvided:true` 与 `vision.renderedImageProvided:true`。这四次反馈没有重新提交网络参考图像，也没有重新搜索；它们查看的是当前实际候选图。

| 场景 | 首轮反馈耗时 | 供应商总token | 反馈请求ID | 对应实际记录 |
|---|---:|---:|---|---|
| 橙子 | 15.1秒 | 7,318 | `efaca106-8205-4ed3-b92d-f36b29c1e4d9` | [citrus_refined](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_citrus_refined.json`） |
| 陶瓷 | 16.1秒 | 9,259 | `daadf13e-b7c7-4879-993c-e1356af88cd4` | [ceramics_refined](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_ceramics_refined.json`） |
| 客厅 | 22.0秒 | 11,907 | `fae6ef65-f75c-4b1d-8c0f-028843c6bd4e` | [interior_refined](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_interior_refined.json`） |
| 雨街 | 23.2秒 | 11,809 | `d3ac1385-0d13-473d-b5be-4bde51bfe1da` | [rainstreet_refined](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_rainstreet_refined.json`） |

token来自供应商响应；接口耗时和本地渲染耗时分别记录。没有把这些数值换算成价格，也没有把不同轮次的累计费用混合成一个未经核验的总账。

### 3.4 实际画面观察与最终选择

**橙子。** 初稿过亮，浅盘结构偏厚且分层明显；首轮反馈后橙色和盘面层次改变，但整体变暗，三枚目标中只有两枚主要果体清晰可辨，绿叶仍像简化片状原语。细小噪点不能直接解释成真实果皮毛孔。首轮可以证明程序和实际像素发生了修改，不能据此宣告主体数量、形态与写实目标已通过。

**陶瓷。** 初稿大面积过曝，可见灯板遮挡了部分构图，花器与石台关系不合理。首轮改善了墙/台/物品的可辨识度，整体照明却偏暗，左上仍有入镜光板，透明物附近和台面有明显高亮采样点。花器、书、玻璃和黄铜都由程序表示，但材料的照片真实度仍不足。

**客厅。** 初稿出现墙底缺口、桌腿悬空和过亮灯板。首轮修正后，墙体闭合和茶几接触明显改善，但画面上方仍露出光源。第二轮返回了合法程序与HTTP 200，实际渲染却明显欠曝，反射/透射区域高亮点增多；这轮保留为反馈会变差的证据，不作为最终改进结果。

客厅最终对比选择第三轮 `interior_refined3`：第三轮真实回传了当前图像，HTTP 200，约22.2秒、12,128总token。实际渲染中天花灯板去掉，采光相对第二轮明显改善，盆栽进入画面；窗前及原玻璃附近仍有不自然几何与高亮边，噪点和平面化材质尚在。[第三轮API](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_interior_refined3.json`）、[第三轮程序](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/assets/v07/generated/interior_refined3.crf.json)、[第二轮退步记录](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_interior_refined2.json`）

**雨夜街角。** 初稿建筑和信号灯结构悬浮，灯板露在画面中，预期斑马线基本不可见。首轮反馈后，斑马线进入前景，竖杆和建筑更接近地面，信号灯和店铺位置更合理。但画面仍偏暗，建筑与发光表面近似方块，行人标志细节和真实城市材质不足。该案例显示结构修正的实际效果，不是原始Street照片的三维复刻。

橙子追加第二轮的第一次尝试还出现了真实接口失败：一次自动JSON修正后仍无法解析，应用返回HTTP 502，错误为 `INVALID_MODEL_JSON`；两次模型响应合计18,273token，实际图像已提交，未生成或提交新的可用程序。该失败保存在 [attempt1_api_citrus_refined2.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/attempt1_api_citrus_refined2.json`）。随后另行明确发起的实测属于新的开发测试请求，不能描述成自动修复器无限重试，也不能抹掉前一次已发生的用量。

随后橙子与陶瓷均完成第二轮有效反馈请求：橙子请求 `41fd7503-1959-4ed4-87cf-9a43cc4a1261`，约16.2秒、7,711token；陶瓷请求 `a12d3f62-8dfd-4363-9bd2-a87e72570ef8`，约19.2秒、9,260token。两者均HTTP 200、实际画面回传为true，不需要自动协议修正。[橙子第二轮](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_citrus_refined2.json`）、[陶瓷第二轮](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/api_ceramics_refined2.json`）

橙子与陶瓷最终均选择第二轮 `refined2`。橙子三枚果体现在清晰入镜，浅盘与构图更完整；果体仍偏规则，叶片简化，暗部噪点和材质层次还有限。陶瓷场景移除了大块入镜玻璃/光板干扰，花器、玻璃球、黄铜球和书完整可辨；玻璃反射/透射的明暗分界较硬，形状与表面依然简化。两组都保留初稿、首轮和第二轮，选择结果来自实际看图，而不是“后一个版本必然更好”的假设。

最终展示对照如下：

| 场景 | 初稿图片 | 最终选用候选 | 对应程序 | 全部轮次记录 |
|---|---|---|---|---|
| 橙子 | [initial](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/citrus_initial.png) | [refined2](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/citrus_refined2.png) | [citrus_refined2.crf.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/assets/v07/generated/citrus_refined2.crf.json) | [citrus_execution.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/citrus_execution.json) |
| 陶瓷 | [initial](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/ceramics_initial.png) | [refined2](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/ceramics_refined2.png) | [ceramics_refined2.crf.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/assets/v07/generated/ceramics_refined2.crf.json) | [ceramics_execution.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/ceramics_execution.json) |
| 客厅 | [initial](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/interior_initial.png) | [refined3](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/interior_refined3.png) | [interior_refined3.crf.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/assets/v07/generated/interior_refined3.crf.json) | [interior_execution.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/interior_execution.json) |
| 雨街 | [initial](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/rainstreet_initial.png) | [refined](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/rainstreet_refined.png) | [rainstreet_refined.crf.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/assets/v07/generated/rainstreet_refined.crf.json) | [rainstreet_execution.json](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/rainstreet_execution.json) |

### 3.5 从物体存在检查推进到几何可见性检查

橙子案例暴露了一个具体问题：JSON中有三枚橙子，并不代表图中能看见三枚。新增诊断对实际候选生成相机光线，读取首次几何交点的对象ID，再与同一候选中只保留目标对象时的投影范围比较；原程序不被修改或替换。

在160×120、每像素1次采样、1次弹射、未降噪的诊断下，第三枚 `orange_small` 的首交点覆盖比为：

| 候选 | 完整场景中命中目标的像素 | 孤立目标投影像素 | 覆盖比 |
|---|---:|---:|---:|
| 首轮 `refined` | 8 | 443 | 1.8059% |
| 第二轮 `refined2` | 575 | 575 | 100% |

这与实际图中第三枚橙子从几乎被遮挡到清晰出现相符。两轮镜头与物品位置发生变化，所以各自的投影分母不同。**这里的100%仅表示该低分辨率采样下的目标几何首表面覆盖，不是照片品质得分、原照片像素复刻率或高分辨率精确分割。** 透明物仍会获得首交点ID，也不能把该指标直接当作透射之后的语义可见性。

陶瓷第二轮将 `window_glass` 明确设置为隐藏，完整场景中的该对象首交点像素降为0。诊断保留对象记录和索引，以免“只保留目标”的检查本身改动材质种子或输入程序。证据见 [首轮对象诊断](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/object_visibility_diagnostic.json`）、[第二轮对象诊断](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/object_visibility_diagnostic_refined2.json`）、[检查脚本](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/inspect_visibility07.cjs`）。

## 4. 渲染证据与性能范围

上述模型初稿与已完成反馈图使用同一执行器版本，尺寸 **640×480**、每像素 **24次采样**、最多 **5次弹射**，开启有界的对象/深度感知空间降噪。每帧统计7,372,800次主采样。降噪是明确的生成设置，不能把滤波后的平滑当成新增几何细节。

对应渲染器SHA-256：

```text
a7f5ce68c1bc7178ee94f1a936a6fc9efbe9c54986616df87a0d614bd5bb633a
```

| 场景 | 初稿本地渲染 | 首轮反馈本地渲染 | 初稿 → 首轮参与渲染对象数 |
|---|---:|---:|---:|
| 橙子 | 43.9秒 | 59.1秒 | 11 → 12 |
| 陶瓷 | 44.6秒 | 86.6秒 | 23 → 20 |
| 客厅 | 82.1秒 | 124.1秒 | 35 → 38 |
| 雨街 | 50.4秒 | 68.3秒 | 26 → 32 |

这些是本次工作环境的实际耗时，不是专门性能基准，也不代表实时帧率。工作台用较小尺寸和较少采样预览，精细输出需等待CPU计算。`stats.objects` 统计启用并参与渲染的对象，包含可能完全被遮挡的对象，不是图像中肉眼可见的物体数量，也不是质量分数。

客厅额外第二轮本地渲染约104.8秒，但视觉结果变差；最终选择的第三轮约97.5秒，包含37个参与渲染对象与2个面积光。两轮均保留实际图和sidecar，不能根据HTTP成功或对象数量选择所谓“更好”结果。

橙子与陶瓷最终第二轮分别渲染约77.6秒和66.3秒，参与渲染对象为9个和17个；隐藏的对象记录可以继续存在于程序中，所以这些数量不等于JSON数组长度。最终图同样使用640×480、24次采样、5次弹射和明确的降噪设置。

每张PNG都有同名JSON sidecar，记录PNG哈希、程序哈希、渲染器哈希、尺寸、采样与运行统计。例如 [橙子初稿渲染证据](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/citrus_initial.json)、[陶瓷首轮证据](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/ceramics_refined.json)、[客厅首轮证据](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/interior_refined.json)、[雨街首轮证据](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/media/v07/rainstreet_refined.json)。

统计记录 `sourceImageBlit:false`、`imageTextureReads:0`：这些0.7新场景的执行器没有读取参考照片作为画布或材质贴图。几何交点、照明、反射、折射和表面表达式由代码求值。统计同时声明有限弹射、辐射截断、粗糙玻璃近似、不含体积或光谱传输、空间降噪可能弱化细节等限制；不能将其称为已经全面验证的物理渲染真值。

## 5. 工程验证

| 检查范围 | 实际结果 | 证据与范围 |
|---|---:|---|
| 旧版核心、边缘、程序水果、0.6对象/拟合/集成 | 52/52通过 | [本轮旧版回归输出](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/legacy_test_run.txt`），保留协议与观测路径。 |
| 0.7执行器 | 13项断言通过 | [执行器测试](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`tests/test_radiance07.cjs`），含多项表达式、确定性与运行边界。 |
| DeepSeek Provider | 24/24通过 | [Provider测试](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`tests/test_deepseek07.mjs`），含搜索证据、参考输入、JSON/协议修正、安全错误输出与重定向拒绝。 |
| Worker与图像采集 | 9/9通过 | [集成回归](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`tests/test_worker_references07.mjs`），含静态绑定、实际流式大小限制、取消与截断图像拒绝。 |
| 实际浏览器交互 | 19/19通过 | [浏览器验收](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/crf_0_7_browser_acceptance.json)，实际载入11例、读像素、编辑、撤销、取消与JSON往返。 |
| 旧案例独立浏览器验收 | 10/10通过 | [本轮重新运行记录](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/crf_0_7_legacy_browser_acceptance.json`），修正旧验收页入口后重新核验参考PNG、画布、编辑与撤销。 |

[0.7测试运行记录](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/crf_0_7_unit_test_run.txt) 的Node汇总将执行器测试文件计为一个子测试，因此显示34个顶层测试单元；不能再把这个34与13项内部断言相加当成额外测试。这里按实际模块分别列出。

浏览器19项检查没有调用远端模型，也没有伪造模型响应。真实API测试由上一节的独立请求日志证明。两类证据共同说明接口可用性，但它们都不能替代最终图片的视觉质量验收。

最终还通过实际界面打开四组模型对比，确认八张640×480图片成功载入；打开橙子第二轮程序后导出PNG与JSON。下载的JSON与保存的真实模型候选逐字段完全相同，PNG为完整320×240交互预览。[实际导出检查](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/browser_export_validation.json`）

浏览器检查实际验证了：Street换色后切换案例再回来保持编辑；0.6对象编辑缓存保留；模型上下文移除密集系数但保留对象结构；0.7编辑改变真实像素，撤销恢复RGB完全相同；非法完整程序和混合操作原子拒绝；取消渲染保留上一完整结果；JSON导出导入后程序与像素一致。

## 6. 本版仍然存在的实质限制

### 加载修复补记（2026-11-21）

根据“0.7 一直加载不出来”的反馈，修正父编辑器在隐藏 iframe 时等待子编辑器动画帧初始化的互等风险。初始化窗口现在保留正常布局，由加载层覆盖；失败后持续显示具体页面、阶段和重试按钮。原 25 秒超时改为 60 秒，以容纳 Street 观测数据下载。6 项定向加载回归通过，实际浏览器中重新加载 Street、切到 0.6 共同场景、再返回 Street 均成功。没有在用户设备上复现原故障，不能据此认定是用户端唯一原因。[定向检查](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`reports/v07/startup_fix_test_run.txt`）

### 6.1 生成质量与搜索学习

当前输出有明显程序化观感。四种几何原语与有限表面函数适合基础物品和结构组合，复杂叶片、织物褶皱、自然破损、真实建筑细节、透明材料与光学效果仍不足。参考搜索增加了输入证据，但不保证比例、接触和材质自动正确；当前没有跨类别训练好的图像到完整场景反演器，也没有独立的照片质量评分器保证每轮变好。

每类只保留本次有限实测轮次，没有建立跨提示词、跨随机状态的质量统计，也没有测得同一需求反复生成的稳定成功率。因此不能把这四组示例扩大为“任意描述都能持续生成高质量照片”的结论。

### 6.2 纹理种子仍与对象数组顺序耦合

当前执行器构建内置材质时使用：

```js
seed: program.seed + index * 127
```

内置纹理与部分凹凸噪声会读取这个对象种子。因此，删除数组靠前的对象或重新排列对象数组，可能改变后续对象的纹理相位，即便那些对象的稳定ID和显式材质参数没有改动。材质AST中显式声明的种子与此有所不同，但还不能据此保证所有表面随机性都绑定到稳定ID。[执行器源码](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/crf-radiance07.js)

这是当前精确局部编辑的限制，不能用“模型成功返回”掩盖。阴影和反射随物体删除而变化属于光学结果；其他物体的随机纹理相位变化属于种子设计问题。后续应让材质随机性绑定到稳定对象ID或独立持久种子，并用实际像素回归验证。

### 6.3 共同路径尚未等于统一高斯渲染

旧Street等观测场景继续使用密集高斯回放；0.6共同场景使用曲面采样后的高斯累加；0.7新图采用CPU光线求值。工作台统一了入口、对象操作和证据组织，尚未将所有观测字段与原生物理材质编译到同一个执行器。

Street原视角100%说明密集RGB系数准确回放。单图未显示的背面、真实光照与材质分解仍有歧义，不能据此宣称恢复了完整真实世界。新图片的程序重放确定性也不等于照片真实度。0.7没有新增四组模型视频的验收成绩；既有视频功能与历史成品保留。

### 6.4 当前反馈不是无界自主RSI

本版确实根据真实失败修正了程序输出、表达式协议和采集管线，也支持实际图像回传。但自动JSON/协议修正有明确次数上限，默认画面反馈也是有限一轮；本次额外轮次由开发检查后明确触发。表示扩展与源码修复有可追踪的工程改动，不是模型在无人监督下任意改写运行系统。客厅第二轮恶化说明不能假设递归次数越多质量越高。

## 7. 可复现入口

完整运行说明见 [RUN_LOCAL.md](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Run_Local.md)。已有案例和程序渲染不需要模型调用；重新发起自然语言生成需由运行环境提供服务端凭据。本报告及分发源码不包含真实密钥。

从源码根目录可以直接渲染本次模型程序，例如：

```bash
node scripts/run_program07.cjs \
  --program web/assets/v07/generated/interior_refined3.crf.json \
  --output out/interior_refined3.png \
  --width 640 --height 480 --samples 24 --bounces 5
```

该CLI默认启用降噪，并写出 `out/interior_refined3.render.json`，包含PNG/RGBA/程序哈希和实际渲染设置；`--raw`可明确导出未降噪结果。不同设置应分开比较，不把采样或后处理变化隐藏在同一个指标里。[CLI源码](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/run_program07.cjs`）

核心复现材料：

- [图像程序格式](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Radiance_Schema.md)：模型可编写的几何、材质、表达式和预算。
- [DeepSeek接口说明](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_DeepSeek_API.md)：请求、实际搜索证据、参考图、修正与错误结构。
- [共同路径技术说明](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Technical_Notes.md)：观测、生成与像素验收的关系。
- [四组模型实验索引](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/crf_0_7_experiments.json)：每组初稿、最终选择和逐轮文件。
- [真实API与渲染脚本](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/probe_scenes07.mjs`）、[本地恢复脚本](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/recover_candidates07.mjs`）、[批量渲染脚本](https://crf-street-04-lab-4d86.laterafter950.chatgpt.site/downloads/CRF_Graphics_0_7_Source.zip)（源码包内：`scripts/render_v07.cjs`）。

DeepSeek能力的外部依据为官方[模型列表](https://api-docs.deepseek.com/api/list-models/)、[Web Tools](https://api-docs.deepseek.com/guides/web_tools/)、[Search API](https://api-docs.deepseek.com/guides/search/)、[视觉输入](https://api-docs.deepseek.com/guides/vision/)和[JSON模式](https://api-docs.deepseek.com/guides/json_mode/)。这些文档证明接口支持的调用方式，不能替代CRF自己应完成的画面质量验证。

## 8. 发布目录整理

发布检查发现，原目录同时保存静态源文件和构建后的静态副本，使部署归档约329MiB，超过256MiB限制。现将编辑器、程序模块、场景、图像和下载文件的源文件统一放入 `web/`；`dist/` 仅用于生成 `dist/client/`、`dist/server/` 及构建配置，避免同一套媒体重复进入部署归档。

这次调整只改变源码与构建目录的组织，不改变图形算法、已生成场景程序或实际图片内容；报告中的渲染器算法SHA-256保持不变。站点内 `/assets/`、`/media/`、`/downloads/` 和模型接口URL保持原样，不增加 `/web` 前缀。历史执行记录中的原始文件路径作为当时证据保留，当前源码与复现命令使用本报告更新后的 `web/` 路径。
