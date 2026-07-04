import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { appendOperatorEvent } from "./event-ledger.js";

describe("operator event ledger", () => {
  it("appends typed operator events as JSONL audit records", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "event-ledger-"));

    appendOperatorEvent(root, {
      type: "operator.status_requested",
      protocolVersion: "os.operator.v1",
      actor: "alice",
      commentId: "comment-1",
    });

    const ledgerPath = path.join(root, ".runs", "operator-events.ndjson");
    const lines = fs.readFileSync(ledgerPath, "utf8").trim().split("\n");
    const record = JSON.parse(lines[0]);

    expect(record.event).toEqual({
      type: "operator.status_requested",
      protocolVersion: "os.operator.v1",
      actor: "alice",
      commentId: "comment-1",
    });
    expect(record.recordedAt).toEqual(expect.any(String));
  });
});
