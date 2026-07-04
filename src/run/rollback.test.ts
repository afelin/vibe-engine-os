import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { readLatestRollbackInstructions } from "./rollback.js";

describe("rollback instructions reader", () => {
  it("returns a safe missing-manifest message when rollback metadata does not exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-empty-"));

    const result = readLatestRollbackInstructions(root);

    expect(result.found).toBe(false);
    expect(result.body).toContain("No verified rollback manifest exists yet.");
  });

  it("reads the newest rollback instructions without mutating anything", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rollback-"));
    const oldDir = path.join(root, ".runs", "run-old");
    const newDir = path.join(root, ".runs", "run-new");
    fs.mkdirSync(oldDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, "ROLLBACK.md"), "# old rollback\n");
    fs.writeFileSync(path.join(newDir, "ROLLBACK.md"), "# new rollback\n");

    const result = readLatestRollbackInstructions(root);

    expect(result).toEqual({
      found: true,
      runId: "run-new",
      body: "# new rollback\n",
    });
  });
});
