/**
 * Compact Ax denial for authorize_write / Coreward Mode failures.
 * Order of operations: authorize → prefer_gate → ContextPack → LLM.
 */
export type AxDenial = {
  ok: false;
  code: string;
  paths?: string[];
  /** Operator / agent next step (never "just retry LLM"). */
  next: string;
  prefer_gate?: string | null;
};

export type AxDenialInput = {
  code: string;
  paths?: string[];
  prefer_gate?: string | null;
  /** Override default next-step copy. */
  next?: string;
};

const NEXT_BY_CODE: Record<string, string> = {
  proposed_files_required: "Pass proposed_files to preflight / authorize_write.",
  house_forbidden:
    "Remove forbidden paths or widen house mandates — do not ask the LLM to bypass.",
  needs_approval: "Wait for human /approve (or Option B CI override when Mandate path is on).",
  missing_ticket_or_mandate:
    "Call preflight / authorize_write (or load a verified Mandate) before engine edits.",
  ticket_expired: "Re-run preflight to mint a fresh ticket.",
  ticket_not_found: "Re-run preflight — ticket file missing.",
  ticket_requires_approval: "Ticket is approval-only; do not treat as engine authorization.",
  ticket_actor_required: "Pass the ticket actor to Coreward Mode / authorize checks.",
  ticket_actor_mismatch: "Use the same actor that minted the ticket.",
  ticket_paths_mismatch: "Re-preflight with the paths you intend to edit (or a covering ticket).",
  prefer_gate:
    "Apply prefer_gate via resolve_gate / preview_gate — skip ContextPack and LLM.",
};

function stripCodePrefix(reason: string): string {
  const head = reason.split(";")[0] ?? reason;
  const colon = head.indexOf(":");
  if (colon <= 0) return head;
  return head.slice(0, colon);
}

export function nextStepForCode(
  code: string,
  preferGate?: string | null,
): string {
  if (preferGate) {
    return `Apply gate \`${preferGate}\` via resolve_gate / preview_gate — skip ContextPack and LLM.`;
  }
  const base = stripCodePrefix(code);
  return (
    NEXT_BY_CODE[base] ??
    NEXT_BY_CODE[code] ??
    "Call preflight / authorize_write; prefer_gate before ContextPack before LLM."
  );
}

export function axDenial(input: AxDenialInput): AxDenial {
  const prefer_gate = input.prefer_gate ?? null;
  return {
    ok: false,
    code: input.code,
    ...(input.paths ? { paths: input.paths } : {}),
    next: input.next ?? nextStepForCode(input.code, prefer_gate),
    ...(prefer_gate ? { prefer_gate } : {}),
  };
}

/**
 * Map authorize_write / mode failure reason → compact Ax denial.
 * Preserves prefer_gate when encoded in reason (`…;prefer_gate:id`).
 */
export function axDenialFromReason(
  reason: string,
  paths?: string[],
  preferGate?: string | null,
): AxDenial {
  let prefer_gate = preferGate ?? null;
  const preferMatch = /prefer_gate:([^\s;]+)/.exec(reason);
  if (!prefer_gate && preferMatch) {
    prefer_gate = preferMatch[1];
  }
  const code = stripCodePrefix(reason) || reason || "denied";
  return axDenial({ code, paths, prefer_gate });
}
