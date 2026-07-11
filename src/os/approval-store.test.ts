import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearApproval,
  persistApproval,
  readPersistedApproval,
} from "./approval-store.js";

describe("approval store", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("persists and reads approval by issue number", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-approval-"));
    tmpDirs.push(root);

    persistApproval(root, "42", "alice", "run-001");
    const record = readPersistedApproval(root, "42");

    expect(record).toMatchObject({
      approvedBy: "alice",
      runId: "run-001",
    });
    expect(record?.approvedAt).toBeTruthy();
  });

  it("clears persisted approval", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-approval-"));
    tmpDirs.push(root);

    persistApproval(root, "7", "bob");
    clearApproval(root, "7");
    expect(readPersistedApproval(root, "7")).toBeNull();
  });
});
