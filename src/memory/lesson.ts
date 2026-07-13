import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseEvoLesson } from "../constitution/parse.js";

export type EvoLesson = {
  id: string;
  runId: string;
  failureClass: string;
  gate_id?: string;
  path: string;
  symptom: string;
  fix: string;
  reuseWhen: string[];
  traceSpanTs: string;
  createdAt: string;
};

const LESSONS_DIR = ".evomem";
const LESSONS_FILE = "lessons.ndjson";

function lessonsPath(rootDir: string): string {
  return path.join(rootDir, LESSONS_DIR, LESSONS_FILE);
}

function newLessonId(): string {
  return crypto.randomUUID();
}

export function appendLesson(rootDir: string, lesson: Omit<EvoLesson, "id" | "createdAt">): EvoLesson {
  const entry = parseEvoLesson({
    ...lesson,
    id: newLessonId(),
    createdAt: new Date().toISOString(),
  });

  const dir = path.join(rootDir, LESSONS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(lessonsPath(rootDir), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export function readLessons(rootDir: string, limit = 100): EvoLesson[] {
  const filePath = lessonsPath(rootDir);
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) => parseEvoLesson(JSON.parse(line)));
}

export function exportEvoMemMarkdown(lessons: EvoLesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map(
    (lesson) =>
      `- [${lesson.path}] ${lesson.symptom} → ${lesson.fix} (run ${lesson.runId})`,
  );
  return `# EVOMEM (generated)\n\n${lines.join("\n")}\n`;
}

export function writeEvoMemExport(rootDir: string): void {
  const lessons = readLessons(rootDir);
  const markdown = exportEvoMemMarkdown(lessons);
  if (!markdown) return;
  fs.writeFileSync(path.join(rootDir, "EVOMEM.md"), markdown, "utf8");
}
