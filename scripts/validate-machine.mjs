import fs from "node:fs";
import path from "node:path";

const roots = ["machine", "schemas"];
let count = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    if (!file.endsWith(".json")) continue;
    JSON.parse(fs.readFileSync(file, "utf8"));
    count += 1;
  }
}

console.log(`validated ${count} JSON files`);

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}
