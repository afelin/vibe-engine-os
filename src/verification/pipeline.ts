import { evaluateMandates } from "../policy/evaluate.js";
import type { GeneratedFile } from "../os/events.js";
import {
  createGateFailure,
  type GateFailure,
} from "./feedback.js";
import {
  normalizeEsmImportExtensions,
  validateEsmImportExtensions,
  validateFilePolicy,
  validateNoPathTraversal,
  validateProtectedFiles,
  type ValidatorResult,
} from "./validators.js";

export type ValidatorPipelineResult = {
  passed: boolean;
  results: ValidatorResult[];
  failures: string[];
  gateFailures: GateFailure[];
};

export function prepareGeneratedPatch(
  files: GeneratedFile[],
): GeneratedFile[] {
  return normalizeEsmImportExtensions(files);
}

function validatorToGateFailure(
  result: ValidatorResult,
  files: GeneratedFile[],
): GateFailure {
  const pathHint =
    files.find((file) => result.output.includes(file.path))?.path ?? "patch";
  return createGateFailure(
    result.name,
    pathHint,
    result.output,
    remediationForValidator(result.name),
  );
}

function remediationForValidator(name: string): string {
  switch (name) {
    case "path_traversal":
      return "Use relative paths under src/, tests/, .planning/, or .skills/.";
    case "generated_patch_file_policy":
      return "Restrict generated files to allowed prefixes.";
    case "protected_files":
      return "Remove protected paths or request /approve before changing them.";
    case "esm_import_extensions":
      return "Add .js extensions to local ESM imports in TypeScript files.";
    case "agent_mandate":
      return "Remove forbidden paths or request /approve for protected prefixes.";
    default:
      return "Fix the validator failure and retry.";
  }
}

function validateAgentMandates(files: GeneratedFile[]): ValidatorResult {
  const evaluation = evaluateMandates(files.map((file) => file.path));
  const forbidden = evaluation.violations.filter(
    (item) => item.rule === "forbidden",
  );

  return {
    name: "agent_mandate",
    passed: evaluation.passed,
    output:
      forbidden.length === 0
        ? "All proposed files satisfy agent mandates"
        : `Forbidden paths: ${forbidden.map((item) => item.path).join(", ")}`,
  };
}

export function runGeneratedPatchValidators(
  files: GeneratedFile[],
): ValidatorPipelineResult {
  const results = [
    validateNoPathTraversal(files),
    validateFilePolicy("generated_patch", files),
    validateProtectedFiles(files),
    validateAgentMandates(files),
    validateEsmImportExtensions(files),
  ];
  const failed = results.filter((result) => !result.passed);
  const gateFailures = failed.map((result) =>
    validatorToGateFailure(result, files),
  );
  const failures = failed.map((result) => `${result.name}: ${result.output}`);

  return {
    passed: failures.length === 0,
    results,
    failures,
    gateFailures,
  };
}
