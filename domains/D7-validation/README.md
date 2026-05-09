# D7 Validation

Status: `planned_executable`

Function signature:

```text
F: Data x Rules -> Valid | Error[]
```

Mathematical basis: type theory and refinement types.

Core basis:

```text
field, entity, error
```

Core operations:

```text
required, range, length, match, oneof, unique, ref, depends, custom
```

Planned files:

- `parser.js`
- `evaluator.js`
- `tests.js`
- `report.md`

D7 is also the future cross-domain contract provider for AST, Intent IR, typed morphisms, and runtime invariants.
