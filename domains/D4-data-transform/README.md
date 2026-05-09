# D4 Data Transformation

Status: `planned_executable`

Function signature:

```text
F: Table x Op -> Table
```

Mathematical basis: Codd relational algebra.

Core basis:

```text
source, sink, literal
```

Core operations:

```text
filter, select, join, union, derive, rename, cast, drop, dedupe, sort,
limit, sample, group, window, pivot, unpivot, fill
```

Planned files:

- `parser.js`
- `evaluator.js`
- `tests.js`
- `report.md`

This domain is the first priority for executable CRF evidence because its closure is straightforward: `Table -> Table`.
