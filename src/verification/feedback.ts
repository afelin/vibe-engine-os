import { parseGateFailure, parseGateFailures } from "../constitution/parse.js";
import { resolveRemediation } from "../memory/feedback-cache.js";

export type GateFailure = {
  status: "gate_failed";
  gate_id: string;
  analysis: { path: string; detail: string };
  remediation_instruction: string;
};

export function createGateFailure(
  gateId: string,
  path: string,
  detail: string,
  remediationInstruction: string,
): GateFailure {
  return parseGateFailure({
    status: "gate_failed",
    gate_id: gateId,
    analysis: { path, detail },
    remediation_instruction: remediationInstruction,
  });
}

export { parseGateFailures };

export function formatGateFailureMarkdown(
  failure: GateFailure,
  rootDir = ".",
): string {
  const resolved = resolveRemediation(
    rootDir,
    failure.gate_id,
    failure.remediation_instruction,
  );
  const fixLine = resolved.cacheHash
    ? `${resolved.instruction} (cache: ${resolved.cacheHash.slice(0, 12)})`
    : resolved.instruction;

  return [
    `### Gate failed: \`${failure.gate_id}\``,
    "",
    `- **Path:** \`${failure.analysis.path}\``,
    `- **Detail:** ${failure.analysis.detail}`,
    `- **Fix:** ${fixLine}`,
  ].join("\n");
}

export function serializeGateFailures(failures: GateFailure[]): string {
  return JSON.stringify(failures, null, 2);
}

export function formatGateFailuresMarkdown(
  failures: GateFailure[],
  rootDir = ".",
): string {
  if (failures.length === 0) return "";
  return failures.map((failure) => formatGateFailureMarkdown(failure, rootDir)).join("\n\n");
}
