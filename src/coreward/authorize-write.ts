/**
 * authorize_write — single preflight for any coding agent.
 * House evaluate_mandate AND Signed Mandate pathFilter (when present)
 * AND AgentId effective budget. Prefer resolve_gate when paths ⊆ a gate.
 * Same-path refresh reuses/extends a fresh ticket without a new human prompt.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  evaluateMandates,
  normalizeProposedPath,
  type Mandates,
} from "../policy/evaluate.js";
import { loadEffectiveMandates } from "../policy/stackables.js";
import {
  getDefaultProfile,
  resolveProfile,
  type AgentProfile,
} from "../agent-id/index.js";
import {
  loadActiveMandate,
  pathFilter,
  resolveEffectiveBudgetStrict,
  type SignedMandate,
} from "../ward/index.js";
import { loadReleaseGates, resolveGateFromRegistry } from "../release-gate/registry.js";
import { axDenialFromReason, type AxDenial } from "./ax-denial.js";
import { bumpPreflightOk } from "./operator-metrics.js";
import { writeCorewardPresence } from "./presence.js";

export type AuthorizeWriteInput = {
  proposed_files: string[];
  root_dir?: string;
  title?: string;
  body?: string;
  actor?: string;
  /** Ticket time-to-live; default 1 hour. */
  ttl_ms?: number;
};

export type AuthorizeWriteResult = {
  ok: boolean;
  ticket_id?: string;
  paths: string[];
  reason: string;
  prefer_gate?: string | null;
  requiresApproval?: boolean;
  /** True when an existing same-path ticket was refreshed. */
  refreshed?: boolean;
  /** Compact Ax denial fields when ok=false (Agentic Cost Plane). */
  code?: string;
  next?: string;
};

export type AuthorizeTicket = {
  ticket_id: string;
  paths: string[];
  issued_at: string;
  expires_at: string;
  prefer_gate?: string | null;
  actor?: string;
  /** When true, Coreward Mode must not treat this ticket as engine authorization. */
  requires_approval?: boolean;
};

const TICKETS_REL = path.join(".vibe", "authorize-tickets");
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Per-rootDir ticket binding — preferred over process-global env (H4). */
const authorizeTicketByRoot = new Map<string, string>();

function rootKey(rootDir: string): string {
  return path.resolve(rootDir);
}

export function setAuthorizeTicketBinding(
  rootDir: string,
  ticketId: string,
): void {
  authorizeTicketByRoot.set(rootKey(rootDir), ticketId);
}

export function getAuthorizeTicketBinding(rootDir: string): string | undefined {
  return authorizeTicketByRoot.get(rootKey(rootDir));
}

/** Test helper — clear in-memory bindings. */
export function clearAuthorizeTicketBindings(): void {
  authorizeTicketByRoot.clear();
}

function ticketsDir(rootDir: string): string {
  return path.join(rootDir, TICKETS_REL);
}

function ticketPath(rootDir: string, ticketId: string): string {
  const safe = ticketId.replace(/[^a-zA-Z0-9._-]/g, "");
  return path.join(ticketsDir(rootDir), `${safe}.json`);
}

function normalizePaths(files: string[]): string[] {
  return [
    ...new Set(
      files
        .map((f) => normalizeProposedPath(f.trim()))
        .filter((f) => f.length > 0),
    ),
  ].sort();
}

function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when every proposed path is among the gate's compiled file paths. */
export function pathsCoveredByGate(
  proposed: string[],
  gatePaths: string[],
): boolean {
  if (proposed.length === 0) return false;
  const set = new Set(gatePaths.map(normalizeProposedPath));
  return proposed.every((p) => set.has(normalizeProposedPath(p)));
}

/**
 * Prefer a zero-token gate when title/body resolve one covering paths,
 * or when any registry gate's files cover the proposed set.
 */
export function preferGateForPaths(
  proposed: string[],
  title = "",
  body = "",
): string | null {
  const resolved = resolveGateFromRegistry(title, body);
  if (resolved && pathsCoveredByGate(proposed, resolved.files.map((f) => f.path))) {
    return resolved.id;
  }
  for (const gate of loadReleaseGates()) {
    if (pathsCoveredByGate(proposed, gate.files.map((f) => f.path))) {
      return gate.id;
    }
  }
  return null;
}

function agentBudgetPaths(
  rootDir: string,
  actor: string | undefined,
  mandate: SignedMandate | null,
): { ok: true; paths: string[] | null; maxBound?: number } | { ok: false; reason: string } {
  const profile: AgentProfile | null = actor
    ? resolveProfile(rootDir, actor)
    : getDefaultProfile(rootDir);

  if (mandate) {
    const budget = resolveEffectiveBudgetStrict(mandate, profile);
    if (!budget.ok) return { ok: false, reason: budget.reason };
    return {
      ok: true,
      paths: budget.budget.path_constraints,
      maxBound: budget.budget.max_bound_files,
    };
  }

  if (profile?.default_path_constraints?.length) {
    return {
      ok: true,
      paths: profile.default_path_constraints,
      maxBound: profile.max_bound_files,
    };
  }

  return { ok: true, paths: null, maxBound: profile?.max_bound_files };
}

export function mintAuthorizeTicket(
  rootDir: string,
  paths: string[],
  opts?: {
    prefer_gate?: string | null;
    actor?: string;
    ttl_ms?: number;
    ticket_id?: string;
    requires_approval?: boolean;
  },
): AuthorizeTicket {
  const now = Date.now();
  const ttl = opts?.ttl_ms ?? DEFAULT_TTL_MS;
  const ticket: AuthorizeTicket = {
    ticket_id: opts?.ticket_id ?? `aw_${crypto.randomBytes(8).toString("hex")}`,
    paths: normalizePaths(paths),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
    prefer_gate: opts?.prefer_gate ?? null,
    ...(opts?.actor ? { actor: opts.actor } : {}),
    ...(opts?.requires_approval ? { requires_approval: true } : {}),
  };
  const dir = ticketsDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    ticketPath(rootDir, ticket.ticket_id),
    `${JSON.stringify(ticket, null, 2)}\n`,
    "utf8",
  );
  return ticket;
}

export function readAuthorizeTicket(
  rootDir: string,
  ticketId: string,
): AuthorizeTicket | null {
  const filePath = ticketPath(rootDir, ticketId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as AuthorizeTicket;
    if (!raw?.ticket_id || !Array.isArray(raw.paths)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Find a non-expired ticket whose path set exactly matches (same-path refresh). */
export function findFreshTicketForPaths(
  rootDir: string,
  paths: string[],
  now = new Date(),
): AuthorizeTicket | null {
  const wanted = normalizePaths(paths);
  const dir = ticketsDir(rootDir);
  if (!fs.existsSync(dir)) return null;
  let best: AuthorizeTicket | null = null;
  let bestExp = -1;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as AuthorizeTicket;
      if (!raw?.ticket_id || !Array.isArray(raw.paths)) continue;
      if (now.getTime() > Date.parse(raw.expires_at)) continue;
      if (raw.requires_approval) continue;
      if (!pathsEqual(normalizePaths(raw.paths), wanted)) continue;
      const exp = Date.parse(raw.expires_at);
      if (exp >= bestExp) {
        bestExp = exp;
        best = raw;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

/** Find a non-expired ticket that covers all requested paths (superset OK). */
export function findCoveringTicket(
  rootDir: string,
  paths: string[],
  now = new Date(),
): AuthorizeTicket | null {
  const wanted = normalizePaths(paths);
  if (wanted.length === 0) return null;
  const dir = ticketsDir(rootDir);
  if (!fs.existsSync(dir)) return null;
  let best: AuthorizeTicket | null = null;
  let bestExp = -1;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as AuthorizeTicket;
      if (!raw?.ticket_id || !Array.isArray(raw.paths)) continue;
      if (now.getTime() > Date.parse(raw.expires_at)) continue;
      if (raw.requires_approval) continue;
      const allowed = new Set(normalizePaths(raw.paths));
      if (!wanted.every((p) => allowed.has(p))) continue;
      const exp = Date.parse(raw.expires_at);
      if (exp >= bestExp) {
        bestExp = exp;
        best = raw;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

/**
 * Bind a covering ticket into per-root binding + COREWARD_AUTHORIZE_TICKET.
 * Prefer getAuthorizeTicketBinding(root) over ambient env for engine asserts.
 */
export function bindAuthorizeTicketEnv(
  rootDir: string,
  paths: string[],
  now = new Date(),
): string | undefined {
  const ticket =
    findCoveringTicket(rootDir, paths, now) ??
    findFreshTicketForPaths(rootDir, paths, now);
  if (!ticket) {
    return (
      getAuthorizeTicketBinding(rootDir) ||
      process.env.COREWARD_AUTHORIZE_TICKET?.trim() ||
      undefined
    );
  }
  setAuthorizeTicketBinding(rootDir, ticket.ticket_id);
  process.env.COREWARD_AUTHORIZE_TICKET = ticket.ticket_id;
  return ticket.ticket_id;
}

/**
 * Validate a ticket covers the requested paths and has not expired.
 * When the ticket was minted with an actor, opts.actor must match (H3).
 */
export function validateAuthorizeTicket(
  rootDir: string,
  ticketId: string,
  paths: string[],
  now = new Date(),
  opts?: { actor?: string },
): { ok: true; ticket: AuthorizeTicket } | { ok: false; reason: string } {
  const ticket = readAuthorizeTicket(rootDir, ticketId);
  if (!ticket) return { ok: false, reason: "ticket_not_found" };
  if (now.getTime() > Date.parse(ticket.expires_at)) {
    return { ok: false, reason: "ticket_expired" };
  }
  if (ticket.requires_approval) {
    return { ok: false, reason: "ticket_requires_approval" };
  }
  if (ticket.actor) {
    const actor = opts?.actor?.trim() ?? "";
    if (!actor) {
      return { ok: false, reason: "ticket_actor_required" };
    }
    if (actor !== ticket.actor) {
      return { ok: false, reason: `ticket_actor_mismatch:${ticket.actor}` };
    }
  }
  const allowed = new Set(ticket.paths.map(normalizeProposedPath));
  const normalized = normalizePaths(paths);
  const denied = normalized.filter((p) => !allowed.has(p));
  if (denied.length > 0) {
    return {
      ok: false,
      reason: `ticket_paths_mismatch:${denied.join(",")}`,
    };
  }
  return { ok: true, ticket };
}

/**
 * One-call authorize: house AND Mandate pathFilter AND AgentId budget.
 * On success mints (or same-path refreshes) a ticket for Coreward Mode engine-path checks.
 * Auto-exports ticket id into COREWARD_AUTHORIZE_TICKET.
 *
 * Cost-plane order: authorize → prefer_gate → ContextPack → LLM.
 */
function withAxDenial(
  result: AuthorizeWriteResult & { ok: false },
): AuthorizeWriteResult {
  const denial: AxDenial = axDenialFromReason(
    result.reason,
    result.paths,
    result.prefer_gate,
  );
  return {
    ...result,
    code: denial.code,
    next: denial.next,
    ...(denial.prefer_gate != null
      ? { prefer_gate: denial.prefer_gate }
      : {}),
  };
}

export function authorizeWrite(input: AuthorizeWriteInput): AuthorizeWriteResult {
  const rootDir = input.root_dir ?? ".";
  const paths = normalizePaths(input.proposed_files);
  if (paths.length === 0) {
    return withAxDenial({
      ok: false,
      paths: [],
      reason: "proposed_files_required",
    });
  }

  const mandates: Mandates = loadEffectiveMandates(rootDir);
  const house = evaluateMandates(paths, mandates);
  if (!house.passed) {
    const forbidden = house.violations
      .filter((v) => v.rule === "forbidden")
      .map((v) => `${v.path}:${v.prefix}`)
      .join(",");
    return withAxDenial({
      ok: false,
      paths,
      reason: `house_forbidden:${forbidden}`,
      requiresApproval: house.requiresApproval,
    });
  }

  const mandate = loadActiveMandate(rootDir);
  const budget = agentBudgetPaths(rootDir, input.actor, mandate);
  if (!budget.ok) {
    return withAxDenial({ ok: false, paths, reason: budget.reason });
  }

  if (budget.maxBound !== undefined && paths.length > budget.maxBound) {
    return withAxDenial({
      ok: false,
      paths,
      reason: `agent_max_bound_files:${paths.length}>${budget.maxBound}`,
    });
  }

  if (budget.paths !== null) {
    const allowed = pathFilter(paths, budget.paths);
    if (allowed.length !== paths.length) {
      const denied = paths.filter((p) => !allowed.includes(p));
      return withAxDenial({
        ok: false,
        paths,
        reason: mandate
          ? `mandate_pathFilter:${denied.join(",")}`
          : `agent_path_constraints:${denied.join(",")}`,
      });
    }
  }

  const prefer_gate = preferGateForPaths(
    paths,
    input.title ?? "",
    input.body ?? "",
  );

  // Approval-prefix paths: surface requiresApproval but do NOT mint an
  // engine-usable ticket (Coreward Mode must not bypass human /approve).
  if (house.requiresApproval) {
    return withAxDenial({
      ok: false,
      paths,
      reason: prefer_gate
        ? `needs_approval;prefer_gate:${prefer_gate}`
        : "needs_approval",
      prefer_gate,
      requiresApproval: true,
    });
  }

  const existing = findFreshTicketForPaths(rootDir, paths);
  const ticket = mintAuthorizeTicket(rootDir, paths, {
    prefer_gate,
    actor: input.actor,
    ttl_ms: input.ttl_ms,
    ...(existing ? { ticket_id: existing.ticket_id } : {}),
  });

  process.env.COREWARD_AUTHORIZE_TICKET = ticket.ticket_id;
  setAuthorizeTicketBinding(rootDir, ticket.ticket_id);

  try {
    bumpPreflightOk(rootDir);
  } catch {
    // Metrics are best-effort — never fail authorize.
  }

  try {
    writeCorewardPresence(rootDir, { ticket_id: ticket.ticket_id });
  } catch {
    // Presence is best-effort for hooks/status — never fail authorize.
  }

  const refreshed = Boolean(existing);
  return {
    ok: true,
    ticket_id: ticket.ticket_id,
    paths,
    reason: refreshed
      ? prefer_gate
        ? `authorized;refreshed;prefer_gate:${prefer_gate}`
        : "authorized;refreshed"
      : prefer_gate
        ? `authorized;prefer_gate:${prefer_gate}`
        : "authorized",
    prefer_gate,
    requiresApproval: false,
    ...(refreshed ? { refreshed: true } : {}),
  };
}
