import * as fs from "node:fs";
import * as net from "node:net";
import { spawnSync } from "node:child_process";

export type CyberreadyValidateDeltaResult = {
  ok: boolean;
  reason?: "not_installed" | "unavailable";
  detail?: string;
  response?: unknown;
};

/**
 * Thin optional CyberReady bridge. Fail-open for the vibe path:
 * - missing CYBERREADY_SOCK → `{ ok: false, reason: "not_installed" }`
 * - socket set but connect/IPC fails → `{ ok: false, reason: "unavailable" }`
 * Never throws. Does not embed OPA, SBOM/VEX, FIDO2, or git notes.
 *
 * When CyberReady `sock` is running, sends `{"op":"validate_delta"}` and
 * returns the GateFailure-shaped JSON response.
 */
export function cyberreadyValidateDelta(
  opts: { sockPath?: string; payload?: Record<string, unknown> } = {},
): CyberreadyValidateDeltaResult {
  try {
    const fromOpts =
      typeof opts.sockPath === "string" ? opts.sockPath.trim() : "";
    const fromEnv =
      typeof process.env.CYBERREADY_SOCK === "string"
        ? process.env.CYBERREADY_SOCK.trim()
        : "";
    const sockPath = fromOpts || fromEnv;

    if (!sockPath) {
      return { ok: false, reason: "not_installed" };
    }

    if (!fs.existsSync(sockPath)) {
      return {
        ok: false,
        reason: "unavailable",
        detail: "CYBERREADY_SOCK path does not exist",
      };
    }

    const payload = opts.payload ?? { op: "validate_delta" };
    const body =
      typeof payload.op === "string"
        ? payload
        : { op: "validate_delta", payload };
    return attemptUnixIpc(sockPath, body);
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      detail: error instanceof Error ? error.message : "CyberReady bridge error",
    };
  }
}

/**
 * Sync Unix IPC via a short-lived Node child (spawnSync) so callers stay sync
 * and Coreward's fail-open contract is preserved on timeout/error.
 */
function attemptUnixIpc(
  sockPath: string,
  payload: Record<string, unknown>,
): CyberreadyValidateDeltaResult {
  try {
    const script = `
const net = require("net");
const sock = process.argv[1];
const body = process.argv[2];
const client = net.createConnection({ path: sock });
let buf = "";
const timer = setTimeout(() => { process.exit(2); }, 1500);
client.on("error", () => process.exit(3));
client.on("connect", () => client.write(body + "\\n"));
client.on("data", (c) => {
  buf += c.toString("utf8");
  const nl = buf.indexOf("\\n");
  const slice = nl >= 0 ? buf.slice(0, nl) : buf.trim();
  if (!slice) return;
  try {
    JSON.parse(slice);
    clearTimeout(timer);
    process.stdout.write(slice);
    process.exit(0);
  } catch {
    if (nl >= 0) process.exit(4);
  }
});
`;
    const result = spawnSync(
      process.execPath,
      ["-e", script, sockPath, JSON.stringify(payload)],
      { encoding: "utf8", timeout: 2500 },
    );
    if (result.status !== 0 || !result.stdout?.trim()) {
      return {
        ok: false,
        reason: "unavailable",
        detail:
          result.stderr?.trim() ||
          "CyberReady socket connect/read failed or timed out",
      };
    }
    const response = JSON.parse(result.stdout.trim()) as Record<
      string,
      unknown
    >;
    return {
      ok: response.ok === true,
      detail:
        typeof response.detail === "string" ? response.detail : undefined,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      detail: error instanceof Error ? error.message : "IPC probe failed",
    };
  }
}

/** @deprecated kept for tests that imported probe behavior — prefer cyberreadyValidateDelta */
export function __probeOnly(sockPath: string): boolean {
  try {
    const client = net.createConnection({ path: sockPath });
    client.on("error", () => {
      /* ignore */
    });
    client.destroy();
    return true;
  } catch {
    return false;
  }
}
