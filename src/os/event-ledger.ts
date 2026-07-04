import * as fs from "node:fs";
import * as path from "node:path";
import type { OSEvent } from "./events.js";

export function appendOperatorEvent(rootDir: string, event: OSEvent): void {
  const runsDir = path.join(rootDir, ".runs");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.appendFileSync(
    path.join(runsDir, "operator-events.ndjson"),
    `${JSON.stringify({ recordedAt: new Date().toISOString(), event })}\n`,
    "utf8",
  );
}
