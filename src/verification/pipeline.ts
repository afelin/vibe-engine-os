import { evaluateMandates } from "../policy/evaluate.js";
import type { GeneratedFile } from "../os/events.js";
import { validateBondCompliance } from "./bond-compliance.js";
import {
  createGateFailure,
  type GateFailure,
} from "./feedback.js";
import {
  normalizeEsmImportExtensions,
  validateEsmImportExtensions,
  validateFilePolicy,
  validateNoPathTraversal,
  validateNoSecrets,
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

export function remediationForValidator(name: string): string {
  switch (name) {
    case "path_traversal":
      return "Use relative paths under src/, tests/, .planning/, or .skills/.";
    case "generated_patch_file_policy":
      return "Restrict generated files to allowed prefixes.";
    case "protected_files":
      return "Remove protected paths or request /approve before changing them.";
    case "esm_import_extensions":
      return "Add .js extensions to local ESM imports in TypeScript files.";
    case "no_secrets":
      return "Remove secret-like values from generated files before retrying.";
    case "agent_mandate":
      return "Remove forbidden paths or request /approve for protected prefixes.";
    case "bond_compliance":
      return "Use only paths from the execution plan and bound file set.";
    default:
      return "Fix the validator failure and retry.";
  }
}

export type RunGeneratedPatchValidatorsOpts = {
  allowedPaths?: string[];
  rootDir?: string;
};

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
  opts: RunGeneratedPatchValidatorsOpts = {},
): ValidatorPipelineResult {
  const results = [
    validateNoPathTraversal(files),
    validateFilePolicy("generated_patch", files),
    validateProtectedFiles(files),
    validateAgentMandates(files),
    validateNoSecrets(files),
    validateEsmImportExtensions(files),
  ];

  const bondCompliance =
    opts.allowedPaths && opts.allowedPaths.length > 0
      ? validateBondCompliance(files, opts.allowedPaths, opts.rootDir ?? ".")
      : null;

  const failed = results.filter((result) => !result.passed);
  const gateFailures = failed.map((result) =>
    validatorToGateFailure(result, files),
  );

  if (bondCompliance && !bondCompliance.passed) {
    gateFailures.push(...bondCompliance.gateFailures);
  }

  const failures = [
    ...failed.map((result) => `${result.name}: ${result.output}`),
    ...(bondCompliance && !bondCompliance.passed
      ? bondCompliance.gateFailures.map(
          (item) => `bond_compliance: ${item.analysis.detail}`,
        )
      : []),
  ];

  return {
    passed: failures.length === 0,
    results,
    failures,
    gateFailures,
  };
}
