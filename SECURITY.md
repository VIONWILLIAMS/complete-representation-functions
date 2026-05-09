# Security Policy

CRF is intended to become agent-readable, agent-callable, and agent-verifiable.
That makes tool boundaries part of the research artifact.

## Public Interface Policy

Public agent interfaces should be read-only or pure-function by default.

Allowed public capabilities:

- Read paper and machine metadata.
- Return schemas.
- Parse DSL strings into AST.
- Validate DSL syntax and static contracts.
- Explain claims and evidence chains.
- Run deterministic lightweight tests with no external side effects.

Disallowed public capabilities:

- Shell execution.
- Git writes.
- Filesystem writes.
- Network fetches on behalf of untrusted users.
- Private engine access.
- Mutable long-running agents.

## Local Interface Policy

Local development tools may run benchmarks, render demos, or generate artifacts, but should use:

- Explicit user approval for writes.
- Timeouts.
- Allowlisted commands.
- Read-only default behavior.
- No network by default.
- Clear audit logs.

## Reporting

Report security issues privately before opening public issues.
