# D6 Permission

Status: `planned_executable`

Function signature:

```text
F: Subject x Resource x Action x Environment -> Decision
```

Mathematical basis: ABAC.

Core basis:

```text
role, resource, action, condition
```

Core operations:

```text
allow, deny, when, inherit, scope, delegate
```

Planned files:

- `parser.js`
- `evaluator.js`
- `tests.js`
- `report.md`

This domain verifies policy decisions, inheritance, deny priority, scope boundaries, and delegation.
