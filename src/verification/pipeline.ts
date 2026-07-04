import type { GeneratedFile } from "../os/events.js";
import {
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
};

export function runGeneratedPatchValidators(
  files: GeneratedFile[],
): ValidatorPipelineResult {
  const results = [
    validateNoPathTraversal(files),
    validateFilePolicy("generated_patch", files),
    validateProtectedFiles(files),
    validateEsmImportExtensions(files),
  ];
  const failures = results
    .filter((result) => !result.passed)
    .map((result) => `${result.name}: ${result.output}`);

  return {
    passed: failures.length === 0,
    results,
    failures,
  };
}
