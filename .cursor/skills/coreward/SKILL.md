---
name: coreward
description: Coreward — call MCP preflight once before edits; stop.
---

# Coreward Agent Skill

Call MCP **`preflight`** (or `authorize_write`) once with proposed paths (+ issue title/body when known). Use the returned ticket / `prefer_gate`. **Stop** — do not chain extra MCP vows.

- Prefer `prefer_gate` over LLM for templated chores.
- Order: **authorize → prefer_gate → ContextPack → LLM**. On `prefer_gate`, apply the gate — skip ContextPack/LLM.
- Multi-agent: share the same `ticket_id`; pass it to `build_scoped_context` so agents share one ContextPack read model.
- `VIBE_DEPTH` dials ContextPack radius (`maxHops` / `charBudget` / `allowLlm`).
- Surface `/approve` only when `requiresApproval` is true.
- After a governed run: optional `validate_capsule` with `run_id`.
- Operator commands (`/go`, `/approve`, `/retry`, `/rollback`) override agent proposals.

**Honesty:** Coreward Mode is not a kernel IDE sandbox. Ward covers CI/promote when a Mandate is on. Visibility strip: `Ward LEGACY|ON · Mode OFF|ON · ticket fresh|expired`. Coreward = promotion gate + Agentic Cost Plane; CyberReady stays a sibling (optional sock).

Setup: [docs/start-here.md](../../docs/start-here.md) · Operate: [docs/operate.md](../../docs/operate.md) · Ward: [docs/ward-security.md](../../docs/ward-security.md) · Savings: [docs/local-first-savings.md](../../docs/local-first-savings.md).

### CyberReady (optional)

When CyberReady present, call `cyberready_validate_delta` after a successful preflight. Missing `CYBERREADY_SOCK` → `{ ok: false, reason: "not_installed" }` (fail-open). No CyberReady product docs in this repo.
