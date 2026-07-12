import * as fs from "node:fs";
import * as path from "node:path";

export type IdempotencyRecord = {
  key: string;
  capsuleHash: string;
  runId: string;
  recordedAt: string;
};

export function buildIdempotencyKey(
  eventName: string,
  deliveryId: string,
  issueNumber: string,
): string {
  return `${eventName}:${deliveryId}:${issueNumber}`;
}

function idempotencyDir(rootDir: string): string {
  return path.join(rootDir, ".runs", "idempotency");
}

function idempotencyPath(rootDir: string, key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(idempotencyDir(rootDir), `${safeKey}.json`);
}

export function readIdempotencyRecord(
  rootDir: string,
  key: string,
): IdempotencyRecord | null {
  const filePath = idempotencyPath(rootDir, key);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as IdempotencyRecord;
}

export function writeIdempotencyRecord(
  rootDir: string,
  record: IdempotencyRecord,
): void {
  const dir = idempotencyDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    idempotencyPath(rootDir, record.key),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export function hasProcessedDelivery(rootDir: string, key: string): boolean {
  return readIdempotencyRecord(rootDir, key) !== null;
}

export function shouldSkipDuplicateRun(
  rootDir: string,
  key: string,
  capsuleHash: string,
): boolean {
  const existing = readIdempotencyRecord(rootDir, key);
  if (!existing) return false;
  return existing.capsuleHash === capsuleHash;
}
