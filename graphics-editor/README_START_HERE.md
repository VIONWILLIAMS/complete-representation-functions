> **历史说明：**本文记录原 1.0 恢复包及当时的 1.1 交接。当前整体任务从 [CODEX_START_HERE.md](CODEX_START_HERE.md) 开始；对象函数实验与 GPU96 开发请使用 `crf-gpu96-development` 分支。文中的“下一阶段”、版本和验证数字均属于当时记录。

# CRF 1.0 完整工程与 1.1 开发交接包

> 实验开发分支第二轮交付请从 [真实场景质量工作台](https://github.com/VIONWILLIAMS/complete-representation-functions/blob/55103cc7399cef3bb5eb7d9e7875f3785dedd9cd/graphics-editor/README_QUALITY.md) 开始：`cd editor && npm ci && npm run dev:quality`，访问 `/quality12.html`。以下是保留的 1.0 恢复包启动说明。

日期：2026-11-22，北京时间。

这是可以在本地启动、检查和继续开发的完整源码工程包。应用基线为产品 **1.0**，源码保留历史标识 **0.10.0 / v10**；**1.1 是下一阶段开发计划**。原代码、原始计划与历史报告保持原样。

## 1. 下载后怎样打开

先完整解压 ZIP。交付启动器采用 **Node.js 22 或以上**（本轮实测 24.22.3）；原工程 engines 保留 >=20 声明，但早期 20.x 存在 JSON import 语法兼容差异。可在终端运行 `node --version` 检查。仅打开现有编辑器和案例不需要 Python，也不需要模型 API 密钥。

### macOS

在解压目录中打开 `Start_CRF.command`。它会启动本机服务并尝试在默认浏览器打开：

<http://127.0.0.1:4173/>

保持启动终端窗口运行；在窗口中按 Control+C 停止服务。如果系统没有执行该文件，可以在终端输入 `bash `（末尾留一个空格），将 `Start_CRF.command` 拖入终端，再按回车。启动器会检查 Node.js 是否存在，并给出明确错误。

也可以进入解压后的根目录，执行：

```bash
node tools/start.mjs
```

如果 4173 已被占用，可改为：

```bash
node tools/start.mjs --port 4174
```

### Windows / Linux

Windows 可运行 `Start_CRF.cmd`；Linux 或其他终端环境执行 `node tools/start.mjs`。本轮实测环境为 Linux，macOS/Windows 启动脚本未在对应实体设备上实测。

应用通过本机 HTTP 服务读取工程和资源。请使用上面的地址打开，而不要直接双击 `editor/web/index.html`。主入口也可明确访问 `/studio10.html`；URL 中不包含 `/web/`。

## 2. 开发环境

从解压目录执行：

```bash
cd editor
npm ci
npm run dev
```

`npm ci` 按 `package-lock.json` 安装开发依赖：esbuild 0.28.2、pngjs 7.0.0。现有案例的本地浏览启动器不要求先运行构建。运行单元测试、图片脚本和构建时，请安装这些依赖。

Python 高斯拟合和对应测试需要 Python 3、NumPy、Pillow、SciPy，以及 g++ 或 clang++。可以在 `editor/` 中建立独立环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

Windows 的虚拟环境激活命令为 `.venv\Scripts\activate`。上述安装命令需要可访问相应软件包源。

## 3. 模型调用

已有案例、当前本地参数编辑与像素计算不需要模型凭据。新的模型生成任务需要服务端进程环境中的 `DEEPSEEK_API_KEY`。工程没有自动加载 `.env` 的逻辑；仅创建 `.env` 文件不会生效。

在 macOS/Linux 的 Bash 终端中，可以隐蔽输入密钥后启动：

```bash
bash
read -r -s -p 'DeepSeek API key: ' DEEPSEEK_API_KEY
printf '\n'
export DEEPSEEK_API_KEY
node tools/start.mjs
```

这里假定仍位于解压根目录。密钥由本机服务端持有，不应写进浏览器代码、场景文件或提交记录。

当前适配器代码使用 `deepseek-flash` 和 `https://api.deepseek.com`；这是恢复源码的配置，并非本次已验证的供应商可用性。`DEEPSEEK_MODEL` 虽然出现在启动脚本中，但当前 worker 实际采用固定默认模型，不能靠该环境变量保证完成模型切换。交接验证没有发起付费模型请求。

## 4. 包内目录

| 路径 | 内容 |
|---|---|
| `editor/` | 恢复提交中的全部 1,934 个文件：源码、资源、历史案例、报告、测试、旧版下载包。 |
| `plans/` | 最新 1.1 Markdown 开发计划与 JSON 执行计划，按原文件字节保留。 |
| `history/` | 已找回的 0.8 计划、复盘与迭代计划；`early_reference/` 是更早的理论、README 和 LLM 交接资料。 |
| `CODEX_HANDOFF_PROMPT.md` | 可直接复制给 Codex 的开发任务。 |
| `AGENTS.md` | 开发范围、版本映射、阅读顺序和验收约束。 |
| `RECOVERY_NOTES.md` | 恢复来源、完整性边界、当前 GitHub 状态与任务续接记录。 |
| `provenance/` | 源码提交记录、源文件 SHA-256 清单、八份恢复文档清单。 |
| `verification/` | 本次真实测试、构建、HTTP 检查及打包前检查证据。 |
| `tools/` | 本地启动器、完整性验证器、可在本地重新压缩的打包脚本。 |

`editor/README.md` 中保留了多个历史版本的介绍；当前任务以根目录说明、`plans/` 和实际源码为准。包内没有完整的旧聊天逐字稿，也不包含原仓库的 `.git` 对象库；`provenance/source-commit-history.txt` 保留本次可读取的 24 条提交记录。包内原有九个历史下载 ZIP 完整保留。

## 5. 本次已经验证什么

源码基线：`0b2fa1c044d073bd8349ef941cc1b213cbe1cfe1`。

- 1,934 个恢复源文件与基线逐字节一致。
- `npm test`：52 项通过。
- `npm run test:v10`：64 项通过。
- Python `test_gaussian10.py`：4 项通过。
- `npm run build`：通过；885 个公开资源逐字节验证，九个历史 ZIP 可按原字节提供。
- 本机 HTTP 服务启动、主页、当前脚本和历史入口检查通过；没有密钥时模型生成返回明确的未配置状态。

本轮实测 Node 24.22.3、Python 3.12.14、NumPy 2.3.5、Pillow 13.0.0、SciPy 1.17.0。测试和构建说明的是恢复的 1.0 基线，不是 1.1 完成证明。本轮没有进行完整浏览器交互验收、用户 Mac 实测或真实模型端到端调用。

查看 `verification/verification-summary.json` 获取汇总。历史构建报告保留在 `editor/reports/v10/`；本次新构建报告单独保存在 `verification/build-verification-this-session.json`。

复现命令（在 `editor/` 中运行）：

```bash
npm test
npm run test:v10
python3 -m unittest discover -s tests -p 'test_gaussian10.py' -v
npm run build
```

构建会更新 `editor/reports/v10/` 的构建记录并生成 `editor/dist/`。需要保留原始恢复包时，请在副本中执行构建。

## 6. 校验与本地重新打包

在解压根目录运行：

```bash
python3 tools/verify_package.py
```

它会校验全部交付文件的 SHA-256，以及 1,934 个原始源码文件和八份恢复文档。修改文件后校验失败是预期行为；原始清单用于确认下载完整性，不能当作开发中所有变更都应禁止的约束。

按原样重新生成 ZIP：

```bash
python3 tools/repack.py
```

默认在包目录旁创建 `CRF_1.0_Full_Handoff_2026-11-22_repacked.zip`。脚本先校验原始交付清单，再仅打包清单中的文件，避免把 node_modules、运行缓存或本机凭据混入。若已修改工程，请在开发分支上采用对应版本的发布流程；该脚本专门用于重现本次交接包。

## 7. 交给 Codex

让 Codex 打开**整个解压根目录**，使它同时看到 `editor/`、`plans/`、`AGENTS.md` 和校验记录，然后粘贴 `CODEX_HANDOFF_PROMPT.md` 的全文。

先复现基线，再按 M0–M5 开发。1.1 正式完成仍要求：计算内核改善、证明层有效、真实程序 RSI 收益、编辑器可运行，四项同时成立。没有完成的条件必须保留为失败或未测。
