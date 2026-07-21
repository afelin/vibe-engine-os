import { execSync } from "node:child_process";
import {
  classifyPreflightOutput,
  classifyReadinessOutput,
  classifyReplayOutput,
  extractGauntletCaseId,
  type DiagnosticClassification,
} from "./diagnose.js";

export type NpmDiagnosticResult = {
  script: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  classification?: DiagnosticClassification;
  /** Operator-facing remediation when a gauntlet case is cited. */
  remediation?: string;
};

function runNpmScript(
  rootDir: string,
  script: string,
  args: string[] = [],
): { ok: boolean; stdout: string; stderr: string } {
  const cmd = `npm run ${script} -- ${args.join(" ")}`.trim();
  try {
    const stdout = execSync(cmd, {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf8",
    });
    return { ok: true, stdout, stderr: "" };
  } catch (error: unknown) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: string }).stdout ?? "")
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "")
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, stdout, stderr };
  }
}

function withGauntletCite(
  classification: DiagnosticClassification,
  output: string,
): { classification: DiagnosticClassification; remediation?: string } {
  const caseId =
    classification.gauntletCaseId ?? extractGauntletCaseId(output);
  if (!caseId) return { classification };

  const cited: DiagnosticClassification = {
    ...classification,
    gauntletCaseId: caseId,
    summary: classification.gauntletCaseId
      ? classification.summary
      : `${classification.summary} (gauntlet case: ${caseId})`,
  };
  return {
    classification: cited,
    remediation: `Gauntlet case \`${caseId}\` matched preflight output — fix that case in evals/taskbond-gauntlet.jsonl or the bond under test, then re-run \`npm run eval:bond\`.`,
  };
}

export function runBondPreflight(
  rootDir: string,
  issueNumber = "",
  runId = "",
): NpmDiagnosticResult {
  const args = [rootDir];
  if (issueNumber) args.push(issueNumber);
  if (runId) args.push(runId);
  const result = runNpmScript(rootDir, "bond:preflight", args);
  const output = `${result.stdout}\n${result.stderr}`;
  const base = classifyPreflightOutput(output);
  const { classification, remediation } = withGauntletCite(base, output);
  return {
    script: "bond:preflight",
    ...result,
    classification,
    remediation,
  };
}

export function runReplayCheck(rootDir: string, runId: string): NpmDiagnosticResult {
  const result = runNpmScript(rootDir, "replay", [rootDir, runId]);
  const output = result.stdout || result.stderr;
  return {
    script: "replay",
    ...result,
    classification: classifyReplayOutput(output, result.ok),
  };
}

export function runLaunchReadiness(rootDir: string): NpmDiagnosticResult {
  const result = runNpmScript(rootDir, "launch:readiness", [rootDir]);
  const output = `${result.stdout}\n${result.stderr}`;
  const base = classifyReadinessOutput(output);
  const { classification, remediation } = withGauntletCite(base, output);
  return {
    script: "launch:readiness",
    ...result,
    classification,
    remediation,
  };
}

export function runTroubleshootDiagnostics(
  rootDir: string,
  options: { runId?: string; issueNumber?: string; symptom?: string } = {},
): NpmDiagnosticResult[] {
  const results: NpmDiagnosticResult[] = [];
  const symptom = options.symptom ?? "";

  if (/replay/i.test(symptom) && options.runId) {
    results.push(runReplayCheck(rootDir, options.runId));
  } else if (/readiness|launch/i.test(symptom)) {
    results.push(runLaunchReadiness(rootDir));
  } else {
    results.push(
      runBondPreflight(rootDir, options.issueNumber ?? "", options.runId ?? ""),
    );
  }

  return results;
}
