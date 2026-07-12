import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createOSPlayer, getPersistedSnapshot } from "./player.js";
import type { OSContext, OSEvent } from "./events.js";
import { resolveRunDir, sanitizeRunId } from "../run/paths.js";

const EVENTS_FILE = "events.ndjson";

export type ReplayLedgerLine =
  | { type: "replay.init"; context: OSContext }
  | OSEvent;

export type ReplayResult = {
  ok: boolean;
  reason?: string;
  replayedHash?: string;
  storedHash?: string;
};

function eventsPath(rootDir: string, runId: string): string {
  return path.join(resolveRunDir(rootDir, sanitizeRunId(runId)), EVENTS_FILE);
}

export function hasEventLedger(rootDir: string, runId: string): boolean {
  return fs.existsSync(eventsPath(rootDir, runId));
}

export function appendOsEvent(
  rootDir: string,
  runId: string,
  event: ReplayLedgerLine,
): void {
  const filePath = eventsPath(rootDir, runId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

/**
 * Ensures the ledger starts with a replay.init line carrying the initial
 * context. Returns false for resumed legacy runs that have no ledger — those
 * cannot be replayed from an initial context, so recording is skipped.
 */
export function initializeEventLedger(
  rootDir: string,
  runId: string,
  initialContext: OSContext,
  resumed: boolean,
): boolean {
  if (hasEventLedger(rootDir, runId)) return true;
  if (resumed) return false;
  appendOsEvent(rootDir, runId, { type: "replay.init", context: initialContext });
  return true;
}

export function readEventLedger(
  rootDir: string,
  runId: string,
): ReplayLedgerLine[] {
  const filePath = eventsPath(rootDir, runId);
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReplayLedgerLine);
}

function sha256Json(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

export function replayRun(rootDir: string, runId: string): ReplayResult {
  if (!hasEventLedger(rootDir, runId)) {
    return { ok: false, reason: "events.ndjson not found (legacy run without event ledger)" };
  }

  let lines: ReplayLedgerLine[];
  try {
    lines = readEventLedger(rootDir, runId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `event ledger unreadable: ${message}` };
  }

  const [init, ...events] = lines;
  if (!init || init.type !== "replay.init") {
    return { ok: false, reason: "event ledger missing replay.init first line" };
  }

  const snapshotPath = path.join(
    resolveRunDir(rootDir, runId),
    "actor.snapshot.json",
  );
  if (!fs.existsSync(snapshotPath)) {
    return { ok: false, reason: "actor.snapshot.json not found" };
  }
  const storedHash = sha256Json(
    JSON.parse(fs.readFileSync(snapshotPath, "utf8")),
  );

  const actor = createOSPlayer(
    (init as { type: "replay.init"; context: OSContext }).context,
  );
  for (const event of events) {
    actor.send(event as OSEvent);
  }
  const replayedHash = sha256Json(getPersistedSnapshot(actor));

  const ok = replayedHash === storedHash;
  return {
    ok,
    reason: ok
      ? undefined
      : "replayed snapshot hash does not match stored actor.snapshot.json",
    replayedHash,
    storedHash,
  };
}
