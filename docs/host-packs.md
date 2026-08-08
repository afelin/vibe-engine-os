# Host packs — Coreward on any coding agent

One contract: MCP **`authorize_write`** (CLI: `npm run coreward:authorize`). MCP server name: **`coreward-release-gates`** (alias `vibe-release-gates` still works).

Coreward Mode (`.vibe/coreward-mode.json` with `"enabled": true`, or `COREWARD_MODE=1`) fail-closes forever **codegen / patch / promote** without a valid ticket or verified Mandate. This is **not** a kernel IDE sandbox — Edit/Shell outside the engine path are out of band.

## Cursor

1. Point MCP at Coreward (adopt — published package):

```json
{
  "mcpServers": {
    "coreward-release-gates": {
      "command": "npx",
      "args": ["-y", "@coreward/mcp"]
    }
  }
}
```

Monorepo dogfood may keep `npx tsx src/release-gate/mcp.ts`. Publish notes: [publish-mcp.md](./publish-mcp.md).

2. Load skill `.cursor/skills/coreward/SKILL.md`.
3. Optional: enable Coreward Mode and require `authorize_write` before agent edits.

## Claude Code / Codex

1. Add or extend `AGENTS.md` (repo root) with:

```markdown
# Coreward
Before proposing file edits: call MCP `authorize_write` with proposed paths.
Prefer `prefer_gate` / `resolve_gate` over LLM for templated chores.
Never bypass house mandates or Ward when a Mandate is active.
```

2. Register the same MCP fragment as Cursor (`coreward-release-gates` → `npx -y @coreward/mcp`).
3. Export adapter: after activate, `.vibe/agent-adapter.json` lists `required_tools: ["authorize_write"]`.

## OpenCode

Point the OpenCode skill/plugin at MCP `coreward-release-gates` and treat `authorize_write` as the single preflight tool. Use `npm run coreward:authorize -- --files a.ts,b.ts` when MCP is unavailable.

## Kimi / other agents

Adapter recipe:

1. `npm run activate` (writes schemas + adapter manifest v2).
2. Call `authorize_write` → on `prefer_gate`, apply gate via `preview_gate` / engine forever path; else scoped codegen.
3. Promote only through CI Ward when Mandate is on.
4. Read cockpit Savings (`gate_hit`, `contextChars`, `tokensEstimate`) after a run.

See [local-first-savings.md](./local-first-savings.md) for day-one token savings and local lessons as IP.

## OpenClaw

OpenClaw owns channels, tools, and model routing. Coreward owns **authorize → evidence → promote**.

1. Register MCP `coreward-release-gates` (same fragment as Cursor).
2. Before code-affecting tools, call `authorize_write` with proposed paths.
3. Optional skill stub: [`.cursor/skills/openclaw-coreward/SKILL.md`](../.cursor/skills/openclaw-coreward/SKILL.md) (tool order only — **no** OpenClaw embed).
4. CI Ward still gates merge when a Mandate is on; IDE/raw Edit bypass remains an honest out-of-band limit.

## Hermes Agent

Hermes is MCP-native and may keep its own memory/lessons. Map preflight to Coreward:

```json
{
  "mcp_servers": {
    "coreward-release-gates": {
      "command": "npx",
      "args": ["-y", "@coreward/mcp"]
    }
  }
}
```

1. Skills that write code must call `authorize_write` first (then `evaluate_mandate` / `resolve_gate` as needed).
2. Hermes memory (`.evomem` elsewhere, or Hermes-local) does **not** replace Ward receipts or capsules.
3. Promote only through CI when Mandate + Ward STRICT apply.

## Local / open models (policy path)

Policy teams can approve Ollama / OpenClaw / Hermes **with** Coreward because: IP stays on your metal for inference when you choose local weights; writes are Mandated via `authorize_write`; promote re-verifies. Details: [local-first-savings.md](./local-first-savings.md).
