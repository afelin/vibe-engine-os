# Context — Agentic Cost Plane

**Public API:** `context-pack.ts` — `buildContextPack`, `formatContextPackBundle`.

MCP: `build_scoped_context` (pass `ticket_id` so multi-agent runs share one pack).

**Internal only** (`@internal` — do not import from engine/agents):

| Module | Role |
| --- | --- |
| `bundle.ts` | Resolve/cap file text for a path list |
| `scoped-repomix.ts` | Import-closure BFS (`maxHops`) |
| `cap.ts` | Char truncation helpers |
| `untrusted-fence.ts` | Fence untrusted tool dumps (heal critic) |

Order: **authorize → prefer_gate → ContextPack → LLM**. On `prefer_gate`, skip the pack.
