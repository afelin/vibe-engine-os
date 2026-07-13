import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIssueRunIndex, writeIssueRunIndex } from "./issue-index.js";

describe("issue run index", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes and reads active run pointer per issue", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-index-"));
    tmpDirs.push(root);

    writeIssueRunIndex(root, "42", {
      runId: "issue-42-2026-07-13",
      state: "awaiting_approval",
      updatedAt: "2026-07-13T12:00:00.000Z",
    });

    const entry = readIssueRunIndex(root, "42");
    expect(entry).toEqual({
      runId: "issue-42-2026-07-13",
      state: "awaiting_approval",
      updatedAt: "2026-07-13T12:00:00.000Z",
    });
    expect(
      fs.existsSync(path.join(root, ".runs", "index", "issue-42.json")),
    ).toBe(true);
  });

  it("returns null when no index exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-index-"));
    tmpDirs.push(root);
    expect(readIssueRunIndex(root, "99")).toBeNull();
  });
});
