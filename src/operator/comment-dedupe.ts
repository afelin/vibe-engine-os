import * as fs from "node:fs";
import * as path from "node:path";

const FILE_NAME = path.join(".runs", "operator-processed-comments.ndjson");

function dedupePath(rootDir: string): string {
  return path.join(rootDir, FILE_NAME);
}

export function hasProcessedComment(rootDir: string, commentId: string): boolean {
  const file = dedupePath(rootDir);
  if (!fs.existsSync(file)) return false;
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.some((line) => {
    try {
      const parsed = JSON.parse(line) as { commentId?: string };
      return parsed.commentId === commentId;
    } catch {
      return false;
    }
  });
}

export function markCommentProcessed(
  rootDir: string,
  commentId: string,
  actor: string,
): void {
  const file = dedupePath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    `${JSON.stringify({ commentId, actor, recordedAt: new Date().toISOString() })}\n`,
    "utf8",
  );
}
