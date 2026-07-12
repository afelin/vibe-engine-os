import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildIdempotencyKey,
  hasProcessedDelivery,
  readIdempotencyRecord,
  shouldSkipDuplicateRun,
  writeIdempotencyRecord,
} from "./idempotency.js";

describe("idempotency", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds stable keys from event delivery and issue", () => {
    const key = buildIdempotencyKey("issues", "delivery-1", "42");
    expect(key).toBe("issues:delivery-1:42");
  });

  it("detects processed delivery before re-run", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-idem-"));
    tmpDirs.push(root);
    const key = buildIdempotencyKey("issues", "del-1", "42");
    expect(hasProcessedDelivery(root, key)).toBe(false);
    writeIdempotencyRecord(root, {
      key,
      capsuleHash: "abc123",
      runId: "run-1",
      recordedAt: new Date().toISOString(),
    });
    expect(hasProcessedDelivery(root, key)).toBe(true);
  });

  it("skips duplicate runs with same capsule hash", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-idem-"));
    tmpDirs.push(root);
    const key = buildIdempotencyKey("issues", "d1", "7");
    writeIdempotencyRecord(root, {
      key,
      capsuleHash: "abc123",
      runId: "run-1",
      recordedAt: new Date().toISOString(),
    });

    expect(shouldSkipDuplicateRun(root, key, "abc123")).toBe(true);
    expect(shouldSkipDuplicateRun(root, key, "different")).toBe(false);
    expect(readIdempotencyRecord(root, key)?.runId).toBe("run-1");
  });
});
