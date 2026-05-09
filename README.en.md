# Complete Representation Functions

> **Free Dancing in the Rabbit Hole.**  
> **But first, fries at the pier.**

_An independent researcher's epigraph._

**Complete Representation Functions: A Unified Theory for Deriving AI-Native Domain Languages**

Subtitle: **From Mathematical Completeness to Intent Semantics and Verifiable Runtime**

This repository publishes CRF as an **agent-native research object**.

It contains:

- a human-readable paper,
- machine-readable domain and claim metadata,
- schema contracts,
- a future executable DSL verification layer,
- a future MCP server interface.

## Read the Paper

- [English paper](paper/crf-paper.en.md)
- [Chinese original paper](paper/crf-paper.zh-CN.md)

## Agent Entrypoints

- [AGENTS.en.md](AGENTS.en.md)
- [llms.en.txt](llms.en.txt)
- [llms-full.en.txt](llms-full.en.txt)
- [machine/crf.manifest.json](machine/crf.manifest.json)

## Machine-Readable Research Object

Core files:

- [machine/domain-registry.json](machine/domain-registry.json): D1-D9 domain registry.
- [machine/keyword-table.json](machine/keyword-table.json): basis, operations, and keyword counts.
- [machine/theorem-map.json](machine/theorem-map.json): theorem sources.
- [machine/claim-graph.json](machine/claim-graph.json): claim-to-evidence graph.
- [machine/experiment-index.json](machine/experiment-index.json): experiment index.
- [machine/dlm-map.json](machine/dlm-map.json): D×L×M runtime coordinates.
- [machine/morphism-registry.json](machine/morphism-registry.json): typed morphism registry.

## Minimal Verification

```bash
npm test
npm run validate:claims
```

## Core Thesis

For any formalizable domain `D`, if there exists a mathematically grounded complete representation function `F_D` with basis `B_D` and closed operations `Omega_D`, then the domain's AI-native DSL core can be derived from `B_D` and `Omega_D` rather than being designed only by expert convention.

CRF therefore turns a paper into a callable research object:

```text
paper -> manifest -> claim graph -> domain registry -> schema -> parser/evaluator/validator -> MCP
```
