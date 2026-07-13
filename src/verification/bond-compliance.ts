import type { GeneratedFile } from "../os/events.js";
import { evaluateMandates, loadMandates } from "../policy/evaluate.js";
import { createGateFailure, type GateFailure } from "./feedback.js";

export type BondComplianceResult = {
  passed: boolean;
  gateFailures: GateFailure[];
  hallucinationBlocked: boolean;
};

export function validateBondCompliance(
  files: GeneratedFile[],
  allowedPaths: string[],
  rootDir = ".",
): BondComplianceResult {
  const allowed = new Set(allowedPaths);
  const gateFailures: GateFailure[] = [];
  let hallucinationBlocked = false;

  for (const file of files) {
    if (!allowed.has(file.path)) {
      hallucinationBlocked = true;
      gateFailures.push(
        createGateFailure(
          "bond_compliance",
          file.path,
          `Generated path "${file.path}" is not in the planned or bound file set`,
          `Use only these exact paths: ${[...allowed].sort().join(", ")}`,
        ),
      );
    }
  }

  const mandates = loadMandates(rootDir);
  const mandateEval = evaluateMandates(
    files.map((item) => item.path),
    mandates,
  );

  if (!mandateEval.passed) {
    for (const violation of mandateEval.violations.filter(
      (item) => item.rule === "forbidden",
    )) {
      gateFailures.push(
        createGateFailure(
          "bond_compliance",
          violation.path,
          `Mandate violation: ${violation.rule} (${violation.prefix})`,
          "Remove forbidden paths or request /approve before changing protected prefixes.",
        ),
      );
    }
  }

  return {
    passed: gateFailures.length === 0,
    gateFailures,
    hallucinationBlocked,
  };
}
