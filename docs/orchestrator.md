# Vibe AI Orchestrator

Thin routing layer over the existing vibe-engine-os stack — no duplicate gate logic, no parallel ledger.

## Commands

```bash
npm run orchestrate -- troubleshoot "Vibe Promotion Gate failing on replay mismatch"
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

## External agent slots

Configure `.vibe/orchestrator/agents.json` (see `agents.json.example`):

| Slot | Detect | Trust |
|------|--------|-------|
| `corp-claude` | `claude --version` | corporate |
| `m365-guide` | always | human-in-loop |
| `hermes` | `hermes --version` | experiment |
| `groq-experiment` | `GROQ_API_KEY` + router | experiment |

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
