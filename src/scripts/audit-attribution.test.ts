import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/audit-attribution.mjs");

function runAudit(args: string[] = []) {
  const result = spawnSync("node", [script, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("audit-attribution script", () => {
  it("passes on the current branch against origin/main", () => {
    const result = runAudit(["origin/main"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("attribution-audit: ok");
  });

  it("fail-opens on shell-metacharacter base refs instead of executing them", () => {
    const result = runAudit(["origin/main; echo pwned"]);
    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toContain("invalid base ref");
  });

  it("fail-opens on missing git ranges", () => {
    const result = runAudit(["origin/this-ref-should-not-exist-xyz"]);
    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).toContain("fail open");
  });
});
