import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendLesson } from "./lesson.js";
import {
  emitGateCandidatesFromLessons,
  lessonToGateCandidate,
} from "./gate-candidates.js";

describe("gate candidates from lessons", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits candidate stub shape from reuseWhen lesson", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cand-"));
    tmpDirs.push(root);
    const lesson = appendLesson(root, {
      runId: "run_1",
      failureClass: "missing_export",
      path: "src/foo.ts",
      symptom: "export missing",
      fix: "add export",
      reuseWhen: ["src/foo", "missing export"],
      traceSpanTs: "2026-08-08T12:00:00.000Z",
    });

    const stub = lessonToGateCandidate(lesson, () => "2026-08-08T12:00:00.000Z");
    expect(stub.schema).toBe("coreward.gate_candidate.v1");
    expect(stub.status).toBe("candidate");
    expect(stub.source_lesson_ids).toEqual([lesson.id]);
    expect(stub.reuseWhen).toContain("src/foo");
    expect(stub.suggested_paths).toEqual(["src/foo.ts"]);
    expect(stub.planLines.some((l) => l.includes("not auto-applied"))).toBe(
      true,
    );

    const { written, candidates } = emitGateCandidatesFromLessons(root);
    expect(candidates.length).toBe(1);
    expect(written.length).toBe(1);
    expect(fs.existsSync(written[0]!)).toBe(true);
    const loaded = JSON.parse(fs.readFileSync(written[0]!, "utf8")) as {
      status: string;
      schema: string;
    };
    expect(loaded.status).toBe("candidate");
    expect(loaded.schema).toBe("coreward.gate_candidate.v1");
  });
});
