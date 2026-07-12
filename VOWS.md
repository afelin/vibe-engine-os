# Vibe Engine Vows

**One invariant:** Generative proposes; **Vows + Constitution + Tests** decide; Git makes it real.

These vows codify [agent.md](agent.md) directives and promotion principles into normative law for humans and machines.

## Engine Vows

1. **No promotion without green** — tsc and vitest must pass before any Git promotion.
2. **Forbidden paths** — mandate-blocked prefixes are never written.
3. **Max 3 ratchet attempts** — self-heal loops cap at three; then quarantine.
4. **ESM only** — `"type": "module"` with `.js` extensions in all local imports.
5. **Catalog parse before write** — all structured artifacts validate against the constitution catalog.
6. **DAG planning** — planner output must match the `ExecutionDag` schema.

## Operator Vows

1. **Protected paths require `/approve`** — high-risk and mandate-gated paths pause for operator consent.
2. **Rollback metadata** — every verified run records `.runs/<runId>/ROLLBACK.md`.

## Agent Vows (MCP obligations)

1. **`evaluate_mandate`** — call before proposing any file paths.
2. **`resolve_gate`** — check deterministic gates before invoking LLM codegen.
3. **`constitution_schemas`** — cite catalog JSON Schema for all structured output.

## Attestation

Every run manifest carries `vowsHash` (SHA-256 of canonical `src/constitution/vows.json`). Activation writes `.vibe/activated.json` with the same hash.

Structured vows: `src/constitution/vows.json`
