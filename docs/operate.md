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

## Security

Governed Mode + Mandate keys: [ward-security.md](./ward-security.md).

## Operator metrics (14-day dogfood)

Three counters — fill after each dogfood session. **Not SaaS:** store as an issue comment *or* local `.vibe/operator-metrics.json`.

| Counter | Meaning | How to fill |
| --- | --- | --- |
| **Turns before first preflight** | Agent turns (chat/tool rounds) before the first successful MCP `preflight` / `coreward:authorize` | Count manually from the session, or `npx tsx src/coreward/operator-metrics.ts record --turns N` |
| **Mode denies vs allows** | Coreward Mode DENY vs ALLOW on the engine path this session | From cockpit / ward decisions; `… record --denies D --allows A` |
| **Time-to-first green PR** | Minutes from issue open (or init) to first PR with green promotion checks | Wall clock or Actions timestamps; `… record --ttf-green-pr-min M` |

```bash
# Print template + current local artifact
npx tsx src/coreward/operator-metrics.ts show

# Write/merge local counters (creates .vibe/operator-metrics.json)
npx tsx src/coreward/operator-metrics.ts record --turns 3 --denies 1 --allows 4 --ttf-green-pr-min 28

# Markdown block to paste as an issue comment
npx tsx src/coreward/operator-metrics.ts comment
```

DoD: after one dogfood session you can fill all three.
