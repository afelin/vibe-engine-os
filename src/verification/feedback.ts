import { parseGateFailure, parseGateFailures } from "../constitution/parse.js";

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

export function formatGateFailureMarkdown(failure: GateFailure): string {
  return [
    `### Gate failed: \`${failure.gate_id}\``,
    "",
    `- **Path:** \`${failure.analysis.path}\``,
    `- **Detail:** ${failure.analysis.detail}`,
    `- **Fix:** ${failure.remediation_instruction}`,
  ].join("\n");
}

export function serializeGateFailures(failures: GateFailure[]): string {
  return JSON.stringify(failures, null, 2);
}

export function formatGateFailuresMarkdown(failures: GateFailure[]): string {
  if (failures.length === 0) return "";
  return failures.map(formatGateFailureMarkdown).join("\n\n");
}
