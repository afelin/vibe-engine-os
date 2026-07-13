# Vibe Engine Agent Protocol

Open specification for agents (any framework) integrating with vibe-engine-os.

**Solo operators:** start with the [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md). **Stakeholders:** see [Plain-Language Briefing](./plain-language-briefing.md).

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
| `ScopedContextBundle` | Capped promotion context |
| `EvoLesson` | Evidence-linked recall lesson |
| `RecallResult` | Deterministic lesson recall output |
| `GateFeedbackEntry` | Cached gate remediation |
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
| `build_scoped_context` | Build ScopedContextBundle for codegen/planner context |
| `recall_lessons` | Deterministic lesson recall by path prefix |
| `list_gates` | Discover zero-token gates |

## TaskBond (anti-rot / anti-decay)

Before planning at depth ≥ 2, the runtime **seals a TaskBond** from the issue body:

- **Intent** (one sentence, max 500 chars)
- **Outcomes** (acceptance checklist)
- **boundFiles** (exact paths — **required** at depth ≥ 2)
- **bondHash** on manifest and `.runs/bonds/issue-<N>.bond.json`

Bond evaluation uses **agent mandates** (`evaluate_mandates`) plus bond policy in `src/policy/mandates.json`. Proposed paths are normalized before prefix checks (blocks obfuscated paths like `src/./auth/…`). Scoped context uses **boundFiles + DAG planned files** via `ScopedContextBundle` — no repomix fallback when paths are bound at depth ≥ 3.

## Anti-rot primitives

Promotion context and hallucination guards stay in vibe-engine (CyberReady OPA handles compliance separately).

| Primitive | Module | Purpose |
|-----------|--------|---------|
| `ScopedContextBundle` | `src/context/bundle.ts` | Capped, hashable file snippets for planner + codegen |
| `BondComplianceValidator` | `src/verification/bond-compliance.ts` | Block generated paths outside planned ∪ bound |
| `EvoLesson` | `src/memory/lesson.ts` | Evidence-linked lessons in `.evomem/lessons.ndjson` |
| `recallLessons` | `src/memory/recall.ts` | Deterministic prefix recall (no embeddings) |
| `GateFeedbackCache` | `src/memory/feedback-cache.ts` | Static remediation in `.vibe/cache/gates/` |
| `InterventionLedger` | `src/research/interventions.ts` | Log policy file changes in `.runs/interventions.ndjson` |

Codegen prompts include `## Existing source (read-only)` from the bundle. Scoreboard tracks `contextChars`, `truncated`, and `hallucinationBlocked`.

MCP export for external agents (e.g. CyberReady adapter):

```bash
# build_scoped_context — bond_files + optional dag → bundle JSON
# recall_lessons — path_prefixes → RecallResult
```

`EVOMEM.md` is an optional human-readable export generated from structured lessons (not the source of truth).

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

## Replay Determinism Gate

Every run appends its OS events to `.runs/<runId>/events.ndjson` (first line records the initial context). Replay rebuilds a fresh player from that ledger and compares the SHA-256 of the replayed snapshot against the stored `actor.snapshot.json`:

```bash
npm run replay -- . <runId>   # prints { ok, replayedHash, storedHash }, exits 1 on mismatch
```

Enforced twice before promotion:

- `bond:preflight` check `replay.deterministic` — **skip-ok** for legacy runs without `events.ndjson`
- CI `Replay determinism gate` step in `forever.yml`, before `promote:apply`

## Attribution

PRs to `main` must carry an `Assisted-by:` trailer on any commit whose message mentions AI tooling (cursor, claude, gpt, copilot, gemini, groq). Enforced by `.github/workflows/tdd-attribution.yml` running `scripts/audit-attribution.mjs` (fail-open on git errors). The engine holds itself to the rule: promotion commits from `forever.yml` append `Assisted-by: vibe-engine-os`.

## Auto-merge (optional)

Opt-in autonomous squash merge when CI is green:

- **Label:** `vibe/auto-merge` on the PR (default — per-PR opt-in)
- **Repo variable:** `VIBE_AUTO_MERGE=1` skips the label requirement
- **Workflow:** `.github/workflows/vibe-auto-merge.yml` (triggers on PR updates + `check_suite: completed`)
- **Gate:** requires `mergeable_state: clean`, successful **Vibe Promotion Gate**, and **Audit Assisted-by attribution** on the PR head SHA
- **CLI:** `npm run pr:auto-merge -- <pr_number> [--dry-run]` or `--sha <commit>`

Cursor skill: `.cursor/skills/vibe-auto-merge`

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
