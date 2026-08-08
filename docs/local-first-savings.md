# Local-first savings & private-model ready

Coreward does **not** train or host foundation weights. It **reduces what you must send** to any model and **keeps governance + memory local** so a future private/on-prem model plugs into the same `authorize_write` → Ward → promote path.

## Agentic Cost Plane

Coreward is a **promotion gate with an Agentic Cost Plane**: agents propose inside a ticket-bound graph; gates absorb repeat work; receipts prove what was allowed.

**Loop:** `preflight` → `prefer_gate`? → else **ContextPack v1** → bounded LLM → lesson → optional **gate candidate** (human merge into `gates.json`).

| Metric | Where |
|--------|--------|
| `gate_hit` | Cockpit / `savings:attest` |
| `contextChars` / `tokensEstimate` | Cockpit / attest |
| `graph_cache_hit` / `hops` | ContextPack + attest (`graphCacheHit`, `hops`) |
| Gate candidates | `.vibe/gate-candidates/` (not auto-merged) |
| Cost dogfood | `npm run coreward:cost-dogfood` → `.vibe/cost-dogfood.json` |

Order is fixed: **authorize → prefer_gate → ContextPack → LLM**. Multi-agent swarms share one `ticket_id` and one ContextPack. `VIBE_DEPTH` maps to ContextPack `{ maxHops, charBudget, allowLlm }`.

CyberReady (sibling repo) may later consume the same path/ticket contract; this repo keeps only the fail-open sock bridge.

## Day-one checklist (felt savings)

1. **Init** — `npm run coreward:init` (`activate` = legacy alias).
2. **Match gates** — call `resolve_gate` / `authorize_write` before LLM; templated chores in `src/release-gate/gates.json`.
3. **Mandate + AgentId** — `mandate:issue` / default profile to shrink path and context caps.
4. **Read the cockpit** — after a governed run, look for **Savings:** `gate_hit=yes|no · contextChars=N · tokensEstimate=N` (plus `graphCacheHit` / `hops` when ContextPack ran).
5. **Export attestation** — `npm run savings:attest` writes a hash-chained JSON (`.vibe/savings-attestation.json`) from those metrics. Local export is claimable; **hosted verify** of attestations stays unclaimed until built. Sample shape: [docs/assets/savings-attest.sample.json](./assets/savings-attest.sample.json).
6. **Prove the bound ratio** — `npm run coreward:cost-dogfood` measures unbound vs ContextPack `contextChars` on a checked-in fixture.

| Lever | Operator move | Felt benefit |
|-------|---------------|--------------|
| Zero-token `resolve_gate` | Match issue/chore to gate first | **$0** for templated work when a gate hits |
| Mandate + AgentId path/context caps | `mandate:issue` / default profile | Fewer files in prompt |
| `VIBE_DEPTH` 0–2 | Labels `vibe:safe` / plan-only | Less codegen surface + tighter ContextPack radius |
| `authorize_write` → `prefer_gate` | Single preflight | Agents stop “thinking” when a gate exists |
| ContextPack cache | Same ticket paths mid-session | Repeated graph builds can hit cache (`graph_cache_hit`) |
| Lessons → gate candidates | Friday ritual: `coreward:gate-candidates` | **Stubs available; no compounding SLA** until human merges into `gates.json` |
| `savings:attest` + cost-dogfood | Export after a gated week | Provable ROI artifact (local); claim is **measured on dogfood fixture** |

### Measured claim (cost dogfood)

Do not advertise a fixed “5–10× cheaper” multiplier. Run `npm run coreward:cost-dogfood` and cite **`ratio_unbound_over_bound`** from `.vibe/cost-dogfood.json` (fixture: bonded ContextPack vs naive multi-dir concat). Last local dogfood on this tree measured **≈17×** unbound/bound at the default char budget; the script exits nonzero below **5×** unless `COREWARD_COST_CLAIM=off`.

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
| Gates | `gates.json` | Deterministic skill library — zero frontier dependency when a gate hits |

## Migration sketch

Point the agent slot at a private endpoint later; keep Coreward MCP (`authorize_write`, Ward, promote). Mandates, gates, and lessons do not need a rewrite.

**Claim-safe:** when gates miss, bounded prompts may still leave the building — Coreward **reduces and bounds** exposure; it does not claim “zero IP ever leaves.”
