# For Agents

You are reading an agent-native research repository.

Start with:

1. `llms.txt`
2. `machine/crf.manifest.json`
3. `machine/domain-registry.json`
4. `machine/claim-graph.json`
5. `paper/crf-paper.en.md` or `paper/crf-paper.zh-CN.md`

When asked about a domain, prefer `machine/domain-registry.json`.

When asked about a claim, prefer `machine/claim-graph.json`.

When asked about evidence, follow the `evidence` and `reproduce` fields.

When asked whether a proposed domain should be admitted, apply:

1. Type independence.
2. Operational closure.
3. Mathematical theorem support.
4. Irreducibility against D1-D9.

Do not treat BDI as D10. BDI is a horizontal intent semantics layer.
