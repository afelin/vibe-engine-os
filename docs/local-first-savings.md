# Local-first savings & private-model ready

Coreward does **not** train or host foundation weights. It **reduces what you must send** to any model and **keeps governance + memory local** so a future private/on-prem model plugs into the same `authorize_write` → Ward → promote path.

## Day-one checklist (felt savings)

1. **Activate** — `npm run activate`.
2. **Match gates** — call `resolve_gate` / `authorize_write` before LLM; ≥12 zero-token chores in `src/release-gate/gates.json`.
3. **Mandate + AgentId** — `mandate:issue` / default profile to shrink path and context caps.
4. **Read the cockpit** — after a governed run, look for **Savings:** `gate_hit=yes|no · contextChars=N · tokensEstimate=N`.
5. **Export attestation** — `npm run savings:attest` writes a hash-chained JSON (`.vibe/savings-attestation.json`) from those metrics. Local export is claimable; **hosted verify** of attestations stays unclaimed until built.

| Lever | Operator move | Felt benefit |
|-------|---------------|--------------|
| Zero-token `resolve_gate` | Match issue/chore to gate first | **$0** for templated work |
| Mandate + AgentId path/context caps | `mandate:issue` / default profile | Fewer files in prompt |
| `VIBE_DEPTH` 0–2 | Labels `vibe:safe` / plan-only | Less codegen surface |
| `authorize_write` → `prefer_gate` | Single preflight | Agents stop “thinking” when a gate exists |
| `savings:attest` | Export after a gated week | Provable ROI artifact (local) |

## Local/open models + Coreward (why policy can say yes)

OpenClaw, Hermes, and Ollama are **runtimes**; Coreward is the **governance spine**. Approved path:

1. Agent runtime uses local/open weights (IP can stay on metal for inference).
2. Every code-affecting tool hits MCP `authorize_write` (Mandate + house rules).
3. CI Ward re-verifies before promote — receipts are evidence, not authorization.

Do not treat Hermes memory or OpenClaw sessions as a substitute for Ward. Packs: [host-packs.md](./host-packs.md).

## Local “weights” (IP that stays yours)

| Artifact | Where | Why it matters |
|----------|--------|----------------|
| Lessons | `.evomem/lessons.ndjson` | Scar tissue / retrieval on **your** disk |
| Capsules / events | `.runs/` | Replayable evidence for later private-model eval |
| Mandates / AgentId / house law | `.vibe/`, `src/policy/` | Policy portable when inference moves in-house |
| Gates | `gates.json` | Deterministic skill library — zero frontier dependency |

## Migration sketch

Point the agent slot at a private endpoint later; keep Coreward MCP (`authorize_write`, Ward, promote). Mandates, gates, and lessons do not need a rewrite.

**Claim-safe:** when gates miss, bounded prompts may still leave the building — Coreward **reduces and bounds** exposure; it does not claim “zero IP ever leaves.”
