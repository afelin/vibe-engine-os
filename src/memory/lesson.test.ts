import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendLesson, readLessons, writeEvoMemExport } from "./lesson.js";
import { recallLessons } from "./recall.js";

describe("EvoLesson", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appends evidence-linked lessons to lessons.ndjson", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-lesson-"));
    tmpDirs.push(root);

    appendLesson(root, {
      runId: "run-1",
      failureClass: "compile",
      gate_id: "typescript_compiler",
      path: "src/foo.ts",
      symptom: "type error",
      fix: "add missing export",
      reuseWhen: ["src/foo"],
      traceSpanTs: new Date().toISOString(),
    });

    const lessons = readLessons(root);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.path).toBe("src/foo.ts");
  });

  it("recalls lessons by path prefix with char cap", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-recall-"));
    tmpDirs.push(root);

    for (let i = 0; i < 10; i++) {
      appendLesson(root, {
        runId: `run-${i}`,
        failureClass: "test",
        path: "src/bar.ts",
        symptom: `failure ${i} `.repeat(20),
        fix: "fix it",
        reuseWhen: ["src/bar"],
        traceSpanTs: new Date().toISOString(),
      });
    }

    const recall = recallLessons(root, ["src/bar"], 3);
    expect(recall.lessons.length).toBeLessThanOrEqual(3);
    expect(recall.markdown).toContain("STRUCTURED LESSONS");
    expect(recall.totalChars).toBeLessThanOrEqual(2000);
  });

  it("exports EVOMEM.md from structured lessons", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-evomem-"));
    tmpDirs.push(root);

    appendLesson(root, {
      runId: "run-export",
      failureClass: "gate",
      path: "src/export.ts",
      symptom: "blocked",
      fix: "use allowed path",
      reuseWhen: ["src/export"],
      traceSpanTs: new Date().toISOString(),
    });

    writeEvoMemExport(root);
    const markdown = fs.readFileSync(path.join(root, "EVOMEM.md"), "utf8");
    expect(markdown).toContain("src/export.ts");
    expect(markdown).toContain("generated");
  });
});
