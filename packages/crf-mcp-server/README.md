# CRF MCP Server

Status: `planned`

The MCP server will expose CRF as a callable research object.

Public server principles:

- read-only resources
- pure-function parsing and validation
- no shell access
- no filesystem writes
- no network fetches on behalf of untrusted users

Planned resources:

```text
crf://paper/full
crf://paper/summary
crf://paper/claims
crf://domains
crf://keywords
crf://theorems
crf://experiments
crf://schemas/domain
crf://schemas/intent-ir
crf://dlm-map
crf://morphisms
```

Planned tools:

```text
crf_parse
crf_validate
crf_explain_claim
crf_check_domain_admission
crf_run_tests
crf_check_morphism
```
