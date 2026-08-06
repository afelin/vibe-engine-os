# Agent Adapter Manifest

See also: [docs/start-here.md](./start-here.md)

Machine-readable integration surface exported to `.vibe/agent-adapter.json` on `npm run activate`.

## Three integration paths

### 1. Cursor / MCP agents (5 min)

1. `npm run activate` — exports schemas + adapter manifest
2. Enable MCP from `mcp.json` (`npm run gate:mcp`)
3. Use `.cursor/skills/vibe-engine/SKILL.md` for preflight/postrun tool order

**Preflight:** `evaluate_mandate` → `validate_bond` → `resolve_gate` → `constitution_schemas`  
**Postrun:** `validate_capsule` → `build_scoped_context` → `recall_lessons`

### 2. GitHub-only nocode (0 min terminal)

1. Open **Vibe Request** issue template (labels `vibe/run`, `vibe:safe`)
2. Fill Intent, Outcome, Files to touch
3. Engine posts PR link + receipt in issue comments

See [Nocode Quickstart](./nocode-quickstart.md).

### 3. Foreign CI / other agents

1. Install composite action from `action.yml`
2. Point agents at `.vibe/schemas.json` for structured output
3. Optional HTTP verify: `npm run constitution:serve` (`GET /schemas`, `POST /verify-capsule`)

See [Agent Protocol](./agent-protocol.md) for event shapes and MCP tool contracts.

## Manifest fields

| Field | Purpose |
| --- | --- |
| `ingress.github_issue_labels` | Label-driven depth and run triggers |
| `ingress.slash_commands` | Operator commands on issues |
| `ingress.mcp_seal_bond` | MCP tool to seal TaskBond from issue body |
| `preflight_tools` | Call before proposing paths or codegen |
| `postrun_tools` | Call after verification, before promotion |
| `schemas_path` | Exported Zod JSON schemas |
| `skill_path` | Cursor skill enforcing vows |
| `http_verify` | Local constitution verify server command |

Regenerate: `npm run activate` or `npm run constitution:export` + adapter export step in activate.
