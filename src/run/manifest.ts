import * as fs from "node:fs";
import * as path from "node:path";

export type RunManifest = {
  runId: string;
  issueNumber: string;
  issueTitle: string;
  branchName: string;
  baseSha: string;
  generatedFiles: string[];
  createdAt: string;
  approvalRequired?: boolean;
};

export function writeRunManifest(rootDir: string, manifest: RunManifest) {
  const dir = path.join(rootDir, ".runs", manifest.runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

export function renderRollbackInstructions(manifest: RunManifest) {
  return [
    `# Rollback ${manifest.runId}`,
    "",
    `Issue: #${manifest.issueNumber} ${manifest.issueTitle}`,
    `Branch: ${manifest.branchName}`,
    `Base SHA: ${manifest.baseSha}`,
    "",
    "Generated files:",
    ...renderGeneratedFiles(manifest.generatedFiles),
    "",
    "To inspect the change:",
    "",
    "```bash",
    `git diff ${manifest.baseSha}..HEAD`,
    "```",
    "",
    "To return to the base commit on this branch after review:",
    "",
    "```bash",
    `git revert --no-edit ${manifest.baseSha}..HEAD`,
    "```",
    "",
  ].join("\n");
}

function renderGeneratedFiles(files: string[]) {
  if (files.length === 0) return ["- No generated files recorded."];
  return files.map((file) => `- ${file}`);
}
