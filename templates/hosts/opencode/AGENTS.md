# Coreward

Before proposing file edits: call MCP **`preflight`** (or `authorize_write`) once with proposed paths.

Prefer `prefer_gate` over LLM for templated chores. Order: **authorize → prefer_gate → ContextPack → LLM**. Stop.

MCP: `coreward-release-gates` in `opencode.json` (`npx -y @coreward/mcp`).
CLI: `npm run coreward:authorize -- --files a.ts,b.ts`.
