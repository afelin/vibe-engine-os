/**
 * Operator-facing governance strip: Ward · Mode · ticket.
 * Never silent — LEGACY/OFF/expired are explicit.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isCorewardMode } from "../coreward/mode.js";
import {
  readAuthorizeTicket,
  type AuthorizeTicket,
} from "../coreward/authorize-write.js";
import { loadActiveMandate } from "../ward/index.js";

export type WardVisibility = "LEGACY" | "ON";
export type ModeVisibility = "OFF" | "ON";
export type TicketVisibility = "fresh" | "expired" | "none";

export type GovernanceVisibility = {
  ward: WardVisibility;
  mode: ModeVisibility;
  ticket: TicketVisibility;
  mandate_id?: string;
  ticket_id?: string;
};

const TICKETS_REL = path.join(".vibe", "authorize-tickets");

function listTicketFiles(rootDir: string): string[] {
  const dir = path.join(rootDir, TICKETS_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dir, name));
}

/** Newest ticket by issued_at (or expires_at), regardless of freshness. */
export function latestAuthorizeTicket(
  rootDir: string,
): AuthorizeTicket | null {
  let best: AuthorizeTicket | null = null;
  let bestMs = -1;
  for (const file of listTicketFiles(rootDir)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as AuthorizeTicket;
      if (!raw?.ticket_id || !raw.expires_at) continue;
      const issued = Date.parse(raw.issued_at ?? raw.expires_at);
      if (issued >= bestMs) {
        bestMs = issued;
        best = raw;
      }
    } catch {
      /* skip corrupt */
    }
  }
  return best;
}

export function resolveTicketVisibility(
  rootDir: string,
  now = new Date(),
): { status: TicketVisibility; ticket_id?: string } {
  const envId = process.env.COREWARD_AUTHORIZE_TICKET?.trim();
  if (envId) {
    const ticket = readAuthorizeTicket(rootDir, envId);
    if (ticket) {
      if (now.getTime() > Date.parse(ticket.expires_at)) {
        return { status: "expired", ticket_id: envId };
      }
      return { status: "fresh", ticket_id: envId };
    }
    // Env ticket from another workspace — ignore for this root.
  }

  const latest = latestAuthorizeTicket(rootDir);
  if (!latest) return { status: "none" };
  if (now.getTime() > Date.parse(latest.expires_at)) {
    return { status: "expired", ticket_id: latest.ticket_id };
  }
  return { status: "fresh", ticket_id: latest.ticket_id };
}

export function resolveGovernanceVisibility(
  rootDir = ".",
  now = new Date(),
): GovernanceVisibility {
  const mandate = loadActiveMandate(rootDir);
  const ticket = resolveTicketVisibility(rootDir, now);
  return {
    ward: mandate ? "ON" : "LEGACY",
    mode: isCorewardMode(rootDir) ? "ON" : "OFF",
    ticket: ticket.status === "none" ? "none" : ticket.status,
    ...(mandate?.mandate_id ? { mandate_id: mandate.mandate_id } : {}),
    ...(ticket.ticket_id ? { ticket_id: ticket.ticket_id } : {}),
  };
}

/**
 * Print strip: `Ward LEGACY|ON · Mode OFF|ON · ticket fresh|expired|none`
 */
export function renderGovernanceStrip(
  rootDir = ".",
  now = new Date(),
): string {
  const v = resolveGovernanceVisibility(rootDir, now);
  const ticketLabel = v.ticket === "none" ? "none" : v.ticket;
  return `Ward ${v.ward} · Mode ${v.mode} · ticket ${ticketLabel}`;
}
