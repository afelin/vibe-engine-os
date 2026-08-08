# Host packs — Coreward on any coding agent

One contract: MCP **`preflight`** / **`authorize_write`** (CLI: `npm run coreward:authorize`). MCP server: **`coreward-release-gates`** (alias `vibe-release-gates` still works). Entrypoint: **`npx -y @coreward/mcp`**.

Coreward Mode (`.vibe/coreward-mode.json` with `"enabled": true`, or `COREWARD_MODE=1`) fail-closes forever **codegen / patch / promote** without a valid ticket or verified Mandate. This is **not** a kernel IDE sandbox — Edit/Shell outside the engine path are out of band.

**Install a pack into cwd:**

```bash
npx tsx src/coreward/host-pack.ts --host cursor|claude|opencode|zed
# overwrite existing files:
npx tsx src/coreward/host-pack.ts --host claude --force
```

(`npm run coreward:host-pack` when wired in `package.json` — house rule requires `/approve` for that script.)

Templates live under [`templates/hosts/`](../templates/hosts/).

## Cursor

1. `npx tsx src/coreward/host-pack.ts --host cursor` → `.cursor/mcp.json` + `.cursor/rules/coreward.mdc`
2. Or `npm run coreward:init` (syncs dogfood/adopt MCP + rule + soft hooks)
3. Customize → MCP → **coreward-release-gates** green (reload if grey)

Monorepo dogfood may keep `npx tsx src/release-gate/mcp.ts`. Publish notes: [publish-mcp.md](./publish-mcp.md).

## Claude Code

1. `npx tsx src/coreward/host-pack.ts --host claude` → project `.mcp.json` + slim `CLAUDE.md`
2. Reload MCP / restart Claude Code so `coreward-release-gates` is available
3. Expect one `preflight` before edits

## OpenCode

1. `npx tsx src/coreward/host-pack.ts --host opencode` → `opencode.json` + slim `AGENTS.md`
2. Confirm MCP local server `coreward-release-gates` is enabled
3. Same vow: preflight → prefer_gate → ContextPack

## Zed

1. `npx tsx src/coreward/host-pack.ts --host zed` → `.zed/settings.json` (`context_servers`, `source: custom`) + slim `AGENTS.md`
2. Settings → AI → MCP Servers → indicator green for **coreward-release-gates**
3. Same preflight vow

## Codex

Paste [`templates/hosts/codex/mcp-snippet.json`](../templates/hosts/codex/mcp-snippet.json) (`npx -y @coreward/mcp`) into Codex MCP settings; keep the slim vow from [`templates/hosts/codex/AGENTS.md`](../templates/hosts/codex/AGENTS.md) in repo `AGENTS.md`.

## Local / CI

No MCP required. See [`templates/hosts/local/README.md`](../templates/hosts/local/README.md):

```bash
npm run coreward:init
npm run coreward:authorize -- --files a.ts,b.ts
```

## OpenClaw / Hermes / Kimi

Same MCP fragment (`npx -y @coreward/mcp`). OpenClaw skill stub: [`.cursor/skills/openclaw-coreward/SKILL.md`](../.cursor/skills/openclaw-coreward/SKILL.md). Hermes memory does **not** replace Ward receipts. Adapter after activate: `.vibe/agent-adapter.json` lists `required_tools: ["authorize_write"]`.

See [local-first-savings.md](./local-first-savings.md) for day-one token savings and local lessons as IP.
