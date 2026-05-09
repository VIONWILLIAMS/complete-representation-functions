# Reproducibility

This repository is currently in metadata-first release state.

Executable evidence roadmap:

1. Implement D4-D8 parsers, evaluators, and tests.
2. Add reproducible D4-D8 50-test benchmark output.
3. Add D2 benchmark fixtures and result JSON for 800-call experiment replay or audit.
4. Add claim validation that checks all `claim_id` evidence paths.

Current commands:

```bash
npm test
npm run validate:claims
```

Declared but not executable yet:

```bash
npm run benchmark:d2
npm run test:domains
npm run mcp
```
