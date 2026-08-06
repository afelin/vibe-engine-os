# Solo Vibe Coder Guide

See also: [docs/start-here.md](./start-here.md)

*You write intent. AI builds. vibe-engine-os guards, records, and ships — with receipts.*

This guide is for a **solo founder or operator** using vibe-engine-os with Cursor (or similar) to build products like a CyberReady MVP. No deep engineering background required.

For the business case and stakeholder framing, see [Plain-Language Briefing](./plain-language-briefing.md). For agent/MCP integration details, see [Agent Protocol](./agent-protocol.md).

---

## What you get (in one page)

| You do | The engine does |
| --- | --- |
| Write a short issue: intent, outcome, 2–4 file paths | Seals a **TaskBond** — a signed work order AI cannot exceed |
| Add label `vibe/run` | Runs plan → code → tests → verification on GitHub |
| Comment `/approve` when asked | Unblocks protected paths (e.g. `package.json`) |
| Add label `vibe/auto-merge` (optional) | Squash-merges the PR when all checks are green |
| Or merge manually when checks are green | Leaves a **capsule** (tamper-proof receipt) under `.runs/<runId>/` |

After a successful run, the cockpit comment includes a **Receipt link** — click **View proof** to open a read-only page showing the run id, capsule hash, vows hash, and repo. No terminal or MCP required to inspect the receipt; use MCP `validate_capsule` only if you want full local verification.

**Built-in safety nets (no extra setup):**

- **Mandates** — blocks forbidden areas (auth, workflows, secrets paths)
- **Gauntlet** — 23+ scenarios including adversarial “break-in” attempts must stay blocked
- **Replay gate** — re-runs every completed flight from its event ledger; mismatch blocks promotion
- **Attribution audit** — PRs mentioning AI tools without `Assisted-by:` do not merge
- **Auto-merge (opt-in)** — label `vibe/auto-merge` only; requires green **Vibe Promotion Gate**

---

## Prerequisites

- **Node.js ≥ 22** (repo includes `.nvmrc`)
- **Git** and a GitHub account
- **Cursor** (recommended) with MCP enabled
- Optional: `gh` CLI for local PR/issue workflows

---

## Step 1 — Activate (one command)

From the repo root:

```bash
git clone https://github.com/afelin/vibe-engine-os.git
cd vibe-engine-os
nvm use          # or: nvm install 22 && nvm use
npm run activate
```

**What `npm run activate` does:**

1. Ensures Node 22+
2. Installs dependencies if needed
3. Runs the full test suite (`npm run check`)
4. Runs a **zero-token smoke** (no API keys — proves deterministic gates work)
5. Smoke-tests MCP
6. Writes `.vibe/activated.json` (vows attestation) and exports schemas to `.vibe/schemas.json`

If activation passes, your machine is a valid promotion node.

---

## Step 2 — Enable MCP in Cursor

The repo ships MCP config at `.cursor/mcp.json`. In **Cursor → Settings → MCP**, ensure **`vibe-release-gates`** is enabled.

Run from the repo root so paths resolve:

```bash
npm run gate:mcp   # smoke-test the MCP server
```

**Why it matters:** while you chat with Cursor, the agent can ask live: “May I edit this file?” instead of discovering violations hours later in CI.

The bundled skill at `.cursor/skills/vibe-engine` reminds agents to call `evaluate_mandate` and `resolve_gate` before edits.

---

## Step 3 — Your first Vibe Request

On GitHub, open **Issues → New issue → Vibe Request** (or use the template locally).

Fill in:

| Field | Example |
| --- | --- |
| **Intent** | Add a health-check endpoint so deploys can verify the app is alive. |
| **Outcome** | `GET /health` returns `{ "ok": true }`; unit test covers happy path. |
| **Files to touch** | `src/health.ts`, `src/health.test.ts` (2–4 paths) |
| **Depth** | `vibe:safe` for small changes; `vibe:ship` when you want tests + broader scope |

Submit. The template adds `vibe/run` by default.

**Watch:** GitHub Actions workflow **Sovereign OS Event Bus** (`forever.yml`). When it finishes, you get a PR with checks including **Vibe Promotion Gate**.

---

## Step 4 — Operator commands (issue comments)

Reply on the **issue** (not the PR) with:

| Command | When to use |
| --- | --- |
| `/status` | Where is the run? What phase? |
| `/approve` | Engine paused on a protected path — you accept the risk |
| `/retry` | Transient failure; rerun from last good checkpoint |
| `/rollback` | Abort and follow `ROLLBACK.md` in the run folder |

---

## The depth dial (how much autonomy AI gets)

Set via issue labels or `VIBE_DEPTH` env var:

| Depth | Label (example) | What happens |
| --- | --- | --- |
| 0 | — | Explain only |
| 1 | `vibe:plan-only` | Plan written, no codegen |
| 2 | `vibe:safe` | Safe generated files |
| 3 | *(default at depth ≥ 3)* | Tests + implementation |
| 4 | `vibe:ship` | Ship-oriented (deploy preview on publish) |
| 5 | — | Protected paths require `/approve` |

**Tip:** start at `vibe:safe` or `vibe:plan-only` until you trust the loop on your repo.

---

## Local runs (before or instead of GitHub)

Zero-token smoke (no API keys):

```bash
ISSUE_NUMBER=3 \
ISSUE_TITLE="cloud loop" \
ISSUE_BODY="src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts" \
npm run local-issue
```

Daily development defaults to **subgraph tests** (`VIBE_TEST_MODE=subgraph`) — only tests touching changed files. For full parity:

```bash
VIBE_TEST_MODE=full npm run local-issue
```

Resume a non-terminal run:

```bash
export VIBE_RUN_ID=issue-3-2026-07-04T12-00-00-000Z
ISSUE_NUMBER=3 npm run local-issue
```

---

## What gets saved after each run

Under `.runs/<runId>/`:

| File | Plain English |
| --- | --- |
| `manifest.json` | The receipt header — issue, files, metrics, hashes |
| `actor.snapshot.json` | Where the state machine ended |
| `trace.ndjson` | Timeline of phases (preflight, codegen, tests) |
| `events.ndjson` | Full event ledger for replay |
| `capsule.hash` | One fingerprint sealing the whole run |
| `ROLLBACK.md` | How to undo if something went wrong |

**Verify replay** (proves determinism):

```bash
npm run replay -- . <runId>
```

Exit code 0 = replayed state matches stored snapshot.

---

## GitHub checks you should know

| Check | What it means |
| --- | --- |
| **Vibe Promotion Gate** | Preflight passed: gauntlet green, bond valid, capsule/replay OK |
| **TDD attribution** | Commits mentioning AI tools have `Assisted-by:` (or `Co-authored-by:` with an AI tool) |
| **Replay determinism gate** | Event ledger replays to the same ending hash |
| **Auto-merge (optional)** | With label `vibe/auto-merge`, merges automatically when all checks are green |

Require **Vibe Promotion Gate** on `main` in branch protection for production repos.

### Optional autonomous merge

1. Add label **`vibe/auto-merge`** to the PR when you are ready for hands-off merge.
2. Ensure branch protection requires **Vibe Promotion Gate** (and attribution audit).
3. When CI finishes green, `vibe-auto-merge.yml` squash-merges — no manual button.

Repo-wide opt-in: GitHub **Settings → Secrets and variables → Actions → Variables** → `VIBE_AUTO_MERGE=1` (skips label requirement; use carefully).

Dry-run locally:

```bash
export GITHUB_TOKEN=ghp_...
export GITHUB_REPOSITORY=owner/repo
npm run pr:auto-merge -- 15 --dry-run
```

---

## Install into your own product repo

To use vibe-engine-os as a layer on CyberReady or another app:

```bash
bash runs/install-into-repo.sh /path/to/your-repo
cd /path/to/your-repo
npm install
npm run activate
```

Optional project profile (e.g. TabDab-inspired paths):

```bash
export VIBE_PROJECT_PROFILE=tabdab   # merges src/policy/profiles/tabdab.json
```

Customize house rules in `src/policy/mandates.json` and zero-token gates in `src/release-gate/gates.json`.

---

## Common commands cheat sheet

```bash
npm run activate              # one-time + re-verify setup
npm run local-issue           # run from env vars (see runs/local-issue.sh)
npm run scoreboard            # run metrics summary
npm run bond:preflight -- . <issue> [runId]   # pre-promote checks
npm run eval:bond             # run TaskBond gauntlet
npm run replay -- . <runId>   # determinism replay
npm run constitution:export   # refresh .vibe/schemas.json
npm run check                 # full CI parity locally
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Activation fails on Node version | `nvm install 22 && nvm use` |
| MCP tools missing in Cursor | Enable `vibe-release-gates` in Settings → MCP; open repo root |
| Run blocked on `package.json` | Comment `/approve` on the issue |
| PR blocked on attribution | Add `Assisted-by: Cursor` (or your tool) to commit message |
| Legacy run fails replay | Runs before `events.ndjson` exist are skip-ok in preflight |
| Agent tried forbidden path | Expected — mandates blocked it; narrow your file list |

---

## Suggested first-week workflow

1. **Day 1:** `npm run activate`, enable MCP, read [Plain-Language Briefing](./plain-language-briefing.md).
2. **Day 2:** Zero-token local smoke (`local-issue` with issue #3 pattern).
3. **Day 3:** Open a real Vibe Request with 2 files and `vibe:safe`.
4. **Day 4:** Merge first green PR; inspect `.runs/<runId>/` capsule.
5. **Day 5:** Try `vibe:ship` on a small feature; require branch protection on `main`.

---

## Further reading

- [AI Providers](./ai-providers.md) — strict compliance, Groq experiment, corp Claude, banned list
- [Orchestrator](./orchestrator.md) — troubleshoot DAG, heal ladder, agent slots
- [Plain-Language Briefing](./plain-language-briefing.md) — capabilities, problems solved, VFA assessment
- [Agent Protocol](./agent-protocol.md) — MCP tools, TaskBond, schemas, gates
- [OS Phases](./os-phases.md) — promotion phase diagram (auto-derived)
- [GitHub App](./github-app.md) — enterprise install and required checks
- [README](../README.md) — technical reference and development
