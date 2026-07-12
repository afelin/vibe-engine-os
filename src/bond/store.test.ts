import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sealTaskBond } from "./seal.js";
import { readTaskBond, writeTaskBond } from "./store.js";

describe("task bond store", () => {
  let root = "";

  afterEach(() => {
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes and reads bond by issue number", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "bond-store-"));
    const sealed = sealTaskBond({
      issueNumber: "7",
      issueTitle: "Test",
      issueBody: `### Intent (one sentence)
Test intent

### Files to touch (exact paths)
src/a.ts
`,
      depth: 3,
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;

    const filePath = writeTaskBond(root, sealed.bond);
    expect(fs.existsSync(filePath)).toBe(true);

    const loaded = readTaskBond(root, "7");
    expect(loaded?.bondHash).toBe(sealed.bond.bondHash);
    expect(loaded?.boundFiles).toContain("src/a.ts");
  });
});
