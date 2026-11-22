# CRF 0.7 工作台

主入口源文件为 `web/index.html`，公开接口为 `window.CRFEditor07` / `CRFWorkbench07`。开发服务以 `web/` 为静态根目录，构建后同一套资源位于 `dist/client/`，服务器位于 `dist/server/`。页面与接口 URL 保持不变，不增加 `/web` 前缀。

Source 与 Images 两个包均以 `CRF_Graphics_0_7` 为顶层目录；解压到同一位置，合并其中的 `web/` 与 `reports/` 即可。`dist/` 是生成目录，不在源码包内，也不是结果包的解压目标。

## 案例连续性

主案例列表直接包含 street、fruit_lab、orchard、alpine、common、stilllife、courtyard，以及0.7原生图像案例 citrus、ceramics、interior、rainstreet。初次进入默认打开红绿灯街景。

0.5案例共用其既有编辑器和既有逐案例缓存；0.6三例各自保持一个按需载入的编辑器实例，从而保留各自状态和撤销栈。旧编辑器直接嵌入当前工作台，全部原有对象、相机、视频、像素检查和导出控件仍可操作。主工作台的场景选择、模型对话、程序导出与像素读取通过公开接口调用这些运行时。

对话生成的新案例在当前场景列表中直接加入，并保存案例目录与语义程序；刷新后仍能重新载入。

浏览器草稿采用 `crf.workbench.0.7.*` 前缀保存；重要作品应另行导出 JSON。草稿空间不足会提示，不承诺浏览器存储具有远端数据库的持久保证。

## 真实模型调用

`GET /api/crf/status` 返回服务端配置或核验状态。配置存在不会自动显示“调用成功”；只有服务端明确核验状态或真实生成请求成功后才显示成功。

`POST /api/crf/generate` 请求：

```json
{
  "prompt": "用户意图",
  "history": [{"role":"user","content":"此前对话"}],
  "mode": "generate",
  "engine": "legacy05",
  "currentScene": {},
  "search": true
}
```

mode支持 `generate`、`edit`、`critique`。当前场景会移除像素、base64颜色系数等密集字段，保留语义结构，并为被省略系数的字段设置 `coefficientsOmitted:true`。画面检查和“检查并改进”额外发送实际画布的 JPEG 与 originalPrompt；没有用替代图冒充当前画布。

响应：`{ok,message,engine,model,program?,operations?,research,usage,runId,qualityNotes,warnings}`。

原生图像的 program 或 operations 经相应引擎校验后，先在独立像素缓冲区完整渲染；空白、单色、没有可见对象或渲染中断的候选不替换当前图。完成后才提交到作品与撤销栈。旧案例操作由原有运行时验证，异常时恢复原状态。没有 `eval` 或模型JavaScript直接执行。新生成返回原生图像程序。旧案例编辑通过其原有原子操作接口执行。

生成默认可关闭的一轮画面反馈：初稿渲染完成后，提交真实 JPEG 与初稿程序，以 edit 模式返回候选，再次完整渲染。第二轮不自动再次搜索。反馈失败或停止时保留初稿；对照标签为“初稿 / 反馈后”，没有把响应成功标为质量更高。

搜索结果、来源 URL 和工具调用记录来自实际响应。参考区分别展示网页条目数量、取得的参考照片、实际提交视觉模型的照片数量，并保留失败获取记录在执行证据中。缩略图只使用服务端返回的实际 imageUrl 等字段；没有图像 URL 时显示来源链接与提交状态。模型的质量说明是模型意见，不标为独立照片写实成绩。密钥没有前端输入、源码常量或本地存储项。

## 本地渲染

原生图像模块通过 `CRFPhoto07` / `CRFRadiance07` 执行。预览采用较低尺寸与采样；精细输出尺寸与采样由界面选择。默认预览为 320 像素宽、2 次采样；模型候选为 640 像素宽、16 次采样。默认开启可关闭的对象/深度感知降噪，并在结果处标注“降噪显示”；导出的 JSON 记录实际 renderSettings。渐进式渲染显示真实进度，停止按钮通过AbortSignal取消本地任务或停止网络等待。

“前后对照”保存修改前实际RGBA与当前画面。相同尺寸时计算RGB MAE和改变像素比例，这些数值明确标为差异而非质量评分。

## 公共接口

- ready、getCases、getCurrentCase、selectCase
- getProgram、getContext、setProgram、applyOps
- render、getPixels、undo
- exportPNG、exportJSON、importProgram
- requestGeneration、improveCurrent、refreshStatus、getMessages、getResearch、getStatus、cancel

`exportJSON()`的外层schema是 `crf.workbench_scene.v0.7`，内含engine、caseId和对应引擎的原始program。密集观测字段随用户作品导出；仅模型上下文会省略这些字段。

## 验收记录范围

编辑器 HTML/脚本依赖与 DOM 引用已经静态检查，JavaScript 通过 Node 语法检查。真实浏览器的加载、交互与服务端调用由整体验收记录报告；本说明不预填浏览器通过结果。

生成脚本与参数验证、空白候选拒绝、撤销与像素对照是工程可用性措施；它们不能证明任意自然语言描述都能自动获得照片级图像，也不是跨场景质量分数。

## 点击运行的浏览器验收

打开 `verify-v07.html`，点击“运行全部检查”。它通过实际 `CRFEditor07` 接口载入全部11个案例、读取实际 RGBA、施加修改、切换场景、撤销、取消渲染并执行 JSON 往返。结果实时写入 DOM `#testReport` 与 `window.CRF07_QA_REPORT`。没有预填通过状态，不调用模型，也没有模型模拟响应。验收实例用独立 `crf.workbench.0.7.qa.*` 草稿前缀。

## 实际模型样例

“模型实测对比”读取网页地址 `assets/v07/experiments.json`，其源文件位于 `web/assets/v07/experiments.json`；实际图片在 `web/media/v07/`，生成程序在 `web/assets/v07/generated/`。逐组并列展示 `initial` 与 `refined` 的实际渲染图与原始提示词、模型、搜索/视觉提交记录。没有结果的轮次明确显示未提供，不以预设案例填补。对应 program 链接经 JSON 导入和相应引擎校验后可继续编辑。样例页不预设反馈后一定更好。
