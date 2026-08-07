import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMandates } from "../constitution/parse.js";

/** Normalize agent-proposed paths before prefix checks (blocks `src/./auth/` bypasses). */
export function normalizeProposedPath(filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, "/"));
}

export function isUnsafeProposedPath(filePath: string): boolean {
  const normalized = normalizeProposedPath(filePath);
  return (
    normalized.includes("..") ||
    path.posix.isAbsolute(normalized) ||
    normalized.startsWith("~") ||
    filePath.includes("\0")
  );
}

export type BondPolicy = {
  require_bound_files_min_depth: number;
  max_bound_files: number;
  max_intent_chars: number;
  allowed_file_prefixes: string[];
};

export type Mandates = {
  forbidden_prefixes: string[];
  require_approval_prefixes: string[];
  max_attempts: number;
  approved_operators?: string[];
  bond?: BondPolicy;
};

export type MandateViolation = {
  path: string;
  rule: "forbidden" | "require_approval";
  prefix: string;
};

export type MandateEvaluation = {
  passed: boolean;
  violations: MandateViolation[];
  requiresApproval: boolean;
  maxAttempts: number;
};

const defaultMandates: Mandates = {
  forbidden_prefixes: [
    "src/auth/",
    ".github/workflows/",
    "src/policy/mandates.json",
    "src/policy/principals.json",
    ".vibe/principals.json",
    ".vibe/active_mandate.json",
  ],
  require_approval_prefixes: [".github/", "package.json"],
  max_attempts: 3,
  approved_operators: [],
};

export function loadMandates(rootDir = "."): Mandates {
  const bundled = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "mandates.json",
  );
  const local = path.join(rootDir, "src/policy/mandates.json");
  const source = fs.existsSync(local) ? local : bundled;

  try {
    const raw = JSON.parse(fs.readFileSync(source, "utf8"));
    return parseMandates({ ...defaultMandates, ...raw });
  } catch {
    return defaultMandates;
  }
}

export function evaluateMandates(
  proposedFiles: string[],
  mandates: Mandates = loadMandates(),
): MandateEvaluation {
  const violations: MandateViolation[] = [];

  for (const rawPath of proposedFiles) {
    if (isUnsafeProposedPath(rawPath)) {
      violations.push({ path: rawPath, rule: "forbidden", prefix: "unsafe_path" });
      continue;
    }

    const filePath = normalizeProposedPath(rawPath);
    for (const prefix of mandates.forbidden_prefixes) {
      if (filePath.startsWith(prefix) || filePath === prefix.replace(/\/$/, "")) {
        violations.push({ path: rawPath, rule: "forbidden", prefix });
      }
    }
    for (const prefix of mandates.require_approval_prefixes) {
      if (filePath.startsWith(prefix) || filePath === prefix) {
        violations.push({ path: rawPath, rule: "require_approval", prefix });
      }
    }
  }

  const forbidden = violations.filter((item) => item.rule === "forbidden");
  const requiresApproval = violations.some((item) => item.rule === "require_approval");

  return {
    passed: forbidden.length === 0,
    violations,
    requiresApproval,
    maxAttempts: mandates.max_attempts,
  };
}
