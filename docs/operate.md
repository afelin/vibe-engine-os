# Operate — Go / Approve / Merge

Day-to-day operator loop after [start-here](./start-here.md).

## Three actions

| Action | When | What |
| --- | --- | --- |
| **Go** | Any time | Comment `/go` on the issue — blocking / fastest unblock / merge-or-deploy |
| **Approve** | Only when cockpit is `awaiting_approval` or preflight returns `requiresApproval` | Comment `/approve` |
| **Merge** | PR green | Merge the PR (optional auto-merge label remains a technical alias) |

Do **not** ask for `/approve` on every ticket — only on approval-prefix / protected paths.

## Open a request

1. Use the **Coreward Request** issue template.
2. Labels for depth stay dual-read in CI (`vibe/run`, `vibe:safe`, …) — templates talk in Go / Approve / Merge language only.
3. Wait for cockpit comments. Visibility strip: `Ward LEGACY|ON · Mode OFF|ON · ticket fresh|expired`.

## Agent path

Agents call MCP **`preflight`** once (CLI: `npm run coreward:authorize -- --files …`). Prefer `prefer_gate` when present. Cost-plane order: **authorize → prefer_gate → ContextPack → LLM**. Share `ticket_id` across agents; pass it to `build_scoped_context`. Other MCP tools are advanced.

Cursor soft hook (`.cursor/hooks.json`) **reminds** when Mode is on and no fresh ticket — **fail-open**; not an IDE sandbox. Engine Mode still fail-closes codegen/promote without a ticket.

## Security

Governed Mode + Mandate keys: [ward-security.md](./ward-security.md).

## Operator metrics (14-day dogfood)

Counters auto-update on successful `preflight` / `authorize_write` and on Mode DENY/ALLOW. Manual `record` remains for turn counts / TTF green PR when needed. **Not SaaS:** `.vibe/operator-metrics.json` or paste `comment` on an issue.

| Counter | Meaning | How filled |
| --- | --- | --- |
| **Turns before first preflight** | Agent turns before first successful preflight | Auto-set to `1` on first ok this session if unset; override with `record --turns N` |
| **Preflight ok count** | Successful authorize/preflight mints | Auto |
| **Mode denies vs allows** | Engine-path Mode DENY vs ALLOW | Auto from `assertCorewardMode` |
| **Time-to-first green PR** | Minutes to first green promotion PR | Manual: `record --ttf-green-pr-min M` |
| **Preflight compliance %** | Sessions with turn-1 preflight / sessions with any preflight | Derived; see kill criterion |

```bash
npm run coreward:metrics -- show
npm run coreward:metrics -- record --turns 3 --denies 1 --allows 4 --ttf-green-pr-min 28
npm run coreward:metrics -- comment
npm run coreward:dogfood-report
```

### Kill criterion — preflight compliance

**Preflight compliance %** = sessions with `turns_before_first_preflight === 1` / sessions that recorded a preflight.

**Target ≥80%** internal dogfood. Below that: demote product narrative that “agents call preflight” as solved; strengthen the soft hook / dogfood until the score recovers.

## Friday ritual (15 min) — gate candidates

Compounding is **not** an SLA until stubs merge into `gates.json`. Weekly:

```bash
npm run coreward:gate-candidates -- emit
npm run coreward:gate-candidates -- list
npm run coreward:gate-candidates -- show <id>
```

1. Emit stubs from lessons (`.vibe/gate-candidates/`).
2. Review → open a PR merging approved stubs into `src/release-gate/gates.json`, **or** close/delete stubs.
3. If no merge in 14 dogfood days: keep language as “stubs available; no compounding SLA” (honest).

## Cost dogfood

```bash
npm run coreward:cost-dogfood   # writes .vibe/cost-dogfood.json; fails if ratio < 5× unless COREWARD_COST_CLAIM=off
```
