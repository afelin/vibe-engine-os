# vibe-engine-os

Sovereign AI dev cluster with a **headless xmachines Play constitution**: one Zod catalog for all law artifacts, `definePlayer` for promotion authority, and crawl-based CI proof that the OS machine matches `gates.json`.

## What it is

vibe-engine-os is a **promotion gate**, not a codegen toy. Models propose JSON-shaped artifacts; the constitution catalog and OS machine guards reject bad input before disk write. Only verified snapshots promote to Git.

## One-step activation

Requires **Node.js ≥ 22** ([`.nvmrc`](.nvmrc) pins `22`; matches `package.json` `engines`).

```bash
git clone <repo-url> && cd vibe-engine-os
nvm use          # or: nvm install 22 && nvm use
npm run activate
```

`npm run activate` auto-runs `nvm install` / `nvm use` when nvm is available and your shell is below v22. It then runs `npm run check`, zero-token cloud-loop smoke, MCP gate smoke, exports schemas to `.vibe/schemas.json`, and writes `.vibe/activated.json` with vows attestation.

## Persona matrix

| Persona | One step | Daily use |
| --- | --- | --- |
| **Lone AI engineer** | `npm run activate` | Issue + `vibe/run` label or `/vibe` in body |
| **Agentic engineer** | activate + enable MCP in Cursor | `.cursor/skills/vibe-engine` enforces vows |
| **Agents** | `docs/agent-protocol.md` + schemas URL | `evaluate_mandate`, `resolve_gate`, catalog JSON |
| **Enterprise** | Install App doc + required check branch rule | Green **Vibe Promotion Gate** + capsule hash on PR |

## 5-minute adoption

```bash
git clone <repo-url> && cd vibe-engine-os
npm run activate

# Zero-token smoke (no API keys)
ISSUE_NUMBER=3 ISSUE_TITLE="cloud loop" ISSUE_BODY="src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts" npm run local-issue

# Label-driven depth: vibe:plan-only → 1, vibe:safe → 2, vibe:ship → 4
# Or VIBE_DEPTH: 0 explain, 1 plan, 2 safe files, 3 tests, 4 deploy, 5 protected /approve

# MCP in Cursor (see mcp.json)
npm run gate:mcp

npm run scoreboard
npm run constitution:export
npm run constitution:serve   # local verify API :8787
```

[![vibe-validate](https://img.shields.io/badge/action-vibe--validate-blue)](action.yml)

Install into another repo: `bash runs/install-into-repo.sh /path/to/repo`

## Zero-token smoke

Deterministic release gates in `src/release-gate/gates.json` match issue titles/bodies and emit patches without LLM calls. Start with issue #3 cloud-loop or PR-review smoke triggers documented in the gate registry.

## VIBE_DEPTH dial

| Depth | Behavior |
| --- | --- |
| 0 | Explain only |
| 1 | Plan write, no codegen |
| 2 | Safe generated files |
| 3 | Tests + implementation (default) |
| 4 | Deploy preview on publish |
| 5 | Protected paths require `/approve` |

Set `VIBE_DEPTH` in the environment before `npm run local-issue` or GitHub Actions.

## Customize law (JSON)

- **Mandates:** `src/policy/mandates.json` — forbidden prefixes, approval prefixes, max attempts
- **Gates:** `src/release-gate/gates.json` — deterministic patch templates and matchers
- **Schemas:** `src/constitution/catalog.ts` — single source of truth; export via `npm run constitution:export`

## MCP in Cursor

Repo root ships `mcp.json`. For project-scoped MCP in Cursor, copy or symlink to `.cursor/mcp.json` (already committed in this repo):

```json
{
  "mcpServers": {
    "vibe-release-gates": {
      "command": "npx",
      "args": ["tsx", "src/release-gate/mcp.ts"]
    }
  }
}
```

**Enable in Cursor:** Settings → MCP → ensure `vibe-release-gates` is on. Run from repo root so `npx tsx src/release-gate/mcp.ts` resolves.

Use `constitution_schemas` for HPURL-ready JSON Schema and `validate_capsule` to verify a local run bundle.

## Solo autopilot checklist

1. `npm run activate` on `main`
2. Enable MCP (`mcp.json` / `.cursor/mcp.json`) + `.cursor/skills/vibe-engine`
3. Open a [Vibe Request](.github/ISSUE_TEMPLATE/vibe-request.yml) issue with **2–4 bound file paths**, intent, and outcome
4. Add label `vibe/run` (and `vibe:ship` for deploy depth)
5. Watch **Sovereign OS Event Bus** workflow; green **Vibe Promotion Gate** on the PR
6. Operator: `/status`, `/approve` (protected paths), `/retry`, `/rollback` via issue comments

Daily local runs at depth ≥ 3 default to `VIBE_TEST_MODE=subgraph` (changed-file vitest). Override with `VIBE_TEST_MODE=full` for full-suite parity.

## TabDab / Lovable profile

For [tabdab-link-proof](https://github.com/afelin/tabdab-link-proof) or other Lovable apps:

```bash
# In target repo after install:
cp .env.example .env   # set VIBE_PROJECT_PROFILE=tabdab

# Or install vibe-engine-os layer into an existing repo:
bash runs/install-into-repo.sh /path/to/tabdab-link-proof
cd /path/to/tabdab-link-proof && npm install && npm run activate
```

`VIBE_PROJECT_PROFILE=tabdab` merges allowed prefixes from `src/policy/profiles/tabdab.json`.

## Run capsule layout

Each run writes under `.runs/<runId>/`:

| File | Purpose |
| --- | --- |
| `manifest.json` | Issue, branch, generated files, metrics, `vowsHash`, `capsuleHash` |
| `actor.snapshot.json` | XState persisted snapshot for resume |
| `trace.ndjson` | Phase spans (preflight, codegen, tsc, vitest) |
| `events.ndjson` | OS event ledger for deterministic replay (`npm run replay`) |
| `capsule.hash` | SHA-256 promotion capsule |
| `ROLLBACK.md` | Human rollback instructions |

Resume a non-terminal run with matching issue:

```bash
export VIBE_RUN_ID=issue-3-2026-07-04T12-00-00-000Z
ISSUE_NUMBER=3 npm run local-issue
```

## Development

```bash
npm run check          # tsc + vitest (includes machine crawl + docs drift)
npm run gate:resolve   # CLI gate resolution
npm test
```

See `agent.md` for the full operator protocol and `docs/os-phases.md` for auto-derived promotion phases.
