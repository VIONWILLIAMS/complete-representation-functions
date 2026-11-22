# AGENTS.md

This is the default English agent instruction file.

For localized versions:

- English: `AGENTS.en.md`
- Chinese: `AGENTS.zh-CN.md`

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

## Graphics Editor Development Entry

For work under `graphics-editor/`, read its `AGENTS.md`, then `CODEX_START_HERE.md` and `plans/CRF_Integrated_Development_Plan.md`. The current GPU96 implementation branch is `crf-gpu96-development`; the default branch also contains the plan but does not automatically contain the experimental application implementation.

The integrated plan preserves original 1.1 requirements and explicitly scopes object-local training and native spatial-function research. It does not admit a new mathematical CRF domain, change core DSL keywords, or promote claims to verified. The canonical truth order and claim-evidence requirements above remain in force. Treat product design, uploaded reports, measured runs, and formally checked claims as distinct evidence classes.
