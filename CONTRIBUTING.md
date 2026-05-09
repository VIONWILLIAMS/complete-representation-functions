# Contributing

This repository treats the CRF paper as an agent-native research object.

## Contribution Types

- Paper corrections.
- Reference additions.
- Claim graph improvements.
- Domain registry corrections.
- Schema improvements.
- Parser, evaluator, and validator implementations.
- Reproducibility scripts.
- MCP server improvements.

## Rules

- New core domains must satisfy the Domain Admission Axiom.
- New claims must have `claim_id` entries in `machine/claim-graph.json`.
- New evidence must be linked from `machine/experiment-index.json` or a domain report.
- New DSL keywords must update both `domain-registry.json` and `keyword-table.json`.
- Experimental JiYu features must be marked experimental until tests exist.

## Validation

Before opening a PR, run:

```bash
npm test
npm run validate:machine
```

If no package scripts exist yet, at minimum validate all JSON files.
