const command = process.argv[2] ?? "unknown";

console.error(`${command} is declared but not yet executable in this metadata-first release.`);
process.exit(1);
