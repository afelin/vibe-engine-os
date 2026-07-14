---
name: vibe-engine
description: Vibe Engine OS agent vows — evaluate_mandate and resolve_gate before edits; cite constitution schemas.
---

# Vibe Engine Agent Skill

Solo operator setup: [docs/solo-vibe-coder-guide.md](../../docs/solo-vibe-coder-guide.md)

## Instructions

Before proposing any file edits in a vibe-engine-os repository:

1. Call MCP `evaluate_mandate` with all proposed file paths.
2. Call MCP `resolve_gate` with issue title/body to check zero-token gates.
3. Call MCP `constitution_schemas` and shape planner output to `ExecutionDag`.
4. Never bypass vows in `VOWS.md` / `src/constitution/vows.json`.
5. After a run, verify capsule via `validate_capsule` with `run_id`.
6. Before troubleshoot LLM, call `resolve_gate` + `build_scoped_context`; route external agents via orchestrator registry (`npm run orchestrate`).

Operator commands (`/approve`, `/retry`, `/rollback`, `/troubleshoot`) override agent proposals.

## Examples

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
