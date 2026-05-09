# 完备表示函数：AI 原生领域语言的统一推导理论

**副标题：从数学完备到意图语义与可验证运行时**

**Complete Representation Functions: A Unified Theory for Deriving AI-Native Domain Languages**

**Subtitle: From Mathematical Completeness to Intent Semantics and Verifiable Runtime**

---

## 语言版本

- [English paper](crf-paper.en.md)
- [中文原文](crf-paper.zh-CN.md)
- [论文语言选择入口](crf-paper.md)

---

## 摘要

当前大语言模型控制软件系统的主流范式，是让模型输出通用编程语言、工具调用代码或 API 参数，再由外部解释器、框架或应用程序执行。这一范式存在三个结构性代价：第一，通用语言的词汇与语法空间巨大，导致模型在生成时承担过高的选择熵；第二，大量模板代码、胶水代码与工具适配代码消耗 token，却不直接携带任务语义；第三，输出结果往往难以被轻量级验证，系统只能在执行失败后通过重试修补。

本文提出**完备表示函数**理论，一个从数学完备性定理出发，为任意可形式化计算域系统性推导 AI 原生领域语言的统一框架。其核心命题是：若一个域 $D$ 存在表示函数 $F_D:X_D\to V_D$，并且该表示满足唯一性、完备性与封闭性，则 $F_D$ 的基底元素可映射为 DSL 的原子关键词，封闭操作可映射为 DSL 的运算符关键词。由此得到的 DSL 不是经验设计的产物，而是从域的数学结构中推导出来的表达系统。

本文提出四步推导法：第一，识别域的物理或逻辑本质，并写出表示函数签名；第二，找到支撑该域表达能力的数学完备性定理；第三，将定理中的基底与封闭操作映射为 AI-native DSL 的关键词集；第四，通过 Parser、Evaluator、Validator 与测试集验证语法可解析性、操作封闭性与执行正确性。该方法已在八个计算域上完成系统验证：三维几何、多智能体协作、用户界面布局、数据变换、状态机、权限控制、数据验证与消息通知。现有验证结果显示，八域共产出 110 个关键词，并在多智能体协作实验中实现 4.72× token 压缩、6.83× 延迟下降和 100% 解析率；后续五个新增验证域完成 50/50 测试通过与 183+ 断言通过。

本文进一步将 CRF 从“数学到 DSL”的推导理论扩展为“数学完备、意图语义与可验证运行时”的三层框架。首先，本文提出域准入公理：一个候选域只有在存在已证明的数学完备性定理，且该定理能够推导出表示函数的基底与封闭操作时，才应被纳入 CRF 域集合。基于该公理，当前理论框架从八个验证域扩展为九域结构，新增智能体进化域，并形成 124 个关键词、9 个验证域、5 个归约候选与 1 个开放位置的域周期表。

其次，本文指出**数学完备不等于意图完备**。一个 DSL 可以在结构上完备，却仍可能无法保真表达用户真正想达到的世界效果。为此，本文在 CRF 之上引入 BDI 语义层，将用户意图建模为可能世界上的目标命题，并通过信念、目标、意图、承诺和重新考虑机制，定义系统何时应持续追求目标、何时应修正计划、何时应放弃当前意图。该层使 CRF 不再直接从自然语言跳到 DSL，而是通过 Intent IR 将用户意图转化为可验证的域内目标。

最后，本文引入 D×L×M 三轴运行时框架，将 CRF 从单域 DSL 推导推进到系统执行。D 轴刻画领域，L 轴刻画从原语到组装的构造层，M 轴刻画从数学公理、语法、实例到物理执行的表现层。JiYu 引擎作为 CRF 的首个系统化实现，展示了三维几何、材质、自演化对象、部件装配和图片转 3D 空间自感知智能体的可能路径。

本文的贡献在于：提出一个从数学完备性定理推导 AI-native DSL 的通用理论；在八个计算域上给出统一推导与实证验证；以 BDI 语义补足“数学完备不等于意图完备”的理论缺口；并以 D×L×M 与 JiYu 案例展示 CRF 如何进一步成为可验证、可组合、可演化的 AI 原生运行时框架。

**关键词：** 完备表示函数；AI-native DSL；领域语言；BDI；可验证运行时；多智能体；JiYu；D×L×M

---

## 目录

- [0. 总命题](#0-总命题)
- [1. 引言：为什么通用代码不是 LLM 的最优输出](#1-引言为什么通用代码不是-llm-的最优输出)
- [2. 相关工作与问题缺口](#2-相关工作与问题缺口)
- [3. 完备表示函数的核心理论](#3-完备表示函数的核心理论)
- [4. 域准入公理、域周期表与九域框架](#4-域准入公理域周期表与九域框架)
- [5. 从数学完备到意图完备：BDI 语义层](#5-从数学完备到意图完备bdi-语义层)
- [6. 四步推导法与八域推导](#6-四步推导法与八域推导)
- [7. 实验设计与结果](#7-实验设计与结果)
- [8. 从 DSL 到运行时：D×L×M 与验证器理论](#8-从-dsl-到运行时dlm-与验证器理论)
- [9. JiYu 案例研究：从几何体到可编辑活物件](#9-jiyu-案例研究从几何体到可编辑活物件)
- [10. 跨域组合、Typed Morphism 与世界模型](#10-跨域组合typed-morphism-与世界模型)
- [11. 讨论与局限](#11-讨论与局限)
- [12. 结论](#12-结论)
- [参考文献](#参考文献)

---

## 0. 总命题

本文提出**完备表示函数**理论：对于任意可形式化的计算域 $D$，若存在一个由数学完备性定理支撑的表示函数：

$$
F_D:X_D\to V_D
$$

使得域内对象能够由一组基底元素与封闭操作完整表达，那么该域的 AI-native 领域语言并非必须由专家经验设计，而可以从该数学结构中机械推导出来。

然而，**数学完备并不自动推出意图完备**。CRF 能够保证某个域内对象“可表达”，但不能单独保证自然语言中的用户意图已被正确翻译为目标世界状态。为弥合这一缺口，本文在 CRF 之上引入 BDI 意图语义层，将用户输入解释为信念、目标、意图和承诺组成的可能世界结构，再经由 Intent IR 编译为具体域 DSL。BDI 逻辑中，Rao 与 Georgeff 使用 possible-worlds formalism 形式化 BDI 架构，并将 possible world 建模为 time tree；Cohen 与 Levesque 的“intention is choice with commitment”则明确讨论了信念、目标、行动、意图之间的 rational balance，以及智能体在目标已满足、不可达或支撑条件改变时如何放弃目标。

因此，CRF 的完整链路不是：

$$
\text{Natural Language}\to \text{DSL}
$$

而是：

$$
\text{Natural Language}
\to
\text{BDI Intent Semantics}
\to
\text{Intent IR}
\to
\text{CRF-derived DSL}
\to
\text{Verified Runtime}
$$

在系统层面，本文进一步以 D×L×M 三轴框架描述 CRF 如何从数学定理进入可执行系统：D 轴表示领域，L 轴表示构造层，M 轴表示从公理、语法、实例到物理执行的表现层。JiYu 作为 CRF 的首个系统化实现，提供了几何、材质、部件装配、空间自感知智能体与自演化资产的工程案例；但本文将明确区分八域实证、九域理论扩展与 JiYu 系统案例三类证据层级。

本文的主张不是“CRF 已经完成所有计算域的终极证明”，而是：

> CRF 给出了一套从数学完备性结构推导 AI-native DSL 的统一方法，并已在八个计算域上完成系统验证；BDI 意图层与 D×L×M 运行时框架，则构成其进一步走向可验证 AI 原生系统的理论扩展。

---

## 1. 引言：为什么通用代码不是 LLM 的最优输出

### 1.1 工具迂回问题

大语言模型正在成为人类控制数字系统的通用入口。用户用自然语言描述目标，模型将目标翻译为文本输出，再由某个解释器、执行器、工具链或应用程序完成任务。无论是写 Python 脚本、调用 JavaScript API、生成 SQL 查询、编写 Blender 脚本、配置 UI JSON，还是驱动多智能体流程，当前主流范式都可以概括为：

$$
\text{User Intent}
\to
\text{Natural Language Prompt}
\to
\text{General-Purpose Code}
\to
\text{Tool Runtime}
\to
\text{Result}
$$

这一范式看似自然，因为通用编程语言和软件工具已经是数字世界的主要接口。但从 LLM 的角度看，它并不一定是最优接口。通用编程语言是为人类程序员、编译器生态和长期软件工程设计的；它们包含大量与单次任务无关的语法选择、库选择、类型处理、错误处理和环境适配。LLM 在生成这些代码时，不只要表达“要做什么”，还要表达“如何操作一个为人类设计的工具系统”。

这就是本文所谓的**工具迂回问题**。模型本来要生成的是某个域内对象或状态，例如一个三维物体、一个 UI 布局、一组智能体协作关系、一个数据变换流程或一个状态机；但它实际输出的却往往是操控工具的代码。工具代码并不是目标本身，而是目标的间接生成路径。它把原本清晰的域内结构，折叠进通用语言、库调用和运行环境中。

CRF 的早期物理域研究已经提出类似判断：LLM 最优输出不应总是代码或自然语言，而可以是直接指定域状态的数学函数参数；在三维几何、表面纹理、声音、图像和运动等物理域中，场函数、频谱场、颜色场和轨迹函数等原生表示能够直接表达域状态，而不必总是经由人类工具管线。本文将这一思想推进到计算域：如果一个计算域本身存在完备表示函数，那么 LLM 应优先输出该域的 AI-native DSL，而不是通用代码。

### 1.2 通用语言的三重结构代价

通用代码生成范式至少带来三类结构性代价。

第一是**选择熵过高**。通用编程语言的语法空间和词汇空间远大于单一任务所需的表达空间。模型必须在大量可能的语法结构、库调用方式、命名习惯、控制流模式和异常处理策略之间选择。对于一个简单的 UI 布局任务，模型可能生成 HTML、CSS、React、Tailwind、SwiftUI、Flutter 或 JSON 配置；对于一个数据变换任务，模型可能生成 SQL、Python pandas、JavaScript array pipeline 或数据库 ORM。可选路径越多，输出越难稳定。

第二是**样板冗余过高**。通用代码经常包含大量非任务语义 token，例如变量声明、导入语句、环境适配、格式转换、错误处理和框架胶水代码。这些 token 消耗了模型上下文和推理预算，却并不直接描述目标对象。CRF 已有验证显示，在多智能体协作实验中，由 CRF 推导的 DSL 相比自然语言/通用描述路径实现了 4.72× token 压缩和 6.83× 速度提升，这说明 token 效率可以来自语言结构本身，而不是单纯的 prompt 技巧。

第三是**验证成本过高**。通用代码的正确性通常需要运行后才能判断，而且错误可能来自多个层面：语法错误、库版本错误、运行环境错误、类型错误、逻辑错误或目标语义错误。相比之下，一个从域数学结构推导出的 DSL，可以把表达空间限制在域内合法操作上，并通过 Parser、Evaluator、Validator 和不变量检查进行轻量验证。

因此，问题不是“LLM 能不能写通用代码”。问题是：**当目标属于某个明确计算域时，通用代码是否仍然是最优输出介质？**

本文给出的答案是否定的。

### 1.3 研究问题：DSL 能否从数学中推导，而不是由专家设计

领域特定语言并不是新概念。SQL、正则表达式、CSS、Verilog、Shader Language、Makefile、Terraform、Kubernetes YAML 都是某种意义上的 DSL。传统 DSL 的生成方式通常是专家设计：领域专家根据经验抽取常用概念，设计语法、关键词、操作符和执行器，再通过多年迭代扩展覆盖更多用例。近年来也出现了数据驱动 DSL、程序合成 DSL 和 LLM 辅助 DSL 设计方法，但它们大多仍然默认 DSL 的结构来自经验、语料或启发式搜索。

本文提出不同观点：对于一类可形式化计算域，DSL 的基元和操作符不必从经验中设计，而可以从该域的数学完备性结构中推导。

例如，数据变换域的核心不是“pandas 常用 API”，而是表到表的封闭变换；其形式基础可以追溯到关系代数。状态机域的核心不是某个状态管理库，而是有限状态、转移与接受条件。权限控制域的核心不是权限配置文件，而是主体、资源、动作、环境和策略判定。消息通知域的核心不是邮件或推送 API，而是条件、触发、时间和传递约束。CRF 的任务，是找到这些域的表示函数、基底和封闭操作，并将其机械映射为 AI-native DSL。

因此，本文的核心研究问题是：

> 给定一个可形式化域 $D$，是否存在一种系统方法，可以从该域的数学完备性定理出发，推导出面向 LLM 生成的最小充分 DSL？

围绕这个问题，本文进一步提出三个子问题：

1. 如何判定一个域是否有资格进入 CRF 框架？
2. 如何从数学结构推导关键词、语法和操作？
3. 如何处理“DSL 已经数学完备，但用户意图仍可能被误译”的问题？

前两个问题由 CRF 的完备表示函数、四步推导法和域准入公理回答。第三个问题则需要引入 BDI 意图语义层。

### 1.4 数学完备不等于意图完备

早期 CRF 草稿已经暴露出一个关键问题：即使 DSL 在数学上完整，用户也未必能够直接写出正确表达。换句话说，CRF 可以保证某个域内状态存在合法表达，但不能单独保证自然语言意图会被翻译成正确表达。关于 `pad` 反例、entity exactness 和 schema fidelity 的讨论，实际都指向同一问题：结构完备不等于语义保真。

例如，用户说“让搜索框短一点”，其真实意图并不一定是“减小 padding”。`pad` 只是可能计划之一。真实目标更接近一个世界状态命题：

$$
\phi =
\text{shorter(searchBox)}
\wedge
\text{preserve(layoutConsistency)}
\wedge
\text{preserve(readability)}
$$

如果系统只是机械修改 `pad`，结果可能并未实现用户意图。此时问题不在于 UI DSL 是否数学完备，而在于系统没有正确建模用户真正追求的世界状态。

同样，在多智能体协作或消息通知中，用户可能要求“张三必须收到这条消息”“审批人必须是原始项目负责人”“实体名必须精确保留”。这些要求不是普通字段，而是意图中的约束条件。如果它们没有进入意图语义层，即使 DSL 结构合法，输出仍可能失真。

因此，本文提出：

$$
\text{CRF solves representability;}
\quad
\text{BDI solves intentionality.}
$$

CRF 回答“目标状态能否在域内被表达”；BDI 回答“智能体应当追求哪个目标状态、保持到什么时候、何时修正计划、何时放弃意图”。

### 1.5 从五物理域到八/九计算域

CRF 的思想起点，是数字物理域中的原生完备表示。早期论文提出，三维几何可以用 SDF 表示，表面纹理可以用高度场表示，声音可以用短时傅里叶频谱场表示，二维图像可以用颜色场表示，运动可以用轨迹函数表示。在这些域中，LLM 不必输出操控工具的脚本，而可以直接输出数学函数或函数参数。

当前论文将这一思想推进到计算域。与物理域不同，计算域的输出不一定是图像、声音或运动，而可能是协作协议、界面布局、数据变换、状态转移、权限判定、验证规则或通知流程。因此，本文将 CRF 重新表述为 AI-native DSL 推导理论：每个域都有自己的函数签名、完备性定理、基底元素、封闭操作和执行器。

本文采用分层表述：八域作为主要实证结果，九域作为当前理论闭包，JiYu 作为系统化实现案例。

### 1.6 从 DSL 到可验证运行时

DSL 本身仍然不是终点。一个 DSL 即使推导正确，也必须经过解析、实例化、执行、渲染和验证才能成为系统。

JiYu 文档提供了这方面的第一批工程样本。D×L×M 三轴框架将 CRF 系统拆成 Domain、Layer、Manifestation 三个维度：D 轴表示能力域，L 轴表示从原语、操作符、模板到组装的构造层，M 轴表示从公理、语法、实例到物理执行的表现层。

这一框架的重要意义在于，它把错误定位从笼统的“系统不对”变成层间边界问题。一个几何物件无法正确渲染，可能不是 SDF 数学错误，而是 D1.L4.M2 的语法问题、D1.L4.M3 的实例参数问题，或者 D1.L4.M4 的物理渲染问题。JiYu 的部件装配文档指出，Layer 1-3 可以生成漂亮抽象几何体，但无法生成“底座 + 齿轮 + 盖子 + 摇柄”这样的可辨识物件；Layer 4 的 object/part/joint 装配层正是从“一个连续几何体”到“有结构、有角色、有关系的智能体应用程序”的关键跃迁。

因此，本文不会把 CRF 停留在 DSL 推导，而会进一步提出可验证运行时的最小形式：

$$
\mathcal D
=
(V_D,B_D,\Omega_D,L_D,\llbracket\cdot\rrbracket_D,R_D,\mathcal I_D,\mathcal V_D)
$$

其中 $V_D$ 是域载体空间，$B_D$ 是基底，$\Omega_D$ 是封闭操作，$L_D$ 是 DSL，$\llbracket\cdot\rrbracket_D$ 是语义映射，$R_D$ 是运行时，$\mathcal I_D$ 是不变量，$\mathcal V_D$ 是验证器。这个定义使 CRF 从“表达理论”扩展为“可执行系统理论”。

### 1.7 本文贡献

本文的主要贡献如下。

**贡献一：提出完备表示函数理论。**  
本文将 AI-native DSL 的来源从专家设计、语料挖掘或 prompt 工程，转化为从数学完备性结构出发的推导问题。若域 $D$ 存在满足唯一性、完备性与封闭性的表示函数 $F_D:X_D\to V_D$，则该域 DSL 的原子关键词与运算符可以由 $F_D$ 的基底和封闭操作推导得到。

**贡献二：提出四步推导法。**  
本文给出统一流程：识别域本质与函数签名；匹配数学完备性定理；从基底和封闭操作推导关键词；通过 Parser、Evaluator 和测试集验证封闭性与执行正确性。

**贡献三：完成八个计算域的系统验证。**  
本文将 CRF 应用于三维几何、多智能体协作、UI 布局、数据变换、状态机、权限控制、数据验证和消息通知八个计算域，形成 110 个关键词，并报告 4.72× token 压缩、6.83× 速度提升、100% 解析率等实验结果。

**贡献四：提出域准入公理与九域理论框架。**  
本文将后续研究中的九域扩展纳入理论讨论，提出域准入公理：候选域必须存在可援引的数学完备性定理，且该定理能够推导出表示函数的基底和封闭操作，方可纳入 CRF 域集合。当前框架包含 9 个验证域、124 个关键词、5 个归约候选与 1 个开放位置。

**贡献五：引入 BDI 意图语义层，补足“数学完备不等于意图完备”的缺口。**  
本文不再假设自然语言可以直接无损映射到 DSL，而是将用户输入先解释为 BDI 结构：Belief、Desire/Goal、Intention、Commitment 和 Reconsideration。自然语言到 DSL 的中间层被写作：

$$
U
\to
(B,G,I,C)
\to
\text{Intent IR}
\to
L_D
$$

其中 $U$ 是用户输入，$(B,G,I,C)$ 分别表示信念、目标、意图和承诺，$L_D$ 是特定域 DSL。

**贡献六：提出 D×L×M 可验证运行时框架。**  
本文将 CRF 从 DSL 推导推进到系统执行，使用 D×L×M 三轴刻画域、构造层和表现层。该框架使系统错误能够被定位到 M1→M2、M2→M3、M3→M4 的翻译边界，并为 Parser、Evaluator、Validator 和不变量检查提供统一位置。

**贡献七：以 JiYu 作为系统化案例，展示 CRF 的运行时潜力。**  
JiYu 的几何库、材质库、部件装配、自演化架构、场景资产与图片转 3D 文档展示了 CRF 从 DSL 到运行时的演进路径。尤其是 Layer 4 部件装配和空间自感知智能体，将“生成几何体”推进到“生成有结构、可编辑、可进化、可交互的活物件”。

### 1.8 证据层级与论文边界

为避免过强主张，本文明确区分三类证据。

第一类是**已系统验证结果**：八个计算域、110 个关键词、Parser/Evaluator/测试集，以及多智能体协作中的 token 压缩、速度提升和解析率结果。这是本文经验主干。

第二类是**理论扩展结果**：九域框架、124 个关键词、域准入公理、域周期表、5 个归约候选和 1 个开放位置。这些结果构成当前最佳理论闭包，但本文不将其表述为对所有可能计算域的最终穷尽证明。

第三类是**系统案例结果**：JiYu 的几何、材质、自演化、部件装配和图片转 3D 方向。它们展示 CRF 如何进入运行时，但不替代八域实证本身。现有工程文档也显示，Layer 4 装配、图片转 3D 和复杂场景资产生成仍存在从规格到稳定实现的工程推进过程。

---

## 2. 相关工作与问题缺口

### 2.1 传统 DSL：由专家设计的领域语言

领域特定语言（Domain-Specific Language, DSL）的核心思想，是为某个有限领域提供比通用编程语言更紧凑、更直接、更可验证的表达方式。SQL、正则表达式、CSS、Verilog、Shader Language、Makefile、Terraform、Kubernetes YAML、状态机配置语言等，都属于广义 DSL。它们共同说明了一件事：当问题域足够稳定时，一个专门语言往往比通用语言更高效。

传统 DSL 的优势在于表达空间被压缩到领域概念之内。以关系数据库为例，Codd 在 1970 年提出关系模型，将数据组织为关系，并使用户能够以关系运算表达数据查询，而不必直接处理底层物理存储路径；这正是 DSL 相对于底层实现的典型优势。类似地，权限控制中的 ABAC 模型把访问判定归约为主体、对象、操作和环境属性与策略规则之间的匹配，NIST SP 800-162 明确定义 ABAC 是一种通过评估这些属性来决定授权的逻辑访问控制方法。

但传统 DSL 仍有一个根本限制：**语言通常是人为设计出来的，而不是从域的数学结构中推导出来的。** 专家观察领域中的常用概念，抽取关键词、参数和组合规则，然后通过工程迭代扩展覆盖范围。这种方式有效，但它的完备性通常是经验性的：某个 DSL 覆盖了大量已知用例，并不等于它从数学上覆盖了该域的状态空间。

CRF 与传统 DSL 的关系，是继承其“压缩表达空间”的优点，但反转其语言来源。CRF 认为，对于一类可形式化域，DSL 的基元和运算符不应首先来自专家经验，而应来自域的完备表示函数 $F:X\to V$ 以及支撑它的数学完备性定理。

因此，传统 DSL 是 CRF 的近邻，但不是 CRF 的同类。传统 DSL 问的是：

$$
\text{How should experts design a useful language?}
$$

CRF 问的是：

$$
\text{Given a mathematical completeness theorem, what language is forced by it?}
$$

这是本文与传统 DSL 研究的第一条分界线。

### 2.2 数据驱动 DSL 与程序合成：从样例中学习语言或程序

第二条相关研究线，是程序合成、归纳程序学习和数据驱动 DSL。它们通常从输入输出样例、任务分布或代码语料中学习程序结构，并在某个预定义或可扩展的语言空间中搜索解。

DreamCoder 是这一方向的代表性系统之一。它通过 wake-sleep Bayesian program learning 学习解决任务的程序，同时扩展可复用的符号抽象库，并训练神经网络来引导程序搜索；其论文明确将“创建表达领域概念的 domain-specific programming languages”作为系统学习专家知识的一部分。这类研究非常重要，因为它证明了“语言”和“抽象库”可以随着任务经验增长，而不必完全由人手工固定。

但是，数据驱动 DSL 与 CRF 的出发点仍然不同。程序合成系统通常从任务样例中归纳可用抽象，目标是提高搜索效率和泛化能力；CRF 则从数学完备性定理出发，先确定域的表示函数、基底元素和封闭操作，再推导 DSL。换句话说，数据驱动方法的 DSL 是从经验分布中学习的，而 CRF 的 DSL 是从域结构中推导的。

二者并不冲突。CRF 可以把数据驱动方法视为上层优化机制：当域的 $F$、基底 $B$ 和操作集 $\Omega$ 已经确定后，程序合成或神经搜索可以帮助发现更短的表达、更优的组合、更常用的模板和更高层的库函数。但这些学习出的模板不应混同于 CRF 的数学基底。模板可以增长，基底必须受定理约束。

这一区分对本文非常关键。否则 CRF 容易被误解为“又一种 AutoDSL”。实际上，CRF 的核心贡献不在于从数据中挖掘频繁模式，而在于提出一个域准入规则：

$$
D\in DomainSet
\Longleftrightarrow
\exists T\in MathematicalTheory:
T \Rightarrow (B_D,\Omega_D,F_D)
$$

因此，程序合成与数据驱动 DSL 解决的是：

$$
\text{Can we learn useful abstractions from tasks?}
$$

CRF 解决的是：

$$
\text{Can a domain’s necessary abstraction set be derived from its mathematical completeness structure?}
$$

### 2.3 LLM 工具调用与结构化输出：让模型更可靠地调用系统

第三条相关研究线，是 LLM 工具调用、函数调用、JSON Schema、结构化输出和 constrained generation。这一方向与 CRF 最接近，因为它们都关心如何让 LLM 输出可执行、可验证、低歧义的文本结构。

结构化输出技术解决了一个非常实际的问题：LLM 输出自由文本不可靠，因此需要 schema、function spec、tool definition、enum、strict mode 和验证机制来约束输出。它们已经构成现代 LLM 应用工程的核心基础设施。

但 CRF 与这些方法的差异在于：**结构化输出只约束输出格式，不回答 schema 本身从哪里来。** JSON Schema 可以让模型稳定输出一个对象，但它不保证这个对象是某个域的完备表示；function calling 可以让模型调用工具，但它不保证工具集合是从域的封闭操作推导出来的。工具表面越大，选择熵和上下文成本越高；而 CRF 的目标正是从域数学结构中推导出最小充分的工具/语言表面。

因此，结构化输出可以成为 CRF 的工程实现手段，但不能替代 CRF 的理论问题。CRF 可以把一个域 DSL 编译为 JSON Schema、函数签名或 constrained grammar；但 CRF 关心的是更前一层：

$$
\text{What is the mathematically justified schema of the domain?}
$$

这也解释了为什么本文强调 AI-native DSL，而不仅仅是“让 LLM 输出 JSON”。JSON 是通用容器；CRF DSL 是域结构本身的坐标化。前者保证格式，后者保证表达空间与域完备结构对齐。

### 2.4 形式化方法与计算理论：CRF 的定理来源，而非竞争对象

CRF 的每个域都依赖某个既有数学或计算理论。数据变换域依赖关系代数；状态机域依赖有限状态自动机；权限控制域依赖 ABAC；消息通知域依赖谓词逻辑与线性时序逻辑；多智能体协作域则可借助 CSP、π-calculus 等并发理论。π-calculus 的经典形式中，通信不仅传递值，也可传递通道名，从而自然表示动态变化的进程连接结构。Pnueli 的 temporal logic of programs 则是将时序逻辑引入程序推理的重要源头，用于讨论程序性质随时间如何成立。

这些理论并不是 CRF 的竞争对象，而是 CRF 的支撑来源。CRF 并不试图重新证明关系代数、自动机理论、时序逻辑或并发演算；CRF 的工作是把这些理论中的“基底—操作—封闭性”结构转译为 AI-native DSL 的语言结构。

这一点决定了本文的证明策略。CRF 的严格证明不应写成“我们重新发明了每个域的完备性定理”，而应写成：

1. 对每个域，识别其已有完备性或表达性理论；
2. 提取该理论中的基底元素与封闭操作；
3. 证明 DSL 关键词集与 $B_D\cup\Omega_D$ 存在映射；
4. 通过 Parser、Evaluator、Validator 证明这个映射可以执行；
5. 通过测试集证明实现层没有破坏理论层的封闭性。

这也是为什么 CRF 的九域框架需要“域准入公理”。如果某个候选域无法给出可靠的数学定理来源，它就不应被轻易纳入核心域集合。

### 2.5 BDI 与可能世界语义：补足意图层，而非取代 CRF

第四条相关研究线，是智能体理论中的 BDI 模型。BDI，即 Belief–Desire–Intention，试图形式化智能体的信念、欲望/目标和意图之间的关系。它与本文的关系非常关键，因为 CRF 解决的是“域内对象能否表达”，而 BDI 解决的是“智能体应当追求哪个目标世界、持续到何时、何时重新考虑”。

Rao 与 Georgeff 在 BDI 架构中使用 branching-time possible-worlds 模型形式化 intention，并明确提出：意图在理性智能体追求目标时起核心作用；其模型将世界表示为 time tree，分支代表智能体在未来可选择的行动路径，并使用类似 CTL 的结构区分 optional 与 inevitable 路径。他们还将 belief、goal 和 intention 分别建模为可达世界集合，其中 intention-accessible worlds 是智能体承诺尝试实现的世界。

Cohen 与 Levesque 的工作则强调 intention 与 commitment 的关系。他们通过 persistent goal 描述智能体如何维持目标：一个 persistent goal 只能在智能体相信目标已满足，或相信目标永远不可能实现时被放弃；后续的 relativized persistent goal 又允许目标相对于某个背景理由 $q$ 成立，当智能体相信该背景理由不再成立时，也可以放弃目标。

这条研究线正好补足 CRF 的一个理论缺口。一个 DSL 可以结构上完整，但用户并不一定能直接写出正确表达；系统也可能在 schema 字段、实体名保真、布局效果等方面满足形式结构却偏离真实意图。

因此，本文不把 BDI 当作第十个 CRF 域，而是将其放在 CRF 之上的横向语义层。原因是：CRF 域集合讨论的是“哪些对象空间存在完备表示函数”；BDI 讨论的是“智能体如何在多个可能未来中选择、维持、修正和放弃目标”。两者的层级不同。

本文采用如下链路：

$$
U
\to
\mathcal BDI(U)
\to
\text{Intent IR}
\to
L_D
\to
R_D
$$

其中 $U$ 是用户自然语言输入，$\mathcal BDI(U)$ 是由信念、目标、意图、承诺和背景理由构成的意图语义结构，$L_D$ 是由 CRF 推导出的域 DSL，$R_D$ 是运行时。

### 2.6 神经生成与黑箱模型：互补而非对立

CRF 还需要与现代神经生成系统区分。无论是图像生成、3D mesh 生成、音频生成，还是多模态 agent，神经模型的优势在于从大规模数据中学习复杂分布，并生成高感知质量的结果。CRF 不否认这种优势。相反，在图片转 3D、结构分析、参数优化和视觉对齐等任务中，神经模型是非常重要的前端和优化器。

但 CRF 与纯神经生成的差异在于 source of truth。神经生成系统通常输出像素、mesh、音频波形或其他结果对象；它们可以非常逼真，却未必知道对象由哪些语义部件组成、哪些属性可编辑、哪些约束必须保持、哪些行为可以绑定。JiYu 图片转 3D 技术方案明确区分了这一点：传统照片到 3D 系统通常输出静态 mesh，而 JiYu 目标是从照片经结构分析、多视图描述、DSL 代码、空间自感知智能体、自校准对齐，最终得到一个“活的程序”。

因此，CRF 与神经生成的关系应写成：

$$
\text{Neural model: infer, fit, optimize}
$$

$$
\text{CRF runtime: represent, validate, edit, compose}
$$

神经模型可以帮助从自然语言或图像中推断初始结构，可以帮助在连续参数空间中优化相似度，也可以帮助为 DSL 生成候选表达；但最终的 canonical representation 应尽量保持为 CRF AST、DSL、ComponentTree 或 genome，而不是不可解释的静态结果文件。

### 2.7 问题缺口：现有研究没有回答 DSL 如何从数学中被发现

综合以上研究，可以看到现有工作各自解决了一部分问题。

传统 DSL 说明，领域语言能显著压缩表达空间，但大多依赖专家设计。程序合成说明，抽象库可以从任务经验中学习，但通常依赖样例分布和搜索。结构化输出说明，LLM 可以被约束为输出 JSON Schema 或函数调用，但 schema 与函数集本身仍由开发者定义。形式化方法提供了关系代数、自动机、时序逻辑、并发演算等强大定理，但很少直接讨论这些定理如何转化为 LLM 最优输出语言。BDI 形式化了信念、目标、意图与承诺，却不直接解决域内对象的 DSL 推导问题。神经生成可以产生高质量结果，却常缺少可编辑、可验证、可组合的 canonical representation。

CRF 的问题意识位于这些研究之间，但不等同于其中任何一条。本文试图回答的是：

> 如果 LLM 的输出文本最终必须被某个解释器执行，那么这个解释器的语言应如何被选择？

本文的答案是：

> 对于可形式化域，语言应由域的完备表示函数推导，而不是由工具生态、专家经验、prompt 习惯或任意 JSON schema 决定。

这就形成本文的核心研究缺口：

$$
\textbf{Existing work studies how to use, constrain, synthesize, or execute languages;}
$$

$$
\textbf{CRF studies how the right AI-native language is discovered from mathematical completeness.}
$$

---

## 3. 完备表示函数的核心理论

### 3.1 基本问题：LLM 应该输出什么

大语言模型控制数字系统时，表面上是在“生成文本”，但从系统角度看，它真正做的是选择某种**可被解释器执行的表达形式**。这个表达形式可以是自然语言、通用代码、JSON、函数调用参数、脚本，也可以是某个领域特定语言。

因此，问题不只是：

$$
\text{Can an LLM generate code?}
$$

更根本的问题是：

$$
\text{What is the most appropriate executable representation for a given domain?}
$$

传统软件工程通常默认答案是通用代码或工具 API。CRF 的出发点不同：如果某个领域本身存在一个数学上完备、封闭、可组合的表示空间，那么 LLM 的最优输出不应是操控外部工具的通用代码，而应是该领域的**原生表示语言**。

对于计算域，目标对象可能不是物理形态，而是协作协议、UI 布局、数据变换、状态机、权限策略、验证规则、通知流程或智能体进化过程。它们同样可以被视为某种状态空间中的对象。如果这个状态空间存在完备表示函数，那么 LLM 就可以直接生成该表示函数的语言化形式。

因此，CRF 要回答的问题是：

> 给定一个可形式化域，能否从其数学结构中推导出适合 LLM 生成的 AI-native DSL？

### 3.2 域、对象空间与表示空间

设 $D$ 为一个可形式化的领域。我们首先区分三个层次。

第一，**对象空间**：

$$
X_D
$$

表示领域 $D$ 中所有目标对象或目标状态的集合。例如，在几何域中，$X_D$ 可以是所有可表示的三维形体；在数据变换域中，$X_D$ 可以是所有表到表的变换；在状态机域中，$X_D$ 可以是所有有限状态转移系统；在权限控制域中，$X_D$ 可以是所有合法访问判定策略。

第二，**表示空间**：

$$
V_D
$$

表示能够编码 $X_D$ 中对象的数学载体空间。这个空间可以是函数空间、代数结构、自动机结构、关系结构、逻辑公式空间或策略空间。CRF 的核心并不是“把对象变成字符串”，而是先找到该对象所属领域的数学载体。

第三，**语言空间**：

$$
L_D
$$

表示可以由 LLM 输出、可以被 Parser 解析、可以被 Evaluator 执行的文本语言。$L_D$ 是面向模型生成的具体 DSL；它不是最原始的数学对象，而是数学表示空间 $V_D$ 的语法化、可执行化形式。

因此，CRF 的基本链路不是：

$$
X_D \to L_D
$$

而是：

$$
X_D
\to
V_D
\to
L_D
\to
\text{Runtime}
$$

或者从生成方向看：

$$
L_D
\to
V_D
\to
X_D
$$

其中，$V_D$ 是理论核心，$L_D$ 是 AI-native 输出界面，Runtime 是工程执行层。

### 3.3 完备表示函数的定义

本文将领域 $D$ 的完备表示函数定义为：

$$
F_D:X_D\to \widehat V_D
$$

其中，$\widehat V_D$ 是表示空间 $V_D$ 在语义等价关系 $\sim_D$ 下的规范化空间：

$$
\widehat V_D = V_D / \sim_D
$$

引入 $\sim_D$ 是必要的。旧版定义中，唯一性被写作：

$$
\forall x\in D,\exists!v\in V,\ F(x)=v
$$

其工程含义是“同一对象只有一种 DSL 表达，无歧义”。但在更严格的数学表述中，原始唯一性需要修正。因为同一个对象往往可以有多种表面表达。例如：

$$
a+b=b+a
$$

可能表示同一个组合结果；同一个 UI 布局也可能通过不同的嵌套顺序写出；同一个几何体也可能有多个等价的构造路径。因此，CRF 需要的是**规范化唯一性**，而不是“任意文本表达唯一”。

**定义 3.1：完备表示函数。** 给定领域 $D$，若存在对象空间 $X_D$、表示空间 $V_D$、语义等价关系 $\sim_D$，以及映射：

$$
F_D:X_D\to V_D/\sim_D
$$

使得每个领域对象 $x\in X_D$ 都对应一个唯一的规范表示类 $[v]\in V_D/\sim_D$，并且该表示类能够由有限基底与封闭操作生成，则称 $F_D$ 为领域 $D$ 的完备表示函数。

换言之：

$$
\forall x\in X_D,\exists![v]\in V_D/\sim_D,\ F_D(x)=[v]
$$

这里唯一的是语义规范类，而不是 DSL 的每一种表面写法。

这一区分非常重要。它允许 CRF 同时保持数学严谨性和工程灵活性：同一个目标对象可以有多个等价 DSL 程序；但这些 DSL 程序经过 normalization 后，应落到同一个规范表示类。

### 3.4 基底、操作与项代数

完备表示函数并不是孤立函数。它必须由一组基底元素和封闭操作支撑。

设：

$$
B_D = \{b_1,b_2,\dots,b_m\}
$$

为领域 $D$ 的基底集合。需要注意，CRF 中的“基底”通常不是无参数常量，而是**参数化构造器**。因此更准确地写：

$$
b_i:P_i\to V_D
$$

其中 $P_i$ 是该基底构造器的参数空间。例如，在几何域中，`sphere(r)`、`box(w,h,d)`、`cylinder(r,h)` 都是参数化基底；在 UI 域中，`row`、`column`、`stack` 等布局构造也可以带参数；在数据变换域中，selection、projection、join 等操作会带条件、字段和键。

再设：

$$
\Omega_D = \{\omega_1,\omega_2,\dots,\omega_n\}
$$

为领域 $D$ 的封闭操作集合。每个操作可以写作：

$$
\omega_j:V_D^{k_j}\times Q_j\to V_D
$$

其中 $k_j$ 是操作元数，$Q_j$ 是操作参数空间。

由 $B_D$ 和 $\Omega_D$ 可以递归生成一个项代数：

$$
T_D = Term(B_D,\Omega_D)
$$

其生成规则为：

1. 若 $b_i(p)\in B_D$，则 $b_i(p)\in T_D$；
2. 若 $t_1,\dots,t_k\in T_D$，且 $\omega\in\Omega_D$，则 $\omega(t_1,\dots,t_k;q)\in T_D$；
3. 所有合法项均由以上规则有限次生成。

项代数 $T_D$ 是 CRF 与 DSL 的关键连接点。数学上，$T_D$ 是基底和操作构成的表达式空间；工程上，$T_D$ 是 DSL 的抽象语法树空间；运行时上，$T_D$ 是 Evaluator 可以解释执行的结构。

因此，CRF 的核心不是直接把 $X_D$ 写成字符串，而是：

$$
X_D
\overset{F_D}{\longrightarrow}
V_D/\sim_D
\longleftarrow
T_D
\longleftarrow
L_D
$$

其中，DSL $L_D$ 是项代数 $T_D$ 的具体文本化形式。

### 3.5 三个核心条件：唯一性、完备性、封闭性

CRF 的基本成立条件仍然是三个：唯一性、完备性、封闭性。但在本论文中，它们需要采用更严格的版本。

#### 3.5.1 规范唯一性

旧版唯一性强调：

$$
\forall x\in X_D,\exists!v\in V_D
$$

但表面表达通常不唯一。因此本文将唯一性改为规范唯一性：

$$
\forall x\in X_D,\exists![v]\in V_D/\sim_D,\ F_D(x)=[v]
$$

含义是：每个目标对象在语义等价类意义下有唯一表示。

工程上，这意味着 CRF 系统应提供：

$$
normalize:L_D\to \widehat V_D
$$

使得不同 DSL 表达如果语义等价，最终会归约到同一个规范对象。例如：

$$
union(a,b)
\sim
union(b,a)
$$

如果 union 在该域中满足交换律，则这两个表达应归为同一规范类。

#### 3.5.2 表示完备性

完备性表示：

$$
\forall x\in X_D,\exists t\in T_D,\quad \llbracket t\rrbracket_D \sim_D F_D(x)
$$

其中：

$$
\llbracket\cdot\rrbracket_D:T_D\to V_D
$$

是项代数到表示空间的语义解释函数。

这句话的含义是：领域中的任意对象，都可以由基底 $B_D$ 和操作 $\Omega_D$ 的有限组合生成。

需要注意两点。第一，“有限关键词”不等于“有限对象数量”。关键词集合可以是有限的，但参数空间可以是连续或无限的。例如 `sphere(r)` 只有一个关键词，但半径 $r$ 可以连续变化。CRF 的压缩能力来自有限构造器与无限参数空间的组合。

第二，物理连续域和离散计算域的完备性强度不同。离散计算域中，完备性通常可以严格表达；而物理场、图像、声音等连续域中，可能需要区分精确完备、$\varepsilon$-完备和任务完备。

因此，本文将完备性分为三种强度。

**精确完备：**

$$
\forall x\in X_D,\exists t\in T_D,\quad G_D(\llbracket t\rrbracket_D)=x
$$

**近似完备：**

$$
\forall x\in X_D,\exists t\in T_D,\quad d(G_D(\llbracket t\rrbracket_D),x)\le \varepsilon
$$

**任务完备：**

$$
\forall x\in X_D,\exists t\in T_D,\quad Task(G_D(\llbracket t\rrbracket_D))=Task(x)
$$

其中 $G_D:V_D\to X_D$ 是实现或解码函数，$d$ 是领域距离度量。

#### 3.5.3 操作封闭性

封闭性表示：

$$
\forall \omega\in\Omega_D,\forall v_1,\dots,v_k\in V_D,\quad
\omega(v_1,\dots,v_k)\in V_D
$$

在 DSL 层面，它意味着操作可以串联：

$$
t_0
\mid
\omega_1
\mid
\omega_2
\mid
\cdots
\mid
\omega_n
$$

且每一步结果仍然属于同一领域的合法表示。

但严格来说，封闭性必须是**类型化封闭性**。因为不是所有操作都能作用于所有对象。例如，UI 的布局操作不能随意作用于权限策略，状态机转移不能随意作用于三维 SDF。即使在同一域内，不同子类型之间也可能有约束。

因此，本文采用类型化封闭性：

$$
\omega:
V_{\tau_1}\times\cdots\times V_{\tau_k}\times Q
\to
V_{\tau_o}
$$

其中 $V_{\tau_i}\subseteq V_D$，$V_{\tau_o}\subseteq V_D$。只要输入满足类型约束，输出就仍属于 $V_D$。

工程上，这要求 Parser 和 Validator 不仅检查语法合法，还要检查类型合法。

### 3.6 四类完备：数学、语法、运行时与意图

旧版 CRF 容易把“完备”作为单一概念使用。但在完整系统中，至少需要区分四类完备。

**载体完备**是最底层的数学性质：

$$
F_D:X_D\to V_D/\sim_D
$$

是否能够覆盖领域对象空间。如果不存在合适的 $V_D$，或者领域对象无法被该表示空间承载，那么后续 DSL 设计没有意义。

**语法完备**表示 DSL 是否能够表达项代数中的所有合法项：

$$
\forall t\in T_D,\exists l\in L_D,\quad parse(l)=t
$$

也就是说，即使数学上 $B_D$ 和 $\Omega_D$ 已经完备，如果 DSL 语法没有提供对应表达，那么系统仍然不完备。

**运行时正确性**表示：

$$
eval(parse(l))=\llbracket parse(l)\rrbracket_D
$$

即 Parser 和 Evaluator 是否忠实实现了 DSL 的语义。这也是为什么 CRF 不能只停留在纸面理论。一个 DSL 在理论上可以表达对象，但实现中可能出现坐标轴映射错误、参数缩放错误、部件定位错误、材质映射错误或渲染错误。

**意图完备**表示 DSL 输出是否真正满足用户想要达成的世界状态：

$$
U
\to
L_D
$$

这一步并不由 CRF 三条件自动保证。一个 DSL 可以数学完备、语法完备、运行时正确，但仍然误解用户意图。因此，本文将意图完备从 CRF 核心三条件中分离出来，并用 BDI 语义层处理。

CRF 管：

$$
\text{Can this domain state be represented?}
$$

BDI 管：

$$
\text{Which represented state should the agent commit to?}
$$

### 3.7 从 $F$ 到 DSL 的映射定理

设领域 $D$ 存在：

$$
F_D:X_D\to V_D/\sim_D
$$

并存在基底集合 $B_D$、封闭操作集合 $\Omega_D$、项代数 $T_D=Term(B_D,\Omega_D)$，以及语义解释函数：

$$
\llbracket\cdot\rrbracket_D:T_D\to V_D
$$

若满足：

1. **表示完备：**

$$
\forall x\in X_D,\exists t\in T_D,\quad
\llbracket t\rrbracket_D\sim_D F_D(x)
$$

2. **操作封闭：**

$$
\forall \omega\in\Omega_D,\quad
\omega(V_D)\subseteq V_D
$$

3. **语法可表达：**

$$
\forall t\in T_D,\exists l\in L_D,\quad parse(l)=t
$$

4. **求值正确：**

$$
eval(parse(l))=\llbracket parse(l)\rrbracket_D
$$

则 DSL $L_D$ 对领域 $D$ 是 CRF-完备的。

**定理 3.1：CRF 到 DSL 的映射定理。** 若领域 $D$ 存在由基底 $B_D$ 与封闭操作 $\Omega_D$ 生成的完备表示函数 $F_D$，且 DSL $L_D$ 能表达 $Term(B_D,\Omega_D)$ 中所有合法项，并由正确 Parser/Evaluator 实现，则 $L_D$ 是领域 $D$ 的 AI-native 完备 DSL。

证明思路如下。对任意目标对象 $x\in X_D$，由表示完备性可知，存在项 $t\in T_D$，使得：

$$
\llbracket t\rrbracket_D\sim_D F_D(x)
$$

由语法可表达性可知，存在 DSL 程序 $l\in L_D$，使得：

$$
parse(l)=t
$$

由求值正确性可知：

$$
eval(parse(l))=\llbracket t\rrbracket_D
$$

因此：

$$
eval(parse(l))\sim_D F_D(x)
$$

即 $l$ 能够表达对象 $x$ 的规范表示。由于 $x$ 任意，故 $L_D$ 对 $X_D$ 完备。

### 3.8 关键词推导：基底映射为原子，操作映射为运算符

CRF 的核心映射规则是：

$$
Keywords(L_D)
=
Names(B_D)\cup Names(\Omega_D)\cup SyntaxGlue
$$

其中：

- $Names(B_D)$ 是基底构造器的名称；
- $Names(\Omega_D)$ 是封闭操作的名称；
- $SyntaxGlue$ 是必要语法胶水，如括号、管道、命名参数、字符串、注释和块结构。

例如，如果某个域的基底是：

$$
B_D=\{sphere, box, cylinder\}
$$

操作是：

$$
\Omega_D=\{translate, rotate, union, subtract, smooth\}
$$

那么 DSL 核心关键词自然是：

$$
\{sphere, box, cylinder, translate, rotate, union, subtract, smooth\}
$$

而不是由专家随意添加。

需要精确说明的是：CRF 可以从数学结构中推导 DSL 的**核心关键词集**；但具体语法风格、错误恢复、人类可读性、编辑器体验、模板库和高阶宏，仍然属于工程设计层。也就是说：

$$
\text{Core DSL} = \text{Derived}
$$

$$
\text{Surface Syntax and UX} = \text{Designed}
$$

### 3.9 AI-native DSL 的判定标准

并不是所有 DSL 都是 AI-native。一个语言可以是领域特定的，却仍然不适合 LLM 生成。本文将 AI-native DSL 定义为满足以下条件的 DSL。

第一，**低选择熵**。语言的关键词集合应尽量接近 $B_D\cup\Omega_D$，避免通用代码中大量与任务无关的语法选择。

第二，**高语义密度**。每个关键词都应直接携带领域语义。例如 `join`、`transition`、`allow`、`notify` 比通用代码中的循环、变量、类、回调更接近目标结构。

第三，**可解析性**。DSL 应有稳定 Parser，能够输出 AST。

第四，**可求值性**。DSL 不只是描述文本，而要能被 Evaluator 转换为执行结果、渲染结果、策略结果或验证结果。

第五，**可验证性**。DSL 应能通过类型检查、不变量检查、结构检查或测试断言来验证合法性。

第六，**可组合性**。DSL 操作应保持封闭，支持管道、嵌套、组合、复用和跨域转换。

因此，AI-native DSL 不是“给人看的短语”，而是：

$$
\text{LLM-generable}
+
\text{parser-readable}
+
\text{runtime-executable}
+
\text{validator-checkable}
$$

### 3.10 CRF 域对象的最小形式

为了统一后续章节，本文将一个 CRF 域的最小理论对象写作：

$$
\mathfrak C_D=
(X_D,V_D,\sim_D,F_D,B_D,\Omega_D,T_D,L_D,parse,\llbracket\cdot\rrbracket_D,eval)
$$

其中：

- $X_D$：领域对象空间；
- $V_D$：领域表示空间；
- $\sim_D$：语义等价关系；
- $F_D:X_D\to V_D/\sim_D$：完备表示函数；
- $B_D$：基底构造器；
- $\Omega_D$：封闭操作；
- $T_D=Term(B_D,\Omega_D)$：项代数；
- $L_D$：DSL 语言空间；
- $parse:L_D\to T_D$：解析函数；
- $\llbracket\cdot\rrbracket_D:T_D\to V_D$：数学语义解释；
- $eval:T_D\to V_D$：工程求值函数。

若：

$$
eval(t)=\llbracket t\rrbracket_D
$$

则 Evaluator 对数学语义忠实。

后续会把这个最小理论对象扩展为运行时对象：

$$
\mathcal D=
(V_D,B_D,\Omega_D,L_D,\llbracket\cdot\rrbracket_D,R_D,\mathcal I_D,\mathcal V_D)
$$

其中 $R_D$ 是运行时，$\mathcal I_D$ 是不变量集合，$\mathcal V_D$ 是验证器集合。

### 3.11 CRF 是发现程序，而不是设计方法

传统 DSL 的基本路径是：

$$
\text{Expert experience}
\to
\text{Vocabulary design}
\to
\text{Syntax}
\to
\text{Implementation}
$$

CRF 的路径是：

$$
\text{Mathematical theorem}
\to
\text{Basis and closed operations}
\to
\text{Term algebra}
\to
\text{DSL keywords}
\to
\text{Parser/Evaluator/Validator}
$$

这就是本文所谓“推导而非设计”。

一个领域是否适合 CRF，不取决于“我们能否想出好听的关键词”，而取决于是否存在足够稳定的数学结构来支撑这些关键词。

### 3.12 最小性、充分性与开放性

CRF 经常会被表述为“推导最小充分 DSL”。这里需要严格区分。

**充分性**可以由完备性证明支持。只要 $B_D$ 和 $\Omega_D$ 能生成领域对象空间，关键词集 $B_D\cup\Omega_D$ 就是充分的。

**最小性**则更难。要证明某个关键词集合最小，需要证明任何去掉某个基底或操作后的集合都不再完备。这通常需要独立的不可约性证明。

因此，本文采用较稳的表述：

$$
\text{CRF derives a mathematically grounded sufficient core DSL.}
$$

在某些域中，如果能进一步证明基底不可约，则可称为最小充分；否则，只称为“由定理支撑的核心关键词集”。

CRF 是开放理论，而不是封闭百科。它的强度来自明确的准入条件和可证伪边界：

$$
\text{No theorem, no core domain.}
$$

但如果未来发现新的数学完备结构，CRF 域集合也应允许扩展。

---

## 4. 域准入公理、域周期表与九域框架

### 4.1 为什么需要域集合理论

单域理论仍然留下一个问题：

$$
\text{Which domains should exist in the CRF framework?}
$$

如果没有域集合理论，CRF 容易出现两种相反的错误。

第一种错误是**域膨胀**。任何功能都可能被命名为一个新域，例如搜索域、缓存域、支付域、日志域、推荐域、碰撞检测域、布局验证域、图片转 3D 域。这样会让 CRF 退化成普通软件模块分类：每出现一个工程功能，就增加一个“域”。一旦如此，“完备表示函数”就失去理论约束，DSL 也重新变成人为设计的接口集合。

第二种错误是**域过度收缩**。如果只承认少数早期验证域，就会把真正具有独立数学结构的新域误判为组合模式。例如，早期八域框架曾把智能体进化作为候选空格；后续九域框架将其确认为 Domain 9，并将总关键词从 110 扩展到 124，同时引入 Bellman 动态规划作为新增理论依据。

因此，CRF 需要一个明确的域准入原则。这个原则必须同时满足三点：

1. 防止把普通工程模块误当成独立域；
2. 允许真正的新数学结构进入域集合；
3. 保持框架可证伪、可扩展、可收缩。

换言之，CRF 的不变量不应是“正好有几个域”，而应是“一个候选域如何被判定”。

### 4.2 域准入公理

本文将 CRF 的域准入公理表述如下。

**公理 4.1：域准入公理。** 一个候选域 $D$ 被纳入 CRF 核心域集合，当且仅当存在一个已被证明或被充分形式化的数学理论 $T$，使得 $T$ 能够推出该域完备表示函数 $F_D$ 的基底 $B_D$、封闭操作 $\Omega_D$，以及由它们生成的表达空间。

形式化写作：

$$
D\in \mathcal D_{\mathrm{CRF}}
\Longleftrightarrow
\exists T\in \mathcal T:
T\vdash
\big(
Complete(B_D,X_D)
\wedge
Closed(\Omega_D,V_D)
\wedge
Construct(F_D,B_D,\Omega_D)
\big)
$$

并且：

$$
Keywords(L_D)=Names(B_D)\cup Names(\Omega_D)\cup SyntaxGlue
$$

这个公理的含义可以压缩成一句话：

$$
\textbf{No theorem, no core domain.}
$$

但这句话需要正确理解。它并不意味着没有数学定理支撑的功能不能被实现；它只意味着这样的功能不应被纳入 **CRF core domain**。工程系统可以有缓存模块、日志模块、搜索模块、推荐模块、支付模块，但这些模块未必是独立 CRF 域。它们可能是数据变换、状态机、权限控制、消息通知和验证规则的组合。

因此，域准入公理不是功能可实现性的判定，而是**域本体地位**的判定。

### 4.3 独立域的三个判定条件

域准入公理给出最高原则，但在具体分析中，还需要三个操作性条件。

**类型独立性。** 候选域 $D$ 必须有不同于已有域的函数签名：

$$
\Sigma_D=(Input_D,Output_D)
$$

若存在已有域 $D_i$，使得：

$$
\Sigma_D \cong \Sigma_{D_i}
$$

则候选功能通常只是 $D_i$ 的实例，而不是新域。

例如，文件存储如果被表达为：

$$
source(file,path),\quad sink(file,path)
$$

其输入输出类型仍然是数据变换的端点；搜索如果被表达为：

$$
filter(condition)\to sort(relevance)\to limit(n)
$$

其类型仍然属于数据变换；定时任务如果被表达为：

$$
after(duration)\to do(action)
$$

则它是状态机操作，而不是独立域。

**操作封闭性。** 候选域必须存在封闭操作集合：

$$
\Omega_D:V_D^{k}\times Q\to V_D
$$

也就是说，操作之后的结果仍能作为同域下一步操作的输入。

如果某个功能输出的是终端判断、终端分数、终端报告或终端违规列表，而无法继续作为同域对象参与后续操作，那么它更像观察器、验证器或查询，而不是独立域。

这给出了 CRF 的一个关键分界线：

> 能够继续生成同类型对象的是域；只产生终端观察结果的是操作或验证器。

**不可归约性。** 候选域必须不能被已有域组合完全表达。

形式化地，若存在若干已有域 $D_1,\dots,D_n$ 与跨域态射 $m_{ij}$，使得候选功能 $D$ 可以被表示为：

$$
D \equiv m_{n-1,n}\circ R_{D_{n-1}}\circ \cdots \circ m_{1,2}\circ R_{D_1}
$$

则 $D$ 不是独立域，而是组合模式。

因此，一个候选域必须同时通过：

$$
\text{Type Independence}
\wedge
\text{Operational Closure}
\wedge
\text{Irreducibility}
$$

才有资格进入 CRF 核心域集合。

### 4.4 从信息流拓扑推导八个基础计算域

早期八域框架不是从行业模块表中枚举出来的，而是从一个可运行软件系统的信息流生命周期推导出来的。

考虑一个典型动作：

$$
\text{用户点击“提交订单”}
$$

系统必须连续回答一组类型不同的问题：

1. 用户看到了什么界面？
2. 系统状态如何变化？
3. 用户是否有权执行该动作？
4. 输入数据是否合法？
5. 数据从哪里来、如何过滤、聚合、连接？
6. 谁需要被通知？
7. 是否需要多个 agent 协作？
8. 是否需要三维空间对象或空间展示？

由此得到八个基础计算域：

$$
\mathcal D_8=
\{
D_1,D_2,D_3,D_4,D_5,D_6,D_7,D_8
\}
$$

分别为：

$$
\begin{aligned}
D_1 &: \text{三维几何}\\
D_2 &: \text{多智能体协作}\\
D_3 &: \text{用户界面布局}\\
D_4 &: \text{数据变换}\\
D_5 &: \text{状态机}\\
D_6 &: \text{权限控制}\\
D_7 &: \text{数据验证}\\
D_8 &: \text{消息通知}
\end{aligned}
$$

这些域按应用依赖关系可形成分层栈：数据层（数据变换 + 数据验证）→ 逻辑层（状态机 + 权限控制）→ 表现层（UI）→ 触达层（消息通知）→ 协作层（多智能体）→ 空间层（三维几何）。

这一分层并不是唯一的软件架构，但它说明八域不是任意拼接；它们对应一个软件系统从数据到状态、从状态到界面、从界面到触达、从单体到协作、从平面到空间的不同信息流类型。

### 4.5 九域扩展：智能体进化

九域框架将 Domain 9 明确加入 CRF 域集合，命名为**智能体进化**。该更新把域数量从 8 扩展到 9，总关键词从 110 扩展到 124，并将新增理论依据标记为 Bellman 动态规划。

D9 的核心不是“多智能体协作”，而是“智能体在反馈下如何改变自身策略或基因组”。因此，它与 D2 的差异非常关键：

$$
D_2:\quad Task\times Agents \to Result
$$

$$
D_9:\quad Agent\times Feedback \to Agent'
$$

D2 关注多个 agent 如何分工、通信、聚合结果；D9 关注单个或多个 agent 如何在经验、反馈、奖励和约束下更新自身。D2 的输出通常是协作结果；D9 的输出仍然是 agent，因此满足封闭性：

$$
Agent' = improve(Agent,Experience)
$$

$$
Agent'' = improve(Agent',Experience')
$$

本文将 D9 的完备表示函数暂写为：

$$
F_9: Agent\times Feedback \to Agent
$$

更精细地，可以写作：

$$
F_9:(S,A,R,\pi,\mathcal M)\times Experience \to (S,A,R,\pi',\mathcal M')
$$

其中 $S$ 是状态空间，$A$ 是动作空间，$R$ 是奖励或反馈结构，$\pi$ 是策略，$\mathcal M$ 是记忆或模型。D9 的核心操作包括规划、采样、自举、梯度更新、探索控制、记忆更新和边界约束。

需要强调：**D9 不是 BDI。** BDI 是自然语言意图到系统目标的横向语义层；D9 是 agent 自身结构在反馈下的纵向改写域。BDI 回答“系统应该坚持哪个意图”；D9 回答“agent 如何在经验中改写自身”。两者可以耦合，但不能混同。

### 4.6 九域总表

| 编号 | 域 | 典型函数签名 | 数学依据 | 核心输出类型 | 地位 |
| --- | --- | --- | --- | --- | --- |
| D1 | 三维几何 | $\mathbb R^3\to \mathbb R$ 或 Shape DSL → SDF | SDF / CSG 封闭性 | 3D 形体 | 已验证 |
| D2 | 多智能体协作 | $Task\times Agents\to Result$ | CSP / π-calculus | 协作流程与结果 | 已验证 |
| D3 | UI 布局 | $Rect\times State\to PartitionTree$ | 二维空间分区 / 拓扑 | 布局树 | 已验证 |
| D4 | 数据变换 | $Table\times Op\to Table$ | Codd 关系代数 | 表或数据流 | 已验证 |
| D5 | 状态机 | $State\times Event\to State\times Action[]$ | 有限状态自动机 | 状态转移系统 | 已验证 |
| D6 | 权限控制 | $Subject\times Resource\times Action\to Allow/Deny$ | ABAC | 授权判定 | 已验证 |
| D7 | 数据验证 | $Data\times Rules\to Valid/Error[]$ | 类型论 / 精炼类型 | 验证结果 | 已验证 |
| D8 | 消息通知 | $Event\times Audience\to Delivery$ | 谓词逻辑 + LTL/MTL | 触达计划 | 已验证 |
| D9 | 智能体进化 | $Agent\times Feedback\to Agent$ | Bellman 动态规划 / 策略更新 | 更新后的 agent | 新增验证域 |

本文采取分层表述：

$$
\text{八域}=\text{论文主实证基线}
$$

$$
\text{九域}=\text{当前理论闭包与升级框架}
$$

这能避免把不同成熟度的证据混为一谈。

### 4.7 域周期表

为了使域集合具有预测能力，而不仅是事后列表，CRF 引入**域周期表**。其基本思想是：一个域可以按函数签名的输入类型与输出类型进行排列。

| 输入类型 / 输出类型 | 判定型 | 封闭变换型 | 生成构造型 |
| --- | --- | --- | --- |
| 静态数据 | D7 数据验证 | D4 数据变换 | 数据生成 → D4+D7 归约 |
| 动态事件 | D6 权限 / 事件判定 | D5 状态机 | D8 消息通知 |
| 二维空间 | 布局验证 → D7 归约 | 空间变换 → D3 归约 | D3 UI 布局 |
| 三维空间 | 碰撞检测 → D1 归约 | SDF 变换 → D1 归约 | D1 三维几何 |
| 智能实体 | 智能体评估：开放 | D9 智能体进化 | D2 多智能体协作 |

这个表的意义有三层。

第一，它提供了一个**发现工具**。当出现新候选功能时，先定位其输入输出类型，再判断其是否已有域占位、是否可归约、是否开放。

第二，它提供了一个**归约工具**。例如碰撞检测看似是独立功能，但其输入是两个三维形体，输出是 Bool 或接触信息；在 SDF 空间中，它可以通过 intersection 非空、零点和梯度计算实现，因此是 D1 的操作或验证器，而不是独立域。

第三，它提供了一个**可证伪框架**。如果未来发现一个数学上独立、不可归约、满足封闭性的候选域，且不落在当前周期表预测位置，CRF 的域集合理论就必须修正。

因此，域周期表不是最终真理，而是一个可扩展、可归约、可证伪的研究工具。

### 4.8 五个归约格与一个开放格

九域周期表当前有五个已归约格和一个开放格。

**数据生成。** 数据生成看似是独立域，因为它输出新数据。但若其输出是 Table，则它落入 D4 数据变换；若需要保证生成数据满足约束，则调用 D7 数据验证。因此：

$$
DataGeneration \to D4 + D7
$$

**布局验证。** 布局验证看似属于 UI 域，但如果任务是检查布局是否满足 WCAG、尺寸、对齐、可访问性规则，那么输出通常是：

$$
Valid/Error[] \quad \text{或} \quad Violation[]
$$

这正是 D7 数据验证的输出类型。因此布局验证归约为 D7。

**空间变换。** 二维空间变换，如 pan、zoom、rotate，本质上是 D3 UI 布局参数的修改。其操作结果仍是布局树或视图状态，因此可归约为 D3。

**碰撞检测。** 碰撞检测输出 hit、depth、normal、point 等终端观察结果。它并不生成新的三维形体，而是观察两个形体之间的关系。若基于 SDF，其核心可以在 D1 内通过 SDF 交集、零点和梯度实现。因此：

$$
CollisionDetection\to D1
$$

**SDF 变换。** SDF 变换字面上就是 D1 的操作集合，例如 twist、bend、repeat、subtract、blend、scale、rotate 等，因此不具备类型独立性。

**智能体评估。** 智能体评估当前被标为开放问题：

$$
F:Agent\times Task\to Score
$$

它具备一定独立数学基础，例如多准则决策分析（MCDM）；但目前的问题在于封闭性不足。Score 是标量终端产物，不能自然作为同域对象继续串成管道。因此它暂时不纳入核心域，也不被完全否决。

### 4.9 域、操作、验证器与组合模式的边界

根据上述分析，本文给出一个简化分类。

**域**拥有独立类型签名、封闭操作、不可归约结构和数学完备性来源。例如 D4 数据变换、D5 状态机、D9 智能体进化。

**操作**作用于某个域对象，并返回同域对象或终端观察结果。例如 SDF 变换、碰撞检测、UI pan/zoom。

**验证器**检查某对象是否满足约束，通常输出 Bool、Valid/Error[]、Violation[] 或 Score。例如布局验证、数据合法性检查、碰撞 hit 判断。

**组合模式**由多个域串联形成的高层功能。例如支付、缓存、搜索、文件存储、图片转 3D、工作流系统。

这一分类对论文后半部分尤其重要。JiYu 的图片转 3D 不应被写成一个新的 CRF 域；它更像是 D3/D1/D7/D9/BDI 之间的跨域组合流程。支付也不应写成域；它是状态机、权限、数据、通知的组合。碰撞检测不应写成域；它是 D1 的观察器或运算符。

这样，CRF 可以避免“系统功能越多，域越多”的工程模块化误区。

### 4.10 域集合的开放性

CRF 的域集合必须是开放的。本文不主张：

$$
|\mathcal D_{\mathrm{CRF}}|=9
$$

是终极定理。

本文主张的是：

$$
D\in \mathcal D_{\mathrm{CRF}}
$$

必须满足域准入公理、三条件判定和归约测试。当前九域只是截至本文版本的最佳闭包：

$$
\mathcal D_{\mathrm{CRF}}^{current}
=
\{D_1,\dots,D_9\}
$$

未来可能出现三种变化：

1. **扩展**：发现第十个满足公理的新域；
2. **收缩**：发现某个当前域可被其他域归约；
3. **重排**：发现更好的周期表坐标系，使现有域位置重新组织。

这不是理论弱点，而是理论可证伪性的来源。

---

## 5. 从数学完备到意图完备：BDI 语义层

### 5.1 问题重述：结构完备不等于语义保真

前几章已经定义了 CRF 的核心理论：若领域 $D$ 存在完备表示函数：

$$
F_D:X_D\to V_D/\sim_D
$$

并且存在基底 $B_D$、封闭操作 $\Omega_D$、项代数 $T_D$、DSL $L_D$、Parser 与 Evaluator，则可以从该域的数学结构推导出一个 AI-native DSL。

但这仍然只解决了一个问题：

$$
\text{Can the target object be represented?}
$$

它还没有解决另一个问题：

$$
\text{Did the system represent what the user actually intended?}
$$

UI 域中的 `pad` 事件说明，用户想让搜索框短一点，减小 `pad` 后搜索框反而变长；多智能体实验中的实体名称保真问题也说明，DSL 组虽然结构压缩和解析率更好，但如果 `who` 字段没有被约束为原文保留，实体名称存活率会显著下降。因此，完备表示函数保证结构完备，但不自动保证语义保真；DSL 更适合作为 AI↔系统接口，而不是人↔系统接口。

因此，CRF 必须拆分两层问题：

$$
\textbf{数学完备：}
\quad
\forall x\in X_D,\exists l\in L_D,\ eval(parse(l))\sim_D F_D(x)
$$

$$
\textbf{意图完备：}
\quad
eval(parse(l))\models \phi_u
$$

其中，$\phi_u$ 不是 DSL 里的某个字段，而是用户希望结果世界满足的目标命题。

例如，用户说：

> 让搜索框短一点。

这句话的意图并不是：

$$
pad=-8
$$

而更像是：

$$
\phi_u =
shorter(searchBox)
\wedge
preserve(readability)
\wedge
preserve(layoutConsistency)
$$

`pad(-8)` 只是一个可能计划，而不是意图本身。如果这个计划没有让结果世界满足 $\phi_u$，系统就不应宣称“任务完成”。它应该保持用户意图，重新考虑计划，并生成新的 DSL。

这就是本文引入 BDI 的原因。

### 5.2 BDI 在 CRF 中的位置：不是第十域，而是横向语义层

BDI 是 Belief–Desire–Intention 的缩写，即信念、欲望/目标、意图。Rao 与 Georgeff 的经典 BDI 架构使用 branching-time possible-worlds 模型形式化意图；在该模型中，possible world 可以被理解为时间树，不同分支表示未来可能的行动路径。Cohen 与 Levesque 的经典论文则强调 intention 与 commitment 的关系，讨论智能体在信念、目标、行动和意图之间的 rational balance，并明确提出智能体何时可以放弃目标。

在 CRF 中，BDI 不应被定义为第十个域。原因很简单：CRF 的域集合讨论的是：

$$
\text{哪些对象空间存在完备表示函数？}
$$

而 BDI 讨论的是：

$$
\text{智能体如何在多个可能未来中选择、维持、修正或放弃目标？}
$$

这两个问题位于不同层级。

CRF 的九域框架已经把 D9 定义为智能体进化域，其函数签名可以概括为：

$$
Agent\times Feedback\to Agent'
$$

D9 处理的是 agent 在反馈中如何改写自身策略、基因组或行为结构。但 BDI 处理的不是 agent 如何进化，而是 agent 如何解释用户意图、承诺某个目标、绑定计划、执行后更新信念，并在必要时重新考虑。因此：

$$
\textbf{D9 = agent self-update domain}
$$

$$
\textbf{BDI = intent semantics and control layer}
$$

BDI 应放在 CRF 派生 DSL 之前，作为自然语言到 DSL 的语义桥：

$$
\text{Natural Language}
\to
\text{BDI Intent Semantics}
\to
\text{Intent IR}
\to
\text{CRF-derived DSL}
\to
\text{Runtime}
$$

这一层的核心职责不是增加新关键词，而是定义系统为什么生成某段 DSL、为什么继续修正、为什么停止、为什么放弃，以及如何判断“用户意图已被满足”。

### 5.3 用户输入不是 DSL，用户输入是关于世界的目标命题

CRF 的基本对象是领域对象 $x\in X_D$。但用户自然语言输入 $u$ 通常不是这样的对象。它更接近一个关于目标世界的模糊描述。

因此，本文将用户输入解释为一个意图语义结构：

$$
\mathcal I_u=(B_u,G_u,I_u,C_u,Q_u)
$$

其中：

- $B_u$：系统根据用户输入、上下文、记忆和当前环境形成的信念；
- $G_u$：用户希望达成的目标或欲望；
- $I_u$：系统选择承诺追求的意图；
- $C_u$：对该意图的承诺策略；
- $Q_u$：支撑该意图成立的背景理由或上下文条件。

进一步地，目标应被写成关于结果世界的命题：

$$
\phi_u\in \Phi
$$

而不是直接写成某个 DSL 片段。

| 用户输入 | 错误解释 | BDI 目标命题 |
| --- | --- | --- |
| 让搜索框短一点 | `pad(-8)` | $shorter(searchBox)\wedge preserve(readability)$ |
| 通知所有逾期客户 | `audience(all)` | $notified(x)\ \forall x: overdue(x)$ |
| 张三必须收到 | `who:"张三"` | $deliveredTo(entity\_name("张三",exact))$ |
| 生成一只像这张图的小狗 | `dog_template()` | $similar(render(object),photo)\wedge preserve(partStructure)$ |
| 让这个物件继续自己演化 | `mutate()` | $improve(agent)\wedge preserve(identity)\wedge bounded(risk)$ |

这一区分非常关键。DSL 是计划语言；BDI 是意图语言。一个 plan 可以失败，但 intention 不应因此自动消失。

### 5.4 BDI 的形式化对象

为了与 CRF 系统兼容，本文采用一个工程化的 BDI 对象模型。

**Belief** 表示系统对当前世界、用户、任务、环境、约束和执行结果的信念：

$$
Bel_a(\psi)
$$

表示 agent $a$ 相信命题 $\psi$ 成立。

在 CRF 系统中，Belief 可以来自用户输入、历史记忆、当前运行时状态、Parser/Evaluator/Validator 的结果、外部工具或感知模块，以及执行反馈。例如：

$$
Bel_a(width(searchBox)=320)
$$

$$
Bel_a(entityName(input)="张三")
$$

$$
Bel_a(parse(l)=valid)
$$

$$
Bel_a(render(l)\not\models shorter(searchBox))
$$

因此，Belief 不应是隐藏的 prompt 上下文，而应是可记录、可修改、可审计的对象。

**Desire / Goal** 表示候选目标集合：

$$
Des_a(\phi_1),Des_a(\phi_2),\dots,Des_a(\phi_n)
$$

但不是所有 desire 都会成为 goal。本文在工程上区分：

$$
Desire = candidate\ preference
$$

$$
Goal = selected\ target\ proposition
$$

**Intention** 是被系统选择并承诺追求的目标命题：

$$
Intend_a(A\Diamond\phi)
$$

其中，$\Diamond\phi$ 表示“最终达到 $\phi$”，$A$ 表示所有被承诺路径上的未来。Intention 与 Goal 的区别在于 commitment。

**Commitment** 定义系统维持意图的条件。一个 single-minded agent 会持续保持某个意图，直到它相信目标已经实现，或者相信不存在任何可能路径可以实现目标。本文采用扩展承诺公式：

$$
Intend_a(A\Diamond\phi_u)
\to
A\Big(
Intend_a(A\Diamond\phi_u)
\ U
(
Bel_a(\phi_u)
\vee
\neg Bel_a(E\Diamond\phi_u)
\vee
Bel_a(\neg q_u)
)
\Big)
$$

其中：

- $\phi_u$：用户目标命题；
- $q_u$：支撑该目标成立的背景理由；
- $Bel_a(\phi_u)$：系统相信目标已经实现；
- $\neg Bel_a(E\Diamond\phi_u)$：系统不再相信存在可达路径实现目标；
- $Bel_a(\neg q_u)$：系统相信支撑该目标的理由已经失效。

这条公式给 CRF 系统提供了一个非常重要的运行原则：

> 计划失败不等于意图失败。只有目标已达成、目标不可达，或目标理由失效，系统才应放弃该意图。

### 5.5 Intent IR：BDI 与 CRF DSL 之间的中间表示

为了让 BDI 能与 CRF 派生 DSL 连接，本文引入 Intent IR。它不是第十个域，也不是最终执行语言，而是自然语言意图到域 DSL 的中间对象。

一个最小 Intent IR 可以写成：

```json
{
  "intent_id": "intent_001",
  "utterance": "让搜索框短一点，但保持可读性",
  "beliefs": [
    { "predicate": "width(searchBox)=320", "confidence": 0.82 },
    { "predicate": "layoutMode=desktop", "confidence": 0.91 }
  ],
  "goal": {
    "predicate": "shorter(searchBox) AND preserve(readability)",
    "success_test": "width_after < width_before AND readability_score >= threshold"
  },
  "background_reason": {
    "predicate": "user_is_editing_current_ui",
    "abandon_if": "current_ui_changed OR user_cancels"
  },
  "constraints": [
    "preserve(layoutConsistency)",
    "preserve(accessibility)",
    "no_horizontal_overflow"
  ],
  "candidate_domains": ["D3"],
  "plan_bindings": [
    { "domain": "D3", "dsl": "input(search) | size(width:280)" },
    { "domain": "D3", "dsl": "sequence(h, gap:8) { input(search) }" }
  ],
  "commitment": "single_minded_with_reason",
  "reconsideration_policy": {
    "on_plan_failure": "rebind_plan",
    "on_goal_unreachable": "ask_user",
    "on_reason_invalid": "drop_intention"
  }
}
```

这个 IR 的关键是，它把三件事分开：

$$
\text{Goal} \ne \text{Plan} \ne \text{DSL}
$$

Goal 是用户想让结果世界满足的命题。Plan 是实现 Goal 的候选策略。DSL 是 Plan 在某个 CRF 域中的可执行表达。

### 5.6 自然语言到 DSL 的新链路

引入 BDI 后，CRF 系统的完整链路应改写为：

$$
U
\xrightarrow{IntentParser}
(B,G,I,C,Q)
\xrightarrow{IntentIR}
\phi_u
\xrightarrow{DomainSelector}
D
\xrightarrow{PlanBinder}
l_D
\xrightarrow{Parser/Evaluator}
r
\xrightarrow{Verifier}
Bel_a(r\models \phi_u)
$$

其中：

- $U$：用户自然语言输入；
- $(B,G,I,C,Q)$：BDI 结构；
- $\phi_u$：目标世界命题；
- $D$：被选择的 CRF 域；
- $l_D$：该域 DSL；
- $r$：执行结果；
- $Verifier$：结果是否满足意图的验证器。

这条链路与旧链路的区别是：

旧链路：

$$
NaturalLanguage\to DSL\to Result
$$

新链路：

$$
NaturalLanguage\to Intent\to GoalProposition\to Plan\to DSL\to Result\to BeliefUpdate
$$

这使系统具备四种能力：

1. **意图保持**：一次 DSL 失败不会直接放弃用户目标；
2. **计划重绑定**：同一目标可以绑定多个 DSL 候选；
3. **执行反馈回写**：结果会更新 Belief；
4. **重新考虑**：系统可判断继续、修正、询问或放弃。

### 5.7 计划绑定：从目标命题到 CRF 域 DSL

BDI 层并不直接执行。它必须通过 Plan Binder 将目标命题绑定到一个或多个 CRF 域。

形式化地：

$$
Bind:\Phi\times \mathcal D_{\mathrm{CRF}}\to \mathcal P(L_D)
$$

其中，$\Phi$ 是目标命题空间，$\mathcal D_{\mathrm{CRF}}$ 是 CRF 域集合，$\mathcal P(L_D)$ 是某域 DSL 程序候选集合。

例如 UI 目标：

$$
\phi=shorter(searchBox)\wedge preserve(readability)
$$

候选绑定：

$$
l_1=input(search)|size(width:280)
$$

$$
l_2=sequence(h,gap:8)\{input(search)\}
$$

如果 $l_1$ 失败，系统应尝试 $l_2$ 或其他候选，而不是放弃 $\phi$。

通知目标：

$$
\phi=\forall x(overdue(x)\to delivered(x,channel=preferred))
$$

候选绑定：

```text
notify(overdue) {
  trigger(payment.overdue)
  audience(filter: overdue)
  channel(preferred)
  fallback(email)
}
```

图片转 3D 目标：

$$
\phi=similar(render(object),photo)\wedge preserve(partStructure)
$$

候选绑定：

```text
object(golden_puppy) {
  part(head) { sphere(...) }
  part(body) { capsule(...) }
  joint(neck, body, head)
}
```

DSL 是计划，渲染是执行，差异评估是 Belief 更新，循环修正是 Reconsideration。

### 5.8 语义保真：从字段约束到意图合同

entity exactness 问题揭示了一个深层原则：完备表示函数保证结构完备，不自动保证语义保真。

本文将语义保真定义为：

$$
SemanticFidelity(U,r)=
\frac{
|\{\phi_i\in Intent(U): r\models \phi_i\}|
}{
|\{\phi_i\in Intent(U)\}|
}
$$

其中，$Intent(U)$ 是从用户输入中抽取的目标命题与约束集合，$r$ 是运行结果。

对于实体名称保真，目标命题可以写作：

$$
preserveExact(entityName("张三"))
$$

这不是普通字段，而是意图合同：

$$
Contract_{entity}:
output.entityName = input.entityName
$$

因此，CRF 系统中的 schema 不应只描述字段类型，还应描述字段在意图中的保真等级。

例如：

```text
entity_name(loose)     // 可同义改写
entity_name(exact)     // 必须逐字保留
entity_name(canonical) // 可归一化到标准实体 ID
entity_name(masked)    // 隐私保护后输出
```

这类标注属于 BDI+Validator 的交界处。它不是某个单域的封闭操作，而是自然语言意图在 CRF 表达中的保真约束。

因此，本文建议把 schema 设计升级为 intent contract 设计：

$$
Schema = Type + Constraint + Fidelity
$$

### 5.9 Reconsideration：执行反馈如何改变意图、计划或信念

BDI 层的核心不只是“生成一个 Intent Object”，而是“在执行中持续管理意图”。

设系统当前持有：

$$
Intend_a(A\Diamond\phi)
$$

并绑定了某个计划：

$$
plan=p
$$

执行后得到结果 $r$。系统通过验证器判断：

$$
r\models \phi
$$

如果成立，则：

$$
Bel_a(\phi)
$$

意图完成。

如果不成立，需要区分三种失败。

**计划失败，但目标仍可达：**

$$
Bel_a(\neg achieved(p,\phi))
\wedge
Bel_a(E\Diamond\phi)
$$

此时系统不应放弃意图，而应重新绑定计划：

$$
rebind(\phi,D)\to p'
$$

**目标不可达：**

$$
\neg Bel_a(E\Diamond\phi)
$$

此时系统应进入用户确认或放弃流程。

**背景理由失效：**

$$
Bel_a(\neg q)
$$

例如用户原本要求“基于这张相机照片生成模型”，但后来发现输入图片不是相机而是收音机；或者用户切换了目标页面，原来的 UI 修改意图不再适用。此时应放弃或重建意图，而不是继续执行旧计划。

### 5.10 意图状态机

为了与 CRF 运行时兼容，本文将 Intention 设计为一个状态机：

$$
Idea
\to
Candidate
\to
Active
\to
Executing
\to
Reviewing
\to
Completed
$$

并允许进入：

$$
Paused,\ Abandoned,\ Failed,\ Superseded
$$

| 状态 | 含义 |
| --- | --- |
| Idea | 用户或系统提出的初始想法 |
| Candidate | 已被解析为候选目标，但尚未承诺 |
| Active | 系统已承诺追求 |
| Executing | 已绑定计划并执行 |
| Reviewing | 正在根据反馈判断是否达成 |
| Completed | 系统相信目标已达成 |
| Paused | 暂停，等待用户或外部条件 |
| Abandoned | 目标不可达或理由失效 |
| Failed | 执行失败且无法恢复 |
| Superseded | 被更高优先级或更新目标替代 |

这个状态机与 CRF 的关系是：

- CRF DSL 只在 Executing 阶段被调用；
- Parser/Evaluator 结果进入 Reviewing；
- Validator 结果更新 Belief；
- Belief 变化触发 Completed、Rebinding、Paused 或 Abandoned。

因此，CRF 不再是孤立的一次性生成器，而是 BDI-controlled runtime 的执行层。

### 5.11 BDI 与九域的关系

BDI 不替代九域，而是协调九域。

一个用户意图可能只落在一个域：

$$
U\to BDI\to D3\to UI\ DSL
$$

也可能跨多个域：

$$
U\to BDI\to D5+D6+D8
$$

例如：

> 当客户逾期超过 48 小时，如果不是 VIP，就通知客户和管理员。

这句话至少涉及：

- D5 状态机：逾期状态如何产生；
- D6 权限/策略：VIP 是否豁免；
- D8 消息通知：谁、何时、通过什么渠道被通知；
- D7 数据验证：客户数据和时间字段是否合法；
- D4 数据变换：筛选逾期客户集合。

BDI 层的任务不是直接执行这些域，而是把用户意图拆成目标命题与约束，然后把它们分配给对应 CRF 域：

$$
\phi_u
=
\phi_{state}
\wedge
\phi_{policy}
\wedge
\phi_{delivery}
\wedge
\phi_{validation}
$$

### 5.12 BDI 对 JiYu 的意义：空间自感知不是视觉循环，而是意图循环

JiYu 图片转 3D 方案中，空间自感知智能体并不是简单的“渲染—比较—调整”视觉循环。它更像一个 BDI 循环：

1. Belief：当前 DSL 生成了一个物件；
2. Goal：该物件应像输入照片；
3. Intention：持续调整直到相似度达标；
4. Plan：修改部件尺寸、位置、材质和关系；
5. Feedback：渲染结果与照片差异；
6. Reconsideration：继续粗调、细调、结构重建或进入静默。

用 BDI 语言重写，就是：

$$
Bel_a(structure(photo)=S)
$$

$$
Goal_a(similar(render(object(S,\theta)),photo))
$$

$$
Intend_a(A\Diamond similarity>\tau)
$$

$$
Plan_a(update(\theta))
$$

$$
Review_a(render_\theta\models \phi)
$$

这能把“空间自感知智能体”从工程描述推进成理论描述：它不是在盲目优化像素，而是在一个明确意图下维持目标、修正计划、更新信念，并在达标后进入 silent 状态。

### 5.13 意图验证指标

引入 BDI 后，CRF 的实验指标也需要扩展。旧版实验已经有 token 压缩、速度提升、解析率、测试通过率等指标。这些指标衡量的是结构与执行层。

意图层还需要新的指标。

**Intent Satisfaction Rate：**

$$
ISR=
\frac{
\#\{tasks:r\models \phi_u\}
}{
\#\{tasks\}
}
$$

**Semantic Fidelity Score：**

$$
SFS=
\frac{
\#\{\phi_i\in Intent(U):r\models \phi_i\}
}{
\#\{\phi_i\in Intent(U)\}
}
$$

**Entity Preservation Rate：**

$$
EPR=
\frac{
\#\{entities:output(entity)=input(entity)\}
}{
\#\{entities\}
}
$$

**Reconsideration Precision：**

$$
RP=
\frac{
\#\{\text{正确触发的 reconsideration}\}
}{
\#\{\text{全部 reconsideration}\}
}
$$

**Plan Rebinding Success：**

$$
PRS=
\frac{
\#\{\text{first plan failed, later plan achieved }\phi\}
}{
\#\{\text{first plan failed}\}
}
$$

这些指标将 CRF 评估从：

$$
\text{DSL 是否能解析}
$$

推进到：

$$
\text{系统是否实现了用户意图}
$$

### 5.14 BDI 层的风险与边界

BDI 会增强 CRF，但也引入新风险。

第一，Belief 抽取可能不可靠。系统可能错误理解用户、错误引用记忆、错误判断当前状态。因此，高影响 Belief 必须带证据链、置信度和用户确认机制。

第二，目标可能过度泛化。用户说“帮我整理下”，系统不能无限扩展成复杂长期项目。

第三，长期意图可能膨胀。一个系统如果不断积累 active intentions，最终会失去可控性。因此，必须限制 active intention 数量，周期性清理低价值意图，并保持 intention state machine 可审计。

第四，隐私与权限风险更高。BDI Runtime 会读取长期记忆、本地文件、上下文和协作信息，因此必须允许用户查看系统引用的数据、删除 belief、关闭数据源，并隔离个人 belief 与共享 belief。

因此，BDI 不应被写成“系统自动理解一切意图”的浪漫叙事。更稳的表述是：

> BDI 提供意图对象化、承诺管理和重新考虑机制；但 belief 抽取、目标建模、权限边界和长期状态治理仍需验证器、用户确认与审计系统支撑。

---

## 6. 四步推导法与八域推导

### 6.1 方法总览：从数学结构到 AI-native DSL

完备表示函数不是普通 DSL 设计方法，而是一套从数学结构出发的发现程序。对任意候选域 $D$，CRF 的推导流程可以压缩为四步：

$$
D
\to
F_D:X_D\to V_D
\to
(B_D,\Omega_D)
\to
L_D
\to
Parser/Evaluator/Validator
$$

**第一步：定义域。** 识别该域的物理或逻辑本质，写出函数签名：

$$
F_D:Input_D\to Output_D
$$

这一步的目标不是命名一个工程模块，而是确认输入类型、输出类型和状态空间。例如，数据变换不是“pandas API”，而是：

$$
F_4:Table\times Op\to Table
$$

状态机不是“状态管理库”，而是：

$$
F_5:State\times Event\to State\times Action[]
$$

三维几何不是“建模软件”，而是：

$$
F_1:\mathbb R^3\to\mathbb R
$$

即空间点到表面的有符号距离场。

**第二步：对接数学定理。** 找到支撑该域完备性的数学理论，抽取其中的基底元素 $B_D$ 和封闭操作 $\Omega_D$。

**第三步：推导关键词。** 将基底元素映射为 DSL 原子关键词，将封闭操作映射为 DSL 运算符关键词：

$$
Keywords(L_D)=Names(B_D)\cup Names(\Omega_D)\cup SyntaxGlue
$$

**第四步：实现并验证。** 每个域都必须至少完成 Parser、Evaluator、测试用例与报告。

由此，CRF 的推导不是纸面定义，而是：

$$
\text{数学定理}
\to
\text{关键词表}
\to
\text{DSL 程序}
\to
\text{AST}
\to
\text{执行结果}
\to
\text{测试验证}
$$

本章聚焦八域主实证；D9 智能体进化作为九域理论扩展，在运行时与跨域章节中讨论。

### 6.2 D1：三维几何

#### 6.2.1 域定义

三维几何域的对象是可渲染、可编辑、可组合的三维形体。CRF 将其表示为空间中任意点到最近表面的有符号距离：

$$
F_1:\mathbb R^3\to\mathbb R
$$

给定点 $p=(x,y,z)$，函数值 $F_1(p)$ 表示点 $p$ 到形体表面的有符号距离：表面外为正，表面内为负，表面上为零。形体本身则由零水平集定义：

$$
Shape=\{p\in\mathbb R^3\mid F_1(p)=0\}
$$

因此，三维几何的原生表示不是 mesh 顶点列表，而是 SDF 函数空间。

#### 6.2.2 数学依据

三维几何域的数学依据是 SDF 空间及其在 CSG 操作下的封闭性。SDF 的关键优势是：形体组合可以通过函数操作完成。例如：

$$
union(d_1,d_2)=\min(d_1,d_2)
$$

$$
intersection(d_1,d_2)=\max(d_1,d_2)
$$

$$
subtract(d_1,d_2)=\max(d_1,-d_2)
$$

因此，SDF 空间中的组合、切割、混合、圆角、重复、扭曲等操作仍然输出 SDF 或近似 SDF。这满足 CRF 的封闭性要求：

$$
\omega(F_1,F_2)\in V_{SDF}
$$

#### 6.2.3 基底与操作

D1 的核心基底是几何原语。当前关键词表包括 7 个原子：

$$
B_1=
\{box,\ sphere,\ cylinder,\ torus,\ capsule,\ cone,\ plane\}
$$

D1 的封闭操作包括 12 个运算符：

$$
\Omega_1=
\{
blend,\ subtract,\ round,\ onion,\ elongate,\ rotate,\ scale,\ mirror,\ twist,\ bend,\ displace,\ repeat
\}
$$

因此，D1 核心关键词数为：

$$
7+12=19
$$

#### 6.2.4 DSL 示例

```text
sphere(0.5)
| blend(0.3, box(0.8, 0.4, 0.6))
| round(0.02)
| rotate(y: 15)
```

这段 DSL 的语义是：创建一个半径 0.5 的球体，将其与一个长方体进行平滑混合，随后做圆角处理并绕 $y$ 轴旋转。它不是在描述 mesh 顶点，也不是在调用外部建模软件，而是在直接构造 SDF 表达式。

#### 6.2.5 CRF 解释

三维几何域很好地展示了 CRF 的基本精神：LLM 不需要输出“如何使用 Blender 建模”的脚本，而应输出形体本身的原生表示。SDF DSL 的每个关键词都对应形体空间中的构造器或封闭操作，Parser 将文本转为 AST，Evaluator 将 AST 转为 SDF 函数，Renderer 再将 SDF 采样、网格化或 raymarch 到可视结果。

该域也是 JiYu 的起点。但从当前论文结构看，D1 在本章只作为八域之一出现；JiYu 的 Layer 4 部件装配、ComponentTree、图片转 3D 和活体资产，将在系统案例章节中展开。

### 6.3 D2：多智能体协作

#### 6.3.1 域定义

多智能体协作域的对象不是单个 agent，也不是 agent 的内部心理状态，而是多个 agent 在任务中的分工、通信、并行、同步和结果聚合。其完备表示函数可写为：

$$
F_2:Task\times Agents\to Result
$$

其中，$Task$ 是待完成任务，$Agents$ 是可参与任务的智能体集合，$Result$ 是协作过程产生的综合结果。

#### 6.3.2 数学依据

D2 的数学依据是 CSP 与 π 演算。CSP 提供了顺序、并行、同步、选择、事件通信等基本并发结构；π 演算进一步提供动态通信通道与进程交互结构。因此，多智能体协作 DSL 的关键词不应来自某个 agent 框架，而应来自并发系统的基础操作。

#### 6.3.3 基底与操作

D2 的原子关键词为 5 个：

$$
B_2=
\{
task,\ gate,\ merge,\ split,\ state
\}
$$

D2 的运算符关键词为 5 个：

$$
\Omega_2=
\{
\to,\ ||,\ ?:,\ *,\ >>
\}
$$

分别对应顺序、并行、条件、循环和管道。总关键词数为：

$$
5+5=10
$$

#### 6.3.4 DSL 示例

```text
task(audit) {
  agent(木) -> analyze
  >> agent(火) -> execute
  >> agent(水) -> evaluate
  >> agent(金) -> synthesize
}
```

这段 DSL 表达一个串联协作过程：木 agent 负责分析，火 agent 执行，水 agent 评估，金 agent 综合。与自然语言描述相比，它更短、更可解析，也更容易进行流程验证。

并行任务可写作：

```text
task(research) {
  split {
    agent(A) -> search(topic: market)
    ||
    agent(B) -> search(topic: technology)
  }
  merge(strategy: summarize)
}
```

#### 6.3.5 CRF 解释

D2 的重要性在于：它把“多 agent 工作流”从自然语言 prompt 变成可解析流程。现有实验使用 200 组任务 × 4 agent，即 800 次 API 调用；DSL 组相对于自然语言组实现 4.72× token 压缩、6.83× 速度提升和 100% 解析率。

这组结果是 CRF 的关键实证之一，因为它证明了：在一个非视觉、非几何、纯流程的计算域中，CRF 派生 DSL 同样能产生显著的 token 经济性和执行稳定性。

### 6.4 D3：用户界面布局

#### 6.4.1 域定义

UI 布局域的对象是二维屏幕区域中的组件分布。它的核心不是 HTML、CSS、React 或 Flutter，而是矩形区域如何被切分、嵌套、叠加和响应状态。

因此，D3 的完备表示函数可以写作：

$$
F_3:Rect\times State\to PartitionTree
$$

其中，$Rect$ 是父级可用区域，$State$ 是界面状态，$PartitionTree$ 是组件布局树。

#### 6.4.2 数学依据

D3 的数学依据是二维欧几里得空间分区拓扑。矩形的分区方式包括一维切分、二维切分和 z 轴叠加；不可约内容类型包括 text、image、input、canvas。

从 CRF 角度看，UI 的本质不是组件库，而是二维区域的递归分区：

$$
Rect\to Rect_1,\dots,Rect_n
$$

每个子区域再绑定内容或交互。只要分区、叠加、边距、对齐、尺寸、滚动、条件显示等操作封闭，布局树就能递归构造任意 UI 结构。

#### 6.4.3 基底与操作

D3 的原子关键词为 7 个：

$$
B_3=
\{
text,\ image,\ input,\ canvas,\ sequence,\ grid,\ layer
\}
$$

其中：

- `sequence` 表示一维切分；
- `grid` 表示二维切分；
- `layer` 表示 z 轴叠加；
- `text`、`image`、`input`、`canvas` 表示四种不可约内容类型。

D3 的运算符关键词为 8 个：

$$
\Omega_3=
\{
pad,\ align,\ scroll,\ size,\ style,\ on,\ when,\ each
\}
$$

总关键词数为：

$$
7+8=15
$$

#### 6.4.4 DSL 示例

```text
sequence(v, gap: 16)
| pad(24) {
  text("Hello") | style(heading)
  input(email)
  input(action, label: "Submit") | style(primary)
}
```

这段 DSL 的语义是：在垂直方向创建一个间距 16 的序列容器，加 24 像素 padding，内部包含标题文本、邮箱输入框和提交动作。

#### 6.4.5 CRF 解释

D3 的关键价值，是把 UI 生成从“写前端代码”改为“生成布局树”。LLM 不需要决定使用 React、Vue、SwiftUI 或 CSS Grid；它只需要输出二维空间分区和组件约束。渲染器可以把同一个 PartitionTree 投影为 Web、移动端、本地界面或 3D 空间面板。

同时，D3 也是 BDI 语义层最容易暴露问题的域。`pad` 反例说明：UI DSL 可以结构完备，但用户意图可能是“视觉宽度变短”，而不是“padding 变小”。因此，D3 的执行结果必须由意图验证器判断：

$$
render(layout)\models \phi_u
$$

而不是只看 DSL 是否解析成功。

### 6.5 D4：数据变换

#### 6.5.1 域定义

数据变换域的对象是表、集合或数据流上的变换。其完备表示函数为：

$$
F_4:Table\times Op\to Table
$$

输入是表和操作，输出仍然是表。这是典型封闭变换域。

#### 6.5.2 数学依据

D4 的数学依据是 Codd 关系代数。Selection $\sigma$、Projection $\pi$、Join $\bowtie$、Union $\cup$、Difference $-$ 构成关系数据的完备操作集。

因此，数据变换 DSL 的关键词不应来自某个数据库或数据框架的 API，而应来自关系代数和数据流处理中的基础操作。

#### 6.5.3 基底与操作

D4 的原子关键词为 3 个：

$$
B_4=
\{
source(type,path),\ sink(type,target),\ literal(data)
\}
$$

D4 的运算符关键词为 17 个：

$$
\Omega_4=
\{
filter,\ select,\ join,\ union,\ derive,\ rename,\ cast,\ drop,\ dedupe,\ sort,\ limit,\ sample,\ group,\ window,\ pivot,\ unpivot,\ fill
\}
$$

总关键词数为：

$$
3+17=20
$$

#### 6.5.4 DSL 示例

```text
source(csv, "sales.csv")
-> filter(region = "华东")
-> join(products, on: sku)
-> group(category, sum: revenue)
-> sort(revenue, desc)
-> sink(table)
```

这段 DSL 描述了一个完整数据流：从 CSV 读取销售数据，筛选华东区域，按 SKU 关联产品表，按品类汇总收入，按收入降序排序，最终输出表。

#### 6.5.5 CRF 解释

D4 是 CRF 最直观的计算域之一，因为它天然满足封闭性：

$$
Table\to Table\to Table
$$

任意合法操作输出仍是表，可继续进入下一步管道。关系代数保证核心变换的表达能力，DSL 管道语法则将这一封闭性直接显式化。

D4 也说明 CRF 不一定追求“关键词越少越好”。20 个关键词看似多于其他域，但它们覆盖了绝大多数数据处理任务，并且每个关键词都直接对应数据变换语义，而非通用代码结构。

### 6.6 D5：状态机

#### 6.6.1 域定义

状态机域描述系统如何在事件驱动下从一个状态转移到另一个状态，并触发动作。其完备表示函数为：

$$
F_5:State\times Event\to State\times Action[]
$$

其中，$State$ 是当前状态，$Event$ 是触发事件，输出是新状态与动作列表。

#### 6.6.2 数学依据

D5 的数学依据是有限状态自动机理论。在软件系统中，许多流程本质上都是有限状态转移：订单从 `pending` 到 `paid`，任务从 `open` 到 `done`，设备从 `idle` 到 `running`，用户从 `anonymous` 到 `authenticated`。

#### 6.6.3 基底与操作

D5 的原子关键词为 5 个：

$$
B_5=
\{
state,\ event,\ action,\ guard,\ context
\}
$$

D5 的运算符关键词为 7 个：

$$
\Omega_5=
\{
on\to,\ if,\ do,\ after,\ enter,\ exit,\ assign
\}
$$

总关键词数为：

$$
5+7=12
$$

#### 6.6.4 DSL 示例

```text
state(pending) {
  on(pay) -> state(paid)
  | if(amount > 0)
  | do(charge_card)
}
```

这段 DSL 表示：当订单处于 `pending` 状态并收到 `pay` 事件时，如果金额大于 0，则执行扣款动作，并转移到 `paid` 状态。

更完整的状态机可以包含 enter/exit action：

```text
state(paid) {
  enter | do(send_receipt)
  on(refund) -> state(refunded)
  | if(can_refund)
  | do(issue_refund)
}
```

#### 6.6.5 CRF 解释

D5 的关键价值，是把系统行为从自由代码中的 if/else 和 callback 中抽离出来，变成可验证的状态图。状态机 DSL 可以检查不可达状态、死循环、缺失事件处理、非法转移、重复 transition 等问题。

同时，D5 与 D6、D8 的关系非常紧密：状态转移前可能需要权限控制，转移后可能触发通知。但它们不应混为一个域，因为函数签名不同：

$$
D_5:State\times Event\to State\times Action[]
$$

$$
D_6:Subject\times Resource\times Action\to Allow|Deny
$$

$$
D_8:Event\times Audience\times Channel\to Delivery
$$

这正体现了类型独立性原则。

### 6.7 D6：权限控制

#### 6.7.1 域定义

权限控制域描述主体是否可以对资源执行某个动作。其完备表示函数为：

$$
F_6:Subject\times Resource\times Action\to Allow|Deny
$$

在更完整的 ABAC 表述中，还应加入环境属性：

$$
F_6:Subject\times Resource\times Action\times Environment\to Decision
$$

其中 $Decision$ 可以是 allow、deny、abstain 或 notApplicable。但为保持 DSL 核心简单，本章采用 allow/deny 二值输出作为基本形式。

#### 6.7.2 数学依据

D6 的理论依据是属性基访问控制 ABAC。从 CRF 角度看，权限控制不是“角色配置文件”，而是一个基于属性和条件的判定函数。只要主体、资源、动作、条件和策略组合足够表达访问规则，就可以构成封闭的权限 DSL。

#### 6.7.3 基底与操作

D6 的原子关键词为 4 个：

$$
B_6=
\{
role,\ resource,\ action,\ condition
\}
$$

D6 的运算符关键词为 6 个：

$$
\Omega_6=
\{
allow,\ deny,\ when,\ inherit,\ scope,\ delegate
\}
$$

总关键词数为：

$$
4+6=10
$$

#### 6.7.4 DSL 示例

```text
role(admin) inherit(mentor) {
  allow(*, *)
  deny(audit_log, delete)
}
```

这段 DSL 表示：`admin` 继承 `mentor` 的权限，默认允许所有资源和动作，但禁止删除审计日志。

更细的 ABAC 风格可以写作：

```text
role(editor) {
  allow(article, update)
  | when(owner == subject.id)
  | scope(project)
}
```

#### 6.7.5 CRF 解释

D6 的优势在于可验证性。通用代码中的权限逻辑通常分散在路由、中间件、数据库查询和 UI 控制中，难以证明一致性。权限 DSL 则可以集中生成策略表，并检查冲突、覆盖、继承环、deny 优先级和作用域泄漏。

D6 也说明 CRF 域不一定都是“生成构造型”。权限控制是判定型域，其输出是 allow/deny。但它仍然可以成为独立域，因为它有独立类型签名和完整策略空间；与“布局验证”不同，权限控制不是某个其他域的终端观察器，而是一个基础系统问题。

### 6.8 D7：数据验证

#### 6.8.1 域定义

数据验证域描述数据是否满足一组规则。其完备表示函数为：

$$
F_7:Data\times Rules\to Valid|Error[]
$$

输入是数据与规则，输出是合法性结果或错误列表。

#### 6.8.2 数学依据

D7 的数学依据是类型论与精炼类型。在 CRF 中，验证不是通用 if 判断，而是数据对象与规则集合之间的类型化关系。基础类型、范围、长度、模式、枚举、唯一性、引用、依赖约束和自定义谓词共同构成验证规则空间。

#### 6.8.3 基底与操作

D7 的原子关键词为 3 个：

$$
B_7=
\{
field(name,type),\ entity(name),\ error(code,message)
\}
$$

D7 的运算符关键词为 9 个：

$$
\Omega_7=
\{
required,\ range,\ length,\ match,\ oneof,\ unique,\ ref,\ depends,\ custom
\}
$$

总关键词数为：

$$
3+9=12
$$

#### 6.8.4 DSL 示例

```text
field(email, string)
| required
| match(email)
| unique(members)
```

这段 DSL 表示：`email` 字段必须存在，类型为字符串，符合 email 格式，并在 members 集合中唯一。

复杂依赖规则可以写作：

```text
entity(order) {
  field(amount, number) | required | range(min: 0)
  field(currency, string) | oneof(CNY, USD, EUR)
  field(invoice_title, string) | depends(type == company)
}
```

#### 6.8.5 CRF 解释

D7 是 CRF 系统中的基础 contract layer。它不只用于表单验证，还可以验证 DSL AST、跨域态射、部件装配、图片转 3D 的结构约束，以及 BDI Intent IR 的字段保真约束。

`entity_name(exact)` 本质上就是 BDI 意图层与 D7 验证层之间的接口。字段不只是类型正确，还必须满足语义保真条件：

$$
output.entityName=input.entityName
$$

因此，D7 在后续运行时中会从“数据验证域”进一步扩展为“结构合同与不变量验证”的核心支撑层。

### 6.9 D8：消息通知

#### 6.9.1 域定义

消息通知域描述某个事件发生后，谁应在什么时间、通过什么渠道、以什么优先级收到什么消息。其完备表示函数为：

$$
F_8:Event\times Audience\times Channel\to Delivery
$$

更完整地，可以写作：

$$
F_8:Event\times Audience\times Channel\times TimePolicy\times Template\to DeliveryPlan
$$

但核心结构仍然是事件、受众、渠道与投递计划。

#### 6.9.2 数学依据

D8 的数学依据是谓词逻辑与线性时序逻辑 LTL/MTL。消息通知不是简单的发送 API，而是带时序约束的事件响应系统。例如：

- 某事件发生后立即通知；
- 48 小时未响应则升级；
- 一小时内最多通知一次；
- 某类消息必须批量发送；
- 首选渠道失败后走 fallback。

这些都是时序逻辑命题。

#### 6.9.3 基底与操作

D8 的原子关键词为 5 个：

$$
B_8=
\{
trigger,\ audience,\ template,\ channel,\ schedule
\}
$$

D8 的运算符关键词为 7 个：

$$
\Omega_8=
\{
when,\ throttle,\ batch,\ escalate,\ fallback,\ priority,\ personalize
\}
$$

总关键词数为：

$$
5+7=12
$$

#### 6.9.4 DSL 示例

```text
notify(overdue) {
  trigger(payment.overdue)
  channel(wechat) | priority(high)
  escalate(after: 48h, to: admin)
}
```

这段 DSL 表示：当支付逾期事件发生时，通过微信高优先级通知，并在 48 小时后升级给管理员。

更完整示例：

```text
notify(invoice_ready) {
  trigger(invoice.created)
  audience(customer.owner)
  template("invoice_ready")
  channel(email)
  fallback(sms)
  throttle(once_per: 24h)
}
```

#### 6.9.5 CRF 解释

D8 的价值在于把通知从“调用发送接口”改为“声明触达逻辑”。通知任务常常失败于时序与受众规则，而不是发送 API 本身。CRF DSL 使系统可以静态检查：

- 是否存在 trigger；
- audience 是否可解析；
- channel 是否可用；
- throttle 是否与 priority 冲突；
- escalate 是否有终止条件；
- fallback 是否形成循环。

D8 也是 BDI 与 CRF 的典型交汇点。用户说“张三必须收到”，其意图不是简单填入某个 `audience` 字段，而是一个必须验证的投递命题：

$$
deliveredTo(entity\_name("张三", exact))
$$

因此，D8 的执行结果应回写 Belief：

$$
Bel_a(delivered(\text{张三}))
$$

或：

$$
Bel_a(\neg delivered(\text{张三}))
$$

并由 BDI 层决定是否重试、升级或询问用户。

### 6.10 八域总表

| 域 | 函数签名 | 原子数 | 运算符数 | 总关键词 |
| --- | --- | ---: | ---: | ---: |
| D1 三维几何 | $\mathbb R^3\to\mathbb R$ | 7 | 12 | 19 |
| D2 多智能体协作 | $Task\times Agents\to Result$ | 5 | 5 | 10 |
| D3 UI 布局 | $Rect\times State\to PartitionTree$ | 7 | 8 | 15 |
| D4 数据变换 | $Table\times Op\to Table$ | 3 | 17 | 20 |
| D5 状态机 | $State\times Event\to State\times Action[]$ | 5 | 7 | 12 |
| D6 权限控制 | $Subject\times Resource\times Action\to Allow/Deny$ | 4 | 6 | 10 |
| D7 数据验证 | $Data\times Rules\to Valid/Error[]$ | 3 | 9 | 12 |
| D8 消息通知 | $Event\times Audience\times Channel\to Delivery$ | 5 | 7 | 12 |
| **合计** | — | **39** | **71** | **110** |

八域共产出 110 个关键词，平均每域 13.75 个，并将八域的数学依据分别归于 SDF/CSG、CSP/π 演算、二维欧几里得分区拓扑、关系代数、有限状态自动机、ABAC、类型论、谓词逻辑 + LTL/MTL。

### 6.11 跨域元语法同构

八域的一个关键发现，是它们不仅在“都有关键词”这一层相似，而且在元语法层面存在同构。

八个域共享五种结构模式：管道、嵌套、参数、引用和条件。管道和参数覆盖 8/8 域，嵌套覆盖 7/8 域，引用覆盖 6/8 域，条件覆盖 7/8 域。一个基础 Parser 框架可服务全部八域，只需替换关键词表。

| 元语法结构 | 作用 | 示例 |
| --- | --- | --- |
| 管道 | 表达封闭操作串联 | `source(...) -> filter(...) -> group(...)` |
| 嵌套 | 表达层级结构 | `state(pending) { ... }` |
| 参数 | 表达构造器配置 | `sphere(r:0.5)` |
| 引用 | 表达对象间关系 | `join(products, on: sku)` |
| 条件 | 表达守卫与约束 | `if(amount > 0)` |

这说明 CRF 不只是“八个领域各自有 DSL”，而是存在一个更高层的统一语法骨架：

$$
L_D = MetaSyntax + Keywords_D
$$

因此，CRF 的工程实现可以采用“共享解析器 + 域关键词表 + 域 evaluator”的架构：

```text
Universal Parser
  + Domain Keyword Table
  + Domain Type Rules
  + Domain Evaluator
  + Domain Validator
```

### 6.12 从八域推导看 CRF 的压缩机制

八域推导揭示了 CRF token 压缩的来源。它不是单纯“语法短”，而是来自三个结构性机制。

第一，**选择空间压缩**。通用代码必须在大量库、类、函数、变量和控制流之间选择；CRF DSL 只在每域 10—20 个核心关键词中选择。

第二，**样板代码消除**。CRF DSL 不需要导入库、声明类、写循环、处理运行环境，只表达目标对象本身。

第三，**封闭操作管道化**。因为每个操作输出仍属于同一域类型，LLM 可以用管道稳定串联操作，而不必临时发明中间变量。D4 的 `Table -> Table`、D5 的 `State -> State`、D1 的 `SDF -> SDF` 都属于这种结构。

因此，CRF 压缩比不是 prompt 技巧，而是域语言的数学结构结果。

---

## 7. 实验设计与结果

### 7.1 本章目标：验证 CRF 的三类主张

理论成立仍需实验回答三个问题。

第一，**可执行性问题**：

$$
\text{CRF 推导出的 DSL 是否真的能被 Parser 解析、Evaluator 执行、Runtime 渲染或求值？}
$$

第二，**经济性问题**：

$$
\text{相对于自然语言或通用代码路径，CRF DSL 是否显著降低 token、延迟和无效输出？}
$$

第三，**跨域复现问题**：

$$
\text{同一四步推导法是否能跨多个计算域复用，而不是只在单个 demo 上成立？}
$$

现有验证材料给出了三类独立证据：第一类是引擎实现验证，包括 3D 几何引擎 v2.2 与 UI 引擎 v0.3；第二类是多智能体协作对照实验，包含 200 组任务、4 个智能体、共 800 次 API 调用；第三类是五个新增计算域的自动化测试，共 50 个测试用例、183+ 个断言，全部通过，且没有新增关键词需求。

本章要证明的是：

> CRF 推导出的 DSL 在八个已验证计算域中，具备可解析性、可执行性、关键词经济性和跨域复用性。

### 7.2 证据层级

本文将 CRF 的证据分为三层。

**第一层：运行时实现验证。** 运行时实现验证回答：

$$
L_D\to parse\to AST\to eval/render
$$

这条链是否真实存在。该层主要覆盖 D1 三维几何与 D3 UI 布局。

**第二层：对照实验验证。** 对照实验回答：

$$
\text{CRF DSL 是否比自然语言/通用描述更经济、更稳定？}
$$

该层主要覆盖 D2 多智能体协作：200 组任务，每组 4 个 agent，共 800 次 API 调用。结果显示，DSL 组实现 4.72× token 压缩、6.83× 速度提升和 100% 解析率。

**第三层：自动化测试验证。** 自动化测试回答：

$$
\text{同一 CRF 推导法是否能快速复制到更多域？}
$$

该层主要覆盖 D4 到 D8：数据变换、状态机、权限控制、数据验证、消息通知。五域批量验证要求每个域采用完全一致的结构：定义 DSL 语法、写 Parser、写 Evaluator、跑测试用例、输出验证报告。

### 7.3 实验指标

**Token 压缩比：**

$$
TCR=
\frac{
Tokens_{\text{baseline}}
}{
Tokens_{\text{CRF}}
}
$$

**延迟加速比：**

$$
LSR=
\frac{
Latency_{\text{baseline}}
}{
Latency_{\text{CRF}}
}
$$

**解析成功率：**

$$
PSR=
\frac{
\#\{l\in L_D:parse(l)\neq error\}
}{
\#\{l\in L_D\}
}
$$

**执行成功率：**

$$
ESR=
\frac{
\#\{AST:eval(AST)\neq error\}
}{
\#\{AST\}
}
$$

**测试通过率：**

$$
TPR=
\frac{
\#\{passed\ tests\}
}{
\#\{total\ tests\}
}
$$

**语义保真指标：**

$$
SFS=
\frac{
\#\{\phi_i\in Intent(U):r\models \phi_i\}
}{
\#\{\phi_i\in Intent(U)\}
}
$$

现有八域主实验主要验证结构完备、可执行性与 token 经济性；意图保真指标目前更多是理论升级后的未来实验方向。

### 7.4 实验一：D1 三维几何引擎验证

D1 实验验证：

$$
L_1\to AST\to SDF\to RenderedShape
$$

是否成立。也就是说，SDF DSL 是否能够被解析为几何表达式，并由 JiYu 几何引擎渲染为可见三维形体。

D1 的核心关键词包括 7 个原语和 12 个操作符：

$$
B_1=
\{box,sphere,cylinder,torus,capsule,cone,plane\}
$$

$$
\Omega_1=
\{blend,subtract,round,onion,elongate,rotate,scale,mirror,twist,bend,displace,repeat\}
$$

D1 的验证方式是引擎实现验证，而不是纯文本测试。流程为：

$$
DSL
\to
Parser
\to
SDF\ AST
\to
SDF\ Function
\to
Mesh/Raymarch
\to
Rendered\ Object
$$

该验证确认三点：

1. DSL 能被解析为几何 AST；
2. AST 能被解释为 SDF 函数；
3. SDF 函数能进入渲染管线并生成形体。

从 CRF 角度看，D1 的价值在于证明：

$$
\text{数学表示空间}
\to
\text{AI-native DSL}
\to
\text{视觉运行时}
$$

这条链是可执行的。

但 D1 也暴露出一个边界：Layer 1-3 可以生成丰富的抽象几何体，却不能自然表达由多个语义部件组成的复杂物件。后者属于 JiYu 案例研究中的 Layer 4 问题。

### 7.5 实验二：D3 UI 布局引擎验证

D3 实验验证：

$$
L_3\to AST\to PartitionTree\to RenderedUI
$$

是否成立。UI 布局域的核心目标是让 LLM 不再输出 HTML、CSS、React 或 Flutter，而是输出二维空间分区结构。

D3 的核心关键词为 15 个：

$$
B_3=
\{text,image,input,canvas,sequence,grid,layer\}
$$

$$
\Omega_3=
\{pad,align,scroll,size,style,on,when,each\}
$$

D3 的验证流程为：

$$
DSL
\to
Parser
\to
LayoutAST
\to
PartitionTree
\to
Renderer
\to
UI
$$

该流程验证：

1. DSL 语法可解析；
2. 布局树可构造；
3. 渲染器可根据布局树生成界面；
4. 关键词集合足以表达常见 UI 结构。

D3 的实验意义在于证明，UI 生成可以被还原为二维分区拓扑，而不必让 LLM 直接生成通用前端代码。

但 D3 同时也是“数学完备不等于意图完备”的典型例子。`pad` 操作在结构上合法，但用户说“让搜索框短一点”时，真实目标可能不是减小 padding，而是改变视觉宽度并保持可读性。因此，D3 的实验结果只能证明 UI DSL 的解析和渲染链路成立，不能单独证明自然语言意图已经被保真映射。

### 7.6 实验三：D2 多智能体协作对照实验

D2 实验是本文最重要的量化对照实验。它验证：

$$
\text{CRF DSL}
\quad
vs.
\quad
\text{Natural Language Baseline}
$$

在 token 成本、执行延迟和解析稳定性上的差异。

实验包含：

$$
200\ groups\times 4\ agents=800\ API\ calls
$$

每组任务由多个智能体协作完成。baseline 组使用自然语言描述协作流程；DSL 组使用由 CRF 推导出的多智能体协作 DSL 表达任务分工、顺序、并行、合并和状态。

结果为：

$$
TCR=4.72
$$

$$
LSR=6.83
$$

$$
PSR=100\%
$$

即 DSL 组相对于自然语言组实现 4.72× token 压缩、6.83× 速度提升和 100% 解析率。

D2 的结果说明，CRF 的 token 优势不只存在于几何或视觉域，也存在于纯流程、纯协作域。多智能体协作天然包含大量结构信息：谁先做、谁并行做、谁等待谁、谁合并结果、条件失败时走哪条路径、中间状态如何传递。自然语言表达这些结构时，通常需要大量解释性文本。CRF DSL 则直接使用并发结构。

但 D2 实验也暴露了语义保真问题。DSL 组在 token 和速度上更优，但如果 schema 没有对实体名做 exact 约束，实体名称保真会下降。这个问题不否定 CRF 的结构优势，而说明必须在 CRF 之上加入 BDI 与 intent contract，用 `entity_name(exact)` 等机制保护关键语义。

因此，D2 实验的正确结论是：

> CRF DSL 显著提升结构表达效率和可解析性；语义保真需要额外的意图层与验证层。

### 7.7 实验四：D4—D8 五新域自动化测试

D4—D8 实验验证同一 CRF 推导法是否能跨更多计算域复制。

五个域分别为：

$$
D_4:\text{数据变换}
$$

$$
D_5:\text{状态机}
$$

$$
D_6:\text{权限控制}
$$

$$
D_7:\text{数据验证}
$$

$$
D_8:\text{消息通知}
$$

五域批量验证任务要求每个域采用完全一致的工程结构：

```text
domain-name/
├── parser.js
├── evaluator.js
├── tests.js
├── demo.html
└── report.md
```

其中：

- `parser.js`：Tokenizer + Parser → AST；
- `evaluator.js`：AST → 执行结果或渲染输出；
- `tests.js`：10 个测试用例；
- `demo.html`：可交互 demo；
- `report.md`：验证报告。

Parser 的核心逻辑在所有域之间共享，包括管道操作符 `->` 或 `|`、花括号 `{}`、圆括号 `()`、`key:value` 命名参数、`//` 注释和双引号字符串。

每个域 10 个测试用例：

$$
5\ domains\times 10\ tests=50\ tests
$$

五个新增域共 50 个测试用例、183+ 个断言，全部通过，且零新关键词需求。

### 7.8 五新域测试结果汇总

| 域 | 测试对象 | 测试用例 | 断言结果 | 新关键词需求 |
| --- | --- | ---: | --- | ---: |
| D4 数据变换 | Table → Table 管道 | 10 | 通过 | 0 |
| D5 状态机 | State/Event 转移 | 10 | 通过 | 0 |
| D6 权限控制 | Policy decision | 10 | 通过 | 0 |
| D7 数据验证 | Rules → Valid/Error | 10 | 通过 | 0 |
| D8 消息通知 | Event → DeliveryPlan | 10 | 通过 | 0 |
| **合计** | — | **50** | **183+ 断言通过** | **0** |

该结果说明，D4—D8 的关键词集合不仅能被理论上列出，也能通过统一 parser/evaluator/test 架构运行。

“零新关键词需求”尤其重要。它意味着在测试集中，没有出现必须新增核心关键词才能表达的任务。这不能证明关键词集绝对最小，也不能证明覆盖所有未来任务，但能支持一个较稳结论：

> 由 CRF 推导出的核心关键词集，在当前测试集上具有充分性。

### 7.9 八域实验总览

| 域 | 验证方式 | 主要结果 |
| --- | --- | --- |
| D1 三维几何 | 引擎实现 | SDF DSL 进入 JiYu 3D 引擎 v2.2 |
| D2 多智能体协作 | 对照实验 | 4.72× token 压缩，6.83× 速度提升，100% 解析率 |
| D3 UI 布局 | 引擎实现 | Parser + Renderer v0.3，15 关键词覆盖 UI 模式 |
| D4 数据变换 | 自动化测试 | 10 测试通过 |
| D5 状态机 | 自动化测试 | 10 测试通过 |
| D6 权限控制 | 自动化测试 | 10 测试通过 |
| D7 数据验证 | 自动化测试 | 10 测试通过 |
| D8 消息通知 | 自动化测试 | 10 测试通过 |

八域总结果可以概括为：八个计算域共产出 110 个关键词，平均每域 13.75 个；实验验证包括 3D/UI 引擎实现、多智能体对照实验和五新域自动化测试三种独立方式。

因此，八域实验支持如下命题：

$$
\text{CRF-derived DSLs are executable, compact, and reusable across domains.}
$$

### 7.10 关键词经济性分析

八域关键词总量为：

$$
110
$$

平均每域：

$$
\frac{110}{8}=13.75
$$

从语言设计角度看，这个数量有三个意义。

第一，**足够小**。每域约 10—20 个关键词，显著低于通用编程语言、库 API 和大型工具调用表面的选择空间。

第二，**足够密**。每个关键词直接对应域内基底或封闭操作，不是通用语法胶水。例如 `filter`、`join`、`transition`、`allow`、`notify` 都携带高密度领域语义。

第三，**足够可解析**。因为关键词集合小且类型明确，Parser 可提前知道合法结构，Validator 可检查非法组合。

因此，CRF 的 token 压缩机制来自：

$$
\text{low vocabulary entropy}
+
\text{high semantic density}
+
\text{closed operation pipelines}
$$

而不是来自简单缩写。

### 7.11 平均压缩比与异常值处理

旧版草稿记录平均压缩比为 4.75×，且排除了三维几何约 120× 的异常值。

这个处理是合理的。D1 三维几何的 baseline 可能是 mesh 顶点、Blender 脚本或复杂工具管线，而 SDF DSL 只需少量函数和参数即可表达形体，因此压缩比可能极高。但如果把 D1 的 120× 纳入平均值，会夸大 CRF 在一般计算域中的压缩效果。

因此，本文建议正文中采用两种统计：

$$
Compression_{\text{typical}}\approx 4.75\times
$$

$$
Compression_{D1}\approx 120\times\quad \text{as outlier}
$$

这使结果更可信。CRF 的主张不需要依赖极端异常值；即使排除 D1，平均压缩比仍有显著优势。

### 7.12 解析率与运行时正确性的区别

D2 的 100% 解析率是强结果，但需要明确其含义：

$$
parse(l)\neq error
$$

并不等于：

$$
eval(parse(l))\models Intent(U)
$$

解析率证明的是语法稳定性，不是意图满足。五新域测试中的 183+ 断言通过，则进一步证明了 Evaluator 在测试集内的执行正确性。

仍需区分四层：

| 层级 | 指标 | 当前证据 |
| --- | --- | --- |
| 语法层 | Parse Success Rate | D2 100% 解析率 |
| 执行层 | Evaluator/Test Pass | 五新域 50/50 测试、183+ 断言 |
| 运行时层 | Renderer/Engine Success | D1、D3 引擎验证 |
| 意图层 | Semantic Fidelity | 已发现问题，需 BDI 层补足 |

这一区分能避免过度宣称。CRF 当前主实验证明了前三层；第四层是 BDI 意图语义层要解决的未来实验方向。

### 7.13 实验边界与有效性威胁

五新域每域 10 个测试用例，共 50 个测试。这个规模足以证明 parser/evaluator 原型可运行，但不足以覆盖所有边界情况。未来应扩展为每域 100—1000 个测试，并加入自动生成的 property-based tests。

token 压缩比依赖 baseline。如果 baseline 是冗长自然语言，CRF 压缩比会更高；如果 baseline 是成熟 DSL 或高度压缩 JSON，压缩比可能降低。因此，未来应设置多组 baseline：自然语言、通用代码、JSON Schema、传统 DSL、CRF DSL。

D1 与 D3 的引擎验证证明系统能跑，但不能单独证明域理论穷尽。理论完备仍依赖前文数学论证。

解析成功也不等于运行效果正确。JiYu 后续案例中，DSL 已被解析，20 部件 19 关节全部识别，但渲染结果仍可能严重失真，问题集中在高度、座舱、轮子、轴向映射、材质高光等 M3→M4 层面。

CRF 的三条件保证表达空间，不保证自然语言理解。引入 BDI，是为了防止把意图理解误算为 CRF 的自动结果。

---

## 8. 从 DSL 到运行时：D×L×M 与验证器理论

### 8.1 为什么 CRF 不能停留在 DSL 推导

DSL 推导本身并不等于系统正确运行。一个 CRF DSL 至少要经历四个阶段：

$$
\text{数学结构}
\to
\text{DSL 语法}
\to
\text{实例参数}
\to
\text{物理或系统执行}
$$

任何一个阶段都可能出错。

例如，三维几何域的 SDF 原语与操作符可以在数学上成立；`object/part/joint` 语法也可以正确表达复杂部件；Parser 甚至可以成功识别所有部件和关节。但最终渲染仍可能失败。JiYu 肌肉车案例正是这种情况：DSL 已被引擎解析，20 个部件、19 个关节全部识别，但渲染结果仍严重失真，问题包括整体过扁、座舱几乎不可见、轮子过小、车灯位置偏移、材质缺少车漆高光等。

这说明：

$$
\text{Parse success} \ne \text{Runtime correctness}
$$

同样：

$$
\text{Mathematical completeness} \ne \text{System correctness}
$$

因此，CRF 必须从“DSL 推导理论”进一步扩展为“可验证运行时理论”。

### 8.2 CRF 运行时对象

单域 CRF 的理论对象为：

$$
\mathfrak C_D=
(X_D,V_D,\sim_D,F_D,B_D,\Omega_D,T_D,L_D,parse,\llbracket\cdot\rrbracket_D,eval)
$$

进入真实系统后，还必须加入运行时、验证器和不变量。因此，本文将 CRF 运行时对象定义为：

$$
\mathcal R_D=
(
V_D,
B_D,
\Omega_D,
L_D,
\llbracket\cdot\rrbracket_D,
P_D,
E_D,
R_D,
\mathcal I_D,
\mathcal V_D
)
$$

其中：

- $V_D$：领域表示空间；
- $B_D$：基底构造器；
- $\Omega_D$：封闭操作；
- $L_D$：领域 DSL；
- $\llbracket\cdot\rrbracket_D$：数学语义解释；
- $P_D:L_D\to AST_D$：Parser；
- $E_D:AST_D\to Instance_D$：Evaluator 或实例化器；
- $R_D:Instance_D\to Output_D$：运行时、渲染器、执行器或求值器；
- $\mathcal I_D$：不变量集合；
- $\mathcal V_D$：验证器集合。

因此，一个 DSL 程序 $l\in L_D$ 的完整执行链为：

$$
l
\xrightarrow{P_D}
AST_D
\xrightarrow{E_D}
Instance_D
\xrightarrow{R_D}
Output_D
\xrightarrow{\mathcal V_D}
Pass/Fail
$$

运行时正确性不再只是：

$$
eval(parse(l))=\llbracket parse(l)\rrbracket_D
$$

而是：

$$
\mathcal V_D(R_D(E_D(P_D(l))))=\top
$$

并且在关键场景中，还要满足意图命题：

$$
R_D(E_D(P_D(l)))\models \phi_u
$$

### 8.3 D×L×M 三轴框架

JiYu 冷启动简报将 CRF 系统组织为三轴结构：Domain、Layer、Manifestation。本文将其形式化为：

$$
\mathcal S = D \times L \times M
$$

其中：

$$
D=\{D_1,\dots,D_9\}
$$

表示 CRF 的九个领域；

$$
L=\{L_1,L_2,L_3,L_4\}
$$

表示每个领域内部从原子到组装的构造层；

$$
M=\{M_1,M_2,M_3,M_4\}
$$

表示从理论到执行的表现层。

因此，当前系统地图为：

$$
9\times 4\times 4 = 144
$$

个坐标格。

每一个系统能力都可以定位为：

$$
(D_i,L_j,M_k)
$$

例如：

- D1.L1.M1：几何原语的数学定义；
- D1.L1.M2：几何原语的 DSL 语法；
- D1.L1.M3：某个 `sphere(r:0.45)` 实例；
- D1.L1.M4：该球体在 Three.js / SDF 引擎中的渲染结果；
- D1.L4.M2：`object/part/joint` 的语法定义；
- D1.L4.M3：Braun 相机的 20 部件实例；
- D1.L4.M4：Braun 相机最终渲染物件。

这个坐标系的关键价值是：它让“系统哪里错了”变成可定位问题，而不是笼统地说“CRF 不工作”或“JiYu 渲染错了”。

### 8.4 Domain 轴：从单域 DSL 到多域运行时

D 轴表示能力域。本文采用九域框架：

$$
D=
\{
D_1,D_2,D_3,D_4,D_5,D_6,D_7,D_8,D_9
\}
$$

分别为三维几何、多智能体协作、UI 布局、数据变换、状态机、权限控制、数据验证、消息通知和智能体进化。

每个域都有自己的 $F_D$、$B_D$、$\Omega_D$、$L_D$ 和 runtime。但在系统中，它们不会孤立存在。例如：

- UI 点击触发 D5 状态机；
- 状态转移前调用 D6 权限控制；
- 输入数据先经过 D7 验证；
- 状态变化后触发 D8 消息通知；
- 空间物件通过 D1 渲染；
- 多个 agent 的任务由 D2 协作；
- agent 或物件基因组由 D9 进化更新。

因此，D 轴解决的是：

$$
\text{当前系统行为属于哪个 CRF 域？}
$$

而不是：

$$
\text{当前工程模块叫什么名字？}
$$

### 8.5 Layer 轴：从原语到组装的 carrier tower

L 轴表示构造层。它回答的问题是：

$$
\text{当前对象处于该领域内部的哪个构造粒度？}
$$

本文采用四层：

| 层级 | 名称 | 含义 |
| --- | --- | --- |
| L1 | 原语层 | 最小不可约构造器 |
| L2 | 操作层 | 作用于原语或对象的封闭操作 |
| L3 | 模板层 | 常用组合模式、宏、预设 |
| L4 | 组装层 | 多部件、多关系、多约束的结构化对象 |

JiYu 几何库规格已经明确采用三层结构：Layer 1 是 7 个 SDF 原语，Layer 2 是 12 个变换/组合/变形操作符，Layer 3 是 15 个预组合复合几何模板。后续部件装配文档进一步指出，仅有 Layer 1-3 会让所有形态停留在“一个连续几何体”的变形，无法生成由底座、齿轮、盖子、摇柄等独立部件构成的音乐盒；因此需要 Layer 4 的 `object/part/joint` 组装层。

于是，D1 几何域的 L 轴可以写成：

$$
L_1:\text{sphere, box, cylinder, torus, capsule, cone, plane}
$$

$$
L_2:\text{blend, subtract, round, twist, bend, repeat,\dots}
$$

$$
L_3:\text{camera body, tree crown, gear, button,\dots}
$$

$$
L_4:\text{object/part/joint/component tree}
$$

这不仅适用于 D1。其他域也有类似层次。

| 域 | L1 原语 | L2 操作 | L3 模板 | L4 组装 |
| --- | --- | --- | --- | --- |
| D3 UI | text/input/image/canvas | pad/align/size | form/card/dashboard | page/app flow |
| D4 数据 | source/literal | filter/join/group | ETL recipe | data pipeline |
| D5 状态机 | state/event/action | transition/guard | approval flow | app lifecycle |
| D6 权限 | role/resource/action | allow/deny/scope | policy template | org policy graph |
| D8 通知 | trigger/audience/channel | throttle/escalate | reminder flow | campaign system |
| D9 进化 | genome/action/reward | mutate/update/select | species strategy | ecosystem |

因此，L 轴可以看作每个域内部的 carrier tower：

$$
L_1\to L_2\to L_3\to L_4
$$

它把“单个原语的完备表示”扩展到“结构化对象的完备表示”。

### 8.6 Manifestation 轴：从公理到物理执行

M 轴回答的问题是：

$$
\text{当前对象处于理论、语法、实例还是执行层？}
$$

本文采用四层：

| 层级 | 名称 | 含义 |
| --- | --- | --- |
| M1 | 公理层 | 数学定义、完备性定理、基底、封闭操作 |
| M2 | 语法层 | DSL 关键词、语法、类型规则、AST schema |
| M3 | 实例层 | 具体 DSL 程序、参数、对象实例、配置 |
| M4 | 物理执行层 | 渲染、运行、求值、消息发送、权限判定等实际输出 |

例如，D1.L4 的四个 M 层分别是：

$$
D1.L4.M1:\text{部件装配作为几何结构的理论}
$$

$$
D1.L4.M2:\text{object/part/joint DSL 语法}
$$

$$
D1.L4.M3:\text{Braun 相机或金毛小狗的具体 DSL}
$$

$$
D1.L4.M4:\text{最终渲染出的 3D 物件}
$$

M 轴不是事后总结，而是工程诊断中的定位工具。

### 8.7 正确性传递：M1→M2→M3→M4

CRF 运行时的核心问题是：数学正确性如何传到物理执行结果？

我们可以把 M 轴上的翻译链写为：

$$
M_1
\xrightarrow{\tau_{12}}
M_2
\xrightarrow{\tau_{23}}
M_3
\xrightarrow{\tau_{34}}
M_4
$$

其中：

- $\tau_{12}$：从数学公理到 DSL 语法；
- $\tau_{23}$：从 DSL 语法到具体实例；
- $\tau_{34}$：从实例到物理执行。

每一步都必须保持不变量。

设某个域的核心不变量集合为：

$$
\mathcal I_D=\{I_1,I_2,\dots,I_n\}
$$

那么正确性传递要求：

$$
I(M_1)\Rightarrow I(M_2)
$$

$$
I(M_2)\Rightarrow I(M_3)
$$

$$
I(M_3)\Rightarrow I(M_4)
$$

或者更严格地说：

$$
\forall i,\quad \tau_{i,i+1}\ \text{preserves}\ \mathcal I_D
$$

如果 M4 输出错误，并不一定说明 M1 理论错误。错误可能出现在任意翻译边界。

### 8.8 翻译边界错误分类

根据 M 轴，可以把 CRF 系统错误分为三类。

**M1→M2 错误：理论到语法的失真。** 典型表现包括缺少必要基底、缺少封闭操作、关键词与数学操作不一一对应、类型规则不完整、DSL 表达不了数学上可表达的对象。例如，早期 D1 只有原语、操作符和模板，缺少 object/part/joint，因此无法表达“由多个独立部件组装的物件”。这不是渲染器问题，而是 D1.L4.M2 的语法缺口。

**M2→M3 错误：语法到实例的失真。** 典型表现包括参数不合理、相对尺寸缺失、约束没有绑定、部件引用错误、joint 连接错误、组件树缺失、LLM 生成了语法合法但语义不合理的实例。例如，Braun 相机 DSL 可能在语法上完整，但如果每个 part 的尺寸、位置和比例都需要手动计算，LLM 很容易产生错误参数。

**M3→M4 错误：实例到物理执行的失真。** 典型表现包括坐标轴映射错误、SDF 到 mesh 采样错误、材质参数映射错误、灯光与相机导致视觉失真、部件 pivot 错误、爆炸视图部件飘散、渲染与 DSL 语义不一致。

这就是 D×L×M 框架的诊断价值：

$$
\text{不要把 M4 的 bug 误判为 M1 的理论失败。}
$$

### 8.9 验证器理论：从测试到 contract layer

进入运行时后，验证器不能只停留在 unit test。它应成为 CRF 的 contract layer。

本文将验证器定义为：

$$
\mathcal V_D:Instance_D\times Output_D\times \mathcal I_D\to \{\top,\bot,Report\}
$$

其中，$\mathcal I_D$ 是不变量集合。

验证器可分为六类。

**语法验证器**检查 DSL 是否符合语法：

$$
P_D(l)\neq error
$$

**类型验证器**检查 AST 中每个操作是否作用于合法类型：

$$
\omega:V_{\tau_1}\times\cdots\times V_{\tau_k}\to V_{\tau_o}
$$

**结构验证器**检查对象内部结构是否合理。例如 D1.L4 中，part 是否有唯一 ID，joint 是否引用存在的 part，是否存在孤立部件，是否存在循环依赖，组件树是否连通，parent-child 关系是否清晰。

**几何验证器**检查物理空间关系是否合理，例如部件是否悬浮、是否过度重叠、左右对称是否保持、比例是否合理、轴向是否一致、bounding box 是否符合预期。

**执行验证器**检查 runtime 结果是否满足执行约束，例如状态机是否产生合法状态、权限策略是否无冲突、通知是否投递、数据变换是否输出正确表、UI 是否无溢出、渲染结果是否可见。

**意图验证器**检查结果是否满足目标命题：

$$
Output\models \phi_u
$$

例如：

$$
render(object)\models similarTo(photo)
$$

$$
deliveryResult\models deliveredTo("张三")
$$

$$
layoutResult\models shorter(searchBox)
$$

意图验证器是 BDI 与 CRF Runtime 的连接点。

### 8.10 不变量集合 $\mathcal I_D$

每个域都应定义自己的不变量集合：

$$
\mathcal I_D=\{I_1,\dots,I_n\}
$$

例如，D1 几何域的不变量可包括：

$$
I_{connectivity}: \text{object graph is connected}
$$

$$
I_{scale}: \text{part proportions within valid range}
$$

$$
I_{joint}: \text{all joints reference valid parts}
$$

$$
I_{symmetry}: \text{symmetric parts preserve mirrored relation}
$$

$$
I_{material}: \text{material parameters within physical bounds}
$$

D5 状态机域的不变量可包括所有状态可达、同一 event/guard 下无冲突转移、终止状态定义正确。D6 权限域的不变量可包括 deny 优先级、scope 不泄漏、role inheritance graph 无环。D8 通知域的不变量可包括 audience 可解析、fallback chain 终止、throttle 不违反限流。

因此，验证器不是每个 demo 临时写的测试，而是 CRF 域对象的一部分。

### 8.11 D7 的升级：从数据验证域到跨域 contract layer

D7 在九域框架中是数据验证域：

$$
F_7:Data\times Rules\to Valid|Error[]
$$

但在运行时理论中，D7 具有第二重角色：它是所有域的 contract layer。

这并不意味着 D7 吞并其他域。D7 仍然是一个独立域；但它的验证机制可以被其他域调用。例如：

$$
V_{D1}:ObjectDSL\to Valid|Error[]
$$

$$
V_{D3}:LayoutAST\to Valid|Error[]
$$

$$
V_{D5}:StateMachine\to Valid|Error[]
$$

$$
V_{Intent}:IntentIR\to Valid|Error[]
$$

因此，D7 在系统中承担横向职能：

$$
D7 = \text{validator provider}
$$

在图片转 3D、部件装配和 JiYu 活体资产中，D7 应被前置为硬门禁，而不是渲染后补救工具。任何 object DSL 在进入 renderer 前，都应先通过：

$$
\mathcal V_{structure}
\wedge
\mathcal V_{geometry}
\wedge
\mathcal V_{material}
\wedge
\mathcal V_{intent}
$$

这就是 validator-first runtime。

### 8.12 Component Tree：D1.L4 的关键运行时结构

D1.L4 的关键问题是：一个复杂物件不是一个连续 SDF blob，而是带语义部件和关系的结构体。

JiYu 组件化架构方案明确指出，当前管线的关键缺口是缺少语义结构层：DSL text 被解析成每行独立 SDF，然后 merge、extract mesh、按 line name 标注；系统知道 `lens_outer` 和 `lens_inner` 是两个东西，却不知道它们共同构成“镜头组件”。因此需要在 DSL 和 mesh 之间插入 Component Tree。

本文将 Component Tree 定义为：

$$
CT=(N,E,\rho,\alpha)
$$

其中：

- $N$：组件节点，包括 object、group、part；
- $E$：父子关系或 joint 关系；
- $\rho:N\to Geometry$：节点到几何表达的映射；
- $\alpha:N\to Attributes$：节点到材质、行为、交互、进化参数的映射。

原始 D1.L1-L3 管线为：

$$
DSL
\to
SDF\ AST
\to
Mesh
\to
Render
$$

加入 Component Tree 后变为：

$$
DSL
\to
AST
\to
ComponentTree
\to
PartSDFs
\to
MeshBundle
\to
Render
$$

Component Tree 的作用包括：

1. 保留部件身份；
2. 支持爆炸视图；
3. 支持部件级交互；
4. 支持独立材质；
5. 支持独立进化；
6. 支持 parent-child cascade；
7. 支持跨域绑定，例如 part 绑定 D5 状态或 D8 通知。

这解释了为什么 Layer 4 是从“几何体”到“智能体应用程序”的关键跳跃。

### 8.13 Layer 4 装配的运行时合同

D1.L4 的核心 DSL 可以概括为：

```text
object(name) {
  part(part_id) { ...geometry... }
  joint(joint_id, parent, child) { ...constraint... }
}
```

运行时合同至少包括以下不变量。

**部件唯一性：**

$$
\forall p_i,p_j\in Parts,\quad id(p_i)=id(p_j)\Rightarrow p_i=p_j
$$

**关节引用合法性：**

$$
\forall joint(parent,child),\quad parent,child\in Parts
$$

**连通性：**

$$
Graph(Parts,Joints)\ \text{is connected}
$$

除非显式声明允许 detached components。

**非悬浮约束：**

$$
\forall part,\quad attached(part)\vee grounded(part)\vee explicitlyFloating(part)
$$

**比例约束：**

$$
scale(part_i)/scale(parent(part_i))\in [r_{min},r_{max}]
$$

**对称约束：**

$$
part_L = mirror(part_R,axis)
$$

**级联更新：**

$$
pos(child)=pos(parent)+relativeOffset(child,parent)
$$

这些合同回应了 Layer 4 中相对尺寸、比例约束、父子关系和部件级验证问题。

### 8.14 从 source of truth 到多重投影

CRF Runtime 中最重要的工程原则是：

$$
\text{AST / ComponentTree / Genome 是 source of truth}
$$

而不是 mesh、图片、HTML 或最终渲染结果。

对于一个 CRF 对象 $a$，可以定义多个投影：

$$
\pi_{render}(a)=\text{visual output}
$$

$$
\pi_{mesh}(a)=\text{exported mesh}
$$

$$
\pi_{ui}(a)=\text{interactive interface}
$$

$$
\pi_{state}(a)=\text{state machine}
$$

$$
\pi_{evo}(a)=\text{evolution substrate}
$$

因此，一个 CRF asset 不应以 glTF、mesh 或图片作为本体。它们只是投影。真正的 canonical object 应是：

$$
a=(AST,ComponentTree,Genome,Contracts,RuntimeBindings)
$$

这也解释了 JiYu 与普通 3D 生成系统的差异。普通系统输出静态 mesh；CRF Runtime 输出的是可编辑、可验证、可绑定行为、可继续演化的结构化对象。

### 8.15 运行时中的 D9：从一次性生成到持续改写

D9 智能体进化在运行时中的地位特殊。它不只是九域中的一个域，还经常作为 M3 实例层上的横向改写机制。

D9 的基本函数签名为：

$$
F_9:Agent\times Feedback\to Agent'
$$

在 JiYu 中，可以改写为：

$$
Genome\times Feedback\to Genome'
$$

运行时上，这意味着：

$$
a_t=(Genome_t,State_t,Contracts)
$$

$$
a_{t+1}=evolve(a_t,feedback_t)
$$

但必须满足：

$$
\mathcal V(a_{t+1})=\top
$$

即进化不能破坏合同。D9 不是无限制变异，而是 contract-preserving self-rewrite。

因此，D9 在运行时中应与 D7 强耦合：

$$
D9:\text{propose mutation}
$$

$$
D7:\text{validate mutation}
$$

$$
Runtime:\text{commit or reject}
$$

### 8.16 图片转 3D：运行时链路示例

图片转 3D 是 D×L×M、BDI、D1、D7、D9 共同作用的典型案例。

JiYu 图片转 3D 技术方案将完整管线写成六步：多视图结构分析、精准 DSL 生成、初始渲染、同态为空间自感知智能体、自校准对齐循环、静默。它明确区分 JiYu 与静态 mesh 生成路径：JiYu 的目标不是输出“死的 mesh 文件”，而是输出可编辑、可进化、可交互的结构化 DSL。

用本文框架表示，该流程为：

$$
Photo
\xrightarrow{Vision}
BDI\ Goal\ \phi
$$

$$
\phi
\xrightarrow{PlanBinder}
D1.L4.M3\ ObjectDSL
$$

$$
ObjectDSL
\xrightarrow{Parser}
ComponentTree
$$

$$
ComponentTree
\xrightarrow{Renderer}
M4\ Render
$$

$$
Render,Photo
\xrightarrow{Verifier}
Bel(similarity>\tau)
$$

$$
\neg Bel(\phi)
\xrightarrow{D9}
update(ObjectDSL)
$$

这个循环直到：

$$
Bel(\phi)
$$

然后进入 silent 状态。

这个案例说明，CRF Runtime 不是一次性生成，而是：

$$
\text{生成}
\to
\text{验证}
\to
\text{反馈}
\to
\text{改写}
\to
\text{再验证}
$$

它本质上是 BDI-controlled, validator-gated, CRF-native runtime。

### 8.17 Validator-first 架构

CRF Runtime 的推荐架构不是：

$$
Generate\to Render\to Fix
$$

而是：

$$
Generate\to Validate\to Render\to Validate\to Commit
$$

也就是说，验证器要前置。

一个最小 validator-first pipeline 可写为：

```text
1. Parse DSL
2. Validate syntax
3. Validate types
4. Build AST
5. Build ComponentTree / Domain Instance
6. Validate structure
7. Validate invariants
8. Execute / render
9. Validate output
10. Update BDI belief
11. Commit / rebind / abandon
```

对应数学形式：

$$
l
\to
P(l)
\to
\mathcal V_{syntax}
\to
E(P(l))
\to
\mathcal V_{structure}
\to
R(E(P(l)))
\to
\mathcal V_{output}
\to
Bel(\phi)
$$

### 8.18 运行时最小架构

CRF Runtime 的最小架构应包含七个模块。

1. **Domain Registry**：存储每个 CRF 域的 $F_D,B_D,\Omega_D,L_D,\mathcal I_D,\mathcal V_D$，并执行域准入公理。
2. **Universal Parser**：实现跨域共享元语法，包括管道、嵌套、参数、引用、条件、注释、字符串。
3. **Domain Evaluator**：每个域有自己的 Evaluator，例如 D1 AST → SDF / ComponentTree，D4 AST → Data pipeline，D5 AST → State transition graph。
4. **Contract Validator**：执行 $\mathcal V_D$，包括语法、类型、结构、几何、执行和意图验证。
5. **Runtime / Renderer**：执行具体输出。
6. **BDI Controller**：维护 Belief、Goal、Intention、Commitment 和 Reconsideration。
7. **Evolution Engine**：执行 D9，但所有改写必须经过 Contract Validator。

完整运行时为：

$$
BDI
\to
DomainRegistry
\to
Parser
\to
Evaluator
\to
Validator
\to
Runtime
\to
Feedback
\to
BDI/D9
$$

### 8.19 与传统 runtime 的区别

传统软件 runtime 的核心是执行通用代码：

$$
Code\to Interpreter/Compiler\to Output
$$

CRF Runtime 的核心是执行领域对象：

$$
Intent
\to
CRF DSL
\to
Domain Instance
\to
Verified Output
$$

| 维度 | 传统 runtime | CRF runtime |
| --- | --- | --- |
| 输入 | 通用代码 | 域原生 DSL |
| 语义来源 | 编程语言规范 | 数学完备表示函数 |
| 验证方式 | 类型检查 / 测试 | 域不变量 + contract validator |
| 错误定位 | 堆栈 / 日志 | D×L×M 坐标 |
| 对象本体 | 代码或数据文件 | AST / ComponentTree / Genome |
| LLM 关系 | 事后生成代码 | 原生生成 DSL |
| 反馈机制 | 异常处理 | BDI + D9 reconsideration |

因此，CRF Runtime 是 AI-native runtime，而不仅是 DSL interpreter。

---

## 9. JiYu 案例研究：从几何体到可编辑活物件

### 9.1 本章定位：案例研究，而非主证明

JiYu 是 CRF 在三维几何、材质、部件装配、空间自感知与自演化方向上的第一个系统化实现案例。它的意义不在于单独证明 CRF 全部理论，而在于展示一个更高层的问题：

$$
\text{CRF-derived DSL 如何成为一个可编辑、可验证、可进化的运行时对象？}
$$

因此，本章采用案例研究口径，而不是主证明口径。

本文对 JiYu 的证据层级作如下区分：

$$
\textbf{已验证核心：}
D1\ \text{几何 DSL、材质/形体维度、部分运行时渲染}
$$

$$
\textbf{正在形成的系统层：}
L4\ \text{部件装配、ComponentTree、资产库、场景资产生成}
$$

$$
\textbf{前沿方向：}
\text{图片转 3D、空间自感知智能体、自演化活体资产}
$$

这种区分很重要。JiYu 的核心 DSL-to-SDF 管线和渲染基础已经构成强案例；但 Layer 4 装配、Image-to-3D、场景资产引擎等差异化功能仍应以工程推进中能力表述，而不应写成已经完全稳定落地的主实证。

### 9.2 JiYu 的理论位置：D1 先行实现与跨域运行时雏形

JiYu 的起点是 D1 三维几何域。按照 CRF，D1 的基本完备表示函数为：

$$
F_1:\mathbb R^3\to\mathbb R
$$

即空间点到形体表面的有符号距离场。JiYu 早期几何库将 D1 拆成三层：Layer 1 是 7 个 SDF 原语，Layer 2 是 12 个变换、组合和变形操作符，Layer 3 是 15 个预组合复合几何模板。每个原语都是一个 SDF 函数，输入三维坐标，输出距离值。

这与 CRF 的理论对象完全对应：

$$
B_1 = \{\text{sphere, box, cylinder, torus, capsule, cone, plane}\}
$$

$$
\Omega_1 = \{\text{blend, subtract, round, twist, bend, repeat,\dots}\}
$$

$$
L_1 = \text{Geometry DSL}
$$

但 JiYu 的后续发展超出了 D1 单域。随着材质库、五个新维度、Layer 4 部件装配、图片转 3D、空间自感知智能体和自演化架构的出现，JiYu 逐渐变成一个跨域运行时雏形：D1 负责形体，D5 负责状态，D7 负责验证，D9 负责演化，BDI 负责意图保持和对齐目标。

因此，JiYu 在本文中的位置是：

$$
\text{JiYu} =
D1\ \text{先行实现}
+
D7\ \text{验证层}
+
D9\ \text{进化层}
+
BDI\ \text{意图/对齐层}
+
\text{asset runtime}
$$

### 9.3 Module 1：Material Lab 证明了什么

JiYu Material Lab 可以视为 JiYu 的第一个核心模块。它证明的不是“复杂物件已经完成”，而是更底层的一件事：

$$
\text{CRF 推导出的 DSL 可以实时驱动三维形体、材质和演化。}
$$

场景资产模块文档总结了 Material Lab 已经证明的几项能力：CRF 推导的 DSL 可以实时渲染为 3D 几何体，14 维材质空间可以同时叠加在一个物体上，自演化引擎可以在这个空间里自主探索 1059+ 代，并且 9 个形态可以完全分化而不收敛。

从 CRF 角度看，这对应三个层面的验证。

第一，D1 几何 DSL 可以进入 M4 物理渲染层：

$$
DSL_{D1}\to SDF\to Render
$$

第二，材质维度可以被视为 D1 表面属性子空间的扩展：

$$
Geometry \times Material \to RenderedObject
$$

第三，D9 可以在形态/材质基因组上做持续改写：

$$
Genome_t\times Feedback_t \to Genome_{t+1}
$$

因此，Material Lab 的研究价值不是“生成了漂亮材质球”，而是证明了一个更深的命题：**在 JiYu 中，DSL、形体、材质、界面和进化基底开始坍缩为同一个可执行对象。**

### 9.4 从三维几何到材质空间：表面不是贴图，而是可进化维度

JiYu 的材质库文档指出，早期 DSL 只有三个材质维度：`color(r,g,b)`、`material(roughness, metalness)` 和 `texture(type, scale, intensity)`；而 Three.js 的 MeshPhysicalMaterial 实际支持 clearcoat、transmission、ior、sheen、iridescence、anisotropy、specular、emissive、attenuation 等更丰富维度。

这对 CRF 有两层意义。

第一，材质不应被视为渲染后处理，而应是对象表示的一部分：

$$
Object = Geometry + Material + Texture + Behavior
$$

第二，材质维度也应具备 CRF 风格的基底与操作。颜色、粗糙度、金属度、透光、清漆、织物光泽、薄膜干涉、自发光等，不只是视觉效果选项，而是可被 LLM 直接控制的物理外观坐标。

因此，JiYu 的材质扩展说明：CRF 的 D1 不应只停留在纯形体 SDF，还应逐步扩展到几何—材质联合载体：

$$
V_{D1}=V_{geometry}\times V_{material}\times V_{texture}
$$

但材质库是 D1 的运行时扩展和子空间扩展，不必被单独声明为新的 CRF 域。

### 9.5 五个新维度：从形体变形到表现维度扩张

JiYu 的五个新维度文档新增了 symmetry、taper、emissive、gradient、wave 五个操作，每个维度对应一个 DSL 操作以及一个 SDF 数学函数或 Three.js 映射。

这组扩展很好地说明了 CRF 的运行时扩展原则。一个新操作是否可以进入 DSL，不应只看它“好不好看”，而应检查：

$$
\text{是否有明确数学函数或 runtime 映射？}
$$

$$
\text{是否保持对象仍在 D1 表示空间内？}
$$

$$
\text{是否可被参数化、验证和进化？}
$$

symmetry、taper、wave 属于 SDF 空间内的变形操作，因此更接近 D1.L2；emissive 和 gradient 属于材质/着色投影，因此更接近 D1 的 surface/material runtime。它们不是随意特效，而是进入 CRF 表示空间的受约束维度。

### 9.6 JiYu 的天花板：为什么 L1-L3 不能生成可辨识物件

JiYu Layer 1-3 的能力很强，但它们有一个结构性天花板：所有形态仍然是“一个东西”的变形。

部件装配文档明确指出，不管怎么 twist、blend、wave、taper，结果始终是一个连续几何体；音乐盒不是一个变形的球，而是“底座 + 齿轮 + 盖子 + 摇柄”四个独立部件的组装。`blend` 可以融合两个形体，但会把两个部件融成一坨，失去“底座是底座、盖子是盖子”的结构清晰性。

这句话对 CRF 非常关键。它说明 D1 的原始完备性至少分两层：

$$
\text{形体完备}
\ne
\text{物件完备}
$$

SDF 可以很好表达连续形体，但一个“相机”“音乐盒”“小狗”“汽车”并不只是一个连续体。它们是由语义部件、空间关系、材质分区、交互位点和行为挂载点组成的结构化对象。

因此，JiYu 需要 Layer 4：

$$
L4 = object/part/joint
$$

Layer 4 不是普通模板库，而是从“几何生成”到“物件表示”的理论跃迁。

### 9.7 Layer 4：object / part / joint 作为物件完备表示

Layer 4 的核心形式可以写为：

```text
object(name) {
  part(part_id) { ...geometry and material... }
  joint(child, on: parent, position: ...)
}
```

它将 D1 的对象从单一 SDF 表达扩展为结构图：

$$
Object=(Parts,Joints,Attributes,Behaviors)
$$

其中：

- $Parts$ 是独立部件集合；
- $Joints$ 是部件之间的空间/拓扑关系；
- $Attributes$ 是材质、纹理、尺寸和局部操作；
- $Behaviors$ 是未来绑定的状态、交互和进化能力。

从 CRF 角度看，Layer 4 使 D1 的表示空间从：

$$
V_{D1}^{blob}
$$

升级为：

$$
V_{D1}^{object}=Graph(Part,Joint)\times Geometry\times Material\times Behavior
$$

这并不否定 SDF，而是把 SDF 放在 part 的局部几何表示里：

$$
part_i.geometry\in V_{SDF}
$$

整个 object 则是部件级图结构：

$$
object = \{part_i\}_{i=1}^n + \{joint_{ij}\}
$$

因此，Layer 4 是 D1 内部的 carrier tower 升级，不是新 Domain。

### 9.8 Component Tree：从独立 SDF 到语义部件图

JiYu 组件化架构方案指出，当前管线的关键缺口是缺少语义结构层：系统知道 `lens_outer` 和 `lens_inner` 是两个独立东西，但不知道它们共同构成“镜头组件”；因此在爆炸视图中，它们会各自独立飞散，而不是作为整体滑出。该方案明确提出需要在 DSL 和 mesh 之间插入 Component Tree。

本文将 Component Tree 定义为：

$$
CT=(N,E,\rho,\alpha)
$$

其中：

- $N$：节点，包括 object、group、part；
- $E$：父子关系、joint 关系或 group 关系；
- $\rho:N\to Geometry$：节点到几何表达的映射；
- $\alpha:N\to Attributes$：节点到材质、状态、交互、进化参数的映射。

加入 Component Tree 后，JiYu 的运行时链路从：

$$
DSL\to independent\ SDFs\to merge\to mesh
$$

升级为：

$$
DSL\to AST\to ComponentTree\to PartSDFs\to MeshBundle\to Runtime
$$

Component Tree 至少带来五个能力：

1. 部件身份保持；
2. 组件级选中与编辑；
3. 爆炸视图按组运动；
4. parent-child 级联更新；
5. 跨域行为挂载。

这正好连接 source of truth 原则：mesh 不是本体，Component Tree 才是本体。

### 9.9 Braun 相机、金毛小狗与肌肉车：三个 Layer 4 验收样本

JiYu 文档中已经出现三个非常适合作为 Layer 4 标准 benchmark 的对象：Braun 相机、金毛小狗和肌肉车。

**Braun 相机**适合测试机械部件与材质分区，包括 mechanical parts、front/back axis、lens assembly、buttons/dials、material zones。因此，它是机械物件装配的标准样本。

**金毛小狗**适合测试有机角色与部件连通，包括 organic character、cartoon proportion、soft material、symmetry、tail/ear attachment。与 Braun 相机不同，小狗不是硬表面机械件，而是有机角色。因此它能验证 Layer 4 是否不仅适用于相机、台灯、音乐盒，也适用于角色类资产。

**肌肉车**尤其重要，因为它不是成功展示，而是失败诊断。该案例说明肌肉车 DSL 已被引擎解析，20 个部件、19 个关节全部识别，但渲染结果严重失真，包括车身太扁、座舱不可见、轮子过小、车身出现水平锯齿条纹、车灯位置偏移、车漆缺少高光等问题。

这正是：

$$
ParseSuccess \ne RuntimeCorrectness
$$

肌肉车案例说明，Layer 4 的验证不能只看 Parser 是否识别 `part` 和 `joint`，还必须检查 axis mapping、calculatePartPosition、proportion constraints、material mapping 和 M3→M4 fidelity。

因此，肌肉车是 CRF Runtime 的错误定位 benchmark。

### 9.10 图片转 3D：从静态 mesh 到空间自感知智能体

JiYu 图片转 3D 方案将其定位为杀手级功能：上传一张照片，生成一个活的、可编辑的、可进化的 3D 物件。该方案明确区分 JiYu 与 Meshy、Tripo、Rodin 等静态 mesh 路径：传统路径是照片到神经网络黑箱再到静态 mesh 文件；JiYu 路径是照片到结构分析、多视图描述、DSL 代码、空间自感知智能体、自校准对齐，最终输出活的程序。

其完整管线为六步：

$$
\text{多视图结构分析}
\to
\text{精准 DSL 生成}
\to
\text{初始渲染}
\to
\text{空间自感知智能体}
\to
\text{自校准对齐循环}
\to
\text{静默}
$$

文档特别强调：精准描述是一切的基础。如果 Step 1 的结构分析出现部件遗漏、比例错误或空间关系含糊，后面的自校准只能修正参数级偏差，无法修正结构级错误。

从 CRF 角度看，这说明 Image-to-3D 不是一个新 Domain，而是一个跨域 morphism pipeline：

$$
Photo
\to
StructureAnalysis
\to
D1.L4.ObjectDSL
\to
D1.Runtime
\to
D9.Alignment
\to
D5.SilentState
$$

也就是说，图片转 3D 是 D1、D5、D7、D9 与 BDI 的组合流程。

### 9.11 空间自感知智能体：BDI 在三维物件中的实现形式

图片转 3D 方案中，空间自感知智能体的核心对象包括 genome、targetDescription、sourceImage、state、iteration 和 alignmentScore。其状态从 initializing 进入 aligning、converging、silent、evolving；自感知系统可以读取自身结构，并将当前形态与目标描述和源图像比较。

这非常接近 BDI 循环：

$$
Belief:\quad \text{当前 genome 生成了什么形体}
$$

$$
Goal:\quad \text{render(genome) 与 sourceImage 足够相似}
$$

$$
Intention:\quad \text{持续对齐直到达到阈值}
$$

$$
Plan:\quad \text{修改 part 尺寸、位置、材质、joint}
$$

$$
Feedback:\quad \text{渲染结果与源图差异}
$$

$$
Reconsideration:\quad \text{继续修正、重建结构或进入 silent}
$$

因此，空间自感知智能体不只是视觉优化循环，而是 CRF + BDI 的物件级实现：

$$
Intend(A\Diamond similarity(render(object),photo)>\tau)
$$

系统持续维护该意图，直到它相信目标达成，或者相信结构分析错误导致目标不可达，或者用户更换目标图像使背景理由失效。

### 9.12 图片转 3D 的验证标准

图片转 3D 方案已经给出了非常接近产品级的验收标准。结构分析方面，要求上传 Braun 相机照片后，Vision LLM 正确识别不少于 15 个部件，部件树连通性达到 100%，比例关系误差不超过 20%，空间关系正确，例如镜头在前、拨盘在上，材质类型也要正确识别。DSL 生成方面，要求 JSON 到 DSL 翻译完整，结构耦合验证通过，生成 DSL 能被 Layer 4 引擎正确渲染。

空间自感知方面，要求智能体能正确渲染初始近似，LLM 对比能识别差异，例如“镜头偏小 20%”，级联更新能正确工作，并且结构耦合在对齐过程中保持，不出现散架的中间状态。对齐收敛方面，要求 LLM 粗校正 5—8 次后相似度超过 70%，算法精校正 20—40 次后相似度超过 85%，总对齐时间小于 30 秒，并在完成后自动进入静默状态。

这些指标可以转写为 CRF 论文中的实验指标：

$$
PartRecall \ge 15
$$

$$
Connectivity = 1.0
$$

$$
ProportionError \le 0.2
$$

$$
Similarity_{coarse}>0.7
$$

$$
Similarity_{fine}>0.85
$$

$$
Time_{align}<30s
$$

$$
State_{final}=silent
$$

这些指标不应在当前论文中宣称已经全部完成，而应作为 JiYu 案例的下一阶段验收协议。

### 9.13 Module 2：从 Material Lab 到场景资产生成

JiYu 场景资产生成引擎被定义为第二大功能模块，其前置依赖是 Layer 4 部件装配引擎。Material Lab 已经证明了实时渲染、材质空间、自演化和多个形态分化，但 1059 代之后的结果暴露出天花板：所有形态都是单体变形，无法组装成可辨识物件。Layer 4 object/part/joint 使 DSL 可以描述由部件组装而成的物件，从而生成树木、建筑、家具、交通工具、机械和角色。

Module 2 的关键是：每个 part 继承完整的 JiYu 表达能力，包括 7 种原语、12 种操作符、工业级纹理、多种材质维度、新维度和动态行为。

这意味着资产不是低多边形模板，而是 CRF 表达空间中的结构化对象：

$$
Asset =
ObjectGraph
+
PartSDF
+
Material
+
Texture
+
Behavior
+
EvolutionGenome
$$

Module 2 的产品链路可以写为：

$$
UserPrompt
\to
ObjectDSL
\to
Layer4Runtime
\to
EditableAsset
\to
AssetLibrary
\to
Scene
$$

### 9.14 自演化架构：代码、渲染、界面与进化基底的坍缩

JiYu Material Lab 的自演化架构提出了本章最强的系统命题：每个材质球不是“被渲染的对象”，而是一段正在运行的程序；它的基因组同时是源代码、渲染指令、用户界面和进化基底。改写基因组等于同时改变程序结构、外观、行为和进化方向，不需要编译、部署或重启。

这句话对 CRF 的运行时理论意义很大。

传统软件中：

$$
SourceCode \ne Data \ne UI \ne RuntimeState
$$

JiYu 中：

$$
Genome = SourceCode = RenderInstruction = Interface = EvolutionSubstrate
$$

这意味着 CRF asset 的本体不是文件，也不是 mesh，而是 genome / AST / ComponentTree。

自演化架构还指出，同步换代遗传算法的问题是球是被动的，等待用户选择后才进入下一代；因此运行模式应从“展示 9 个 → 用户选择 → 全部替换为下一代”的同步 IGA，升级为每个个体有独立 timer、独立变异、内部启发式和用户信号的异步自演化生态系统。

这正好对应 D9：

$$
Genome_t\times Feedback_t\to Genome_{t+1}
$$

并且必须由 D7 验证：

$$
\mathcal V(Genome_{t+1})=\top
$$

因此，自演化不是随机变异，而是 contract-preserving self-rewrite。

### 9.15 JiYu 的跨域坐标

图片转 3D 流程可以被定位到多个 D×L×M 坐标：

$$
Step\ 1:\ D3.L2.M2
$$

界面域、操作层、语法层，用于多视图投影和结构分析；

$$
Step\ 2:\ D1.L4.M3
$$

几何域、组装层、实例层，用于具体 object DSL；

$$
Step\ 3:\ D1.L4.M4
$$

几何域、组装层、物理层，用于 GPU 渲染像素；

$$
Step\ 4:\ D2.L1.M3
$$

智能体域、原语层、实例层，用于单个 agent 实例化；

$$
Step\ 5:\ D9.L2.M4
$$

进化域、操作层、物理层，用于目标导向对齐执行；

$$
Step\ 6:\ D5.L3.M3
$$

状态域、模板层、实例层，用于 convergence / silent 状态。

这组坐标非常重要。它说明 JiYu 的复杂功能不是随意工程堆叠，而是可以被 D×L×M 精确定位。

因此，JiYu 可以作为运行时理论的实例：

$$
\text{功能} \ne \text{域}
$$

$$
\text{功能} = \text{多个域坐标的组合路径}
$$

图片转 3D 不是 D10；它是 D1、D2、D3、D5、D7、D9 与 BDI 的组合流程。

### 9.16 工程边界：什么已经成立，什么仍需完成

为了保证论文可信度，本章必须明确 JiYu 的边界。

**已成立的部分。** JiYu 已经提供了 D1 几何 DSL、材质维度、自演化原型、部分 Three.js 渲染样本，以及 Golden Puppy、Muscle Car 等可运行 demo 的上下文。因此，可以说：

$$
\text{JiYu 已经证明 CRF 的 D1 先行实现具备运行时潜力。}
$$

**部分成立的部分。** Layer 4 object/part/joint、ComponentTree、Braun 相机、金毛小狗和肌肉车，已经形成了清晰规格、验收样本和部分实现记录。但从 muscle car 失真和工程审计可见，L4 的 M3→M4 仍是关键瓶颈。因此，应写为：

$$
\text{Layer 4 已形成明确理论与工程规格，但仍需稳定 runtime 验证。}
$$

**前沿方向。** Image-to-3D、空间自感知智能体、资产库自演化、世界编辑器等，已经有完整技术方案和验收指标，但不应在本论文中作为已完成主实证，而应作为 CRF 运行时的前沿系统方向。

本章结论必须收敛为：

$$
\text{JiYu 是 CRF runtime 的先行案例，不是 CRF 全理论的完成态证明。}
$$

### 9.17 JiYu 对 CRF 理论的反向贡献

JiYu 不只是 CRF 的应用，也反向推动了 CRF 理论升级。

第一，JiYu 推动了 L 轴的提出。没有 JiYu，很容易把 D1 理解为单层 SDF DSL。但 Layer 1-3 的天花板说明，形体完备不等于物件完备。

第二，JiYu 推动了 M 轴的提出。肌肉车案例说明，Parser 成功不等于渲染正确。

第三，JiYu 推动了 ComponentTree 作为 source of truth。爆炸视图零件飘散问题说明，mesh 不能作为本体。对象的本体必须是 ComponentTree / AST / Genome。

第四，JiYu 推动了 BDI 与 D9 的实际融合。图片转 3D 的空间自感知智能体说明，目标对齐不是一次生成，而是意图保持、反馈、修正和静默的循环。

因此，JiYu 的真正研究价值是：

$$
\text{它把 CRF 从单域 DSL 推导推向了跨域可验证运行时。}
$$

---

## 10. 跨域组合、Typed Morphism 与世界模型

### 10.1 为什么单域完备还不够

真实系统不会只停留在单域内部。一个用户请求往往同时涉及多个域：

> 把这张照片里的相机生成成一个可编辑 3D 物件，放到桌面场景里，点击快门时发出声音，电量低时通知我，并让它能根据用户反馈自动改进外观。

这句话至少涉及：

$$
D1\ \text{几何}
$$

$$
D3\ \text{界面/空间投影}
$$

$$
D5\ \text{状态机}
$$

$$
D7\ \text{验证}
$$

$$
D8\ \text{通知}
$$

$$
D9\ \text{进化}
$$

以及 BDI 意图层。

因此，单域完备只能回答：

$$
\text{每个域内部是否可表示？}
$$

它不能自动回答：

$$
\text{多个域之间如何转换、耦合、保持一致？}
$$

本章的任务，就是把 CRF 从“单域完备”推进到“跨域可组合”。

### 10.2 从“域集合 + 耦合函数”到 typed morphism

CRF 早期五物理域论文已经提出一个重要方向：世界模型可以被理解为域集合与耦合函数的组合：

$$
World = \{F_i\} + \{C_{ij}\}
$$

这个思想是对的，但需要进一步形式化。因为 $C_{ij}$ 如果只是“耦合函数”这个宽泛说法，会留下三个问题：

1. 耦合从哪个类型到哪个类型？
2. 耦合过程中哪些信息允许丢失，哪些不允许丢失？
3. 如何验证耦合结果仍然满足目标域的不变量？

因此，本文将 $C_{ij}$ 升级为 **typed morphism**。

设两个 CRF 域：

$$
\mathcal R_i=(V_i,L_i,\mathcal I_i,\mathcal V_i)
$$

$$
\mathcal R_j=(V_j,L_j,\mathcal I_j,\mathcal V_j)
$$

一个从域 $D_i$ 到域 $D_j$ 的 typed morphism 定义为：

$$
m_{i\to j}:(V_i,\mathcal I_i)\to(V_j,\mathcal I_j)
$$

并且必须满足验证条件：

$$
\mathcal V_j(m_{i\to j}(v_i))=\top
$$

如果该 morphism 需要保留某些源域不变量，还必须满足：

$$
Preserve_{ij}(v_i,m_{i\to j}(v_i))=\top
$$

因此，跨域转换不再是随意把一个域的输出喂给另一个域，而是 typed、contracted、validated 的显式转换。

### 10.3 对“不要离开原生空间”的修正

早期五物理域论文强调“始终在原生完备表示空间内操作，不得分解、不得离开”。这条原则在反对工具迂回和低维不可逆投影时非常有力。

但到了 CRF 计算域与 JiYu 运行时阶段，这句话需要精确化。真实系统必然会跨域：

$$
Photo\to ObjectDSL
$$

$$
ObjectDSL\to ComponentTree
$$

$$
ComponentTree\to Render
$$

$$
Render\to SimilarityScore
$$

$$
Feedback\to GenomeUpdate
$$

如果仍然字面坚持“绝不离开原生空间”，就无法解释图片转 3D、状态绑定、消息通知、智能体进化等必要过程。

因此，本文将旧原则修正为两条：

**规则一：域内避免 lossy projection。** 在同一域内部，不应把高保真、可逆或近可逆表示压缩成丢失关键信息的低维中间码。

**规则二：跨域允许 typed morphism。** 当任务确实需要从一个域进入另一个域时，必须经过显式类型、合同和验证器约束的 morphism。

写作：

$$
\text{Within-domain: avoid lossy projection}
$$

$$
\text{Cross-domain: allow typed, validated morphism}
$$

这使 CRF 能同时保留早期理论的核心洞见，又能解释后续系统中的真实跨域组合。

### 10.4 Typed morphism 的基本结构

一个 typed morphism 至少包含七个部分：

$$
m_{i\to j}=
(SourceType,TargetType,Pre,Map,Post,Loss,Validator)
$$

分别为：

1. **SourceType**：源域类型；
2. **TargetType**：目标域类型；
3. **Pre**：前置条件；
4. **Map**：实际映射函数；
5. **Post**：后置条件；
6. **Loss**：允许的信息损失说明；
7. **Validator**：验证器。

形式化写作：

$$
m_{i\to j}:
\{v_i\in V_i\mid Pre_i(v_i)\}
\to
\{v_j\in V_j\mid Post_j(v_j)\}
$$

并满足：

$$
v_j=Map(v_i)
$$

$$
\mathcal V_j(v_j)=\top
$$

$$
Loss_{ij}(v_i,v_j)\le \epsilon_{ij}
$$

其中，$\epsilon_{ij}$ 是该转换允许的信息损失阈值。某些 morphism 必须是严格保真，例如实体名称 exact preservation；某些 morphism 可以是近似保真，例如照片轮廓到三维物件的几何近似。

### 10.5 Morphism 与操作、验证器、组合模式的区别

**操作**作用在同一域内部：

$$
\omega_D:V_D\to V_D
$$

例如：

$$
rotate:SDF\to SDF
$$

$$
filter:Table\to Table
$$

$$
transition:State\to State
$$

**验证器**检查对象是否满足规则：

$$
\mathcal V_D:V_D\to Bool/Error[]
$$

例如：

$$
validateLayout:Layout\to Violation[]
$$

$$
validateObject:ObjectDSL\to Error[]
$$

**Morphism** 在不同域之间转换对象：

$$
m_{i\to j}:V_i\to V_j
$$

例如：

$$
m_{photo\to object}:Image\to ObjectDSL
$$

$$
m_{object\to render}:ObjectDSL\to Image
$$

$$
m_{event\to notification}:Event\to DeliveryPlan
$$

**组合模式**是一组操作、验证器和 morphism 的管线：

$$
Pipeline=m_n\circ \omega_n\circ\cdots\circ m_1\circ \omega_1
$$

因此，图片转 3D 不应被写成 D10。它是：

$$
BDI + D1 + D2 + D3 + D5 + D7 + D9
$$

的跨域组合。

### 10.6 Morphism 的可组合性

如果存在两个 morphism：

$$
m_{i\to j}:V_i\to V_j
$$

$$
m_{j\to k}:V_j\to V_k
$$

则可组合为：

$$
m_{i\to k}=m_{j\to k}\circ m_{i\to j}
$$

但这种组合只在中间合同通过时成立：

$$
\mathcal V_j(m_{i\to j}(v_i))=\top
$$

并且：

$$
Pre_{j\to k}(m_{i\to j}(v_i))=\top
$$

因此，morphism 组合是**部分组合**，不是任意函数复合。

更完整地：

$$
m_{j\to k}\circ m_{i\to j}
\quad \text{defined iff} \quad
Post_{i\to j}\Rightarrow Pre_{j\to k}
$$

这对 CRF Runtime 非常重要。它说明跨域链路中每一步都必须产生下游可接受的对象。否则，错误必须停在当前边界，而不能继续传播。

### 10.7 信息损失与可逆性等级

不同 morphism 的保真要求不同。本文将跨域转换分为四级。

**同构 morphism** 若存在逆映射：

$$
m_{j\to i}
$$

且：

$$
m_{j\to i}(m_{i\to j}(v_i))\sim_i v_i
$$

则几乎无损。例如，一个 DSL AST 与其规范 JSON 表示之间可能是同构的，只要二者携带相同结构信息。

**保真 morphism** 不一定可逆，但能保证关键不变量被保留：

$$
Preserve_{ij}(I_i)=\top
$$

例如：

$$
ObjectDSL\to ComponentTree
$$

可能不是严格可逆，因为语法糖会消失，但部件身份、joint 关系和材质绑定必须保留。

**近似 morphism** 允许连续误差：

$$
d(v_j,Target(v_i))\le \epsilon
$$

例如：

$$
Photo\to ObjectDSL
$$

从单张图片反推三维结构必然不唯一，因此只能要求部件、比例、轮廓和材质在阈值内近似正确。

**观察 morphism** 将复杂对象映射为终端观察结果：

$$
V_i\to Bool/Score/Error[]
$$

例如：

$$
ObjectDSL\to CollisionScore
$$

$$
Render\to SimilarityScore
$$

这类 morphism 通常不可逆，也不生成同域对象。因此它更像验证器或观察器，而不是新域。

### 10.8 跨域合同：Pre、Post 与 Invariant

一个 typed morphism 的核心是合同。

设：

$$
m_{i\to j}:V_i\to V_j
$$

其合同包括：

$$
Pre_i(v_i)
$$

$$
Post_j(v_j)
$$

$$
Preserve_{ij}(v_i,v_j)
$$

其中：

- $Pre_i$ 检查源对象是否适合转换；
- $Post_j$ 检查目标对象是否合法；
- $Preserve_{ij}$ 检查跨域必须保留的不变量。

例如，ObjectDSL 到 ComponentTree 的 morphism：

$$
m_{DSL\to CT}:L_{D1.L4}\to CT
$$

前置条件：

$$
parse(l)\neq error
$$

$$
all\ part\ ids\ unique
$$

后置条件：

$$
CT\ \text{is connected}
$$

$$
all\ joints\ reference\ existing\ parts
$$

保留条件：

$$
partIdentity(l)=partIdentity(CT)
$$

$$
jointRelation(l)=jointRelation(CT)
$$

如果这些条件不满足，系统不得继续进入 mesh extraction。

### 10.9 BDI 对跨域组合的作用

BDI 层不是某个单域，也不是普通调度器。它在跨域组合中承担三项职责。

第一，**选择目标世界**。用户输入首先被解释为目标命题：

$$
\phi_u
$$

而不是直接解释为某个域 DSL。在跨域任务中，$\phi_u$ 通常被拆成多个子命题：

$$
\phi_u=
\phi_{D1}
\wedge
\phi_{D5}
\wedge
\phi_{D8}
\wedge
\phi_{D9}
$$

第二，**绑定跨域计划**。BDI 通过 Plan Binder 选择跨域 morphism 链：

$$
Plan(\phi_u)=
m_{D1\to D5}
\circ
m_{D5\to D8}
\circ
\cdots
$$

它不直接执行，而是组织哪些域参与、按什么顺序转换、每步由哪个 validator 检查。

第三，**根据反馈重新考虑**。当某个 morphism 失败，BDI 层决定是重新绑定计划、修正源域对象、询问用户、放弃意图，还是进入 D9 自演化修正。

因此，跨域组合不是静态 pipeline，而是 BDI-controlled pipeline。

### 10.10 JiYu 图片转 3D 作为 typed morphism 链

JiYu 图片转 3D 是本文最清晰的跨域 morphism 案例。其技术方案将流程写为：

$$
Photo
\to
MultiViewAnalysis
\to
ObjectDSL
\to
InitialRender
\to
SpatialSelfPerceptionAgent
\to
AlignmentLoop
\to
SilentState
$$

用 typed morphism 表示：

**$m_1:Photo\to StructureDescription$**

$$
m_1:D3/Image\to StructureIR
$$

前置条件包括 image 可用、object 可视觉分割；后置条件包括 parts identified、view hypotheses generated、spatial relations estimated。这是近似 morphism，因为单张照片无法唯一决定三维结构。

**$m_2:StructureDescription\to ObjectDSL$**

$$
m_2:StructureIR\to L_{D1.L4}
$$

后置条件包括 parse(ObjectDSL) 不报错、parts(ObjectDSL) 近似 parts(StructureIR)、joints(ObjectDSL) 近似 relations(StructureIR)。这是保真 morphism，必须保留结构分析中的部件和关系。

**$m_3:ObjectDSL\to ComponentTree$**

$$
m_3:L_{D1.L4}\to CT
$$

后置条件包括 CT connected、part ids preserved、joint refs valid。这一步应该是高保真 morphism。JiYu 组件化架构之所以提出 Component Tree，正是为了避免 DSL 到 mesh 时丢失组件语义。

**$m_4:ComponentTree\to Render$**

$$
m_4:CT\to Image
$$

这一步是投影 morphism。它将结构化对象投影为图像，不可逆，但可用于验证。

**$m_5:Render\times Photo\to Feedback$**

$$
m_5:Image\times Image\to DifferenceReport
$$

这是观察 morphism，输出差异报告或相似度分数。

**$m_6:Feedback\times ObjectDSL\to ObjectDSL'$**

$$
m_6:D9(ObjectDSL,Feedback)\to ObjectDSL'
$$

这是 D9 自改写 morphism，必须满足：

$$
\mathcal V_{D1.L4}(ObjectDSL')=\top
$$

如果改写后结构合同失败，则不得 commit。

**$m_7:ObjectDSL'\to SilentState$**

当系统相信：

$$
Bel(similarity(render(ObjectDSL'),photo)>\tau)
$$

则进入：

$$
D5:aligning\to silent
$$

这一步是 BDI + D5 的状态 morphism。

因此，图片转 3D 的完整形式是：

$$
m_7\circ m_6\circ m_5\circ m_4\circ m_3\circ m_2\circ m_1
$$

但它不是一次性函数，而是带 feedback loop 的部分组合。

### 10.11 从物件到 Agent：跨域绑定

CRF asset 真正变成“活物件”，不是因为它会动，而是因为几何部件可以绑定状态、权限、通知、进化和意图。

设一个 JiYu object：

$$
O=(Parts,Joints,Materials,Behaviors)
$$

对于某个部件 $p\in Parts$，可以绑定多个域。

**D1 → D5：部件状态绑定。**

例如相机盖：

$$
part(lid)\to state(open|closed)
$$

morphism：

$$
m_{D1\to D5}:Part\to StateMachine
$$

**D5 → D8：状态变化触发通知。**

例如：

$$
state(battery=low)\to notify(user)
$$

morphism：

$$
m_{D5\to D8}:Event\to DeliveryPlan
$$

**D1 → D9：部件参与进化。**

例如：

$$
part(lens).material\to evolve(feedback)
$$

morphism：

$$
m_{D1\to D9}:PartGenome\to EvolvableGenome
$$

**D6：权限控制。**

例如：

$$
user(role=viewer)\ \text{cannot edit internal gears}
$$

morphism：

$$
m_{D1\to D6}:PartAction\to PolicyDecision
$$

这说明，活物件不是 D1 单域对象，而是：

$$
AliveObject=
D1\ structure
+
D5\ state
+
D6\ policy
+
D8\ notification
+
D9\ evolution
+
BDI\ intent
$$

### 10.12 世界模型：共享状态与域投影

早期五物理域论文提出：

$$
World=\{F_i\}+\{C_{ij}\}
$$

但为了进入可验证系统，本文建议将其升级为：

$$
World=(Z,\{G_i\},\{m_{ij}\},\mathcal C,\mathcal V)
$$

其中：

- $Z$：共享潜在世界状态；
- $G_i:Z\to V_i$：从共享状态到某域表示的投影；
- $m_{ij}:V_i\to V_j$：域间 typed morphism；
- $\mathcal C$：跨域一致性约束；
- $\mathcal V$：验证器集合。

例如，一个相机物件的共享状态：

$$
Z_{camera}=
\{
geometry,\ material,\ pose,\ state,\ owner,\ battery,\ behavior
\}
$$

它可以投影到多个域：

$$
G_{D1}(Z)=ObjectDSL
$$

$$
G_{D5}(Z)=StateMachine
$$

$$
G_{D6}(Z)=Policy
$$

$$
G_{D8}(Z)=NotificationRules
$$

$$
G_{D9}(Z)=EvolutionGenome
$$

这比简单写 $\{F_i\}+\{C_{ij}\}$ 更强，因为它将世界理解为共享状态与多域投影，而不是彼此独立的域函数集合。

### 10.13 跨域一致性约束

如果多个域都投影自同一个 $Z$，就必须定义一致性约束。

**几何—状态一致性。** 如果：

$$
state(lid)=open
$$

则 D1 中盖子的 rotation 应满足：

$$
rotation(lid)>\theta_{open}
$$

写作：

$$
C_{D5,D1}:state(lid)=open\Rightarrow pose(lid)=openPose
$$

**状态—通知一致性。** 如果：

$$
state(battery)=low
$$

则 D8 应生成通知：

$$
notify(user,batteryLow)
$$

写作：

$$
C_{D5,D8}:batteryLow\Rightarrow deliveryPlan(user)
$$

**权限—交互一致性。** 如果：

$$
D6(user,part,edit)=deny
$$

则 UI 或空间交互中不得出现编辑 affordance：

$$
C_{D6,D3}:deny(edit)\Rightarrow hide(editControl)
$$

**进化—结构一致性。** 如果 D9 改写部件参数，则 D1 结构合同必须仍然通过：

$$
C_{D9,D1}:evolve(O)\Rightarrow \mathcal V_{D1.L4}(O')=\top
$$

这些约束就是世界模型中的 $\mathcal C$。

### 10.14 Typed morphism 与 D×L×M 的关系

D×L×M 给出单个能力在系统中的坐标；typed morphism 给出坐标之间的转换边。

一个 morphism 可以写成：

$$
m:
(D_i,L_a,M_b)\to(D_j,L_c,M_d)
$$

因此：

$$
D\times L\times M
$$

是节点空间；

$$
morphism
$$

是边；

$$
workflow
$$

是路径；

$$
validator
$$

是边和节点上的合同检查器。

CRF Runtime 可以被建模为一个类型化图：

$$
G_{CRF}=(Nodes,Edges,Contracts)
$$

其中：

$$
Nodes\subseteq D\times L\times M
$$

$$
Edges=\{m_{a\to b}\}
$$

$$
Contracts=\{Pre,Post,Invariant\}
$$

这使跨域系统具备图式可解释性。任何复杂功能都可以还原为一条或多条经过验证的 typed path。

### 10.15 组合完备性的开放问题

单域完备已经定义为：

$$
\forall x\in X_D,\exists l\in L_D
$$

使得：

$$
eval(parse(l))\sim F_D(x)
$$

但跨域组合完备更难。它需要回答：

$$
\forall task\in Task_{multi-domain},\exists path\in G_{CRF}
$$

使得：

$$
Execute(path)\models \phi_{task}
$$

这要求同时满足：

1. 每个节点所在域单独完备；
2. 每条 morphism 类型正确；
3. 每条 morphism 的合同通过；
4. 跨域一致性约束不冲突；
5. BDI 目标命题可被分解为各域子目标；
6. Runtime 能完成执行和反馈。

因此，跨域组合完备不能直接由单域完备推出。

**开放问题 10.1：跨域组合完备性。** 给定一个由 CRF 域构成的 typed graph $G_{CRF}$，如何刻画哪些多域任务 $\phi$ 可以由该图中的 morphism path 完成？

形式化写作：

$$
Completeness(G_{CRF},\Phi)
$$

其中 $\Phi$ 是可接受的多域目标命题集合。

这个问题是 CRF 未来研究的核心之一。

### 10.16 最小跨域证明：四域活体对象

为了避免世界模型叙事过大，本文建议未来采用一个最小跨域证明，而不是一开始追求完整世界。

最小对象可以是：

$$
D1 + D5 + D8 + D9
$$

即：

- D1：一个可编辑物件；
- D5：一个状态机；
- D8：一个通知规则；
- D9：一个进化机制。

例如“活体相机”：

$$
D1:\text{相机几何与部件}
$$

$$
D5:\text{idle / shooting / charging / lowBattery}
$$

$$
D8:\text{低电量通知、拍摄完成通知}
$$

$$
D9:\text{根据用户反馈优化外观}
$$

再加 D7 验证和 BDI 意图控制。

最小证明目标不是生成一个巨大世界，而是证明：

$$
\text{同一个 AST/ComponentTree/Genome 可以同时投影为形体、状态、通知和进化基底。}
$$

这比宏大世界叙事更可验证，也更符合 JiYu 当前技术路线。

### 10.17 神经方法在跨域组合中的位置

CRF 并不排斥神经模型。相反，在跨域 morphism 中，神经模型常常是必要的。

典型位置包括：

**感知 morphism：**

$$
Image\to StructureIR
$$

这需要视觉模型。

**初始计划生成：**

$$
Intent\to ObjectDSL
$$

这需要 LLM。

**连续参数优化：**

$$
Feedback\to ParameterUpdate
$$

这可以由梯度优化、搜索或学习模型完成。

**相似度评估：**

$$
Render,Target\to Score
$$

这可以由视觉相似度模型、CLIP 类模型或人工评价完成。

但神经模型不应成为 source of truth。CRF Runtime 的本体仍应是：

$$
AST/ComponentTree/Genome
$$

神经模型负责 infer、fit、optimize；CRF 负责 represent、validate、edit、compose。

因此，跨域世界模型应是神经—符号混合结构：

$$
Neural = perception + proposal + optimization
$$

$$
CRF = representation + contract + runtime + evolution
$$

### 10.18 跨域错误定位

Typed morphism 还提供了跨域错误定位方法。

如果一个任务失败，不应直接说“CRF 失败”，而应定位失败发生在哪条边或哪个节点。

例如图片转 3D 失败：

1. 若部件漏识别，错误在 $m_{Photo\to StructureIR}$；
2. 若 DSL 语法不合法，错误在 $m_{StructureIR\to ObjectDSL}$；
3. 若 ComponentTree 丢失 group，错误在 $m_{ObjectDSL\to ComponentTree}$；
4. 若渲染比例失真，错误在 $m_{ComponentTree\to Render}$；
5. 若相似度判断错误，错误在 $m_{Render\to Feedback}$；
6. 若改写后对象散架，错误在 $m_{Feedback,ObjectDSL\to ObjectDSL'}$，并且 D7 validator 应捕获该错误。

这种定位方式与 D×L×M 结合后，可以给出非常具体的诊断：

$$
(D1,L4,M3)\to(D1,L4,M4)
$$

失败，而不是“几何域失败”。

---

## 11. 讨论与局限

### 11.1 本文能证明什么、不能证明什么

本文的核心主张是：

$$
\text{若一个可形式化域存在受数学完备性结构支撑的表示函数，则该域的 AI-native DSL 可以由基底与封闭操作推导，而非完全依赖专家经验设计。}
$$

前文已从三个层级支撑这一主张。

第一，理论层面，本文定义了单域 CRF：

$$
F_D:X_D\to V_D/\sim_D
$$

并将唯一性修正为规范等价类意义下的唯一性，将完备性拆分为载体完备、语法完备、运行时正确性与意图完备。

第二，域集合层面，本文提出域准入公理：一个候选域只有存在能够推出基底与封闭操作的数学完备性理论，才应进入 CRF core domain。

第三，实验与系统层面，现有材料已经给出八域、110 个关键词、三类验证方式，以及多智能体协作中的 4.72× token 压缩、6.83× 加速和 100% 解析率；五个新增域采用统一 Parser、Evaluator、Tests、Report 架构进行验证。

但这些结果并不意味着所有问题都已经解决。CRF 当前最有价值的地方，正是它把以前混在一起的几类问题拆开了：

$$
\text{数学可表达性}
\ne
\text{自然语言意图保真}
\ne
\text{运行时正确执行}
\ne
\text{跨域组合完备}
$$

### 11.2 CRF 证明的是 DSL 的数学来源，不是所有 DSL 的最终形态

本文最强的理论贡献，是将 DSL 的核心语义词汇从“专家设计”转化为“数学结构推导”。

但这并不意味着 CRF 可以完全取消语言设计。

更准确地说：

$$
\text{Core semantic vocabulary is derived.}
$$

$$
\text{Surface syntax and developer experience are designed.}
$$

也就是说，`filter`、`join`、`state`、`transition`、`allow`、`notify`、`sphere`、`blend` 这类核心关键词，应来自域的基底和封闭操作；但管道符号用 `|` 还是 `->`，命名参数采用 `key:value` 还是 JSON，错误信息如何显示，IDE 如何补全，模板库如何组织，这些仍然属于工程设计。

因此，CRF 不应被写成：

$$
\text{DSL 完全无需设计}
$$

而应写成：

$$
\text{DSL 的核心语义层可以由数学结构推导，表层语法与交互层仍需工程设计。}
$$

### 11.3 “完备”不是一个单一性质

旧版 CRF 表述中，“完备”容易被理解为一个整体性质：只要有完备表示函数，该域问题就解决了。本文已经对这个概念做了拆分。

至少存在四类完备：

$$
\text{载体完备}
$$

$$
\text{语法完备}
$$

$$
\text{运行时正确性}
$$

$$
\text{意图完备}
$$

载体完备回答：对象空间是否能进入某个表示空间。语法完备回答：DSL 是否能表达该表示空间的合法项。运行时正确性回答：Parser、Evaluator、Renderer 是否忠实实现语义。意图完备回答：用户真正想要的世界状态是否被保真表达。

这四者不能互相推出。

### 11.4 九域是当前最佳闭包，不是终极穷尽证明

九域框架是本文的重要升级。它将旧版八域扩展为九域，新增 D9 智能体进化，总关键词从 110 扩展到 124，并将域周期表更新为“9 验证 + 5 归约 + 1 开放”。

但九域不应被表述为终极定理。

更稳的表述是：

$$
\mathcal D_{\mathrm{CRF}}^{current}
=
\{D_1,\dots,D_9\}
$$

是当前依据域准入公理、归约分析和已有验证得到的最佳闭包。

未来仍可能发生三种变化：

1. **扩展**：发现第十个满足域准入公理的新域；
2. **收缩**：证明某个当前域可被其他域组合归约；
3. **重排**：发现更好的输入/输出类型坐标系，使域周期表重新组织。

这不是理论缺陷，而是理论可证伪性的体现。

### 11.5 域准入公理强，但仍需要更严格的独立证明

域准入公理是本文最有力量的理论收敛器：

$$
D\in DomainSet
\Longleftrightarrow
\exists T\in MathematicalTheory:
T\Rightarrow (B_D,\Omega_D,F_D)
$$

它能防止 CRF 退化为任意工程模块列表。搜索、缓存、支付、文件存储、布局验证、碰撞检测等候选，都不能因为“有用”就成为新域；它们必须通过类型独立性、封闭性和不可归约性测试。

但严格来说，域准入公理本身仍需要后续更形式化的工作。需要定义“数学完备性定理”的准入强度，需要给出不可归约性的正式证明框架，也需要定义候选域失败的充分条件。

因此，域准入公理应被写成：

$$
\text{CRF core runtime 的纳入标准}
$$

而不是：

$$
\text{关于世界所有计算结构的最终本体论。}
$$

### 11.6 数学定理继承不是重新证明

CRF 的每个域都依赖既有数学或计算理论。本文不重新证明关系代数、自动机理论、ABAC、LTL、CSP、π 演算、Bellman 动态规划等理论，而是将它们的基底和封闭结构转译为 AI-native DSL。

因此，CRF 的证明策略本质上是**定理继承 + 语言映射 + 工程验证**：

$$
Theorem_D
\to
(B_D,\Omega_D)
\to
L_D
\to
Parser/Evaluator/Validator
$$

这带来一个优点，也带来一个局限。优点是 CRF 不需要从零建立每个域的完备性；它可以站在已有数学结果上。局限是，CRF 本身的元定理仍需独立证明：

$$
\text{从任意完备表示函数到 AI-native DSL 的映射是否总是成立？}
$$

更严格版本还需要处理参数空间连续性、等价类规范化、表面语法多样性、高阶宏与模板是否改变核心表达能力、类型化封闭性、跨域 morphism 的部分函数性质。

因此，本文当前证明强度应表述为：

$$
\text{我们给出一个统一理论框架与跨域经验验证，而非完成全部元理论证明。}
$$

### 11.7 八域实验强在工程可执行性，弱在测试规模

本文的主实证来自八个计算域。其强项很明确：

- 八域共产出 110 个关键词；
- D1 与 D3 有运行时引擎验证；
- D2 有 800 次 API 对照实验；
- D4—D8 有统一 Parser、Evaluator 和测试架构；
- 五新域 50 个测试、183+ 断言通过；
- D2 显示 4.72× token 压缩、6.83× 加速和 100% 解析率。

这些结果足以支持：

$$
\text{CRF-derived DSLs are executable and token-efficient in the tested domains.}
$$

但实验仍有明显边界。测试集规模还小，baseline 选择会影响压缩比，解析率不等于意图满足，运行时 demo 不等于完备性证明。

因此，本文实验结论应保持为：

$$
\text{八域验证强力支持 CRF 的可执行性、关键词经济性和跨域复用性。}
$$

而不是：

$$
\text{八域实验已经证明 CRF 解决所有任务。}
$$

### 11.8 意图层是必要补丁，但 BDI 本身也有风险

本文引入 BDI，是为了解决“数学完备不等于意图完备”的问题。这个引入是必要的。

没有 BDI，CRF 链路会变成：

$$
NaturalLanguage\to DSL\to Runtime
$$

这会把用户目标、计划、DSL 操作混在一起。`pad` 反例和 entity exactness 问题已经说明，这种直连是不安全的。

引入 BDI 后，链路变为：

$$
NaturalLanguage
\to
BDI
\to
IntentIR
\to
CRF\ DSL
\to
VerifiedRuntime
$$

这使系统能够区分：

$$
Goal\ne Plan\ne DSL
$$

但 BDI 也带来新风险：Belief 可能错误，Goal 可能过度扩张，Intention 可能膨胀，隐私与权限风险更高。

因此，BDI 的角色应被准确写成：

$$
\text{BDI provides objectified intent management, not omniscient intent understanding.}
$$

它能把意图、承诺、重考虑机制形式化，但不能自动保证所有自然语言理解都是正确的。

### 11.9 JiYu 是强案例，但不是完整产品证明

JiYu 是本文最重要的系统化案例。它展示了 CRF 如何从 D1 几何 DSL 走向材质、部件装配、ComponentTree、图片转 3D、自演化和活体资产。

JiYu 的强项在于：

- D1 几何库已有 7 原语、12 操作符、15 模板的三层架构；
- 材质库从 3 个维度扩展到更多维度，并映射到 MeshPhysicalMaterial 的更多物理外观能力；
- 五个新维度 symmetry、taper、emissive、gradient、wave 具有明确 DSL 操作与 SDF/Three.js 映射；
- Material Lab 自演化架构提出“基因组同时是源代码、渲染指令、用户界面和进化基底”的强系统命题；
- Layer 4 部件装配明确指出从单体 blob 到 object/part/joint 的必要性。

但 JiYu 的局限也很清楚。差异化能力如 L4 部件装配、Image-to-3D、场景资产引擎等仍存在规格与代码之间的差距；肌肉车案例也显示，DSL 解析成功后，M3→M4 仍可能出现严重渲染失真。

因此，JiYu 在论文中的正确定位是：

$$
\text{CRF runtime 的先行系统案例}
$$

而不是：

$$
\text{CRF 全理论已经完全产品化的证明}
$$

### 11.10 Layer 4 是关键突破，也是最大工程瓶颈

从 JiYu 相关材料看，Layer 4 是 CRF 落地中最关键的跃迁。

Layer 1-3 已经能够生成丰富的抽象几何体，但它们仍然停留在“一个连续几何体”的变形。加入 object/part/joint 后，每个 part 才能独立进化、交互、绑定功能和独立材质。

因此，Layer 4 的理论价值是：

$$
\text{形体完备}
\to
\text{物件完备}
$$

但 Layer 4 的工程难点也最大：

- part 的相对坐标如何定义；
- joint 的语义如何标准化；
- parent-child cascade 如何实现；
- part-level SDF 如何合并为 mesh bundle；
- ComponentTree 如何保留到渲染、爆炸视图、编辑和进化；
- validator 如何检查连通、比例、对称、碰撞、悬浮和材质约束。

Layer 4 既是最大机会，也是最大风险。它一旦稳定，JiYu 将从“几何生成器”跃迁为“可编辑活物件引擎”；如果不稳定，复杂物件生成就会卡在 M3→M4。

### 11.11 图片转 3D 是最强产品入口，但不能替代理论证明

JiYu 图片转 3D 方案非常有战略价值。它与传统静态 mesh 生成路线的差异十分清楚：传统路径是照片到神经网络黑箱再到静态 mesh；JiYu 路径是照片到精准结构分析、多视图描述、DSL 代码、空间自感知智能体、自校准对齐，最终输出活的程序。

这条链路非常适合作为 CRF 的公众展示入口：

$$
Photo
\to
ObjectDSL
\to
EditableLivingObject
$$

因为它能直接展示 CRF 与普通生成式 3D 的差别：输出不是死 mesh，而是可编辑、可验证、可交互、可进化的结构化对象。

但在论文中，它不能替代八域主实证。原因有三点。

第一，图片转 3D 是跨域组合流程，不是单域 CRF 证明。

第二，单张照片反推三维结构本身存在不适定性，只能是近似 morphism，不可能严格无损。

第三，方案文档自己也强调，Step 1 多视图结构分析是最大难点；如果部件遗漏或空间关系错误，后续自校准只能修正参数级偏差，无法修正结构级错误。

因此，论文应将图片转 3D 定位为：

$$
\text{CRF typed morphism + BDI + D9 的系统前沿案例}
$$

而不是：

$$
\text{CRF 理论已经完成的主实验。}
$$

### 11.12 跨域组合完备性仍是开放问题

单域完备不能直接推出跨域组合完备。

单域完备是：

$$
\forall x\in X_D,\exists l\in L_D:
eval(parse(l))\sim F_D(x)
$$

跨域组合完备则是：

$$
\forall \phi\in \Phi_{multi-domain},\exists path\in G_{CRF}:
Execute(path)\models \phi
$$

后者显然更强。它要求每个域内部完备、morphism 类型正确、跨域合同通过、共享状态一致、BDI 目标可分解、validator 能捕获边界错误、D9 改写不破坏结构。

当前本文只能提出 typed morphism 框架，还不能证明所有跨域任务都可组合完成。

因此，跨域组合完备性应被明确列为开放问题，而不是暗示已经解决。

### 11.13 神经模型与 CRF 的关系不是对立，而是分工

CRF 容易被误解为“反神经生成”或“符号主义复兴”。这不是本文立场。

神经模型在 CRF 系统中至少有四个重要位置：

1. 从自然语言或图像推断结构；
2. 生成初始 DSL 候选；
3. 做连续参数优化；
4. 评估渲染结果与目标之间的相似度。

例如，图片转 3D 的第一步“多视图结构分析”高度依赖视觉模型；空间自感知智能体的对齐循环也需要视觉比较或相似度评估。

CRF 的主张不是不用神经模型，而是：

$$
\text{神经模型负责 infer / propose / optimize}
$$

$$
\text{CRF 负责 represent / validate / edit / compose}
$$

也就是说，神经模型可以产生候选结构，但最终 source of truth 应尽量落在 AST、ComponentTree、Genome 或 Intent IR 上，而不是不可解释的像素、mesh 或 embedding。

### 11.14 安全、权限与审计问题尚未充分展开

CRF 一旦从 DSL 推导进入 runtime，就会涉及安全问题。

尤其是引入 BDI 与 D9 后，系统不再只是一次性生成文本，而可能长期维持意图、自主重新绑定计划、自动改写对象、触发通知、执行状态变化，甚至在未来控制真实外部系统。

这带来至少五类风险：

1. 错误 Belief 导致错误行动；
2. 意图过度延展导致越权执行；
3. D9 自演化破坏合同或产生不可预期行为；
4. 跨域 morphism 泄漏敏感信息；
5. 权限策略与实际 UI/执行层不一致。

因此，CRF Runtime 必须将 D6 权限控制、D7 验证、审计日志和用户确认机制作为核心组成，而不是后期补丁。

一个“活物件”如果能自演化、发通知、改变状态，就必须具备：

$$
Permission
+
Validation
+
Audit
+
Rollback
+
UserOverride
$$

否则，“活体资产”会从创新变成风险源。

### 11.15 论文叙事中的三条红线

为了使本文在学术和工程上都站得住，建议保留三条写作红线。

**红线一：不把九域写成终极穷尽。** 可以写“当前最佳闭包”，不能写“最终证明所有域只有九个”。

**红线二：不把 BDI 写成第十域。** BDI 是意图语义层，不是对象表示域。D9 智能体进化才是九域中的 agent self-update domain。

**红线三：不把 JiYu 写成完全落地产品。** JiYu 是系统化案例和先行实现，不是八域理论的唯一证明。Layer 4、Image-to-3D、场景资产引擎等应写成前沿方向与工程推进中能力，而不是已经完全稳定的事实。

这三条红线能显著提高论文可信度。

### 11.16 未来工作

本文的未来工作可以分为六条线。

第一，完成更严格的元理论证明，尤其是从 $F_D,B_D,\Omega_D$ 到 $L_D$ 的映射条件、最小性、等价类规范化和类型化封闭性。

第二，扩展八域 benchmark。每个域需要更大测试集、多 baseline、property-based tests、adversarial tests 与语义保真测试。

第三，实现 BDI Runtime 与 Intent IR，把 Belief、Goal、Intention、Commitment、Reconsideration 从理论对象落成可执行系统。

第四，推进 JiYu Layer 4：稳定 object/part/joint、ComponentTree、parent-child cascade、结构 validator 与 M3→M4 渲染链。

第五，完成第一条 typed morphism 系统链路。图片转 3D 是最佳候选：

$$
Photo
\to
StructureIR
\to
ObjectDSL
\to
ComponentTree
\to
Render
\to
Feedback
\to
ObjectDSL'
\to
SilentState
$$

第六，构造最小跨域活体对象：

$$
D1 + D5 + D8 + D9
$$

例如一个可编辑相机或金毛小狗：有形体、有状态、有通知、有进化，并且所有变化都通过 validator。

---

## 12. 结论

### 12.1 本文回答的问题

本文讨论的核心问题不是“大语言模型能否写代码”，而是一个更基础的问题：

$$
\textbf{当 LLM 控制一个系统时，它应该输出什么样的可执行文本？}
$$

当前主流范式默认让 LLM 输出通用编程语言、工具调用或 API 参数。但本文指出，当任务属于一个可形式化领域时，通用代码往往不是最优介质。更优的路径是：找到该领域的数学完备表示函数，并让 LLM 直接输出由该表示函数推导出的 AI-native DSL。

因此，本文提出**完备表示函数**理论：

$$
F_D:X_D\to V_D/\sim_D
$$

其中 $X_D$ 是领域对象空间，$V_D$ 是领域表示空间，$\sim_D$ 是语义等价关系。若领域 $D$ 存在由数学完备性定理支撑的基底 $B_D$ 与封闭操作 $\Omega_D$，则该领域 DSL 的核心关键词可以由：

$$
Keywords(L_D)=Names(B_D)\cup Names(\Omega_D)\cup SyntaxGlue
$$

推导出来，而不必完全依赖专家经验、代码语料或 prompt 工程。

换言之，CRF 的核心回答是：

$$
\textbf{AI-native DSL 不是先被设计出来，而是先从数学结构中被发现出来。}
$$

### 12.2 本文的核心贡献

本文的贡献可以归纳为七项。

**贡献一：提出完备表示函数理论。** 本文将一个领域 $D$ 的 AI-native DSL 推导问题，形式化为完备表示函数问题：

$$
F_D:X_D\to V_D/\sim_D
$$

并将旧版“唯一性、完备性、封闭性”三条件进一步严格化为规范唯一性、表示完备性和类型化封闭性。

**贡献二：提出从数学结构到 DSL 的映射定理。** 本文将领域基底 $B_D$、封闭操作 $\Omega_D$、项代数 $T_D$、DSL $L_D$、Parser 与 Evaluator 统一到一个推导链中：

$$
F_D
\to
(B_D,\Omega_D)
\to
T_D
\to
L_D
\to
parse/eval/validate
$$

并给出核心映射命题：如果一个领域的基底与封闭操作能生成完备项代数，且 DSL 能表达该项代数中的所有合法项，那么该 DSL 对该领域是 CRF-完备的。

**贡献三：提出域准入公理与九域框架。** 本文进一步提出域准入公理：

$$
D\in DomainSet
\Longleftrightarrow
\exists T\in MathematicalTheory:
T\Rightarrow(B_D,\Omega_D,F_D)
$$

即，一个候选域只有在存在数学完备性理论，并且该理论能够推出基底、封闭操作与表示函数时，才应被纳入 CRF core domain。

**贡献四：在八个计算域上完成主实证验证。** 本文将 CRF 应用于八个计算域：三维几何、多智能体协作、UI 布局、数据变换、状态机、权限控制、数据验证与消息通知。八域共产出 110 个关键词，平均每域 13.75 个；多智能体实验中，CRF DSL 实现 4.72× token 压缩、6.83× 速度提升和 100% 解析率。

**贡献五：引入 BDI 意图语义层。** 本文明确指出：

$$
\textbf{数学完备不等于意图完备。}
$$

CRF 能保证某个领域对象可表示，但不能自动保证用户自然语言中的真实意图被正确翻译为 DSL。为此，本文在 CRF 之上引入 BDI 语义层，将用户输入解释为 Belief、Goal、Intention、Commitment 和 Reconsideration 组成的意图对象。

由此，系统链路从：

$$
NaturalLanguage\to DSL\to Runtime
$$

升级为：

$$
NaturalLanguage
\to
BDI
\to
IntentIR
\to
CRF\ DSL
\to
VerifiedRuntime
$$

**贡献六：提出 D×L×M 可验证运行时框架。** 本文将 CRF 从 DSL 推导理论推进为可验证运行时理论。D×L×M 三轴分别表示 Domain、Layer、Manifestation，并形成 $9\times4\times4=144$ 个系统坐标格。本文进一步提出 M1→M2→M3→M4 的正确性传递链，使系统 bug 可以被定位到理论到语法、语法到实例、实例到执行的翻译边界。

**贡献七：以 JiYu 展示 CRF 的系统化实现路径。** JiYu 是本文最重要的系统案例。它从 D1 三维几何先行实现出发，逐步扩展到材质、五个新维度、Layer 4 部件装配、ComponentTree、图片转 3D、空间自感知智能体和自演化活体资产。

### 12.3 最终理论结构

本文最终形成的 CRF 理论不是单层结构，而是三层系统：

$$
\boxed{
\text{BDI 意图层}
}
$$

$$
\boxed{
\text{CRF 表示层}
}
$$

$$
\boxed{
\text{Runtime 验证层}
}
$$

三层分别回答不同问题。

BDI 层回答：

$$
\text{用户到底想让哪个可能世界成为现实？}
$$

CRF 层回答：

$$
\text{这个目标世界如何在某个领域中被完备表达？}
$$

Runtime 层回答：

$$
\text{这个表达如何被正确解析、实例化、执行、验证和修正？}
$$

这三层组合起来，给出了从自然语言到可验证系统执行的完整链路：

$$
U
\to
\mathcal{BDI}(U)
\to
IntentIR
\to
L_D
\to
AST_D
\to
Instance_D
\to
RuntimeOutput
\to
Validator
\to
BeliefUpdate
$$

其中，CRF 不再是一次性 DSL 生成器，而是一个由意图、表示、验证、反馈与自改写组成的 AI-native runtime 框架。

### 12.4 最终系统命题

基于全文，可以将 CRF 的最终命题写成：

> 对于任意可形式化领域 $D$，若存在受数学完备性定理支撑的表示函数 $F_D:X_D\to V_D/\sim_D$，则该领域的 AI-native DSL 可以从 $F_D$ 的基底与封闭操作中系统推导；但要使该 DSL 成为可工作的 AI 原生系统，还必须在上层引入 BDI 意图语义，在下层引入 Parser、Evaluator、Validator、Runtime 与跨域 typed morphism。CRF 因而不仅是 DSL 推导理论，也是从数学完备到意图语义、再到可验证运行时的统一框架。

这句话应成为论文最后的核心收束。

### 12.5 本文重新定义了什么

本文尝试重新定义四件事。

**第一，重新定义 LLM 的输出介质。**

LLM 的最优输出不一定是通用代码，也不一定是自然语言，而可以是某个领域的完备表示语言：

$$
LLM\ Output \ne Code
$$

$$
LLM\ Output = DomainNativeRepresentation
$$

**第二，重新定义 DSL 的来源。**

传统 DSL 是专家设计的。CRF 认为，在可形式化领域中，DSL 的核心基元应由数学结构推出：

$$
\text{DSL keywords are derived from } B_D\cup\Omega_D
$$

**第三，重新定义系统对象的本体。**

传统系统里，代码、数据、UI、渲染结果通常相互分离。JiYu 自演化架构提出一个强命题：基因组同时是源代码、渲染指令、用户界面和进化基底；改写基因组等于同时改变程序结构、外观、行为和进化方向。

这意味着 CRF asset 的本体不应是 mesh、图片或导出文件，而应是：

$$
AST + ComponentTree + Genome + Contracts
$$

**第四，重新定义世界模型。**

传统世界模型常被理解为神经网络隐空间。CRF 提出另一条路径：

$$
World=(Z,\{G_i\},\{m_{ij}\},\mathcal C,\mathcal V)
$$

其中，$Z$ 是共享世界状态，$G_i$ 是不同领域的投影，$m_{ij}$ 是 typed morphism，$\mathcal C$ 是跨域一致性约束，$\mathcal V$ 是验证器集合。

这使世界模型不只是黑箱预测器，而是一个可编辑、可验证、可组合的多域表示系统。

### 12.6 研究价值

CRF 的研究价值体现在五个方面。

**理论价值。** CRF 把 DSL 的产生方式从经验设计转化为数学发现。它不是提出一个新的单点 DSL，而是提出一种跨域推导机制：

$$
MathematicalTheory
\to
CompleteRepresentationFunction
\to
Basis/Operations
\to
AI-nativeDSL
$$

**工程价值。** 八域实验说明，CRF DSL 能够进入真实 parser、evaluator、renderer 和测试系统。尤其是 D2 多智能体实验中的 4.72× token 压缩、6.83× 加速和 100% 解析率，说明 CRF 的 token 经济性不是抽象宣称，而是可量化结果。

**系统价值。** D×L×M 和 validator-first runtime 使 CRF 不再停留在语言层，而能成为系统架构。它提供了错误定位、合同验证、运行时校验、跨域组合和自演化控制的统一坐标系。

**产品价值。** JiYu 展示了 CRF 的产品潜力：从“生成几何体”升级到“生成可编辑活物件”。图片转 3D 方案明确提出 JiYu 与静态 mesh 路径的差异：JiYu 输出结构化 DSL、空间自感知智能体和可编辑、可进化、可交互的活程序，而非静态 mesh 文件。

**学术价值。** CRF 将 DSL、形式化方法、LLM 输出介质、智能体意图理论、运行时验证、神经—符号系统与世界模型问题连接在一起。它提供了一条不同于“更大模型直接生成一切”的研究路线：用数学结构约束表达，用 BDI 管理意图，用验证器守住边界，用 D9 允许受控自改写。

### 12.7 本文的边界

本文也明确保留边界。

第一，九域不是终极穷尽定理，而是当前最佳理论闭包。

第二，CRF 推导的是核心语义关键词，不取消表层语法、模板库、IDE 体验和错误恢复等工程设计。

第三，八域实验验证了可执行性、关键词经济性和跨域复用性，但测试规模仍需扩大，baseline 仍需多样化。

第四，BDI 提供意图对象化和承诺管理，但不自动保证所有自然语言理解都正确。

第五，JiYu 是系统化案例与先行实现，不是全部理论完全产品化的证明。Layer 4、Image-to-3D 和场景资产引擎等差异化能力仍存在规格到稳定实现的推进空间。

第六，跨域组合完备性仍是开放问题。Typed morphism 提供了形式化路径，但还需要更多最小跨域系统实验。

这些边界不是削弱 CRF，而是使 CRF 成为一个可继续研究、可继续验证、可继续工程化推进的框架。

### 12.8 未来路线

本文之后，CRF 最重要的研究路线有六条。

第一，完成更严格的元理论证明，尤其是从 $F_D,B_D,\Omega_D$ 到 $L_D$ 的映射条件、最小性、等价类规范化和类型化封闭性。

第二，扩展八域 benchmark。每个域需要更大测试集、多 baseline、property-based tests、adversarial tests 与语义保真测试。

第三，实现 BDI Runtime 与 Intent IR，把 Belief、Goal、Intention、Commitment、Reconsideration 从理论对象落成可执行系统。

第四，推进 JiYu Layer 4：稳定 object/part/joint、ComponentTree、parent-child cascade、结构 validator 与 M3→M4 渲染链。

第五，完成第一条 typed morphism 系统链路。图片转 3D 是最佳候选：

$$
Photo
\to
StructureIR
\to
ObjectDSL
\to
ComponentTree
\to
Render
\to
Feedback
\to
ObjectDSL'
\to
SilentState
$$

第六，构造最小跨域活体对象：

$$
D1 + D5 + D8 + D9
$$

例如一个可编辑相机或金毛小狗：有形体、有状态、有通知、有进化，并且所有变化都通过 validator。

### 12.9 最终结论

本文提出的完备表示函数理论，最终可以用三句话概括。

第一：

$$
\textbf{CRF 让 DSL 从数学中长出来。}
$$

一个领域的 AI-native DSL 不必完全依赖专家经验设计；只要该领域存在完备表示函数，其核心关键词就可以从数学基底和封闭操作推导。

第二：

$$
\textbf{BDI 让 DSL 对齐人的意图。}
$$

数学完备只能保证可表示，不能保证用户真正想要的世界状态被保真表达。因此，自然语言到 CRF DSL 之间必须有意图语义层。

第三：

$$
\textbf{Runtime 让 DSL 成为可验证系统。}
$$

DSL 必须经过 Parser、Evaluator、Validator、ComponentTree、typed morphism 和 D×L×M 坐标系，才能从语言变成可靠执行。

因此，CRF 的完整路径是：

$$
\boxed{
NaturalLanguage
\to
BDI
\to
IntentIR
\to
CRF\ DSL
\to
VerifiedRuntime
\to
LivingAsset/WorldModel
}
$$

这一路径表明，CRF 不是一个普通 DSL 项目，也不是一个 3D demo，而是一条从数学完备性出发，通向 AI-native runtime 和可验证世界模型的研究路线。

如果说传统软件系统的基本单位是代码文件，那么 CRF 系统的基本单位将是：

$$
\textbf{可表达、可验证、可交互、可进化的结构化对象。}
$$

这就是完备表示函数的最终意义。

---

## 参考文献

### A. DSL、领域语言与程序合成

1. van Deursen, A., Klint, P., & Visser, J. (2000). *Domain-Specific Languages: An Annotated Bibliography*. ACM SIGPLAN Notices. [DOI](https://doi.org/10.1145/352029.352035)
2. Hudak, P. (1998). *Modular Domain Specific Languages and Tools*. In *Software Reuse*. [DOI](https://doi.org/10.1007/BFb0053565)
3. Mernik, M., Heering, J., & Sloane, A. M. (2005). *When and How to Develop Domain-Specific Languages*. ACM Computing Surveys. [DOI](https://doi.org/10.1145/1118890.1118892)
4. Spinellis, D. (2001). *Notable Design Patterns for Domain-Specific Languages*. Journal of Systems and Software. [DOI](https://doi.org/10.1016/S0164-1212(00)00089-3)
5. Fowler, M. (2010). *Domain-Specific Languages*. Addison-Wesley. [Book](https://martinfowler.com/books/dsl.html)
6. Solar-Lezama, A. (2008). *Program Synthesis by Sketching*. PhD dissertation, UC Berkeley. [PDF](https://people.csail.mit.edu/asolar/papers/thesis.pdf)
7. Gulwani, S. (2011). *Automating String Processing in Spreadsheets using Input-Output Examples*. POPL. [DOI](https://doi.org/10.1145/1926385.1926423)
8. Ellis, K., Wong, C., Nye, M., Sablé-Meyer, M., Morales, L., Hewitt, L., Solar-Lezama, A., & Tenenbaum, J. B. (2020). *DreamCoder: Growing Generalizable, Interpretable Knowledge with Wake-Sleep Bayesian Program Learning*. [arXiv](https://arxiv.org/abs/2006.08381)

### B. LLM 工具调用、结构化输出与约束生成

9. OpenAI. *Structured model outputs*. [Docs](https://platform.openai.com/docs/guides/structured-outputs)
10. OpenAI. *Function calling*. [Docs](https://platform.openai.com/docs/guides/function-calling)
11. JSON Schema. *JSON Schema Draft 2020-12*. [Spec](https://json-schema.org/draft/2020-12/json-schema-core)
12. Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2023). *ReAct: Synergizing Reasoning and Acting in Language Models*. [arXiv](https://arxiv.org/abs/2210.03629)
13. Schick, T., Dwivedi-Yu, J., Dessì, R., Raileanu, R., Lomeli, M., Hambro, E., Zettlemoyer, L., Cancedda, N., & Scialom, T. (2023). *Toolformer: Language Models Can Teach Themselves to Use Tools*. [arXiv](https://arxiv.org/abs/2302.04761)
14. Willard, B. T., & Louf, R. (2023). *Efficient Guided Generation for Large Language Models*. [arXiv](https://arxiv.org/abs/2307.09702)

### C. BDI、意图、承诺与智能体理论

15. Bratman, M. E. (1987). *Intention, Plans, and Practical Reason*. Harvard University Press. [Book](https://www.hup.harvard.edu/books/9780674458185)
16. Cohen, P. R., & Levesque, H. J. (1990). *Intention is Choice with Commitment*. Artificial Intelligence. [PDF](https://www-cs.stanford.edu/~epacuit/classes/lori-spr09/cohenlevesque-intention-aij90.pdf)
17. Rao, A. S., & Georgeff, M. P. (1991). *Modeling Rational Agents within a BDI-Architecture*. [PDF](https://jmvidal.cse.sc.edu/library/rao91a.pdf)
18. Georgeff, M. P., & Lansky, A. L. (1987). *Reactive Reasoning and Planning*. AAAI. [AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/8752)
19. Wooldridge, M., & Jennings, N. R. (1995). *Intelligent Agents: Theory and Practice*. The Knowledge Engineering Review. [DOI](https://doi.org/10.1017/S0269888900008122)
20. Wooldridge, M. (2009). *An Introduction to MultiAgent Systems*. Wiley. [Book](https://www.wiley.com/en-us/An+Introduction+to+MultiAgent+Systems%2C+2nd+Edition-p-9780470519462)

### D. 关系、自动机、并发与时序逻辑

21. Codd, E. F. (1970). *A Relational Model of Data for Large Shared Data Banks*. Communications of the ACM. [PDF](https://www.seas.upenn.edu/~zives/03f/cis550/codd.pdf)
22. Rabin, M. O., & Scott, D. (1959). *Finite Automata and Their Decision Problems*. IBM Journal of Research and Development. [DOI](https://doi.org/10.1147/rd.32.0114)
23. Hoare, C. A. R. (1978). *Communicating Sequential Processes*. Communications of the ACM. [DOI](https://doi.org/10.1145/359576.359585)
24. Milner, R., Parrow, J., & Walker, D. (1992). *A Calculus of Mobile Processes, I*. Information and Computation. [PDF](https://www.cis.upenn.edu/~stevez/cis670/pdfs/pi-calculus.pdf)
25. Pnueli, A. (1977). *The Temporal Logic of Programs*. FOCS. [PDF](https://faculty.sist.shanghaitech.edu.cn/faculty/songfu/cav/FOCS77.pdf)
26. Koymans, R. (1990). *Specifying Real-Time Properties with Metric Temporal Logic*. Real-Time Systems. [DOI](https://doi.org/10.1007/BF01995674)
27. Alur, R., & Henzinger, T. A. (1992). *Logics and Models of Real Time: A Survey*. Real-Time: Theory in Practice. [DOI](https://doi.org/10.1007/BFb0031995)
28. Lamport, L. (1978). *Time, Clocks, and the Ordering of Events in a Distributed System*. Communications of the ACM. [PDF](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)
29. Clarke, E. M., & Emerson, E. A. (1981). *Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic*. [DOI](https://doi.org/10.1007/BFb0025774)

### E. 形式化验证、程序语义与类型系统

30. Hoare, C. A. R. (1969). *An Axiomatic Basis for Computer Programming*. Communications of the ACM. [PDF](https://www.cs.cmu.edu/~crary/819-f09/Hoare69.pdf)
31. Dijkstra, E. W. (1975). *Guarded Commands, Nondeterminacy and Formal Derivation of Programs*. Communications of the ACM. [DOI](https://doi.org/10.1145/360933.360975)
32. Plotkin, G. D. (1981). *A Structural Approach to Operational Semantics*. Aarhus University. [PDF](https://homepages.inf.ed.ac.uk/gdp/publications/sos_jlap.pdf)
33. Scott, D., & Strachey, C. (1971). *Toward a Mathematical Semantics for Computer Languages*. Oxford Programming Research Group. [PDF](https://www.cs.ox.ac.uk/files/3228/PRG06.pdf)
34. Winskel, G. (1993). *The Formal Semantics of Programming Languages*. MIT Press. [Book](https://mitpress.mit.edu/9780262731034/the-formal-semantics-of-programming-languages/)
35. Church, A. (1940). *A Formulation of the Simple Theory of Types*. Journal of Symbolic Logic. [DOI](https://doi.org/10.2307/2266170)
36. Freeman, T., & Pfenning, F. (1991). *Refinement Types for ML*. PLDI. [PDF](https://www.cs.cmu.edu/~fp/papers/pldi91.pdf)
37. Rondon, P. M., Kawaguchi, M., & Jhala, R. (2008). *Liquid Types*. PLDI. [PDF](https://goto.ucsd.edu/~rjhala/liquid/liquid_types.pdf)
38. Pierce, B. C. (2002). *Types and Programming Languages*. MIT Press. [Book](https://mitpress.mit.edu/9780262162098/types-and-programming-languages/)
39. Findler, R. B., & Felleisen, M. (2002). *Contracts for Higher-Order Functions*. ICFP. [DOI](https://doi.org/10.1145/581478.581484)

### F. 权限控制、数据约束与策略系统

40. NIST. (2014). *SP 800-162: Guide to Attribute Based Access Control (ABAC) Definition and Considerations*. [Link](https://csrc.nist.gov/pubs/sp/800/162/upd2/final)
41. Hu, V. C., Ferraiolo, D., Kuhn, R., Schnitzer, A., Sandlin, K., Miller, R., & Scarfone, K. (2014). *Guide to Attribute Based Access Control (ABAC) Definition and Considerations*. NIST SP 800-162. [PDF](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-162.pdf)
42. OASIS. (2013). *eXtensible Access Control Markup Language (XACML) Version 3.0*. [Spec](https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html)

### G. 几何、SDF、隐式曲面、CSG 与渲染

43. Hart, J. C. (1996). *Sphere Tracing: A Geometric Method for the Antialiased Ray Tracing of Implicit Surfaces*. The Visual Computer. [DOI](https://doi.org/10.1007/s003710050084)
44. Bloomenthal, J. (Ed.). (1997). *Introduction to Implicit Surfaces*. Morgan Kaufmann. [ACM](https://dl.acm.org/doi/book/10.5555/255695)
45. Requicha, A. A. G. (1980). *Representations for Rigid Solids: Theory, Methods, and Systems*. ACM Computing Surveys. [DOI](https://doi.org/10.1145/356827.356833)
46. Requicha, A. A. G., & Voelcker, H. B. (1977). *Constructive Solid Geometry*. Production Automation Project Technical Memo. [PDF](https://www.cs.mtu.edu/~shene/COURSES/cs3621/NOTES/model/csg.pdf)
47. Wyvill, G., McPheeters, C., & Wyvill, B. (1986). *Data Structure for Soft Objects*. The Visual Computer. [DOI](https://doi.org/10.1007/BF01900346)
48. Lorensen, W. E., & Cline, H. E. (1987). *Marching Cubes: A High Resolution 3D Surface Construction Algorithm*. SIGGRAPH. [DOI](https://doi.org/10.1145/37401.37422)
49. Osher, S., & Sethian, J. A. (1988). *Fronts Propagating with Curvature-Dependent Speed: Algorithms Based on Hamilton-Jacobi Formulations*. Journal of Computational Physics. [DOI](https://doi.org/10.1016/0021-9991(88)90002-2)

### H. UI 布局、约束求解与界面系统

50. Borning, A., Marriott, K., Stuckey, P., & Xiao, Y. (1997). *Solving Linear Arithmetic Constraints for User Interface Applications*. UIST. [DOI](https://doi.org/10.1145/263407.263517)
51. Badros, G. J., Borning, A., & Stuckey, P. J. (2001). *The Cassowary Linear Arithmetic Constraint Solving Algorithm*. ACM TOCHI. [PDF](https://constraints.cs.washington.edu/solvers/cassowary-tochi.pdf)
52. Myers, B. A. (1990). *A New Model for Handling Input*. ACM Transactions on Information Systems. [DOI](https://doi.org/10.1145/77608.77611)

### I. 动态规划、强化学习与自演化系统

53. Bellman, R. (1957). *Dynamic Programming*. Princeton University Press. [Book](https://press.princeton.edu/books/hardcover/9780691079516/dynamic-programming)
54. Bellman, R. (1957). *A Markovian Decision Process*. Journal of Mathematics and Mechanics. [DOI](https://doi.org/10.1512/iumj.1957.6.56038)
55. Puterman, M. L. (1994). *Markov Decision Processes: Discrete Stochastic Dynamic Programming*. Wiley. [Book](https://onlinelibrary.wiley.com/doi/book/10.1002/9780470316887)
56. Sutton, R. S., & Barto, A. G. (2018). *Reinforcement Learning: An Introduction*. MIT Press. [Book](http://incompleteideas.net/book/the-book-2nd.html)
57. Holland, J. H. (1975). *Adaptation in Natural and Artificial Systems*. University of Michigan Press. [MIT Press](https://mitpress.mit.edu/9780262581110/adaptation-in-natural-and-artificial-systems/)
58. Koza, J. R. (1992). *Genetic Programming: On the Programming of Computers by Means of Natural Selection*. MIT Press. [Book](https://mitpress.mit.edu/9780262111706/genetic-programming/)

### J. 信号、图像与物理域原生表示

59. Gabor, D. (1946). *Theory of Communication*. Journal of the Institution of Electrical Engineers. [DOI](https://doi.org/10.1049/ji-3-2.1946.0074)
60. Shannon, C. E. (1949). *Communication in the Presence of Noise*. Proceedings of the IRE. [DOI](https://doi.org/10.1109/JRPROC.1949.232969)
61. Griffin, D. W., & Lim, J. S. (1984). *Signal Estimation from Modified Short-Time Fourier Transform*. IEEE Transactions on Acoustics, Speech, and Signal Processing. [DOI](https://doi.org/10.1109/TASSP.1984.1164317)
62. Gonzalez, R. C., & Woods, R. E. (2018). *Digital Image Processing*. Pearson. [Book](https://www.pearson.com/en-us/subject-catalog/p/digital-image-processing/P200000003223)
