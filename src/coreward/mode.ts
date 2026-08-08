/**
 * Coreward Mode — fail-closed engine path without authorize_write ticket
 * or verified Mandate. Not a kernel sandbox; IDE Edit/Shell remain out of band.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getAuthorizeTicketBinding,
  readAuthorizeTicket,
  validateAuthorizeTicket,
} from "./authorize-write.js";
import { axDenialFromReason, type AxDenial } from "./ax-denial.js";
import { bumpModeAllow, bumpModeDeny } from "./operator-metrics.js";
import type { VerifiedMandate } from "../ward/index.js";

function safeBumpAllow(rootDir: string): void {
  try {
    bumpModeAllow(rootDir);
  } catch {
    /* metrics best-effort */
  }
}

function safeBumpDeny(rootDir: string): void {
  try {
    bumpModeDeny(rootDir);
  } catch {
    /* metrics best-effort */
  }
}

export type CorewardModeConfig = {
  enabled: boolean;
};

export type EnginePathPhase = "codegen" | "patch" | "promote" | "forever";

export type CorewardModeGateResult =
  | { ok: true; via: "mode_off" | "mandate" | "ticket" }
  | ({ ok: false; reason: string } & Pick<AxDenial, "code" | "next" | "paths">);

const MODE_REL = path.join(".vibe", "coreward-mode.json");

export function corewardModePath(rootDir: string): string {
  return path.join(rootDir, MODE_REL);
}

export function readCorewardModeConfig(rootDir = "."): CorewardModeConfig {
  const env = process.env.COREWARD_MODE?.trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") {
    return { enabled: true };
  }
  if (env === "0" || env === "false" || env === "no") {
    return { enabled: false };
  }
  const filePath = corewardModePath(rootDir);
  if (!fs.existsSync(filePath)) return { enabled: false };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      enabled?: unknown;
    };
    return { enabled: raw.enabled === true };
  } catch {
    return { enabled: false };
  }
}

export function isCorewardMode(rootDir = "."): boolean {
  return readCorewardModeConfig(rootDir).enabled;
}

export function writeCorewardModeConfig(
  rootDir: string,
  config: CorewardModeConfig,
): void {
  const filePath = corewardModePath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Fail closed on forever codegen / patch / promote when Coreward Mode is on
 * unless a verified Mandate is present or a valid authorize_write ticket covers paths.
 */
export function assertCorewardMode(
  rootDir: string,
  phase: EnginePathPhase,
  opts: {
    paths?: string[];
    ticket_id?: string;
    /** When ticket was minted with actor, must match (AgentId / Mandate actor). */
    actor?: string;
    verifiedMandate?: VerifiedMandate | null;
    now?: Date;
  } = {},
): CorewardModeGateResult {
  if (!isCorewardMode(rootDir)) {
    return { ok: true, via: "mode_off" };
  }

  if (opts.verifiedMandate) {
    safeBumpAllow(rootDir);
    return { ok: true, via: "mandate" };
  }

  const paths = opts.paths ?? [];
  const ticketId =
    opts.ticket_id?.trim() ||
    getAuthorizeTicketBinding(rootDir) ||
    process.env.COREWARD_AUTHORIZE_TICKET?.trim() ||
    "";

  if (!ticketId) {
    const reason = `coreward_mode:${phase}:missing_ticket_or_mandate`;
    const denial = axDenialFromReason("missing_ticket_or_mandate", paths);
    safeBumpDeny(rootDir);
    return {
      ok: false,
      reason,
      code: denial.code,
      next: denial.next,
      paths,
    };
  }

  const ticketPaths =
    paths.length > 0
      ? paths
      : (readAuthorizeTicket(rootDir, ticketId)?.paths ?? []);
  const actor = opts.actor?.trim() || undefined;
  const validated = validateAuthorizeTicket(
    rootDir,
    ticketId,
    ticketPaths,
    opts.now,
    actor ? { actor } : undefined,
  );
  if (!validated.ok) {
    const reason = `coreward_mode:${phase}:${validated.reason}`;
    const denial = axDenialFromReason(validated.reason, ticketPaths);
    safeBumpDeny(rootDir);
    return {
      ok: false,
      reason,
      code: denial.code,
      next: denial.next,
      paths: ticketPaths,
    };
  }
  safeBumpAllow(rootDir);
  return { ok: true, via: "ticket" };
}
