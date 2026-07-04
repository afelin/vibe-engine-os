import * as fs from "node:fs";
import * as path from "node:path";

export type RollbackInstructions =
  | { found: true; runId: string; body: string }
  | { found: false; body: string };

export function readLatestRollbackInstructions(rootDir: string): RollbackInstructions {
  const runsDir = path.join(rootDir, ".runs");
  if (!fs.existsSync(runsDir)) {
    return missingRollbackInstructions();
  }

  const candidates = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(runsDir, entry.name, "ROLLBACK.md");
      if (!fs.existsSync(filePath)) return null;
      return {
        runId: entry.name,
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const latest = candidates[0];
  if (!latest) {
    return missingRollbackInstructions();
  }

  return {
    found: true,
    runId: latest.runId,
    body: fs.readFileSync(latest.filePath, "utf8"),
  };
}

function missingRollbackInstructions(): RollbackInstructions {
  return {
    found: false,
    body: [
      "## Rollback",
      "",
      "No verified rollback manifest exists yet.",
      "",
      "A rollback file is created only after a generated run passes verification.",
    ].join("\n"),
  };
}
