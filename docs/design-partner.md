# Design partner pack

*One page.* Run the wedge without a live walkthrough.

## Who

Teams drowning in AI PRs — many agent diffs, weak scope, unclear “what landed and why.”

## Path

1. Open a [Coreward Request](../.github/ISSUE_TEMPLATE/vibe-request.yml) (Vibe Request) with **Intent**, **Outcome**, and **2–4 files**.
2. Comment **`/go`** — three next actions (blocking / unblock / merge-or-deploy). See [operate.md](./operate.md).
3. Merge when CI is green (optional auto-merge label). Expect visibility strip + capsule receipt — not certification.

Local agent path: `npm run coreward:init` → MCP `preflight` once → [start-here.md](./start-here.md).

## Success

- Cockpit strip present: `Ward LEGACY|ON · Mode OFF|ON · ticket …`
- PR has a receipt (capsule / proof link) — evidence, not a certificate
- Bound files match the request; no whole-repo surprise diffs

## Why not “just rules”?

[compare-cursor-rules.md](./compare-cursor-rules.md) — AGENTS.md alone vs Coreward gates + promote.

## Adopt into your repo

[Adopt (GitHub Pages)](https://afelin.github.io/coreward/adopt/) · source [`site/adopt/`](../site/adopt/).

Tips ≠ license — voluntary support tips are not a purchase of rights ([LICENSE.md](../LICENSE.md)).
