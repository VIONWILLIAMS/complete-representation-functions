/**
 * Planned CRF MCP server entrypoint.
 *
 * This file intentionally exposes no runtime tool yet. The first public MCP
 * implementation should be read-only and pure-function by default.
 */

export const crfMcpServerStatus = {
  name: "crf-mcp-server",
  status: "planned",
  publicSafetyMode: "read-only",
  resources: [
    "crf://paper/full",
    "crf://paper/claims",
    "crf://domains",
    "crf://keywords",
    "crf://theorems",
    "crf://experiments",
    "crf://schemas/domain",
    "crf://schemas/intent-ir",
    "crf://dlm-map",
    "crf://morphisms"
  ],
  tools: [
    "crf_parse",
    "crf_validate",
    "crf_explain_claim",
    "crf_check_domain_admission",
    "crf_run_tests",
    "crf_check_morphism"
  ]
};
