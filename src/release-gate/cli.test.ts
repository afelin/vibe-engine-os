import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxBin = join(repoRoot, "node_modules/.bin/tsx");
const cliPath = join(repoRoot, "src/release-gate/cli.ts");

function runCli(args: string[]): unknown {
  const stdout = execFileSync(tsxBin, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

describe("gate:resolve CLI", () => {
  it("accepts positional title and body", () => {
    const result = runCli([
      "cloud loop",
      "src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts",
    ]) as { id?: string };

    expect(result.id).toBe("cloud-loop-smoke");
  });

  it("accepts --title and --body flags documented in agent-protocol", () => {
    const result = runCli([
      "--title",
      "cloud loop",
      "--body",
      "src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts",
    ]) as { id?: string };

    expect(result.id).toBe("cloud-loop-smoke");
  });
});
