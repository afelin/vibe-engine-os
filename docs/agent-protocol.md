# Vibe Engine Agent Protocol

Open specification for agents (any framework) integrating with vibe-engine-os.

## Ingress: PlayEvent

Agents send typed events matching the OS machine (`src/os/machine.ts`):

- `preflight.completed`
- `plan.created` (payload: `ExecutionDag`)
- `risk.reviewed`
- `approval.granted`
- `patch.generated`
- `verification.passed` / `verification.failed`
- `publish.completed`

## Constitution Catalog

All structured artifacts validate against `src/constitution/catalog.ts`:

| Schema | Purpose |
|--------|---------|
| `ExecutionDag` | Planner output |
| `RunManifest` | Promotion record (`vowsHash`, `capsuleHash`) |
| `GateFailure` | Ratchet feedback |
| `VowAttestation` | Vows compliance |
| `MandateEval` | Path policy result |

Export schemas: `npm run constitution:export` → `.vibe/schemas.json`

HTTP: `npm run constitution:serve` → `GET /schemas`, `POST /verify-capsule`

## MCP Tools

| Tool | When |
|------|------|
| `evaluate_mandate` | Before proposing paths |
| `resolve_gate` | Before LLM codegen |
| `constitution_schemas` | Before structured output |
| `validate_capsule` | After run completes |
| `list_gates` | Discover zero-token gates |

## Vow Attestation

Every manifest includes `vowsHash` (SHA-256 of `src/constitution/vows.json`).

Activation attestation: `.vibe/activated.json`

## Capsule Hash

Canonical SHA-256 over `{ manifest, snapshot, traceTail, vowsHash }`.

Written to `.runs/<runId>/capsule.hash`. Verifiable via MCP or HTTP.

## Gate Resolution

```bash
npm run gate:resolve -- --title "gate:add-unit-test" --body ""
```

Ten gates in `src/release-gate/gates.json`; each maps to `.skills/actors/<id>.ts`.

## Depth Labels

| Label | Depth |
|-------|-------|
| `vibe:plan-only` | 1 |
| `vibe:safe` | 2 |
| `vibe:ship` | 4 |

Operator slash commands override labels.

## Reference Runtime

vibe-engine-os is the reference implementation. External repos may use:

- `action.yml` (`vibe-validate` composite action)
- `runs/install-into-repo.sh`
- Required **Vibe Promotion Gate** GitHub Check
