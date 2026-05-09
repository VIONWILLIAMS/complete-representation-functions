# Getting Started

This repository currently provides the paper and the first agent-native metadata layer.

Useful entrypoints:

```bash
cat machine/crf.manifest.json
cat machine/domain-registry.json
cat machine/claim-graph.json
cat llms.txt
```

Validate JSON files:

```bash
find machine schemas -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log("ok", process.argv[1])'
```

Future executable layers will add parser, evaluator, validator, benchmark, and MCP commands.
