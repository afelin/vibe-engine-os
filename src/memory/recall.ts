import { capContext } from "../context/cap.js";
import { readLessons, type EvoLesson } from "./lesson.js";

export type RecallResult = {
  lessons: EvoLesson[];
  markdown: string;
  totalChars: number;
  truncated: boolean;
};

export function recallLessons(
  rootDir: string,
  pathPrefixes: string[],
  limit = 5,
): RecallResult {
  const prefixes = pathPrefixes.filter(Boolean);
  const all = readLessons(rootDir, 200);

  const matched = all
    .filter((lesson) =>
      prefixes.some(
        (prefix) =>
          lesson.path.startsWith(prefix) ||
          lesson.reuseWhen.some((pattern) => prefix.startsWith(pattern)),
      ),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  const lines = matched.map(
    (lesson) =>
      `- [${lesson.path}] ${lesson.symptom} → ${lesson.fix} (gate: ${lesson.gate_id ?? "n/a"})`,
  );
  const raw = lines.length
    ? `\n\n⚠️ STRUCTURED LESSONS (evidence-linked):\n${lines.join("\n")}`
    : "";
  const capped = capContext(raw, 2000, "tail");

  return {
    lessons: matched,
    markdown: capped,
    totalChars: capped.length,
    truncated: capped.length < raw.length,
  };
}

export function formatLessonsForPlanner(recall: RecallResult): string {
  return recall.markdown;
}
