import fs from "node:fs";

const claims = JSON.parse(fs.readFileSync("machine/claim-graph.json", "utf8"));
const missing = [];

for (const claim of claims) {
  for (const evidence of claim.evidence ?? []) {
    if (evidence.kind?.endsWith("placeholder")) continue;
    if (!fs.existsSync(evidence.path)) {
      missing.push(`${claim.claim_id}: ${evidence.path}`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing evidence paths:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`validated ${claims.length} claims`);
