---
name: coreward
description: Coreward agent vows — authorize_write before edits; evaluate_mandate and resolve_gate; cite constitution schemas.
---

# Coreward Agent Skill

Solo operator setup: [docs/solo-vibe-coder-guide.md](../../docs/solo-vibe-coder-guide.md)

Operator entry: comment `/go` on a Vibe Request for the three-action next-step guide. Contract: [docs/agent-contract.md](../../docs/agent-contract.md).

Host packs: [docs/host-packs.md](../../docs/host-packs.md). Local-first savings: [docs/local-first-savings.md](../../docs/local-first-savings.md). License FAQ: [LICENSE.md](../../LICENSE.md). OpenClaw stub: [.cursor/skills/openclaw-coreward/SKILL.md](../openclaw-coreward/SKILL.md).

## Instructions

First-run (once per workspace):

1. Call MCP `get_active_stack`. If unset, call `list_stackables` and ask the operator — or default `set_legal_space` to `none`.
2. Keep the active legal space in mind for preflight context (do not rewrite mandate/policy files).

Before proposing any file edits in a Coreward repository:

1. Call MCP `authorize_write` with all proposed file paths (and issue title/body when available). Never propose paths without a successful `authorize_write` ticket when Coreward Mode is on.
2. Call MCP `get_active_stack` (legal space context) then `evaluate_mandate` with all proposed file paths.
3. Call MCP `resolve_gate` with issue title/body to check zero-token gates — prefer `prefer_gate` from `authorize_write` when present.
4. Call MCP `constitution_schemas` and shape planner output to `ExecutionDag`.
5. Never bypass vows in `VOWS.md` / `src/constitution/vows.json`.
6. After a run, verify capsule via `validate_capsule` with `run_id`.
7. Before troubleshoot LLM, call `resolve_gate` + `build_scoped_context`; route external agents via orchestrator registry (`npm run orchestrate`).

Operator commands (`/go`, `/approve`, `/retry`, `/rollback`, `/troubleshoot`) override agent proposals.

**Honesty:** Coreward Mode is not a kernel IDE sandbox. Promotion still requires Ward when a Mandate is on. Labels `vibe/*` remain dual-read technical aliases.

### CyberReady (optional)

When CyberReady present, call `cyberready_validate_delta` after `evaluate_mandate`. If `CYBERREADY_SOCK` is missing, the tool returns `{ ok: false, reason: "not_installed" }` — fail-open; do not block promote. Still no OPA embed inside Coreward.

## Examples

- Fresh clone → `get_active_stack` returns unset → `list_stackables` → `set_legal_space` with `none` (or operator-chosen space).
- Issue body mentions `gate:add-unit-test` → `authorize_write` returns `prefer_gate`; skip LLM if gate matches.
- Proposing `src/auth/session.ts` → `authorize_write` / `evaluate_mandate` returns forbidden; stop and report.
- Proposing `package.json` → `ok: true` with `requiresApproval: true`; request operator `/approve` before write.

## Performance Notes

- Prefer `resolve_gate` / `authorize_write.prefer_gate` over LLM for deterministic chores (≥12 gates in `gates.json`).
- Use scoped context: planner receives DAG file list, not full repomix.
- Read cockpit **Savings** lines (`gate_hit`, `contextChars`, `tokensEstimate`) after a governed run.
