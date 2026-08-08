# Coreward

**Rules hope. Gates decide.** Stops unbounded AI PRs from merging without path bind + receipt.

**Start here:** [docs/start-here.md](docs/start-here.md).

**What:** A promotion gate for agent-written code — not a codegen toy. Agents propose; house rules and CI decide what lands in Git. Receipts are tamper-**evident**, not certification.

## Do (GitHub-only)

1. Open a [Coreward Request](.github/ISSUE_TEMPLATE/vibe-request.yml) with **Intent**, **Outcome**, and **2–4 bound file paths**.
2. Comment **`/go`** for the three next actions.
3. Merge when CI is green.

Details: [docs/operate.md](docs/operate.md) · [docs/design-partner.md](docs/design-partner.md).

**Also (agents / Cursor)**

1. `npm run coreward:init`
2. Cursor Settings → MCP → enable **coreward-release-gates** (if not green)
3. Chat — agent already has the rule; expect one `preflight`

Adopt (no monorepo `src/`): `npx -y @coreward/mcp` — [docs/publish-mcp.md](docs/publish-mcp.md). This checkout dogfoods `npx tsx src/release-gate/mcp.ts`.

Details: [docs/start-here.md](docs/start-here.md) · [AGENTS.md](AGENTS.md).

## Why not just Cursor rules?

[docs/compare-cursor-rules.md](docs/compare-cursor-rules.md)

## Proof / trust

[![CI](https://github.com/afelin/coreward/actions/workflows/ci.yml/badge.svg)](https://github.com/afelin/coreward/actions/workflows/ci.yml)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-live-2ea44f)](https://afelin.github.io/coreward/)
[![License: FSL-1.1-Apache-2.0](https://img.shields.io/badge/License-FSL--1.1--Apache--2.0-blue)](LICENSE.md)

[Trust / Signals](https://afelin.github.io/coreward/trust/) · GA [v1.0.0](https://github.com/afelin/coreward/releases/tag/v1.0.0)

## Warm catalog

After first green PR: [docs/capabilities.md](docs/capabilities.md) — tiers, modules, honest limits. Deeper walks live there (solo / nocode / ward-security).

**Boundary:** Ward is CI/promote-only when a Mandate is on; IDE Edit/Shell remains out of band.

**License:** Free internal use under [FSL-1.1-Apache-2.0](LICENSE) — not for hosted Competing Use until Change Date. Optional [Support tip](https://donate.stripe.com/8x24gzfZy2gG0g3bRCbsc00).

---

*Product name is **Coreward**. Wire aliases (`vibe/*` labels, `.vibe/`, `VIBE_*`, MCP `vibe-release-gates`) stay dual-read for compatibility — see [docs/start-here.md](docs/start-here.md).*
