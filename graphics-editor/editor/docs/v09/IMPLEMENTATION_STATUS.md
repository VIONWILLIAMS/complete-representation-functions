# CRF 0.9 implementation

The user approved the complete iteration plan on 2026-11-21 (Asia/Shanghai).
Baseline: 26f9b85a2b25a84ef7afd9ace98a2930e5ab5851.

This is the development candidate. Release gates remain independent of successful builds,
schema validation, model calls, fitted-image counts and deployment. Full photorealistic
generation is not assumed achieved. Existing 0.3–0.8 cases and source paths are retained.

Parallel ownership:
- `web/crf-generative09.js`, shared appearance learning: generative representation.
- `web/crf-boundary09.js`, new street context: mixed edges and inferred background.
- `server/generative09.mjs`, `web/task-runner09.js`: semantic compilation and bounded jobs.
- Root integration: editor, Worker routing, actual provider experiments, frozen gates,
  standalone rendering, downloads, videos, browser QA and deployment.

The final acceptance report records each gate as passed, failed, partial or not measured.
It must not lower criteria or remove failed attempts to produce a passing release label.
