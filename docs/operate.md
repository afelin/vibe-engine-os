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

Agents call MCP **`preflight`** once (CLI: `npm run coreward:authorize -- --files …`). Prefer `prefer_gate` when present. Other MCP tools are advanced.

## Security

Governed Mode + Mandate keys: [ward-security.md](./ward-security.md).
