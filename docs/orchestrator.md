# Vibe AI Orchestrator

Thin routing layer over the existing vibe-engine-os stack — no duplicate gate logic, no parallel ledger.

## Commands

```bash
npm run orchestrate -- troubleshoot "Vibe Promotion Gate failing on replay mismatch"
npm run orchestrate -- troubleshoot "Vibe Promotion Gate failing" --skip-llm
ORCHESTRATOR_SKIP_LLM=1 npm run orchestrate -- troubleshoot "<symptom>"
npm run orchestrate:smoke
npm run orchestrate -- route --intent "debug M365 Teams webhook"
npm run orchestrate -- agents
```

GitHub: comment `/troubleshoot <symptom>` on an issue (routes via `github-comment-router.ts`).

## Architecture

```text
Intent → resolve_gate (MCP) → feedback-cache → npm diagnostics
      → build_scoped_context → external agent slot → heal result
      → events.ndjson + cockpit + HPURL receipt
```

## Healing ladder (Ilya/Karpathy discipline)

| Level | Mechanism | Tokens |
|-------|-----------|--------|
| L0 | `resolve_gate`, `readGateFeedbackEntry`, `recallLessons`, `bond:preflight` / `replay` / `launch:readiness` | 0 |
| L1 | Feedback-cache hit → known remediation | 0 |
| L2 | One bounded LLM pass (`corp-claude` or `groq-experiment`) | 1 |
| L3 | `m365-guide`, human `/approve`, cockpit escalate | varies |
| L4 | Offline `autoresearch` + interventions — never hot path | 0 in prod |

**Constitutional cage:** orchestrator never auto-modifies `mandates.json`, `gates.json`, `VOWS.md`, credentials, or workflow permissions.

**CI smoke:** pass `--skip-llm` or set `ORCHESTRATOR_SKIP_LLM=1` to stop at L0–L1 without corp-claude / groq calls. `npm run orchestrate:smoke` runs a deterministic promotion-gate symptom.

**Feedback cache:** `seedGateFeedbackCache` writes `.vibe/cache/gates/<gateId>.json`. Symptom signatures (e.g. "Vibe Promotion Gate") map to `promotion_gate` via `classifyFromSymptom`. Re-seed on activate or at troubleshoot start.

## External agent slots

Configure `.vibe/orchestrator/agents.json` (see `agents.json.example`). Slots **degrade gracefully** when CLI or API keys are missing — `npm run orchestrate -- agents` shows `available: false` and the heal ladder escalates to the next level instead of crashing.

| Slot | Detect | Trust |
|------|--------|-------|
| `corp-claude` | `claude --version`; config via `CLAUDE_CONFIG_DIR` or `~/.claude/profiles/corp` | corporate |
| `m365-guide` | always (BizChat prompt + link; no API) | human-in-loop |
| `hermes` | `hermes --version` | experiment |
| `groq-experiment` | `resolveCodegenEndpoint()` / Groq via `router.ts` | experiment |

Missing `corp-claude` / `hermes` CLIs or groq keys → slot unavailable; troubleshoot continues at L0–L1 or escalates to `m365-guide` / human.

### Corp Claude discovery

```bash
claude /status   # skip if CLI missing — slot stays unavailable
export CLAUDE_CONFIG_DIR=~/.claude/profiles/corp   # or rely on auto-detect
```

Details and managed-settings checks: [ai-providers.md](./ai-providers.md#discover-corporate-claude).

### Optional Hermes install

```bash
# Official agent: https://github.com/NousResearch/hermes-agent
hermes --version
# Copy .vibe/orchestrator/agents.json.example → agents.json and keep hermes.enabled
```

If the binary is absent, `invokeHermes` returns `{ ok: false, reason: "hermes_not_installed" }`.

### Groq experiment (Phase 1)

Uses existing [`src/llm/router.ts`](../src/llm/router.ts) (`resolveCodegenEndpoint`). Copy `.env.experiment.example` on personal repos only. OmniRoute is **not** required — see [ai-providers.md](./ai-providers.md#omniroute-optional-phase-2).

## MCP tools used (via `callReleaseGateTool`)

`list_gates`, `resolve_gate`, `preview_gate`, `evaluate_mandate`, `constitution_schemas`, `validate_capsule`, `seal_bond`, `validate_bond`, `build_scoped_context`, `recall_lessons`

## npm diagnostics (verify step)

`bond:preflight`, `replay`, `launch:readiness`, `scoreboard`

## Events

Troubleshoot spans append to `.runs/<runId>/events.ndjson` via `appendOsEvent` — **not** a separate orchestrator ledger.

## Metrics (Pearl)

`runMetricsSchema` extended with `healLevel`, `agentSlot`, `deterministicFix`. Scored offline by `npm run autoresearch`.

## Compliance

Run `scripts/ai-trust-check.sh` before local LLM runs. See [ai-providers.md](./ai-providers.md).

## Module map

| File | Role |
|------|------|
| `src/orchestrator/troubleshoot.ts` | DAG wiring |
| `src/orchestrator/heal.ts` | L0–L3 dispatcher |
| `src/orchestrator/diagnose.ts` | Failure classification |
| `src/orchestrator/registry.ts` | Agent slots |
| `src/orchestrator/primitives/*` | corp-claude, m365, hermes only |
