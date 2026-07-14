import { execSync } from "node:child_process";
import {
  classifyPreflightOutput,
  classifyReadinessOutput,
  classifyReplayOutput,
  type DiagnosticClassification,
} from "./diagnose.js";

export type NpmDiagnosticResult = {
  script: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  classification?: DiagnosticClassification;
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

export function runBondPreflight(
  rootDir: string,
  issueNumber = "",
  runId = "",
): NpmDiagnosticResult {
  const args = [rootDir];
  if (issueNumber) args.push(issueNumber);
  if (runId) args.push(runId);
  const result = runNpmScript(rootDir, "bond:preflight", args);
  return {
    script: "bond:preflight",
    ...result,
    classification: classifyPreflightOutput(`${result.stdout}\n${result.stderr}`),
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
  return {
    script: "launch:readiness",
    ...result,
    classification: classifyReadinessOutput(`${result.stdout}\n${result.stderr}`),
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
