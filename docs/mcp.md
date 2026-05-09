# CRF MCP Server Design

The CRF MCP server is planned as a two-tier interface.

## Public MCP

Public MCP should be read-only and pure-function.

Resources:

- `crf://paper/full`
- `crf://paper/summary`
- `crf://paper/claims`
- `crf://domains`
- `crf://domains/D4`
- `crf://keywords`
- `crf://theorems`
- `crf://experiments`
- `crf://schemas/domain`
- `crf://schemas/intent-ir`
- `crf://dlm-map`
- `crf://morphisms`

Tools:

- `crf_parse`
- `crf_validate`
- `crf_explain_claim`
- `crf_check_domain_admission`
- `crf_run_tests`
- `crf_check_morphism`

## Local MCP

Local MCP may add executable capabilities, but only with sandboxing, allowlists, timeouts, and user approval for writes.

Local-only tools may include:

- benchmark execution
- D1 geometry rendering
- artifact generation
- local PR preparation

## Safety Boundary

No public MCP tool should expose shell execution, filesystem writes, network fetches, or private JiYu engine access.
