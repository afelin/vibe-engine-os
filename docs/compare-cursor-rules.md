# AGENTS.md / Cursor rules vs Coreward

| | AGENTS.md / rules alone | Coreward |
| --- | --- | --- |
| Preflight | Hope agent obeys | MCP `preflight` + Mode (engine) + soft Cursor hook (fail-open) |
| Templated chores | LLM every time | zero-token gates when matched |
| Promote | Soft | CI Ward / capsule / gauntlet |
| Evidence | Chat log | HPURL / capsuleHash |
| Cost | Tokens | Prefer gate → ContextPack → LLM; measure via `coreward:cost-dogfood` |

Start: [start-here.md](./start-here.md) · Trust / Signals: [site/trust](https://afelin.github.io/coreward/trust/)
