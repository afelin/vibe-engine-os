# Coreward

Sovereign AI dev cluster (**Coreward** promotion gate) with a **headless xmachines Play constitution**: one Zod catalog for all law artifacts, `definePlayer` for promotion authority, and crawl-based CI proof that the OS machine matches `gates.json`.

**Repo:** [github.com/afelin/coreward](https://github.com/afelin/coreward) · **Start here:** [docs/start-here.md](docs/start-here.md) — 5 minutes, any tool (GitHub-only, Cursor + MCP, external agent, or legal-space dial). Deeper walks: [Solo Vibe Coder Guide](docs/solo-vibe-coder-guide.md) · [Nocode Quickstart](docs/nocode-quickstart.md) · [Plain-Language Briefing](docs/plain-language-briefing.md).

**Public surface (GitHub Pages):** [white paper](https://afelin.github.io/coreward/whitepaper/) · [adopt](https://afelin.github.io/coreward/adopt/) · [status](https://afelin.github.io/coreward/status/) · [site source](site/). Manuscript: `papers/coreward-whitepaper.md` (when present; `npm run site:build` regenerates HTML).

## What it is

**Coreward** is a **promotion gate**, not a codegen toy. Models propose JSON-shaped artifacts; the constitution catalog and OS machine guards reject bad input before disk write. Only verified snapshots promote to Git.

Truth-driven gates (TDD): **deterministic replay** from `events.ndjson`, **Assisted-by** attribution on PRs, and an **adversarial gauntlet** that proves guardrails block forbidden changes.

**Mandate–Ward (opt-in):** a signed **Mandate** is a session work-order/budget (paths, actions, depth, expiry)—not “AI ethics.” When present, **Ward** enforces ALLOW/DENY on the engine path before bond/codegen/patch/promote. **Receipts** are tamper-evident trails (`ward_decision`, capsule, HPURL)—not certification. Absent Mandate ⇒ legacy house rules only. IDE Edit/Shell can still bypass Ward; the product claim is *CI/promote cannot move without Ward when a Mandate is on*. Security invariant + regulated checklist: [docs/ward-security.md](docs/ward-security.md).

## Capabilities

**Coreward** is a **promotion gate**, not a codegen toy. Models propose JSON-shaped artifacts; the constitution catalog and OS machine guards reject bad input before disk write. Only verified snapshots promote to Git. Walkthroughs: [Solo Vibe Coder Guide](docs/solo-vibe-coder-guide.md) · [Nocode Quickstart](docs/nocode-quickstart.md) · [Agent Protocol](docs/agent-protocol.md).

| Capability | What you get | How to activate | Status |
| --- | --- | --- | --- |
| **TaskBond** | Sealed work order — intent, outcomes, bound files (max 16); scope creep blocked at seal time | [Vibe Request](.github/ISSUE_TEMPLATE/vibe-request.yml) issue with 2–4 paths; MCP `seal_bond` / `validate_bond` | Built-in |
| **House mandates** | Standing law: forbidden prefixes, approval prefixes, max attempts, approver allowlist | Edit `src/policy/mandates.json`; MCP `evaluate_mandate` before proposing paths | Built-in |
| **Signed Mandate + Ward** | Opt-in session contract (budget); Ward ALLOW/DENY on engine path; context shrink when verified | `npm run mandate:issue` → `.vibe/active_mandate.json`; `npm run ward:doctor`; principals in `.vibe/principals.json` — [ward-security.md](docs/ward-security.md) | Built-in |
| **Zero-token gates** | Deterministic patch templates — no LLM, $0 cost for templated chores | Match issue title/body to `src/release-gate/gates.json`; MCP `resolve_gate` / `list_gates` | Built-in |
| **VIBE_DEPTH dial** | Volume knob 0–5: explain → plan → safe files → tests → deploy → protected `/approve` | `VIBE_DEPTH` env or labels `vibe:plan-only` / `vibe:safe` / `vibe:ship` | Built-in |
| **Capsule + receipt** | Tamper-evident run fingerprint (`capsuleHash`, `vowsHash`) + **View proof** HPURL in issue comment (not a certificate) | Runs automatically; inspect `proof/index.html` or MCP `validate_capsule` | Built-in |
| **TaskBond gauntlet** | 32/32 adversarial bond + mandate scenarios; baseline ratchet blocks guard drift | `npm run eval:bond`; wired into **Coreward Promotion Gate** preflight | Built-in |
| **Replay gate** | Flight recorder — re-run `events.ndjson`; mismatch blocks promotion | `npm run replay -- . <runId>`; CI replay determinism check on PRs | Built-in |
| **Anti-rot** | Scoped context (capped snippets, no repomix fallback), bond compliance (paths outside plan ∪ bound blocked), evidence-linked lessons | MCP `build_scoped_context`, `recall_lessons`; lessons in `.evomem/lessons.ndjson` | Built-in |
| **MCP tools** | Live rulebook in Cursor: gates, bonds, mandates, schemas, capsule verify | Enable `coreward-release-gates` (alias `vibe-release-gates`) in `mcp.json`; `npm run gate:mcp` smoke | Built-in |
| **Forever loop** | GitHub issue → plan → codegen → verify → PR + cockpit comment; runs while you sleep | Label `vibe/run` on issue; **Sovereign OS Event Bus** workflow | Built-in |
| **Cockpit + explain dial** | Issue/PR comment dashboard: depth, hashes, next action, decision explain (off/short/long/expand) | Auto-posted on runs; labels `vibe:explain-short` / `vibe:explain-long` or `VIBE_EXPLAIN` | Built-in |
| **Operator commands** | Human steering without terminal: `/status`, `/approve`, `/continue`, `/retry`, `/rollback`, `/details`, `/troubleshoot` | Reply on the issue; see [Agent Protocol](docs/agent-protocol.md) | Built-in |
| **Option B `/approve`** | When Mandate path is on, CI may issue a short-lived signed override Mandate (`github-ci-bot-override`); human is audit-only (`approving_comment_actor`)—not human crypto | Issue comment `/approve` with runner key available | Built-in |
| **Promotion gate** | **Coreward Promotion Gate** — gauntlet green, bond valid, capsule/replay OK before merge | Require check on `main`; runs on vibe PRs via `vibe-pr-gate.yml` | Built-in |
| **Assisted-by attribution** | PR blocked if commits mention AI tools without `Assisted-by:` trailer | Automatic on PRs; engine tags its own commits | Built-in |
| **Auto-merge** | Squash-merge when branch protection + promotion gate green | Label `vibe/auto-merge` or repo var `VIBE_AUTO_MERGE=1` | Built-in |
| **Activate / adopt** | One-command bootstrap: check, zero-token smoke, MCP smoke, schema export, vows attestation | `npm run activate` or `bash runs/adopt.sh /path/to/repo` | Built-in |
| **`launch:readiness`** | Local preflight: workflows, gauntlet vs baseline, MCP smoke, proof page | `npm run launch:readiness` on `main` | Built-in |
| **`launch:ship`** | One-command ship after readiness green | `npm run launch:ship` — see [Launch Proof runbook](docs/launch-proof.md) | Built-in |
| **Launch proof E2E** | Zero-token cloud proof: issue → PR → receipt → green checks; writes `.vibe/launch-proof.json` | Actions → **Launch Proof (zero-token E2E)**; [green run](https://github.com/afelin/coreward/actions/runs/29321223413) on [issue #36](https://github.com/afelin/coreward/issues/36) | **Claimable** |

### Powerful combinations

| Combo | Flow |
| --- | --- |
| **Nocode loop** | [Nocode Quickstart](docs/nocode-quickstart.md) → Vibe Request issue → forever loop → receipt → merge (optional `vibe/auto-merge`) — no terminal |
| **Cursor + MCP** | `npm run activate` + MCP + `.cursor/skills/Coreward` → live mandate/gate checks while you edit |
| **Zero-token chores** | Match gate in `gates.json` + depth 0–2 → deterministic patch, no API keys |
| **High-trust ship** | TaskBond + Signed Mandate/Ward + gauntlet + replay + promotion gate + attribution → audit-ready PR with capsule receipt |

### Who it's for

| Persona | Why |
| --- | --- |
| **Solo vibe coder** | Delegate bounded changes overnight; review 2–4 files instead of whole-repo diffs |
| **Agentic engineer** | One constitution catalog + MCP — same rules in Cursor, Actions, and custom agents |
| **Compliance / security MVP** | Capsule hashes, replay, and gauntlet turn “the AI did it” into evidence |
| **Enterprise operator** | Mandates, approvers, depth dial, and required checks on `main` |

See also the [Persona matrix](#persona-matrix) below for one-step activation paths.

### Module contribution map

| Module | Contribution |
| --- | --- |
| **TaskBond** | Declares the file set a run may touch |
| **House `mandates.json`** | Standing forbids / approval prefixes for every run |
| **SignedMandate** | Session budget; cannot widen house forbids (AND) |
| **Ward** | Enforce-before-execute on engine path when Mandate present |
| **Context shrink** | Filters planner/lesson paths to Mandate constraints |
| **Zero-token gates** | Deterministic patches preferred when paths match |
| **Capsule** | Tamper-evident run fingerprint |
| **HPURL** | Proof link fragment for local/comment verify |
| **Pearl** | Ops narrative over heal / DENY deltas |
| **Claim ledger** | Marketing claims ↔ asserts; unclaimed IDs never pass |
| **Agent identity (today)** | `src/agent-id` + `authorized_actor` + Assisted-by (+ principals)—not eIDAS; see [docs/agent-identity.md](docs/agent-identity.md) |

### Honest limits

- **Branch protection on private free repos** — enabling required checks on `main` needs admin scope; use GitHub UI (Settings → Branches) when the API returns 403. See [Launch Proof runbook](docs/launch-proof.md#manual-ops-after-proof-passes).
- **Hosted Pages receipts** — public proof base is `https://afelin.github.io/coreward/proof` (`DEFAULT_PROOF_BASE`); override with `VIBE_PROOF_BASE` when mirroring. Local `proof/index.html` still works offline.
- **IDE Ward** — Edit/Shell and soft MCP paths can bypass Ward; do not claim universal IDE interception (`ide_ward_interceptor` stays unclaimed).
- **Receipts ≠ certification** — capsules and `ward_decision` events are tamper-evident evidence, not legal or auditor certification.

## One-step activation

Requires **Node.js ≥ 22** ([`.nvmrc`](.nvmrc) pins `22`; matches `package.json` `engines`).

```bash
git clone https://github.com/afelin/coreward.git && cd coreward
nvm use          # or: nvm install 22 && nvm use
npm run activate
```

`npm run activate` auto-runs `nvm install` / `nvm use` when nvm is available and your shell is below v22. It then runs `npm run check`, zero-token cloud-loop smoke, MCP gate smoke, exports schemas to `.vibe/schemas.json`, and writes `.vibe/activated.json` with vows attestation.

## Documentation

| Doc | Audience |
| --- | --- |
| [Solo Vibe Coder Guide](docs/solo-vibe-coder-guide.md) | Solo founders — activate, first issue, operator commands |
| [Plain-Language Briefing](docs/plain-language-briefing.md) | Stakeholders — capabilities, problems solved, VFA assessment |
| [Agent Protocol](docs/agent-protocol.md) | Agents & integrators — MCP, TaskBond, schemas, gates |
| [Agent Adapter](docs/agent-adapter.md) | Any framework — manifest, MCP + issue ingress paths |
| [Nocode Quickstart](docs/nocode-quickstart.md) | Nocode users — issue → PR → receipt, no terminal |
| [Launch Proof](docs/launch-proof.md) | Operators — zero-token E2E runbook + artifact slots |
| [Platform Enforcement](docs/platform-enforcement.md) | Operators — deploy-from-capsule, GitHub Pro-free enforcement |
| [Public surface](docs/PUBLIC.md) | What is public vs `internal/` (RISE export) |
| [OS Phases](docs/os-phases.md) | Promotion phase diagram (auto-derived from machine) |
| [GitHub App](docs/github-app.md) | Enterprise — required checks, branch protection |

## Persona matrix

| Persona | One step | Daily use |
| --- | --- | --- |
| **Solo vibe coder** | [Solo guide](docs/solo-vibe-coder-guide.md) → `npm run activate` | Vibe Request issue + `vibe/run` label |
| **Agentic engineer** | activate + enable MCP in Cursor | `.cursor/skills/Coreward` enforces vows |
| **Agents** | `docs/agent-protocol.md` + schemas URL | `evaluate_mandate`, `resolve_gate`, catalog JSON |
| **Enterprise** | Install App doc + required check branch rule | Green **Coreward Promotion Gate** + capsule hash on PR |

## 5-minute adoption

```bash
git clone https://github.com/afelin/coreward.git && cd coreward
bash runs/adopt.sh .

# Or install into an existing repo:
bash runs/adopt.sh /path/to/your-repo
```

`runs/adopt.sh` runs install (if needed), `npm install`, and `npm run activate` — exports `.vibe/schemas.json`, `.vibe/agent-adapter.json`, and `.vibe/activated.json`.

```bash
# Zero-token smoke (no API keys)
ISSUE_NUMBER=3 ISSUE_TITLE="cloud loop" ISSUE_BODY="src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts" npm run local-issue

# Launch readiness preflight
npm run launch:readiness

# Label-driven depth: vibe:plan-only → 1, vibe:safe → 2, vibe:ship → 4
# Or VIBE_DEPTH: 0 explain, 1 plan, 2 safe files, 3 tests, 4 deploy, 5 protected /approve

# MCP in Cursor (see mcp.json)
npm run gate:mcp

npm run scoreboard
npm run constitution:export
npm run constitution:serve   # local verify API :8787
```

[![vibe-validate](https://img.shields.io/badge/action-vibe--validate-blue)](action.yml)

Install bundle only: `bash runs/install-into-repo.sh /path/to/repo`

## Launch proof

Zero-token E2E on private GitHub: issue → PR → receipt → green **Coreward Promotion Gate**.

```bash
npm run launch:readiness          # local file + gauntlet + MCP checks
# Actions → Launch Proof (workflow_dispatch) → .vibe/launch-proof.json
npm run launch:scar               # GTM snippet from proof artifacts
```

When `.vibe/launch-proof.json` exists, it records `issueNumber`, `prUrl`, `capsuleHash`, and `checksGreen`. See [Launch Proof runbook](docs/launch-proof.md). Public repo + Pages deferred until private smoke passes.

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

- **House mandates:** `src/policy/mandates.json` — standing forbidden/approval prefixes, max attempts
- **Signed Mandate:** `.vibe/active_mandate.json` (via `npm run mandate:issue`) — session budget; principals in `.vibe/principals.json`; [ward-security.md](docs/ward-security.md)
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

Full walkthrough: **[Solo Vibe Coder Guide](docs/solo-vibe-coder-guide.md)**

1. `npm run activate` on `main`
2. Enable MCP (`mcp.json` / `.cursor/mcp.json`) + `.cursor/skills/Coreward`
3. Open a [Vibe Request](.github/ISSUE_TEMPLATE/vibe-request.yml) issue with **2–4 bound file paths**, intent, and outcome
4. Add label `vibe/run` (and `vibe:ship` for deploy depth)
5. Watch **Sovereign OS Event Bus** workflow; green **Coreward Promotion Gate** on the PR
6. Operator: `/status`, `/approve` (protected paths), `/retry`, `/rollback` via issue comments
7. Optional: verify determinism with `npm run replay -- . <runId>` (see run folder under `.runs/`)

Daily local runs at depth ≥ 3 default to `VIBE_TEST_MODE=subgraph` (changed-file vitest). Override with `VIBE_TEST_MODE=full` for full-suite parity.

PR commits that mention AI tooling must include an `Assisted-by:` trailer (enforced by `tdd-attribution.yml`).

## Optional auto-merge on green CI

Add label **`vibe/auto-merge`** to a PR (or set repo variable **`VIBE_AUTO_MERGE=1`** for repo-wide opt-in). When branch protection checks and **Coreward Promotion Gate** are green, `.github/workflows/vibe-auto-merge.yml` squash-merges the PR.

```bash
npm run pr:auto-merge -- 15 --dry-run   # verify readiness locally
```

Skill: `.cursor/skills/vibe-auto-merge`

## TabDab / Lovable profile

For [tabdab-link-proof](https://github.com/afelin/tabdab-link-proof) or other Lovable apps:

```bash
# In target repo after install:
cp .env.example .env   # set VIBE_PROJECT_PROFILE=tabdab

# Or install the coreward / Coreward layer into an existing repo:
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
