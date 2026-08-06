---
name: vibe-engine
description: Vibe Engine OS agent vows — evaluate_mandate and resolve_gate before edits; cite constitution schemas.
---

# Vibe Engine Agent Skill

Solo operator setup: [docs/solo-vibe-coder-guide.md](../../docs/solo-vibe-coder-guide.md)

Operator entry: comment `/go` on a Vibe Request for the three-action next-step guide. Contract: [docs/agent-contract.md](../../docs/agent-contract.md).

## Instructions

First-run (once per workspace):

1. Call MCP `get_active_stack`. If unset, call `list_stackables` and ask the operator — or default `set_legal_space` to `none`.
2. Keep the active legal space in mind for preflight context (do not rewrite mandate/policy files).

Before proposing any file edits in a vibe-engine-os repository:

1. Call MCP `get_active_stack` (legal space context) then `evaluate_mandate` with all proposed file paths.
2. Call MCP `resolve_gate` with issue title/body to check zero-token gates.
3. Call MCP `constitution_schemas` and shape planner output to `ExecutionDag`.
4. Never bypass vows in `VOWS.md` / `src/constitution/vows.json`.
5. After a run, verify capsule via `validate_capsule` with `run_id`.
6. Before troubleshoot LLM, call `resolve_gate` + `build_scoped_context`; route external agents via orchestrator registry (`npm run orchestrate`).

Operator commands (`/go`, `/approve`, `/retry`, `/rollback`, `/troubleshoot`) override agent proposals.

### CyberReady (optional)

When CyberReady present, call `cyberready_validate_delta` after `evaluate_mandate`. If `CYBERREADY_SOCK` is missing, the tool returns `{ ok: false, reason: "not_installed" }` — fail-open; do not block promote or the vibe path. Still no OPA embed inside vibe-engine-os.

## Examples

- Fresh clone → `get_active_stack` returns unset → `list_stackables` → `set_legal_space` with `none` (or operator-chosen space).
- Issue body mentions `gate:add-unit-test` → call `resolve_gate` first; skip LLM if gate matches.
- Proposing `src/auth/session.ts` → `evaluate_mandate` returns `{ ok: false, reason: "forbidden_prefix" }`; stop and report.
- Proposing `package.json` → `evaluate_mandate` returns `{ ok: true, requiresApproval: true }`; request operator `/approve` before write.
- Planner JSON → validate against `ExecutionDag` schema before codegen.
- Chat or PR comment with 2+ `src/` paths and ship verbs → engine nudges a Vibe Request issue; does not auto-run without `vibe/run`.

## Performance Notes

- Prefer `resolve_gate` over LLM for deterministic chores (10 gates in `gates.json`).
- Use scoped context: planner receives DAG file list, not full repomix.

## Troubleshooting

- `validate_capsule` invalid → check `vowsHash` matches activated vows.
- High-risk paths → request operator `/approve` before disk write.
- Activation: `npm run activate` writes `.vibe/activated.json`.
- Unknown `set_legal_space` id → fail closed; call `list_stackables` for allowed ids.
