/**
 * CLI: npm run ward:doctor
 * Usage: ward:doctor [root_dir]
 */
import { runWardDoctor } from "./doctor.js";

const rootDir = process.argv[2] ?? ".";

const result = runWardDoctor(rootDir);
for (const check of result.checks) {
  const mark = check.ok ? "✓" : check.soft ? "⚠" : "✗";
  const soft = check.soft ? " (soft)" : "";
  console.log(`${mark} ${check.id}${soft}: ${check.detail}`);
}

if (!result.ok) {
  console.error("\nward:doctor failed — fix hard checks above");
  process.exit(1);
}

console.log("\nward:doctor green");
process.exit(0);
