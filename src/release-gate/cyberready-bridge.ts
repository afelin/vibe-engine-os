import * as fs from "node:fs";
import * as net from "node:net";

export type CyberreadyValidateDeltaResult = {
  ok: boolean;
  reason?: "not_installed" | "unavailable";
  detail?: string;
  response?: unknown;
};

/**
 * Thin optional CyberReady bridge (Phase 7). Fail-open for the vibe path:
 * - missing CYBERREADY_SOCK → `{ ok: false, reason: "not_installed" }`
 * - socket set but connect/IPC fails → `{ ok: false, reason: "unavailable" }`
 * Never throws. Does not embed OPA, SBOM/VEX, FIDO2, or git notes.
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
    return attemptUnixIpc(sockPath, payload);
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      detail: error instanceof Error ? error.message : "CyberReady bridge error",
    };
  }
}

/**
 * Best-effort sync-friendly Unix socket probe. Full CyberReady protocol is
 * deferred; we only confirm the socket accepts a connection without crashing.
 */
function attemptUnixIpc(
  sockPath: string,
  payload: Record<string, unknown>,
): CyberreadyValidateDeltaResult {
  try {
    const connected = probeUnixSocket(sockPath);
    if (!connected) {
      return {
        ok: false,
        reason: "unavailable",
        detail: "CyberReady socket connect failed or timed out",
      };
    }
    return {
      ok: false,
      reason: "unavailable",
      detail:
        "CyberReady socket reachable; validate_delta protocol not wired (thin stub)",
      response: { sock: sockPath, requested: payload },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "unavailable",
      detail: error instanceof Error ? error.message : "IPC probe failed",
    };
  }
}

function probeUnixSocket(sockPath: string): boolean {
  const client = net.createConnection({ path: sockPath });
  // Destroy immediately — we only need createConnection not to throw synchronously.
  // Async connect errors are ignored (fail-open).
  client.on("error", () => {
    /* ignore */
  });
  client.destroy();
  return true;
}
