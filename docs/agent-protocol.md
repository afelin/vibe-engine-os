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
| `RunManifest` | Promotion record (`vowsHash`, `bondHash`, `capsuleHash`) |
| `TaskBond` | Sealed ingress packet (anti-rot/decay) |
| `TaskBondEval` | Bond + mandate evaluation result |
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
| `seal_bond` | Seal TaskBond from issue body to disk |
| `validate_bond` | Dry-run bond + mandate check (Cursor/agents) |
| `list_gates` | Discover zero-token gates |

## TaskBond (anti-rot / anti-decay)

Before planning at depth ≥ 2, the runtime **seals a TaskBond** from the issue body:

- **Intent** (one sentence, max 500 chars)
- **Outcomes** (acceptance checklist)
- **boundFiles** (exact paths — **required** at depth ≥ 2)
- **bondHash** on manifest and `.runs/bonds/issue-<N>.bond.json`

Bond evaluation uses **agent mandates** (`evaluate_mandates`) plus bond policy in `src/policy/mandates.json`. Scoped context uses **boundFiles only** — no repomix fallback when paths are bound.

```bash
npm run bond:seal -- . 42 "Title" "### Intent...\n### Files...\nsrc/foo.ts"
```

**Lovable / TabDab profile:** set `VIBE_PROJECT_PROFILE=tabdab` to merge paths from `src/policy/profiles/tabdab.json` (synced from [afelin/tabdab-link-proof](https://github.com/afelin/tabdab-link-proof)).

### Gauntlet (TabDab-style eval loop)

Deterministic regression cases in `evals/taskbond-gauntlet.jsonl`:

```bash
npm run eval:bond              # run gauntlet + diff vs baseline
npm run eval:bond -- . --write-baseline   # refresh evals/taskbond-gauntlet-baseline.jsonl
```

### Preflight (before promote)

```bash
npm run bond:preflight -- . <issue_number> [run_id]
```

Checks: gauntlet green, optional sealed bond file, optional capsule validate. Wired in CI before `promote:apply`.

### Structured verdicts

MCP tools return TabDab-style envelopes: `{ ok: true, bondHash?, requiresApproval? }` or `{ ok: false, reason, path?, detail? }` on `evaluate_mandate`, `validate_bond`, and `seal_bond`. Approval-gated paths (e.g. `package.json`) return **`ok: true` with `requiresApproval: true`** — pause for operator `/approve`, not a hard block.

## Vow Attestation

Every manifest includes `vowsHash` (SHA-256 of `src/constitution/vows.json`).

Activation attestation: `.vibe/activated.json`

## Capsule Hash

Canonical SHA-256 over `{ manifest, snapshot, traceTail, vowsHash }`.

Written to `.runs/<runId>/capsule.hash`. Verifiable via MCP or HTTP.

## Gate Resolution

```bash
npm run gate:resolve -- --title "gate:add-unit-test" --body ""
# or positional: npm run gate:resolve -- "title" "body"

npm run pr:create -- --title "feat: ..." --head feat/my-branch
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
