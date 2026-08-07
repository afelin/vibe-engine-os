---
name: openclaw-coreward
description: OpenClaw / local-agent host pack — call Coreward authorize_write before code-affecting tools; CI Ward still promotes.
---

# OpenClaw + Coreward (skill stub)

Coreward is the **governance spine**, not an agent runtime. OpenClaw (or Hermes) owns channels, tools, and model endpoints. This skill only teaches **tool order**.

## Instructions

1. Before any code-affecting write/edit/apply tool, call MCP **`authorize_write`** (server `coreward-release-gates`) with proposed paths.
2. When `prefer_gate` is set, prefer `resolve_gate` / gate apply over LLM codegen.
3. Call `evaluate_mandate` when house rules matter; respect Ward on CI/promote when a Mandate is active.
4. Do **not** bypass Coreward Mode tickets on the forever engine path.
5. After a governed run, read cockpit **Savings** (`gate_hit`, `contextChars`, `tokensEstimate`) or run `npm run savings:attest`.

MCP fragment:

```json
{
  "mcpServers": {
    "coreward-release-gates": {
      "command": "npx",
      "args": ["tsx", "src/release-gate/mcp.ts"]
    }
  }
}
```

CLI fallback: `npm run coreward:authorize -- --files a.ts,b.ts`.

Full packs: [docs/host-packs.md](../../docs/host-packs.md). Local/open models: [docs/local-first-savings.md](../../docs/local-first-savings.md).

## Examples

- OpenClaw about to patch `src/foo.ts` → `authorize_write` first → proceed only if `ok`.
- Hermes MCP session → same `mcp_servers` entry; lessons may live in Hermes memory, but **Ward receipts** remain the promote evidence.

## Performance Notes

- Prefer gates over frontier tokens for templated chores.
- Keep Coreward MCP local to the repo; do not embed OpenClaw/Hermes inside Coreward.

## Troubleshooting

- MCP missing → use `npm run coreward:authorize`.
- Promote blocked → check Mandate + Ward STRICT in CI; IDE Edit bypass is out of band (honest limit).
