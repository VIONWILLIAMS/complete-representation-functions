# Complete Representation Functions: A Unified Theory for Deriving AI-Native Domain Languages

**Subtitle: From Mathematical Completeness to Intent Semantics and Verifiable Runtime**

## Language Versions

- [English paper](crf-paper.en.md)
- [Chinese original](crf-paper.zh-CN.md)
- [Paper language selector](crf-paper.md)

---

## Abstract

The dominant pattern for using large language models to control software systems is to ask the model to output general-purpose code, tool calls, or API parameters, and then to execute those outputs through external interpreters, frameworks, or applications. This pattern has three structural costs. First, general-purpose languages expose a large syntactic and lexical space, increasing the model's generation entropy. Second, boilerplate, glue code, imports, adapters, and environment-specific details consume tokens without directly carrying task semantics. Third, the output is difficult to validate cheaply; many systems discover errors only after execution and then rely on retries.

This paper proposes **Complete Representation Functions** (CRF), a theory for deriving AI-native domain languages from mathematical completeness structures. The core thesis is: if a formalizable domain `D` has a representation function:

```text
F_D: X_D -> V_D
```

and if the representation satisfies uniqueness, completeness, and closure, then the basis elements of `F_D` can be mapped to the atomic keywords of a DSL, while the closed operations can be mapped to the operator keywords of that DSL. The resulting DSL is not merely a product of expert convention; it is a language induced by the mathematical structure of the domain.

The paper proposes a four-step derivation method. First, identify the physical or logical essence of the domain and write the representation function signature. Second, identify the mathematical completeness theorem that supports the domain's expressive capacity. Third, map the theorem's basis and closed operations to the keyword set of an AI-native DSL. Fourth, validate syntax parsability, operational closure, and execution correctness through a parser, evaluator, validator, and test suite. This method has been applied to eight computational domains: 3D geometry, multi-agent collaboration, UI layout, data transformation, state machines, permission control, data validation, and notification. The current evidence reports 110 keywords across the eight domains; in the multi-agent experiment, the CRF DSL achieved 4.72x token compression, 6.83x latency reduction, and 100% parse rate. Five later validation domains reached 50/50 test pass and 183+ assertion pass.

The paper further extends CRF from a "mathematics-to-DSL" derivation theory into a three-layer framework: mathematical completeness, intent semantics, and verifiable runtime. First, the paper introduces the Domain Admission Axiom: a candidate domain should enter the CRF domain set only if there exists a proven mathematical completeness theorem, and if that theorem can derive the representation function's basis and closed operations. Based on this axiom, the current theoretical framework extends the eight validated domains into a nine-domain structure by adding the Agent Evolution domain, producing 124 keywords, nine validated/theoretical domains, five reduced candidates, and one open slot in the domain periodic table.

Second, the paper argues that **mathematical completeness does not imply intent completeness**. A DSL can be structurally complete while still failing to faithfully express the world effect the user actually wants. To bridge this gap, the paper introduces a BDI semantics layer above CRF. User input is modeled as a possible-world structure consisting of beliefs, goals, intentions, commitments, and reconsideration mechanisms. This layer prevents the system from jumping directly from natural language to DSL; instead, it converts user intent into verifiable domain goals through an Intent IR.

Finally, the paper introduces the D×L×M runtime framework. The `D` axis denotes domains, the `L` axis denotes construction layers from primitives to assembly, and the `M` axis denotes manifestation layers from mathematical axioms, syntax, instances, to physical execution. JiYu is treated as the first system case study for CRF-style runtime, showing possible paths across geometry, material, self-evolving objects, part assembly, and image-to-3D spatial self-perception.

The paper's contributions are: a general theory for deriving AI-native DSLs from mathematical completeness theorems; a unified derivation and empirical validation across eight computational domains; a BDI semantic layer that fills the gap between mathematical completeness and intent completeness; and a D×L×M + JiYu case study showing how CRF can develop into a verifiable, composable, evolvable AI-native runtime framework.

**Keywords:** Complete Representation Functions; AI-native DSL; domain-specific languages; BDI; verifiable runtime; multi-agent systems; JiYu; D×L×M.

---

## Table of Contents

- [0. Core Thesis](#0-core-thesis)
- [1. Why General-Purpose Code Is Not the Optimal LLM Output](#1-why-general-purpose-code-is-not-the-optimal-llm-output)
- [2. Related Work and the Missing Question](#2-related-work-and-the-missing-question)
- [3. Core Theory of Complete Representation Functions](#3-core-theory-of-complete-representation-functions)
- [4. Domain Admission Axiom, Domain Periodic Table, and Nine-Domain Framework](#4-domain-admission-axiom-domain-periodic-table-and-nine-domain-framework)
- [5. From Mathematical Completeness to Intent Completeness: The BDI Layer](#5-from-mathematical-completeness-to-intent-completeness-the-bdi-layer)
- [6. Four-Step Derivation and Eight-Domain Derivation](#6-four-step-derivation-and-eight-domain-derivation)
- [7. Experimental Design and Results](#7-experimental-design-and-results)
- [8. From DSL to Runtime: D×L×M and Validator Theory](#8-from-dsl-to-runtime-dlm-and-validator-theory)
- [9. JiYu Case Study: From Geometry to Editable Living Objects](#9-jiyu-case-study-from-geometry-to-editable-living-objects)
- [10. Cross-Domain Composition, Typed Morphisms, and World Models](#10-cross-domain-composition-typed-morphisms-and-world-models)
- [11. Discussion and Limitations](#11-discussion-and-limitations)
- [12. Conclusion](#12-conclusion)
- [References](#references)

---

## 0. Core Thesis

This paper proposes the theory of **Complete Representation Functions**. For any formalizable computational domain `D`, if there exists a representation function supported by a mathematical completeness theorem:

```text
F_D: X_D -> V_D
```

such that domain objects can be completely expressed by a set of basis elements and closed operations, then the AI-native domain language for that domain does not have to be designed purely from expert experience. It can be mechanically derived from the mathematical structure.

However, mathematical completeness does not automatically imply intent completeness. CRF can guarantee that a domain object is representable, but it cannot by itself guarantee that a user's natural-language intention has been translated into the correct target world state. To bridge that gap, this paper introduces a BDI intent semantics layer above CRF. User input is interpreted as a possible-world structure consisting of beliefs, goals, intentions, and commitments, and is then compiled through Intent IR into a concrete domain DSL.

In BDI logic, Rao and Georgeff use possible-worlds formalism to formalize the BDI architecture and model possible worlds as time trees. Their single-minded commitment condition states that an agent will not abandon an intention as long as it believes the intention remains achievable. Cohen and Levesque's "intention is choice with commitment" explicitly discusses the rational balance among belief, goal, action, and intention, and explains when an agent should abandon a goal: when the goal has already been satisfied, when it becomes impossible, or when the supporting reason changes.

Therefore, the complete CRF chain is not:

```text
Natural Language -> DSL
```

but:

```text
Natural Language
-> BDI Intent Semantics
-> Intent IR
-> CRF-derived DSL
-> Verified Runtime
```

At the system level, this paper uses the D×L×M framework to explain how CRF moves from mathematical theorems into executable systems. `D` denotes the domain axis, `L` denotes construction layers, and `M` denotes manifestation layers from axioms, syntax, and instances to physical execution. JiYu is the first systematic implementation case of CRF, providing engineering examples across geometry, materials, part assembly, spatial self-aware agents, and self-evolving assets.

This paper explicitly distinguishes three evidence levels:

1. **Systematically validated results:** eight computational domains, 110 keywords, parsers/evaluators/test suites, multi-agent token compression, latency improvement, and parse rate.
2. **Theoretical extension:** nine-domain framework, 124 keywords, Domain Admission Axiom, domain periodic table, five reduced candidates, and one open position.
3. **System case study:** JiYu geometry, material, self-evolution, part assembly, and image-to-3D directions.

The main claim is not that CRF has completed a final proof for all computational domains. The claim is:

**CRF provides a unified method for deriving AI-native DSLs from mathematical completeness structures, and it has been systematically validated across eight computational domains. The BDI intent layer and D×L×M runtime framework form the theoretical extension required for CRF to move toward verifiable AI-native systems.**

---

## 1. Why General-Purpose Code Is Not the Optimal LLM Output

### 1.1 The Tool Detour Problem

Large language models are becoming general interfaces through which humans control digital systems. A user describes a goal in natural language. The model translates that goal into text. An interpreter, executor, toolchain, or application then performs the task. Whether the output is a Python script, JavaScript API call, SQL query, Blender script, UI JSON configuration, or multi-agent workflow, the dominant pattern can be summarized as:

```text
User Intent
-> Natural Language Prompt
-> General-Purpose Code
-> Tool Runtime
-> Result
```

This pattern appears natural because general-purpose programming languages and software tools are already the primary interfaces to the digital world. But from the perspective of an LLM, it is not necessarily the optimal interface. General-purpose programming languages were designed for human programmers, compiler ecosystems, and long-term software engineering. They contain many syntactic choices, library choices, type-handling mechanisms, error-handling patterns, and environment adapters irrelevant to a single task. When an LLM generates such code, it must express not only "what should exist" but also "how to manipulate a tool system designed for humans."

This is what this paper calls the **tool detour problem**. The model's real target is often a domain object or state: a 3D object, a UI layout, a multi-agent collaboration relation, a data transformation pipeline, or a state machine. But what it actually outputs is often code that controls a tool. Tool code is not the target itself. It is an indirect generation path. It folds an otherwise clear domain structure into general-purpose syntax, library calls, and runtime environments.

Early CRF work in physical domains already made a similar observation: the optimal LLM output should not always be code or natural language; it can be mathematical function parameters that directly specify domain state. In 3D geometry, surface texture, sound, images, and motion, native representations such as field functions, spectral fields, color fields, and trajectory functions can directly express the target state without going through human tool pipelines. This paper extends that idea to computational domains: if a computational domain has a complete representation function, the LLM should preferentially output that domain's AI-native DSL rather than general-purpose code.

### 1.2 Three Structural Costs of General-Purpose Languages

The general-purpose code generation pattern has at least three structural costs.

The first cost is **excessive choice entropy**. The syntax and vocabulary space of a general-purpose language is far larger than what a single domain task requires. The model must choose among many possible syntactic structures, libraries, naming patterns, control-flow styles, and error-handling strategies. For a simple UI layout task, the model may generate HTML, CSS, React, Tailwind, SwiftUI, Flutter, or JSON configuration. For a data transformation task, it may generate SQL, Python pandas code, JavaScript array pipelines, or ORM logic. The more possible paths exist, the less stable generation becomes.

The second cost is **excessive boilerplate**. General-purpose code often includes tokens that carry little direct task semantics: imports, variable declarations, adapters, format conversions, error handling, and framework glue. These tokens consume context and reasoning budget while not directly describing the target object. Existing CRF validation reports show that in the multi-agent collaboration experiment, the CRF-derived DSL achieved 4.72x token compression and 6.83x speed improvement compared with the natural-language/general-description path. This suggests that token efficiency can come from language structure itself, not merely from prompt tricks.

The third cost is **excessive validation cost**. The correctness of general-purpose code is often known only after execution, and errors may come from multiple layers: syntax, library versions, runtime environment, types, logic, or target semantics. By contrast, a DSL derived from a domain's mathematical structure can restrict the expression space to legal domain operations and support lightweight verification through parsers, evaluators, validators, and invariant checks.

Therefore, the question is not whether an LLM can write general-purpose code. The question is:

**When a target belongs to a clear computational domain, is general-purpose code still the optimal output medium?**

This paper answers no.

### 1.3 Research Question: Can DSLs Be Derived from Mathematics?

Domain-specific languages are not new. SQL, regular expressions, CSS, Verilog, shader languages, Makefiles, Terraform, and Kubernetes YAML are all DSLs in a broad sense. Traditional DSLs are usually created through expert design: domain experts extract common concepts, define syntax, choose keywords, implement interpreters, and iteratively extend the language.

This paper proposes a different view. For a class of formalizable computational domains, the primitives and operators of a DSL do not have to be designed from experience first. They can be derived from the mathematical completeness structure of the domain.

For example, the core of the data transformation domain is not "common pandas APIs" but closed transformations from table to table, grounded in relational algebra. The core of a state machine domain is not a state-management library but states, events, transitions, and acceptance or action conditions. The core of a permission domain is not a configuration file but the relationship among subjects, resources, actions, environments, and policy decisions. The core of a notification domain is not an email or push API but triggers, audiences, channels, timing, and delivery constraints.

The central research question is:

**Given a formalizable domain `D`, is there a systematic method to derive a minimal sufficient AI-native DSL from the domain's mathematical completeness theorem?**

This question has three subquestions:

1. How can we decide whether a domain is eligible for CRF?
2. How can we derive keywords, syntax, and operations from mathematical structure?
3. How can we address the problem that a DSL may be mathematically complete while user intent is still mistranslated?

The first two questions are answered by CRF's complete representation functions, four-step derivation method, and Domain Admission Axiom. The third requires the BDI intent semantics layer.

### 1.4 Mathematical Completeness Is Not Intent Completeness

Early CRF drafts exposed a key problem: even if a DSL is mathematically complete, the user may not directly write the correct expression, and the system may not correctly translate the user's natural-language intention into the right DSL. In other words, CRF can guarantee that a domain state has a legal representation; it cannot by itself guarantee that the natural-language intention has been translated faithfully.

The `pad` counterexample captures this problem. A user says: "make the search box shorter." The user's real intention is not necessarily "decrease padding." `pad` is only one possible plan. The actual target is closer to a world-state proposition:

```text
shorter(searchBox)
AND preserve(layoutConsistency)
AND preserve(readability)
```

If the system mechanically changes `pad`, the result may fail to satisfy the user's intent. The problem is not that the UI DSL is mathematically incomplete. The problem is that the system did not correctly model the target world state the user wanted.

The same issue appears in multi-agent collaboration or message notification. A user may require "Zhang San must receive this message," "the approver must be the original project owner," or "entity names must be preserved exactly." These requirements are not ordinary fields. They are constraints inside the user's intention. If they do not enter the intent semantics layer, the output can be structurally valid but semantically wrong.

Therefore:

```text
CRF solves representability.
BDI solves intentionality.
```

CRF answers whether a target state can be represented inside a domain. BDI answers which target state an agent should pursue, how long it should maintain the commitment, when it should revise the plan, and when it should abandon the intention.

### 1.5 From Physical Domains to Computational Domains

CRF began from native complete representations in digital physical domains. Early work proposed that 3D geometry can be represented by SDFs, surface texture by height fields, sound by short-time Fourier spectral fields, 2D images by color fields, and motion by trajectory functions. In those domains, the LLM does not need to output scripts that manipulate tools; it can output mathematical functions or function parameters directly.

This paper extends that idea to computational domains. Unlike physical domains, computational domain outputs may be collaboration protocols, UI layouts, data transformations, state transitions, permission decisions, validation rules, or notification flows. These can also be viewed as objects inside state spaces. If such a state space has a complete representation function, the LLM can directly generate a linguistic form of that representation.

The paper uses a layered account:

```text
eight domains = main empirical baseline
nine domains = current theoretical closure
JiYu = system case study
```

This distinction matters because not all evidence has the same maturity.

### 1.6 From DSL to Verifiable Runtime

A DSL is not the endpoint. Even if derived correctly, a DSL must be parsed, instantiated, executed, rendered, and validated to become a working system.

JiYu provides the first engineering samples for this direction. The D×L×M framework decomposes a CRF system into Domain, Layer, and Manifestation dimensions. The `D` axis represents capability domains, the `L` axis represents construction layers from primitives and operators to templates and assemblies, and the `M` axis represents manifestation layers from axioms to syntax, instances, and physical execution.

The value of this framework is that it turns the vague statement "the system is wrong" into a boundary-localization problem. A geometric object that renders incorrectly may not indicate an SDF mathematical failure. It may be a D1.L4.M2 syntax issue, a D1.L4.M3 instance parameter issue, or a D1.L4.M4 physical rendering issue.

The minimal runtime object for a CRF domain is:

```text
D = (
  V_D,
  B_D,
  Omega_D,
  L_D,
  semantics,
  Runtime,
  Invariants,
  Validators
)
```

This definition extends CRF from an expression theory into an executable system theory.

### 1.7 Contributions

This paper makes seven contributions.

**Contribution 1: Complete Representation Functions.**  
The paper turns the source of AI-native DSLs from expert design, corpus mining, or prompt engineering into a derivation problem grounded in mathematical completeness structures.

**Contribution 2: Four-Step Derivation Method.**  
The paper defines a unified workflow: identify the domain essence and function signature; match a mathematical completeness theorem; derive keywords from basis and closed operations; validate with parser, evaluator, and tests.

**Contribution 3: Eight-Domain Systematic Validation.**  
The paper applies CRF to 3D geometry, multi-agent collaboration, UI layout, data transformation, state machines, permission control, data validation, and notification, yielding 110 keywords and reported results including 4.72x token compression, 6.83x latency improvement, and 100% parse rate in D2.

**Contribution 4: Domain Admission Axiom and Nine-Domain Framework.**  
The paper introduces a criterion for entering the CRF domain set and extends the framework to nine domains with 124 keywords, five reduced candidates, and one open candidate.

**Contribution 5: BDI Intent Semantics.**  
The paper explicitly fills the gap between mathematical completeness and intent completeness by introducing beliefs, goals, intentions, commitments, and reconsideration mechanisms.

**Contribution 6: D×L×M Runtime Framework.**  
The paper extends CRF from DSL derivation to system execution and error localization through a three-axis runtime coordinate system.

**Contribution 7: JiYu Case Study.**  
JiYu illustrates the path from geometry DSLs to material systems, part assembly, component trees, spatial self-awareness, and self-evolving assets.

### 1.8 Evidence Levels and Boundaries

This paper distinguishes three evidence levels.

First, systematically validated results: eight computational domains, 110 keywords, parsers/evaluators/tests, and the multi-agent benchmark results.

Second, theoretical extension: nine-domain framework, 124 keywords, Domain Admission Axiom, domain periodic table, five reduced candidates, and one open candidate.

Third, system case study: JiYu's geometry, material, self-evolution, part assembly, and image-to-3D directions.

The paper does not claim that CRF has completed a final proof for all possible computational domains. It claims that CRF provides a unified method for deriving AI-native DSLs from mathematical completeness structures, and that the method has been systematically validated on an initial set of eight domains.

---

## 2. Related Work and the Missing Question

### 2.1 Traditional DSLs: Domain Languages Designed by Experts

The core idea of domain-specific languages is to provide a compact, direct, and verifiable expression medium for a limited domain. SQL, regular expressions, CSS, Verilog, shader languages, Makefiles, Terraform, Kubernetes YAML, and state-machine configuration languages all show that when a domain is stable enough, a specialized language can be more efficient than a general-purpose language.

Traditional DSLs compress the expression space into domain concepts. Codd's relational model, for example, allows users to express queries through relational operations without directly handling physical storage paths. ABAC similarly reduces access decisions to attributes of subjects, objects, actions, and environments.

But traditional DSLs have a fundamental limitation: their languages are usually designed rather than derived. Experts observe recurring concepts, choose keywords, define syntax, and expand coverage through engineering iteration. The resulting completeness is often empirical. Covering many known use cases is not the same as mathematically covering a domain's state space.

CRF inherits the DSL advantage of expression-space compression, but reverses the source of the language. For formalizable domains, the primitives and operators should first come from complete representation functions, basis elements, and closed operations.

Traditional DSL research asks:

```text
How should experts design a useful language?
```

CRF asks:

```text
Given a mathematical completeness theorem, what language is forced by it?
```

### 2.2 Data-Driven DSLs and Program Synthesis

Program synthesis, inductive programming, and data-driven DSL methods learn program structures from examples, task distributions, or code corpora. DreamCoder is a representative system: it learns programs, expands reusable symbolic abstraction libraries, and trains neural networks to guide search.

This line of work is important because it shows that languages and abstraction libraries can grow from experience. However, CRF starts from a different place. Program synthesis systems usually infer useful abstractions from task distributions. CRF begins with mathematical completeness theorems and derives basis elements and closed operations before optimizing over examples.

The two are complementary. CRF can provide the mathematically grounded core; program synthesis can discover higher-level templates, shorter expressions, common macros, or optimized compositions. But those learned templates should not be confused with the mathematical basis.

Data-driven DSLs ask:

```text
Can we learn useful abstractions from tasks?
```

CRF asks:

```text
Can a domain's necessary abstraction set be derived from its mathematical completeness structure?
```

### 2.3 LLM Tool Calling and Structured Output

LLM tool calling, JSON Schema, structured outputs, and constrained generation are close to CRF in engineering spirit. They all aim to make model output executable, parsable, and less ambiguous.

Structured output ensures that a model response follows a developer-provided schema. Function calling lets a model interact with external tools and systems. These techniques are essential infrastructure for modern LLM applications.

But structured output constrains format; it does not explain where the schema comes from. JSON Schema can make a model output a valid object, but it does not guarantee that the object is a complete representation of a domain. Function calling can expose tools, but it does not guarantee that the tool set was derived from the domain's closed operations.

CRF can compile a domain DSL into JSON Schema, function signatures, or constrained grammars. But CRF asks the prior question:

```text
What is the mathematically justified schema of the domain?
```

JSON is a container. CRF DSL is a coordinate system for the domain.

### 2.4 Formal Methods and Computational Theory

Each CRF domain relies on existing mathematical or computational theory. Data transformation depends on relational algebra. State machines depend on finite automata. Permission control depends on ABAC. Notification depends on predicate logic and temporal logic. Multi-agent collaboration can draw from CSP and pi-calculus.

These theories are not competitors to CRF. They are theorem sources. CRF does not attempt to reprove relational algebra, automata theory, temporal logic, or process calculi. Its work is to translate the basis-operation-closure structure of those theories into AI-native DSLs.

This determines the proof strategy:

1. Identify each domain's existing completeness or expressivity theory.
2. Extract basis elements and closed operations.
3. Show a mapping from the DSL keyword set to the basis and operations.
4. Implement parser, evaluator, and validator.
5. Use tests to show that implementation does not break theoretical closure.

### 2.5 BDI and Possible-Worlds Semantics

BDI stands for Belief, Desire, and Intention. It formalizes the relationship among what an agent believes, what it wants, and what it has committed to pursue.

Rao and Georgeff use a branching-time possible-worlds model to formalize intention. Their model represents worlds as time trees, where branches represent possible future action paths. Beliefs, goals, and intentions are modeled as accessible world sets.

Cohen and Levesque emphasize intention as choice with commitment. Their persistent-goal formulation explains why an agent should maintain a goal until it believes the goal has been achieved, believes the goal is impossible, or believes the supporting reason no longer holds.

This line of work fills a theoretical gap in CRF. A DSL can be structurally complete while natural-language intent remains mistranslated. Therefore, BDI is placed above CRF as a horizontal semantics layer, not as a tenth domain.

The chain becomes:

```text
U -> BDI(U) -> Intent IR -> L_D -> R_D
```

### 2.6 Neural Generation and Black-Box Models

CRF does not oppose neural generation. Neural models are excellent at inferring, fitting, and optimizing complex patterns from data. In image-to-3D, structure analysis, parameter optimization, and visual alignment, neural models are essential.

The difference is the source of truth. A neural generator may output pixels, meshes, audio, or other artifacts. These can be perceptually strong, but they may not preserve semantic parts, editability, constraints, or behavior bindings.

CRF proposes a division of labor:

```text
Neural model: infer, fit, optimize
CRF runtime: represent, validate, edit, compose
```

The canonical representation should remain in CRF ASTs, DSLs, Component Trees, or genomes whenever possible.

### 2.7 The Missing Question

Existing work solves adjacent problems:

- Traditional DSLs show that domain languages compress expression spaces.
- Program synthesis learns abstractions from examples.
- Structured output constrains LLM output formats.
- Formal methods provide theorem sources.
- BDI formalizes intention.
- Neural generation produces high-quality perceptual artifacts.

But the central question remains under-addressed:

```text
If an LLM's output must be executed by an interpreter,
how should the interpreter's language be chosen?
```

CRF's answer:

```text
For formalizable domains, derive the language from the domain's complete representation function.
```

---

## 3. Core Theory of Complete Representation Functions

### 3.1 Basic Problem: What Should an LLM Output?

When an LLM controls a digital system, it is not merely "generating text." It is choosing an executable representation. The representation may be natural language, code, JSON, function-call parameters, scripts, or a domain-specific language.

The deeper question is:

```text
What is the most appropriate executable representation for a given domain?
```

CRF starts from the view that if a domain has a mathematically complete, closed, composable representation space, then the optimal LLM output should be the domain's native representation language rather than code that manipulates external tools.

### 3.2 Domain, Object Space, and Representation Space

Let `D` be a formalizable domain. CRF distinguishes three layers:

```text
X_D: object space
V_D: representation space
L_D: language space
```

`X_D` is the set of target objects or states in the domain. `V_D` is the mathematical carrier space that encodes those objects. `L_D` is the textual DSL that can be generated by an LLM, parsed by a parser, and executed by a runtime.

The chain is not:

```text
X_D -> L_D
```

but:

```text
X_D -> V_D -> L_D -> Runtime
```

or, in the generation direction:

```text
L_D -> V_D -> X_D
```

### 3.3 Definition of Complete Representation Function

A complete representation function for domain `D` is:

```text
F_D: X_D -> V_D / ~_D
```

where `~_D` is a semantic equivalence relation.

The quotient is necessary because surface expressions are rarely unique. `a + b` and `b + a` may represent the same object. The same UI layout may be written with different nesting structures. The same geometry may have multiple construction paths.

CRF therefore requires **canonical uniqueness**, not surface uniqueness:

```text
for every x in X_D, there exists a unique [v] in V_D / ~_D such that F_D(x) = [v].
```

This allows multiple DSL strings to express the same object as long as normalization maps them to the same semantic class.

### 3.4 Basis, Operations, and Term Algebra

A complete representation function must be supported by basis elements and closed operations.

Let:

```text
B_D = {b_1, b_2, ..., b_m}
```

be the basis set. In CRF, basis elements are often parameterized constructors:

```text
b_i: P_i -> V_D
```

Let:

```text
Omega_D = {omega_1, omega_2, ..., omega_n}
```

be the closed operation set:

```text
omega_j: V_D^k x Q_j -> V_D
```

Together, they generate a term algebra:

```text
T_D = Term(B_D, Omega_D)
```

This term algebra is the bridge between mathematics and DSL. Mathematically, it is the expression space generated by the basis and operations. Engineering-wise, it is the AST space of the DSL.

### 3.5 Three Core Conditions

CRF's three conditions are canonical uniqueness, representational completeness, and typed closure.

**Canonical uniqueness:**

```text
forall x in X_D, exists unique [v] in V_D / ~_D such that F_D(x) = [v]
```

**Representational completeness:**

```text
forall x in X_D, exists t in T_D such that semantics(t) ~_D F_D(x)
```

**Typed closure:**

```text
omega: V_tau1 x ... x V_tauk x Q -> V_tauo
```

where all input and output types remain legal subspaces of `V_D`.

In continuous physical domains, completeness may be exact, approximate, or task-level:

```text
exact completeness: output equals target
epsilon completeness: distance(output, target) <= epsilon
task completeness: Task(output) = Task(target)
```

### 3.6 Four Types of Completeness

The word "complete" must be stratified.

**Carrier completeness** asks whether the domain objects can be carried by the representation space.

**Syntax completeness** asks whether the DSL can express all legal terms in the term algebra.

**Runtime correctness** asks whether parser, evaluator, and runtime faithfully implement the mathematical semantics.

**Intent completeness** asks whether the output satisfies the user's intended target world.

These do not imply one another. A DSL may be mathematically complete but syntactically incomplete. A syntax may parse but execute incorrectly. A runtime may execute correctly but fail the user's intent.

### 3.7 Mapping Theorem from CRF to DSL

Let a domain `D` have:

```text
F_D: X_D -> V_D / ~_D
B_D
Omega_D
T_D = Term(B_D, Omega_D)
semantics: T_D -> V_D
L_D
parse: L_D -> T_D
eval: T_D -> V_D
```

If:

1. the basis and operations are representationally complete,
2. operations are closed,
3. the DSL can express all legal terms,
4. the evaluator is faithful to the semantics,

then `L_D` is CRF-complete for domain `D`.

Proof sketch: for any object `x` in `X_D`, completeness gives a term `t` whose semantics is equivalent to `F_D(x)`. Syntax completeness gives a DSL program `l` such that `parse(l)=t`. Evaluator correctness gives `eval(parse(l)) = semantics(t)`. Therefore, `l` expresses the canonical representation of `x`.

### 3.8 Keyword Derivation

The core keyword rule is:

```text
Keywords(L_D) = Names(B_D) union Names(Omega_D) union SyntaxGlue
```

If the basis contains `sphere`, `box`, and `cylinder`, and the operations contain `translate`, `rotate`, `union`, `subtract`, and `smooth`, then these become the DSL's core semantic vocabulary.

CRF does not eliminate design entirely. It derives the core semantic vocabulary. Surface syntax, editor UX, error messages, and macro libraries remain engineering design.

### 3.9 Criteria for AI-Native DSLs

Not every DSL is AI-native. An AI-native DSL should have:

1. low choice entropy,
2. high semantic density,
3. stable parseability,
4. executable evaluation,
5. validator support,
6. composability through closure.

Thus:

```text
AI-native DSL = LLM-generable + parser-readable + runtime-executable + validator-checkable
```

### 3.10 Minimal CRF Domain Object

The minimal theoretical object for a CRF domain is:

```text
C_D = (
  X_D,
  V_D,
  ~_D,
  F_D,
  B_D,
  Omega_D,
  T_D,
  L_D,
  parse,
  semantics,
  eval
)
```

The runtime version adds runtime, invariants, and validators.

### 3.11 CRF as Discovery, Not Merely Design

Traditional DSL path:

```text
expert experience -> vocabulary design -> syntax -> implementation
```

CRF path:

```text
mathematical theorem -> basis and closed operations -> term algebra -> DSL keywords -> parser/evaluator/validator
```

This is why CRF is a discovery procedure. A domain is not admitted because its keywords sound useful. It is admitted because its mathematical structure supports a complete representation.

### 3.12 Minimality, Sufficiency, and Openness

CRF can often prove sufficiency. If basis and operations generate the domain object space, then the keyword set is sufficient.

Minimality is harder. It requires showing that removing any basis element or operation breaks completeness. Unless such irreducibility is proven, the safer claim is:

```text
CRF derives a mathematically grounded sufficient core DSL.
```

This keeps the theory open. Future mathematical structures may expand the domain set, and future reducibility proofs may shrink or reorganize it.

### 3.13 Summary

This chapter defined complete representation functions, clarified canonical uniqueness, introduced basis and closed operations, formalized term algebra, separated four types of completeness, and stated the mapping theorem from mathematical representation to AI-native DSL.

The next layer is domain set theory: which domains are eligible for CRF?

---

## 4. Domain Admission Axiom, Domain Periodic Table, and Nine-Domain Framework

### 4.1 Why Domain Set Theory Is Needed

Single-domain CRF theory leaves a key question:

```text
Which domains should exist in the CRF framework?
```

Without a domain set theory, CRF can make two opposite errors.

The first is domain inflation. Any feature can be named a new domain: search, cache, payment, logging, recommendation, collision detection, layout validation, image-to-3D. Then CRF degenerates into ordinary module classification.

The second is excessive contraction. If only early validated domains are accepted, truly independent mathematical structures may be misclassified as combinations.

Therefore, CRF needs an admission principle that prevents arbitrary module inflation while allowing new mathematically independent domains.

### 4.2 Domain Admission Axiom

**Domain Admission Axiom:**

```text
D in CRF_DomainSet
iff
there exists a mathematical theory T
such that T proves:
  completeness of basis B_D over D,
  closure of operations Omega_D over D,
  constructability of F_D from (B_D, Omega_D).
```

In short:

```text
No theorem, no core domain.
```

This does not mean features without theorem support cannot be implemented. It means they should not be treated as core CRF domains. They may be operations, validators, observers, or combination patterns.

### 4.3 Three Operational Conditions

A candidate domain must pass three operational checks.

**Type independence.**  
The candidate must have a function signature distinct from existing domains.

**Operational closure.**  
The candidate's operations must return objects that remain inside the domain object space.

**Irreducibility.**  
The candidate must not be expressible as a composition of existing domains.

This distinction separates domains from operations and validators. A function that outputs `Bool`, `Score`, or `Violation[]` is often an observer or validator rather than a new domain, because it does not produce a same-domain object that can continue through a closed pipeline.

### 4.4 The Eight Foundational Computational Domains

The early eight-domain framework comes from the information-flow topology of a software system. A typical action such as "submit order" involves UI, state transitions, permissions, validation, data transformation, notification, multi-agent collaboration, and possibly 3D spatial representation.

The eight domains are:

```text
D1: Geometry
D2: Multi-Agent Collaboration
D3: UI Layout
D4: Data Transformation
D5: State Machine
D6: Permission Control
D7: Data Validation
D8: Notification
```

They correspond to distinct information types and function signatures, not arbitrary industry modules.

### 4.5 Nine-Domain Extension: Agent Evolution

The ninth domain is Agent Evolution:

```text
D9: Agent x Feedback -> Agent'
```

D9 differs from D2. D2 focuses on how multiple agents coordinate to produce results:

```text
Task x Agents -> Result
```

D9 focuses on how an agent changes itself under feedback:

```text
Agent x Feedback -> Agent'
```

The output remains an agent, so closure holds:

```text
Agent' -> Agent'' -> ...
```

D9 is not BDI. BDI decides which intention the agent should pursue. D9 describes how the agent updates itself through feedback.

### 4.6 Nine-Domain Table

| ID | Domain | Function Signature | Mathematical Source | Output Type | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | Geometry | `R^3 -> R` or Shape DSL -> SDF | SDF / CSG | 3D shape | validated/case study |
| D2 | Multi-Agent Collaboration | `Task x Agents -> Result` | CSP / pi-calculus | collaboration flow/result | validated |
| D3 | UI Layout | `Rect x State -> PartitionTree` | spatial partition / constraints | layout tree | validated/case study |
| D4 | Data Transformation | `Table x Op -> Table` | relational algebra | table/data stream | validated target |
| D5 | State Machine | `State x Event -> State x Action[]` | finite automata | transition system | validated target |
| D6 | Permission | `Subject x Resource x Action -> Decision` | ABAC | allow/deny decision | validated target |
| D7 | Validation | `Data x Rules -> Valid/Error[]` | type theory / refinement types | validation result | validated target |
| D8 | Notification | `Event x Audience -> Delivery` | predicate logic / temporal logic | delivery plan | validated target |
| D9 | Agent Evolution | `Agent x Feedback -> Agent` | dynamic programming / policy update | updated agent | theoretical extension |

The paper uses layered evidence:

```text
eight domains = main empirical baseline
nine domains = current theoretical closure
JiYu = system case study
```

### 4.7 Domain Periodic Table

CRF uses a domain periodic table to organize possible domains by input and output types. The current state is:

```text
9 verified/theoretical domains + 5 reduced candidates + 1 open candidate
```

Reduced candidates include data generation, layout validation, 2D spatial transformation, collision detection, and SDF transformation. The open candidate is agent evaluation.

The table is not final truth. It is a discovery, reduction, and falsification tool.

### 4.8 Five Reduced Slots and One Open Slot

**Data generation** reduces to D4 + D7 because generated data is still data, often table-like, constrained by validation rules.

**Layout validation** reduces to D7 because it outputs violations or validity reports.

**2D spatial transformation** reduces to D3 because pan, zoom, and rotate are layout/view-state operations.

**Collision detection** reduces to D1 because it is an observer or validator over geometry rather than a closed geometry-producing domain.

**SDF transformation** reduces directly to D1 because it is a geometry operation.

**Agent evaluation** remains open because it often outputs a scalar score, which may not satisfy closure unless evaluation criteria become self-updating objects.

### 4.9 Boundaries: Domain, Operation, Validator, Combination Pattern

CRF distinguishes:

- **Domain:** independent type signature, closure, irreducibility, theorem source.
- **Operation:** same-domain transformation or observation.
- **Validator:** checks constraints and returns Bool/Error/Violation.
- **Combination pattern:** a pipeline across multiple domains.

Payment, caching, search, workflow, image-to-3D, and living assets are usually combination patterns, not new domains.

### 4.10 Openness of the Domain Set

CRF does not claim:

```text
|DomainSet| = 9
```

as a final theorem. It claims that current evidence supports a nine-domain closure under the admission rule. Future work may add a domain, reduce a domain, or reorganize the periodic table.

### 4.11 Summary

This chapter introduced domain set theory, Domain Admission Axiom, the three operational conditions, the eight-domain baseline, the D9 extension, the domain periodic table, and the distinction among domains, operations, validators, and combination patterns.

---

## 5. From Mathematical Completeness to Intent Completeness: The BDI Layer

### 5.1 Problem: Structural Completeness Is Not Semantic Fidelity

CRF guarantees representability:

```text
Can the target object be represented?
```

It does not guarantee:

```text
Did the system represent what the user actually intended?
```

The `pad` counterexample shows this clearly. A UI DSL may be complete and valid, but the operation chosen may fail the target proposition. Similarly, entity exactness failures in multi-agent tasks show that a structurally compact DSL can still lose semantically important names.

Therefore, we separate:

```text
mathematical completeness: every domain object can be represented
intent completeness: the output satisfies the user's target proposition
```

### 5.2 BDI's Position in CRF

BDI is not a tenth CRF domain. Domains discuss object spaces and representation functions. BDI discusses how an agent chooses, maintains, revises, and abandons goals across possible worlds.

Thus:

```text
D9 = agent self-update domain
BDI = intent semantics and control layer
```

BDI sits before domain DSL generation:

```text
Natural Language -> BDI Intent Semantics -> Intent IR -> CRF-derived DSL -> Runtime
```

### 5.3 User Input Is a Target Proposition

User input is not a DSL program. It is a description of a desired world state.

CRF models a user input as:

```text
I_u = (B_u, G_u, I_u, C_u, Q_u)
```

where:

- `B_u`: beliefs inferred from user input and context,
- `G_u`: goals or desires,
- `I_u`: committed intentions,
- `C_u`: commitment strategy,
- `Q_u`: supporting background reasons.

The goal is a proposition:

```text
phi_u in Phi
```

not a DSL fragment.

### 5.4 Formal BDI Objects

**Belief** represents what the system believes:

```text
Bel_a(phi)
```

Beliefs may come from user input, history, runtime state, parser/evaluator/validator results, tools, or execution feedback.

**Goal** represents candidate target propositions.

**Intention** represents a goal the system commits to pursue.

**Commitment** defines persistence or abandonment conditions. A simplified single-minded commitment principle is:

```text
Intend_a(A eventually phi)
->
maintain intention until Bel_a(phi) or no reachable path remains
```

With Cohen-Levesque-style supporting reasons:

```text
maintain intention until:
  Bel_a(phi)
  OR not Bel_a(E eventually phi)
  OR Bel_a(not q)
```

where `q` is the background reason supporting the intention.

### 5.5 Intent IR

Intent IR connects BDI and CRF DSLs. It separates goal, plan, and DSL:

```text
Goal != Plan != DSL
```

A minimal Intent IR contains:

```json
{
  "intent_id": "intent_001",
  "utterance": "make the search box shorter but keep it readable",
  "beliefs": [],
  "goal": {
    "predicate": "shorter(searchBox) AND preserve(readability)"
  },
  "constraints": [
    "preserve(layoutConsistency)",
    "no_horizontal_overflow"
  ],
  "candidate_domains": ["D3"],
  "plan_bindings": [],
  "commitment": "single_minded_with_reason",
  "reconsideration_policy": {
    "on_plan_failure": "rebind_plan",
    "on_goal_unreachable": "ask_user",
    "on_reason_invalid": "drop_intention"
  }
}
```

### 5.6 New Natural Language to DSL Chain

With BDI, the chain becomes:

```text
U
-> IntentParser
-> (B, G, I, C, Q)
-> Intent IR
-> DomainSelector
-> PlanBinder
-> DSL
-> Parser/Evaluator
-> Result
-> Verifier
-> BeliefUpdate
```

This enables intention persistence, plan rebinding, execution feedback, and reconsideration.

### 5.7 Plan Binding

The plan binder maps a target proposition to one or more domain DSL candidates:

```text
Bind: Phi x DomainSet -> P(L_D)
```

If one plan fails, the intention remains and another plan can be tried.

### 5.8 Semantic Fidelity as Intent Contract

Entity exactness is not merely a schema issue. It is an intent contract:

```text
preserveExact(entityName("Zhang San"))
```

Schema should be extended to:

```text
Schema = Type + Constraint + Fidelity
```

Examples:

```text
entity_name(loose)
entity_name(exact)
entity_name(canonical)
entity_name(masked)
```

### 5.9 Reconsideration

Execution feedback can produce three cases:

1. Plan failed but goal is still reachable: rebind the plan.
2. Goal is unreachable: ask the user or abandon.
3. Supporting reason failed: abandon or rebuild the intention.

This makes reconsideration a normal runtime mechanism, not an exception.

### 5.10 Intention State Machine

Intentions can be modeled as a state machine:

```text
Idea -> Candidate -> Active -> Executing -> Reviewing -> Completed
```

with additional states:

```text
Paused, Abandoned, Failed, Superseded
```

CRF DSL execution occurs in the Executing phase. Validators update beliefs in the Reviewing phase.

### 5.11 BDI and the Nine Domains

A user intention may involve one domain or many domains. For example:

```text
when a customer is overdue for more than 48 hours,
if they are not VIP,
notify the customer and the administrator
```

This involves D5 state machine, D6 permission/policy, D8 notification, D7 validation, and D4 data transformation.

BDI decomposes the target proposition and binds subgoals to domains.

### 5.12 JiYu and Spatial Self-Perception

JiYu image-to-3D can be understood as a BDI loop:

```text
Belief: current DSL generated this object
Goal: rendered object should match source image
Intention: keep adjusting until similarity threshold is reached
Plan: modify part sizes, positions, materials, joints
Feedback: render/image difference
Reconsideration: continue, rebuild, or enter silent state
```

### 5.13 Intent Metrics

Intent-layer metrics include:

```text
Intent Satisfaction Rate
Semantic Fidelity Score
Entity Preservation Rate
Reconsideration Precision
Plan Rebinding Success
```

These metrics extend CRF evaluation from "does it parse?" to "does it satisfy the user's target world?"

### 5.14 Risks and Boundaries

BDI introduces risks:

- wrong beliefs,
- overgeneralized goals,
- too many active intentions,
- privacy and permission issues,
- unsafe autonomous reconsideration.

Therefore, BDI must be paired with evidence chains, confidence, user correction, audit logs, and permission control.

### 5.15 Summary

This chapter introduced BDI as the missing layer between natural language and CRF DSLs. CRF solves representability. BDI manages target-world commitment and reconsideration.

---

## 6. Four-Step Derivation and Eight-Domain Derivation

### 6.1 Method Overview

CRF derives each domain DSL through four steps:

```text
D
-> F_D: X_D -> V_D
-> (B_D, Omega_D)
-> L_D
-> Parser/Evaluator/Validator
```

Step 1: define the domain and function signature.  
Step 2: identify the mathematical theorem.  
Step 3: derive keywords from basis and closed operations.  
Step 4: implement and validate.

### 6.2 D1: 3D Geometry

D1 represents 3D shapes as signed distance fields:

```text
F_1: R^3 -> R
```

The zero level set defines the shape:

```text
Shape = {p in R^3 | F_1(p) = 0}
```

Basis:

```text
box, sphere, cylinder, torus, capsule, cone, plane
```

Operations:

```text
blend, subtract, round, onion, elongate, rotate, scale,
mirror, twist, bend, displace, repeat
```

Total: 19 keywords.

Example:

```text
sphere(0.5)
| blend(0.3, box(0.8, 0.4, 0.6))
| round(0.02)
| rotate(y: 15)
```

D1 shows that LLMs do not need to output Blender scripts. They can output native shape expressions.

### 6.3 D2: Multi-Agent Collaboration

D2 represents task decomposition, communication, synchronization, and result aggregation:

```text
F_2: Task x Agents -> Result
```

Mathematical sources: CSP and pi-calculus.

Basis:

```text
task, gate, merge, split, state
```

Operations:

```text
->, ||, ?:, *, >>
```

Total: 10 keywords.

Example:

```text
task(audit) {
  agent(A) -> analyze
  >> agent(B) -> execute
  >> agent(C) -> evaluate
  >> agent(D) -> synthesize
}
```

The reported D2 experiment used 200 task groups and 4 agents per group, for 800 API calls, achieving 4.72x token compression, 6.83x speedup, and 100% parse rate.

### 6.4 D3: UI Layout

D3 represents UI layout as 2D spatial partition:

```text
F_3: Rect x State -> PartitionTree
```

Basis:

```text
text, image, input, canvas, sequence, grid, layer
```

Operations:

```text
pad, align, scroll, size, style, on, when, each
```

Total: 15 keywords.

Example:

```text
sequence(v, gap: 16)
| pad(24) {
  text("Hello") | style(heading)
  input(email)
}
```

D3 shows that UI generation can be expressed as layout-tree generation rather than front-end framework code.

### 6.5 D4: Data Transformation

D4 represents closed transformations from table to table:

```text
F_4: Table x Op -> Table
```

Mathematical source: relational algebra.

Basis:

```text
source, sink, literal
```

Operations:

```text
filter, select, join, union, derive, rename, cast, drop,
dedupe, sort, limit, sample, group, window, pivot, unpivot, fill
```

Total: 20 keywords.

Example:

```text
source(csv, "sales.csv")
-> filter(region = "East")
-> join(products, on: sku)
-> group(category, sum: revenue)
-> sort(revenue, desc)
-> sink(table)
```

D4 is a canonical closed pipeline domain:

```text
Table -> Table -> Table
```

### 6.6 D5: State Machine

D5 represents event-driven state transitions:

```text
F_5: State x Event -> State x Action[]
```

Mathematical source: finite automata.

Basis:

```text
state, event, action, guard, context
```

Operations:

```text
on->, if, do, after, enter, exit, assign
```

Total: 12 keywords.

Example:

```text
state(pending) {
  on(pay) -> state(paid)
  | if(amount > 0)
  | do(charge_card)
}
```

### 6.7 D6: Permission Control

D6 represents authorization decisions:

```text
F_6: Subject x Resource x Action x Environment -> Decision
```

Mathematical/policy source: ABAC.

Basis:

```text
role, resource, action, condition
```

Operations:

```text
allow, deny, when, inherit, scope, delegate
```

Total: 10 keywords.

Example:

```text
role(admin) inherit(mentor) {
  allow(*, *)
  deny(audit_log, delete)
}
```

### 6.8 D7: Data Validation

D7 represents rule-based data validation:

```text
F_7: Data x Rules -> Valid | Error[]
```

Mathematical sources: type theory and refinement types.

Basis:

```text
field, entity, error
```

Operations:

```text
required, range, length, match, oneof, unique, ref, depends, custom
```

Total: 12 keywords.

Example:

```text
field(email, string)
| required
| match(email)
| unique(members)
```

D7 later becomes the cross-domain contract provider for CRF runtime.

### 6.9 D8: Notification

D8 represents event-triggered delivery plans:

```text
F_8: Event x Audience x Channel x TimePolicy x Template -> DeliveryPlan
```

Mathematical sources: predicate logic and temporal logic.

Basis:

```text
trigger, audience, template, channel, schedule
```

Operations:

```text
when, throttle, batch, escalate, fallback, priority, personalize
```

Total: 12 keywords.

Example:

```text
notify(overdue) {
  trigger(payment.overdue)
  channel(wechat) | priority(high)
  escalate(after: 48h, to: admin)
}
```

### 6.10 Eight-Domain Summary

| Domain | Function Signature | Basis | Operations | Total |
| --- | --- | ---: | ---: | ---: |
| D1 Geometry | `R^3 -> R` | 7 | 12 | 19 |
| D2 Multi-Agent | `Task x Agents -> Result` | 5 | 5 | 10 |
| D3 UI Layout | `Rect x State -> PartitionTree` | 7 | 8 | 15 |
| D4 Data Transformation | `Table x Op -> Table` | 3 | 17 | 20 |
| D5 State Machine | `State x Event -> State x Action[]` | 5 | 7 | 12 |
| D6 Permission | `Subject x Resource x Action -> Decision` | 4 | 6 | 10 |
| D7 Validation | `Data x Rules -> Valid/Error[]` | 3 | 9 | 12 |
| D8 Notification | `Event x Audience x Channel -> Delivery` | 5 | 7 | 12 |
| **Total** | — | **39** | **71** | **110** |

### 6.11 Cross-Domain Meta-Syntax

The eight domains share meta-syntax:

- pipelines,
- nesting,
- parameters,
- references,
- conditions.

This supports a universal parser plus domain-specific keyword tables and evaluators:

```text
Universal Parser
  + Domain Keyword Table
  + Domain Type Rules
  + Domain Evaluator
  + Domain Validator
```

### 6.12 Compression Mechanism

CRF compression comes from:

1. lower vocabulary entropy,
2. elimination of boilerplate code,
3. closed operation pipelines.

The compression is structural, not merely syntactic abbreviation.

### 6.13 Why D9 Is Not in the Eight-Domain Main Empirical Chapter

D9 belongs to the nine-domain theoretical update. It is kept separate from the eight-domain empirical baseline because the strongest existing experimental results are tied to D1-D8, especially D2 and D4-D8.

### 6.14 Summary

This chapter showed how CRF's four-step derivation method applies across eight computational domains, producing 110 keywords and a shared meta-syntax.

---

## 7. Experimental Design and Results

### 7.1 Goals

The experiments test three questions:

1. Can CRF-derived DSLs be parsed, evaluated, and executed?
2. Do CRF DSLs reduce token and latency costs?
3. Can the same derivation method be reproduced across multiple domains?

### 7.2 Evidence Levels

Evidence is divided into:

1. runtime implementation evidence,
2. controlled benchmark evidence,
3. automated test evidence.

D1 and D3 provide runtime case studies. D2 provides benchmark evidence. D4-D8 are intended as the first executable test layer.

### 7.3 Metrics

Metrics include:

```text
Token Compression Ratio
Latency Speedup Ratio
Parse Success Rate
Execution Success Rate
Test Pass Rate
Semantic Fidelity Score
```

Semantic fidelity belongs to the intent layer and requires BDI/Intent IR evaluation.

### 7.4 D1 Geometry Runtime Evidence

D1 validates:

```text
DSL -> AST -> SDF -> RenderedShape
```

The evidence shows that a geometry DSL can enter a runtime and produce visible shapes. It does not prove that all complex objects are solved. Layer 4 assembly is a separate challenge.

### 7.5 D3 UI Runtime Evidence

D3 validates:

```text
DSL -> AST -> PartitionTree -> RenderedUI
```

It shows that UI generation can be expressed as layout-tree generation. But the `pad` example also shows that parse success and rendering do not imply user-intent satisfaction.

### 7.6 D2 Multi-Agent Benchmark

The D2 benchmark includes:

```text
200 task groups x 4 agents = 800 API calls
```

Reported results:

```text
4.72x token compression
6.83x latency speedup
100% parse rate
```

This is the strongest quantitative evidence in the current draft.

The correct conclusion is:

**CRF DSL significantly improves structural expression efficiency and parsability; semantic fidelity still requires intent contracts and validators.**

### 7.7 D4-D8 Five-Domain Tests

The planned architecture for D4-D8 is:

```text
domain/
  parser.js
  evaluator.js
  tests.js
  demo.html
  report.md
```

The reported target is:

```text
5 domains x 10 tests = 50 tests
183+ assertions
100% pass rate
0 new keyword requirement
```

In this repository, these are marked as `planned_executable` until actual parser/evaluator/test files are implemented.

### 7.8 Results Summary

| Domain | Validation Type | Current Status |
| --- | --- | --- |
| D1 Geometry | runtime case study | reported |
| D2 Multi-Agent | benchmark | reported |
| D3 UI Layout | runtime case study | reported |
| D4 Data Transformation | automated tests | planned executable |
| D5 State Machine | automated tests | planned executable |
| D6 Permission | automated tests | planned executable |
| D7 Validation | automated tests | planned executable |
| D8 Notification | automated tests | planned executable |

### 7.9 Keyword Economy

The eight domains contain 110 keywords, with an average of 13.75 keywords per domain. This size is small enough to reduce generation entropy but large enough to cover core domain objects.

### 7.10 Outlier Handling

D1 geometry may achieve extremely high compression compared with mesh or tool scripts. To avoid overstating typical gains, D1 should be treated as an outlier when reporting average compression.

### 7.11 Parse Rate vs Runtime Correctness

Parse success means:

```text
parse(l) != error
```

It does not mean:

```text
eval(parse(l)) satisfies user intent
```

CRF must distinguish syntax, execution, runtime, and intent layers.

### 7.12 Meaning of Zero New Keyword Requirement

Zero new keyword requirement in a test set means the derived keywords were sufficient for that test set. It does not prove absolute minimality or future completeness.

### 7.13 Exposed Problem: Intent Fidelity

The experiments expose semantic fidelity issues such as entity exactness. This motivates intent-layer metrics and BDI.

### 7.14 Validity Threats

Limitations include small test sets, baseline sensitivity, implementation incompleteness, and the difference between parse success and intent satisfaction.

### 7.15 Supported Claims

Current evidence supports:

1. CRF DSLs can be implemented.
2. CRF DSLs can be token-efficient.
3. The method is reusable across domains.
4. Intent fidelity needs BDI.

### 7.16 Repository Status

This repository currently implements the metadata and bilingual publication layer. The executable layer is the next step.

### 7.17 Summary

This chapter organized CRF evidence into runtime, benchmark, and automated test layers, while explicitly separating reported evidence from executable repository evidence.

---

## 8. From DSL to Runtime: D×L×M and Validator Theory

### 8.1 Why DSL Derivation Is Not Enough

A derived DSL can still fail at runtime. The chain has multiple layers:

```text
mathematical structure
-> DSL syntax
-> instance parameters
-> physical or system execution
```

Any boundary can fail.

### 8.2 CRF Runtime Object

The CRF runtime object is:

```text
R_D = (
  V_D,
  B_D,
  Omega_D,
  L_D,
  semantics,
  Parser,
  Evaluator,
  Runtime,
  Invariants,
  Validators
)
```

Full execution:

```text
l -> Parser -> AST -> Evaluator -> Instance -> Runtime -> Output -> Validator
```

### 8.3 D×L×M Framework

The system space is:

```text
S = D x L x M
```

where:

- `D`: domain axis,
- `L`: construction layer,
- `M`: manifestation layer.

With nine domains, four layers, and four manifestations:

```text
9 x 4 x 4 = 144 coordinates
```

### 8.4 Domain Axis

The D axis contains D1-D9. It identifies which CRF domain a behavior belongs to, rather than which engineering module name it has.

### 8.5 Layer Axis

The L axis has:

```text
L1: primitives
L2: operations
L3: templates
L4: assemblies
```

In geometry, L4 is where `object/part/joint` appears.

### 8.6 Manifestation Axis

The M axis has:

```text
M1: axioms
M2: syntax
M3: instances
M4: physical/runtime execution
```

This separates theory, syntax, concrete parameters, and runtime output.

### 8.7 Correctness Transfer

Correctness must be preserved across:

```text
M1 -> M2 -> M3 -> M4
```

A failure at M4 does not necessarily refute M1.

### 8.8 Boundary Error Classes

Errors can occur at:

- M1 -> M2: theory-to-syntax loss,
- M2 -> M3: syntax-to-instance loss,
- M3 -> M4: instance-to-runtime loss.

Layer 4 geometry failures often occur at M3->M4: coordinate axes, part positioning, scale, material mapping, or mesh extraction.

### 8.9 Validator Theory

Validators become CRF's contract layer:

```text
V_D: Instance_D x Output_D x Invariants -> Pass/Fail/Report
```

Validator types include:

1. syntax validators,
2. type validators,
3. structure validators,
4. geometry validators,
5. execution validators,
6. intent validators.

### 8.10 Invariant Sets

Each domain defines invariants. For D1:

```text
connectivity
scale
joint validity
symmetry
material bounds
```

For D5:

```text
reachability
determinism
terminal state correctness
```

For D6:

```text
deny priority
scope containment
inheritance acyclicity
```

### 8.11 D7 as Contract Layer

D7 is both a domain and a cross-domain validator provider. It can validate data, ASTs, Intent IR, typed morphisms, and runtime invariants.

### 8.12 Component Tree

D1.L4 requires a Component Tree:

```text
CT = (Nodes, Edges, GeometryMap, AttributeMap)
```

The runtime chain becomes:

```text
DSL -> AST -> ComponentTree -> PartSDFs -> MeshBundle -> Render
```

Without a Component Tree, part identity and component hierarchy are lost.

### 8.13 Layer 4 Contracts

Layer 4 assembly requires:

- part uniqueness,
- valid joint references,
- graph connectivity,
- non-floating constraints,
- proportion constraints,
- symmetry constraints,
- parent-child cascading.

### 8.14 Source of Truth

CRF assets should use:

```text
AST / ComponentTree / Genome
```

as source of truth. Mesh, image, UI, and exported files are projections.

### 8.15 D9 in Runtime

D9 introduces self-update:

```text
Agent x Feedback -> Agent'
Genome x Feedback -> Genome'
```

But all mutations must be contract-preserving:

```text
Validator(Genome') = pass
```

### 8.16 Image-to-3D Runtime Chain

Image-to-3D is:

```text
Photo
-> BDI Goal
-> D1.L4 ObjectDSL
-> ComponentTree
-> Render
-> Verifier
-> D9 update
-> repeat until Bel(goal)
```

### 8.17 Validator-First Architecture

The recommended pipeline is:

```text
Generate
-> Validate
-> Render
-> Validate
-> Commit
```

### 8.18 Minimal Runtime Architecture

Modules:

1. Domain Registry,
2. Universal Parser,
3. Domain Evaluator,
4. Contract Validator,
5. Runtime/Renderer,
6. BDI Controller,
7. Evolution Engine.

### 8.19 Difference from Traditional Runtime

Traditional runtime executes general-purpose code. CRF runtime executes domain objects under mathematical and contract constraints.

### 8.20 Summary

This chapter moved CRF from DSL derivation to verifiable runtime theory.

---

## 9. JiYu Case Study: From Geometry to Editable Living Objects

### 9.1 Case Study Position

JiYu is not the sole proof of CRF. It is the first system case study showing how CRF can move from DSL derivation to verifiable, editable, evolvable runtime objects.

### 9.2 JiYu's Theoretical Position

JiYu starts from D1 geometry:

```text
F_1: R^3 -> R
```

Its geometry library uses:

- Layer 1 primitives,
- Layer 2 operations,
- Layer 3 templates,
- Layer 4 assembly.

As JiYu expands into materials, part assembly, image-to-3D, spatial self-awareness, and self-evolution, it becomes a cross-domain runtime case:

```text
JiYu = D1 + D7 + D9 + BDI + asset runtime
```

### 9.3 Material Lab

Material Lab shows that CRF DSLs can drive geometry, material, and evolution in a runtime. Its strongest claim is not that complex assets are solved, but that a genome/DSL can act as source code, render instruction, UI surface, and evolution substrate.

### 9.4 Geometry to Material Space

Material should not be treated as a post-processing texture. It is part of the object representation:

```text
Object = Geometry + Material + Texture + Behavior
```

The D1 carrier can be extended toward:

```text
V_D1 = V_geometry x V_material x V_texture
```

### 9.5 New Dimensions

Dimensions such as symmetry, taper, emissive, gradient, and wave are not arbitrary effects if they have mathematical or runtime mappings and preserve representation legality.

### 9.6 Ceiling of Layers 1-3

Layers 1-3 generate rich single-shape variations, but they do not naturally create recognizable multi-part objects. A music box is not a deformed sphere. It is base + gear + cover + handle.

### 9.7 Layer 4: object/part/joint

Layer 4 upgrades geometry to object representation:

```text
Object = Parts + Joints + Attributes + Behaviors
```

Each part may have geometry, material, interaction, and evolution binding.

### 9.8 Component Tree

Component Tree preserves semantic identity between DSL and mesh:

```text
DSL -> AST -> ComponentTree -> PartSDFs -> MeshBundle -> Runtime
```

It supports component-level editing, explosion views, behavior binding, and parent-child cascading.

### 9.9 Benchmark Objects

Three useful Layer 4 samples:

1. Braun camera: mechanical parts and material zones.
2. Golden puppy: organic character, symmetry, soft materials.
3. Muscle car: M3-to-M4 runtime diagnosis.

The muscle car case is especially important because parsing can succeed while rendering fails.

### 9.10 Image-to-3D

JiYu image-to-3D is not "photo to static mesh." It is:

```text
photo
-> structure analysis
-> object DSL
-> spatial self-perception agent
-> self-calibration loop
-> silent state
```

The output should be an editable, evolvable, interactive program-like object.

### 9.11 Spatial Self-Perception

Spatial self-perception is a BDI loop in 3D object form:

```text
Belief: current genome creates this object
Goal: rendered object matches source image
Intention: continue until similarity threshold is reached
Plan: modify dimensions, positions, materials, joints
Feedback: render difference
Reconsideration: continue, rebuild, or enter silent state
```

### 9.12 Image-to-3D Validation

Validation criteria include:

- part recall,
- component connectivity,
- proportion error,
- spatial relation correctness,
- material classification,
- coarse and fine similarity thresholds,
- final silent state.

These should be treated as future validation protocol unless executable tests are present.

### 9.13 Scene Asset Generation

Layer 4 enables asset generation: trees, buildings, furniture, vehicles, machines, and characters. Each asset is a structured CRF object:

```text
Asset = ObjectGraph + PartSDF + Material + Texture + Behavior + EvolutionGenome
```

### 9.14 Self-Evolution Architecture

JiYu proposes that a genome can simultaneously be source code, render instruction, UI, and evolution substrate. Editing the genome changes structure, appearance, behavior, and evolution direction.

### 9.15 JiYu's Cross-Domain Coordinates

Image-to-3D can be located across D×L×M coordinates, such as:

- D1.L4.M3: concrete object DSL,
- D1.L4.M4: rendered object,
- D9.L2.M4: alignment operation,
- D5.L3.M3: convergence/silent state.

### 9.16 Engineering Boundaries

JiYu's D1 foundation is a strong case. Layer 4, image-to-3D, and scene asset runtime remain engineering frontiers until stable tests exist.

### 9.17 JiYu's Reverse Contribution to CRF

JiYu motivates:

- the L axis,
- the M axis,
- Component Tree as source of truth,
- BDI + D9 integration.

### 9.18 Summary

JiYu shows that CRF can move from mathematical DSLs to editable living objects, but it should be treated as a system case study with clear maturity boundaries.

---

## 10. Cross-Domain Composition, Typed Morphisms, and World Models

### 10.1 Why Single-Domain Completeness Is Not Enough

Real tasks require multiple domains:

```text
Geometry + UI + State + Permission + Notification + Evolution + Intent
```

Single-domain completeness does not automatically solve cross-domain composition.

### 10.2 From Coupling Functions to Typed Morphisms

Early physical-domain CRF described:

```text
World = {F_i} + {C_ij}
```

This paper upgrades coupling functions into typed morphisms:

```text
m_i_j: (V_i, I_i) -> (V_j, I_j)
```

with validators and preservation constraints.

### 10.3 Revising "Never Leave the Native Space"

Within a domain, avoid lossy projection. Across domains, allow typed and validated morphisms.

```text
within-domain: avoid lossy projection
cross-domain: allow typed, validated morphism
```

### 10.4 Morphism Structure

A morphism includes:

```text
SourceType
TargetType
Preconditions
Mapping
Postconditions
AllowedLoss
Validator
```

### 10.5 Distinguishing Operation, Validator, Morphism, Combination Pattern

Operations act inside one domain. Validators check constraints. Morphisms map between domains. Combination patterns are pipelines of operations, validators, and morphisms.

### 10.6 Morphism Composition

Morphism composition is partial:

```text
m_j_k o m_i_j
is defined only if Post_i_j implies Pre_j_k
```

### 10.7 Information Loss and Reversibility

Morphism levels:

1. isomorphic,
2. faithful,
3. approximate,
4. observational.

Photo-to-object is approximate. ObjectDSL-to-ComponentTree should be faithful. Render-to-score is observational.

### 10.8 Cross-Domain Contracts

Each morphism has:

```text
Pre_i(v_i)
Post_j(v_j)
Preserve_i_j(v_i, v_j)
```

### 10.9 BDI in Cross-Domain Composition

BDI decomposes a user target into subgoals, binds them to domain paths, and decides how to respond when morphisms fail.

### 10.10 JiYu Image-to-3D as a Morphism Chain

```text
Photo
-> StructureDescription
-> ObjectDSL
-> ComponentTree
-> Render
-> Feedback
-> ObjectDSL'
-> SilentState
```

This is a partial, feedback-driven morphism chain.

### 10.11 From Object to Agent

A living object is:

```text
AliveObject =
  D1 structure
  + D5 state
  + D6 policy
  + D8 notification
  + D9 evolution
  + BDI intent
```

### 10.12 World Model

The world model becomes:

```text
World = (Z, {G_i}, {m_ij}, C, V)
```

where `Z` is shared world state, `G_i` are domain projections, `m_ij` are typed morphisms, `C` are consistency constraints, and `V` are validators.

### 10.13 Cross-Domain Consistency Constraints

Examples:

```text
state(lid)=open -> pose(lid)=openPose
batteryLow -> deliveryPlan(user)
deny(edit) -> hide(editControl)
evolve(O) -> Validator_D1(O')=pass
```

### 10.14 Typed Morphism and D×L×M

D×L×M gives the node space. Typed morphisms give edges. Workflows are paths. Validators are contracts on nodes and edges.

### 10.15 Open Problem: Composition Completeness

Cross-domain composition completeness asks:

```text
for every multi-domain task phi,
does there exist a path in G_CRF such that Execute(path) satisfies phi?
```

This remains open.

### 10.16 Minimal Cross-Domain Proof

A practical next proof target is:

```text
D1 + D5 + D8 + D9
```

For example, a living camera with geometry, state, notification, and evolution.

### 10.17 Role of Neural Methods

Neural models infer, propose, and optimize. CRF represents, validates, edits, and composes.

### 10.18 Cross-Domain Error Localization

Failure should be localized to a node or morphism edge, such as:

```text
Photo -> StructureIR
ObjectDSL -> ComponentTree
ComponentTree -> Render
Feedback -> ObjectDSL'
```

### 10.19 Summary

This chapter extended CRF from single-domain completeness to typed cross-domain composition and world models.

---

## 11. Discussion and Limitations

### 11.1 What This Paper Proves and Does Not Prove

The core claim is narrow:

```text
If a formalizable domain has a theorem-backed complete representation function,
then its AI-native DSL core can be derived from basis and closed operations.
```

The paper does not claim that LLMs automatically solve all software engineering problems.

### 11.2 CRF Derives Core Semantics, Not Every Surface Detail

CRF derives the core semantic vocabulary. Surface syntax, developer experience, templates, macros, and error recovery remain design work.

### 11.3 Completeness Is Not Monolithic

Completeness includes:

- carrier completeness,
- syntax completeness,
- runtime correctness,
- intent completeness.

They are distinct.

### 11.4 Nine Domains Are Current Closure, Not Final Exhaustiveness

The nine-domain framework is the current best closure under the Domain Admission Axiom. It may expand, shrink, or reorganize.

### 11.5 Domain Admission Still Needs Stronger Proof Machinery

The admission axiom is powerful but still needs formal work on theorem strength, irreducibility proofs, and failure conditions.

### 11.6 Theorem Inheritance Is Not Reproof

CRF inherits existing mathematical theories and maps them to DSL structures. It does not reprove relational algebra, automata, LTL, ABAC, or SDF theory.

### 11.7 Experiments Are Strong in Executability, Limited in Scale

The evidence supports executability, token economy, and cross-domain reuse, but test scale, baselines, and reproducibility need expansion.

### 11.8 BDI Is Necessary but Risky

BDI introduces belief errors, goal over-expansion, long-lived intention management, privacy risk, and permission issues.

### 11.9 JiYu Is a Strong Case, Not a Complete Product Proof

JiYu is a system case study. Layer 4, image-to-3D, and self-evolution require stable tests before being marked fully verified.

### 11.10 Layer 4 Is Breakthrough and Bottleneck

Layer 4 upgrades shape completeness to object completeness, but requires robust part coordinates, joints, component trees, validators, and runtime mapping.

### 11.11 Image-to-3D Is a Strong Product Entry, Not a Theoretical Substitute

Image-to-3D is a cross-domain pipeline and cannot replace the core theoretical and empirical evidence.

### 11.12 Cross-Domain Composition Completeness Is Open

Single-domain completeness does not imply multi-domain task completeness. Typed morphism graphs are a proposed path, not a completed proof.

### 11.13 Neural Models and CRF Are Complementary

Neural models should generate candidates and optimize parameters. CRF should preserve canonical structure, validation, editability, and composition.

### 11.14 Security, Permission, and Audit

Agent-native runtime must include permission, validation, audit, rollback, and user override.

### 11.15 Three Narrative Red Lines

1. Do not present nine domains as final exhaustion.
2. Do not present BDI as D10.
3. Do not present JiYu as fully productized proof.

### 11.16 Future Work

Future work includes:

- stronger metatheory,
- larger benchmarks,
- Intent IR and BDI runtime,
- JiYu Layer 4 and ComponentTree stabilization,
- typed morphism graph implementation,
- minimal cross-domain living object experiment.

### 11.17 Summary

CRF provides a clear, extensible, falsifiable, and engineering-oriented framework from mathematical completeness to AI-native DSLs and verifiable runtime. It is not complete, but it is a concrete research path.

---

## 12. Conclusion

### 12.1 Question Answered

This paper asks:

```text
When an LLM controls a system, what executable text should it output?
```

The answer is not always general-purpose code. When a target belongs to a formalizable domain, the best output may be the domain's native representation language.

### 12.2 Core Contributions

The paper contributes:

1. Complete Representation Functions.
2. Mapping theorem from mathematical structure to DSL.
3. Domain Admission Axiom and nine-domain framework.
4. Eight-domain empirical baseline.
5. BDI intent semantics layer.
6. D×L×M verifiable runtime framework.
7. JiYu system case study.

### 12.3 Final Theoretical Structure

CRF has three layers:

```text
BDI Intent Layer
CRF Representation Layer
Runtime Validation Layer
```

They answer:

```text
Which world should be pursued?
How is that world represented?
How is the representation executed and verified?
```

### 12.4 Final System Thesis

For any formalizable domain `D`, if there exists a theorem-backed complete representation function:

```text
F_D: X_D -> V_D / ~_D
```

then the domain's AI-native DSL can be derived from its basis and closed operations. But to become a working AI-native system, that DSL must be paired with BDI intent semantics, parser, evaluator, validator, runtime, and typed morphisms.

### 12.5 What This Paper Redefines

This paper redefines:

1. LLM output medium: not always code, but domain-native representation.
2. DSL source: not only expert design, but mathematical derivation.
3. System object ontology: AST/ComponentTree/Genome as source of truth.
4. World model: shared state plus domain projections, typed morphisms, constraints, and validators.

### 12.6 Research Value

CRF has theoretical value, engineering value, system value, product value, and academic value. It connects DSLs, formal methods, LLM interfaces, BDI, runtime validation, neuro-symbolic systems, and world models.

### 12.7 Boundaries

The paper does not claim final domain exhaustiveness, complete product maturity, or automatic intent understanding. It provides a structured path that can be tested, extended, and falsified.

### 12.8 Future Roadmap

The next steps are:

1. Complete metatheory.
2. Expand benchmarks.
3. Implement BDI runtime and Intent IR.
4. Stabilize JiYu Layer 4.
5. Implement the first typed morphism chain.
6. Build a minimal living cross-domain object.

### 12.9 Final Conclusion

CRF can be summarized in three sentences:

```text
Mathematics derives the DSL.
BDI aligns the DSL with human intent.
Runtime validation makes the DSL executable and trustworthy.
```

The complete path is:

```text
Natural Language
-> BDI
-> Intent IR
-> CRF DSL
-> Verified Runtime
-> Living Asset / World Model
```

If traditional software systems are organized around code files, CRF systems are organized around structured objects that are representable, verifiable, interactive, and evolvable.

This is the final significance of Complete Representation Functions.

---

## References

The full bibliographic catalog is mirrored from the Chinese original. Key references include the following.

### A. DSLs, Domain Languages, and Program Synthesis

1. van Deursen, A., Klint, P., & Visser, J. (2000). *Domain-Specific Languages: An Annotated Bibliography*. ACM SIGPLAN Notices.
2. Hudak, P. (1998). *Modular Domain Specific Languages and Tools*. In *Software Reuse*.
3. Mernik, M., Heering, J., & Sloane, A. M. (2005). *When and How to Develop Domain-Specific Languages*. ACM Computing Surveys.
4. Spinellis, D. (2001). *Notable Design Patterns for Domain-Specific Languages*. Journal of Systems and Software.
5. Fowler, M. (2010). *Domain-Specific Languages*. Addison-Wesley.
6. Solar-Lezama, A. (2008). *Program Synthesis by Sketching*. PhD dissertation.
7. Gulwani, S. (2011). *Automating String Processing in Spreadsheets using Input-Output Examples*. POPL.
8. Ellis, K., et al. (2020). *DreamCoder: Growing Generalizable, Interpretable Knowledge with Wake-Sleep Bayesian Program Learning*.

### B. LLM Tool Use, Structured Output, and Constrained Generation

9. OpenAI. *Structured model outputs*.
10. OpenAI. *Function calling*.
11. JSON Schema. *JSON Schema Draft 2020-12*.
12. Yao, S., et al. (2023). *ReAct: Synergizing Reasoning and Acting in Language Models*.
13. Schick, T., et al. (2023). *Toolformer: Language Models Can Teach Themselves to Use Tools*.
14. Willard, B. T., & Louf, R. (2023). *Efficient Guided Generation for Large Language Models*.

### C. BDI, Intention, Commitment, and Agents

15. Bratman, M. E. (1987). *Intention, Plans, and Practical Reason*.
16. Cohen, P. R., & Levesque, H. J. (1990). *Intention is Choice with Commitment*.
17. Rao, A. S., & Georgeff, M. P. (1991). *Modeling Rational Agents within a BDI-Architecture*.
18. Georgeff, M. P., & Lansky, A. L. (1987). *Reactive Reasoning and Planning*.
19. Wooldridge, M., & Jennings, N. R. (1995). *Intelligent Agents: Theory and Practice*.
20. Wooldridge, M. (2009). *An Introduction to MultiAgent Systems*.

### D. Relations, Automata, Concurrency, and Temporal Logic

21. Codd, E. F. (1970). *A Relational Model of Data for Large Shared Data Banks*.
22. Rabin, M. O., & Scott, D. (1959). *Finite Automata and Their Decision Problems*.
23. Hoare, C. A. R. (1978). *Communicating Sequential Processes*.
24. Milner, R., Parrow, J., & Walker, D. (1992). *A Calculus of Mobile Processes*.
25. Pnueli, A. (1977). *The Temporal Logic of Programs*.
26. Koymans, R. (1990). *Specifying Real-Time Properties with Metric Temporal Logic*.
27. Alur, R., & Henzinger, T. A. (1992). *Logics and Models of Real Time: A Survey*.
28. Lamport, L. (1978). *Time, Clocks, and the Ordering of Events in a Distributed System*.
29. Clarke, E. M., & Emerson, E. A. (1981). *Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic*.

### E. Formal Verification, Semantics, and Type Systems

30. Hoare, C. A. R. (1969). *An Axiomatic Basis for Computer Programming*.
31. Dijkstra, E. W. (1975). *Guarded Commands, Nondeterminacy and Formal Derivation of Programs*.
32. Plotkin, G. D. (1981). *A Structural Approach to Operational Semantics*.
33. Scott, D., & Strachey, C. (1971). *Toward a Mathematical Semantics for Computer Languages*.
34. Winskel, G. (1993). *The Formal Semantics of Programming Languages*.
35. Church, A. (1940). *A Formulation of the Simple Theory of Types*.
36. Freeman, T., & Pfenning, F. (1991). *Refinement Types for ML*.
37. Rondon, P. M., Kawaguchi, M., & Jhala, R. (2008). *Liquid Types*.
38. Pierce, B. C. (2002). *Types and Programming Languages*.
39. Findler, R. B., & Felleisen, M. (2002). *Contracts for Higher-Order Functions*.

### F. Permission, Data Constraints, and Policy Systems

40. NIST. (2014). *SP 800-162: Guide to Attribute Based Access Control (ABAC) Definition and Considerations*.
41. Hu, V. C., et al. (2014). *Guide to Attribute Based Access Control (ABAC) Definition and Considerations*.
42. OASIS. (2013). *eXtensible Access Control Markup Language (XACML) Version 3.0*.

### G. Geometry, SDF, Implicit Surfaces, CSG, and Rendering

43. Hart, J. C. (1996). *Sphere Tracing*.
44. Bloomenthal, J. (Ed.). (1997). *Introduction to Implicit Surfaces*.
45. Requicha, A. A. G. (1980). *Representations for Rigid Solids*.
46. Requicha, A. A. G., & Voelcker, H. B. (1977). *Constructive Solid Geometry*.
47. Wyvill, G., McPheeters, C., & Wyvill, B. (1986). *Data Structure for Soft Objects*.
48. Lorensen, W. E., & Cline, H. E. (1987). *Marching Cubes*.
49. Osher, S., & Sethian, J. A. (1988). *Fronts Propagating with Curvature-Dependent Speed*.

### H. UI Layout and Constraint Solving

50. Borning, A., Marriott, K., Stuckey, P., & Xiao, Y. (1997). *Solving Linear Arithmetic Constraints for User Interface Applications*.
51. Badros, G. J., Borning, A., & Stuckey, P. J. (2001). *The Cassowary Linear Arithmetic Constraint Solving Algorithm*.
52. Myers, B. A. (1990). *A New Model for Handling Input*.

### I. Dynamic Programming, Reinforcement Learning, and Evolution

53. Bellman, R. (1957). *Dynamic Programming*.
54. Bellman, R. (1957). *A Markovian Decision Process*.
55. Puterman, M. L. (1994). *Markov Decision Processes*.
56. Sutton, R. S., & Barto, A. G. (2018). *Reinforcement Learning: An Introduction*.
57. Holland, J. H. (1975). *Adaptation in Natural and Artificial Systems*.
58. Koza, J. R. (1992). *Genetic Programming*.

### J. Signals, Images, and Native Physical Representations

59. Gabor, D. (1946). *Theory of Communication*.
60. Shannon, C. E. (1949). *Communication in the Presence of Noise*.
61. Griffin, D. W., & Lim, J. S. (1984). *Signal Estimation from Modified Short-Time Fourier Transform*.
62. Gonzalez, R. C., & Woods, R. E. (2018). *Digital Image Processing*.
