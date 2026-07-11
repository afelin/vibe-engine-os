import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type Mandates = {
  forbidden_prefixes: string[];
  require_approval_prefixes: string[];
  max_attempts: number;
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
  forbidden_prefixes: ["src/auth/", ".github/workflows/"],
  require_approval_prefixes: [".github/", "package.json"],
  max_attempts: 3,
};

export function loadMandates(rootDir = "."): Mandates {
  const bundled = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "mandates.json",
  );
  const local = path.join(rootDir, "src/policy/mandates.json");
  const source = fs.existsSync(local) ? local : bundled;

  try {
    return { ...defaultMandates, ...JSON.parse(fs.readFileSync(source, "utf8")) };
  } catch {
    return defaultMandates;
  }
}

export function evaluateMandates(
  proposedFiles: string[],
  mandates: Mandates = loadMandates(),
): MandateEvaluation {
  const violations: MandateViolation[] = [];

  for (const filePath of proposedFiles) {
    for (const prefix of mandates.forbidden_prefixes) {
      if (filePath.startsWith(prefix) || filePath === prefix.replace(/\/$/, "")) {
        violations.push({ path: filePath, rule: "forbidden", prefix });
      }
    }
    for (const prefix of mandates.require_approval_prefixes) {
      if (filePath.startsWith(prefix) || filePath === prefix) {
        violations.push({ path: filePath, rule: "require_approval", prefix });
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
