# D5 State Machine

Status: `planned_executable`

Function signature:

```text
F: State x Event -> State x Action[]
```

Mathematical basis: finite automata.

Core basis:

```text
state, event, action, guard, context
```

Core operations:

```text
on->, if, do, after, enter, exit, assign
```

Planned files:

- `parser.js`
- `evaluator.js`
- `tests.js`
- `report.md`

This domain verifies event-driven state transitions, guards, actions, enter/exit hooks, and unreachable or conflicting transitions.
