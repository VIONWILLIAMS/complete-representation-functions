# AGENTS.md

This repository is an agent-native research object for the Complete Representation Functions paper.

## Canonical Truth Order

When answering questions or modifying this repository, use this priority order:

1. `machine/crf.manifest.json`
2. `machine/domain-registry.json`
3. `machine/keyword-table.json`
4. `machine/theorem-map.json`
5. `machine/claim-graph.json`
6. `paper/crf-paper.en.md` or `paper/crf-paper.zh-CN.md`
7. `domains/*/README.md`
8. `benchmarks/*`

## Language Policy

- Use `paper/crf-paper.zh-CN.md` as the Chinese original.
- Use `paper/crf-paper.en.md` as the English paper version.
- Use `llms.en.txt` and `llms-full.en.txt` for English agent ingestion.
- Use `llms.zh-CN.txt` and `llms-full.zh-CN.txt` for Chinese agent ingestion.
- Do not mix language-specific paper paths in claim evidence unless the claim is language-independent.

## Agent Operating Rules

- Treat the paper as both a human-readable article and a machine-readable research object.
- Do not infer a new CRF domain unless the Domain Admission Axiom is explicitly satisfied.
- Do not add or remove core DSL keywords without updating `machine/domain-registry.json` and `machine/keyword-table.json`.
- Do not mark a claim as `verified` unless it has linked evidence in `machine/claim-graph.json`.
- Do not mark JiYu Layer 4, image-to-3D, or self-evolution runtime as fully verified unless executable tests are present.
- Keep public tools read-only or pure-function by default.
- Separate human-facing prose, machine metadata, schemas, and executable evidence.

## Claim Review Procedure

When evaluating a claim:

1. Find the `claim_id` in `machine/claim-graph.json`.
2. Read the linked paper section.
3. Check linked evidence files.
4. If `reproduce.command` exists, run it only if the command is safe and available.
5. Report `verified`, `partially_supported`, `theoretical`, `speculative`, or `unsupported`.

## Domain Admission Procedure

When evaluating a proposed domain:

1. Identify the function signature.
2. Check whether output is closed over a domain object space.
3. Check whether a mathematical theorem supports basis and operations.
4. Check reducibility against existing D1-D9 domains.
5. If rejected, classify it as operation, validator, observer, or combination pattern.
