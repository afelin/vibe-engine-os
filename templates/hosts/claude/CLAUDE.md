# Coreward

Before proposing file edits: call MCP **`preflight`** (or `authorize_write`) once with proposed paths.

Prefer `prefer_gate` over LLM for templated chores. Order: **authorize → prefer_gate → ContextPack → LLM**. Stop — other MCP tools are advanced.

MCP server: `coreward-release-gates` via project `.mcp.json` (`npx -y @coreward/mcp`).
CLI fallback: `npm run coreward:authorize -- --files a.ts,b.ts`.
