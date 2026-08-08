# Coreward — agent instructions

Before proposing any file edits:

1. Call MCP **`preflight`** (or `authorize_write`) once with proposed paths (and issue title/body when known). Never propose paths without a successful ticket when Coreward Mode is on.
2. Prefer `prefer_gate` over LLM for templated chores. Surface `/approve` only when `requiresApproval`.
3. Stop — other MCP tools are advanced.

MCP server: `coreward-release-gates`. CLI: `npm run coreward:authorize -- --files a.ts,b.ts`. Init: `npm run coreward:init`.

**Surface freeze (this fortnight):** no new MCP tools; prefer `preflight` only; advanced tools stay advanced. Eng merges authorize/Mode/Ward **bugfixes** only if Ship Readiness fails. MCP tool count stays stable unless a listing correction is required for a bugfix.

**License:** [`LICENSE`](LICENSE) / [`LICENSE.md`](LICENSE.md) — FSL-1.1-Apache-2.0. Machine index: [`llms.txt`](llms.txt).

Docs: [docs/start-here.md](docs/start-here.md) · [docs/operate.md](docs/operate.md) · [docs/ward-security.md](docs/ward-security.md) · [.cursor/skills/coreward/SKILL.md](.cursor/skills/coreward/SKILL.md).
