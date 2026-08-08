# Warm catalog — after first green PR

Day-1 path: [start-here.md](./start-here.md) (triad) · [operate.md](./operate.md) · [ward-security.md](./ward-security.md).

This page is the full capability catalog moved off the cold README. Prefer the triad above until you have one green PR.

**Bootstrap:** recommended CLI is **`npm run coreward:init`**. `npm run activate` is a **legacy alias** kept for compatibility (same adopt path via `runs/activate.sh` / `runs/adopt.sh`).

---

## Capabilities

Canonical day-1 path and Ward boundary: [start-here.md](./start-here.md) · [ward-security.md](./ward-security.md). Deeper walks: [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) · [Nocode Quickstart](./nocode-quickstart.md) · [Agent Protocol](./agent-protocol.md).

| Capability | What you get | How to activate | Status |
| --- | --- | --- | --- |
| **TaskBond** | Sealed work order — intent, outcomes, bound files (max 16); scope creep blocked at seal time | [Vibe Request](../.github/ISSUE_TEMPLATE/vibe-request.yml) issue with 2–4 paths; MCP `seal_bond` / `validate_bond` | Built-in |
| **House mandates** | Standing law: forbidden prefixes, approval prefixes, max attempts, approver allowlist | Edit `src/policy/mandates.json`; MCP `evaluate_mandate` before proposing paths | Built-in |
| **Signed Mandate + Ward** | Opt-in session contract (budget); Ward ALLOW/DENY on engine path; context shrink when verified | `npm run mandate:issue` → `.vibe/active_mandate.json`; `npm run ward:doctor`; principals in `.vibe/principals.json` — [ward-security.md](./ward-security.md) | Built-in |
| **Zero-token gates** | Deterministic patch templates — no LLM, $0 cost for templated chores | Match issue title/body to `src/release-gate/gates.json`; MCP `resolve_gate` / `list_gates` | Built-in |
| **VIBE_DEPTH dial** | Volume knob 0–5: explain → plan → safe files → tests → deploy → protected `/approve` | `VIBE_DEPTH` env or labels `vibe:plan-only` / `vibe:safe` / `vibe:ship` | Built-in |
| **Capsule + receipt** | Tamper-evident run fingerprint (`capsuleHash`, `vowsHash`) + **View proof** HPURL in issue comment (not a certificate) | Runs automatically; inspect `proof/index.html` or MCP `validate_capsule` | Built-in |
| **TaskBond gauntlet** | 32/32 adversarial bond + mandate scenarios; baseline ratchet blocks guard drift | `npm run eval:bond`; wired into **Coreward Promotion Gate** preflight | Built-in |
| **Replay gate** | Flight recorder — re-run `events.ndjson`; mismatch blocks promotion | `npm run replay -- . <runId>`; CI replay determinism check on PRs | Built-in |
| **Anti-rot** | Scoped context (capped snippets, no repomix fallback), bond compliance (paths outside plan ∪ bound blocked), evidence-linked lessons | MCP `build_scoped_context`, `recall_lessons`; lessons in `.evomem/lessons.ndjson` | Built-in |
| **MCP tools** | Live rulebook in Cursor: `authorize_write` / `preflight` first, then gates, bonds, mandates, schemas, capsule verify | Enable `coreward-release-gates` (alias `vibe-release-gates`) in `mcp.json`; `npm run gate:mcp` smoke | Built-in |
| **Forever loop** | GitHub issue → plan → codegen → verify → PR + cockpit comment; runs while you sleep | Label `vibe/run` on issue; **Coreward Forever Loop** workflow | Built-in |
| **Cockpit + explain dial** | Issue/PR comment dashboard: depth, hashes, next action, decision explain (off/short/long/expand) | Auto-posted on runs; labels `vibe:explain-short` / `vibe:explain-long` or `VIBE_EXPLAIN` | Built-in |
| **Operator commands** | Human steering without terminal: `/status`, `/approve`, `/continue`, `/retry`, `/rollback`, `/details`, `/troubleshoot` | Reply on the issue; see [Agent Protocol](./agent-protocol.md) | Built-in |
| **Option B `/approve`** | When Mandate path is on, CI may issue a short-lived signed override Mandate (`github-ci-bot-override`); human is audit-only (`approving_comment_actor`)—not human crypto | Issue comment `/approve` with runner key available | Built-in |
| **Promotion gate** | **Coreward Promotion Gate** — gauntlet green, bond valid, capsule/replay OK before merge | Require check on `main`; runs on vibe PRs via `vibe-pr-gate.yml` | Built-in |
| **Assisted-by attribution** | PR blocked if commits mention AI tools without `Assisted-by:` trailer | Automatic on PRs; engine tags its own commits | Built-in |
| **Auto-merge** | Squash-merge when branch protection + promotion gate green | Label `vibe/auto-merge` or repo var `VIBE_AUTO_MERGE=1` | Built-in |
| **Init / adopt** | Recommended: `npm run coreward:init`. Legacy alias: `npm run activate` (kept for compat) | `npm run coreward:init` or `bash runs/adopt.sh /path/to/repo` | Built-in |
| **`launch:readiness`** | Local preflight: workflows, gauntlet vs baseline, MCP smoke, proof page | `npm run launch:readiness` on `main` | Built-in |
| **`launch:ship`** | One-command ship after readiness green | `npm run launch:ship` — see [Launch Proof runbook](./launch-proof.md) | Built-in |
| **Launch proof E2E** | Zero-token cloud proof: issue → PR → receipt → green checks; writes `.vibe/launch-proof.json` | Actions → **Launch Proof (zero-token E2E)**; [green run](https://github.com/afelin/coreward/actions/runs/29321223413) on [issue #36](https://github.com/afelin/coreward/issues/36) | **Claimable** |

### Powerful combinations

| Combo | Flow |
| --- | --- |
| **Nocode loop** | [Nocode Quickstart](./nocode-quickstart.md) → Vibe Request issue → forever loop → receipt → merge (optional `vibe/auto-merge`) — no terminal |
| **Cursor + MCP** | `npm run coreward:init` + MCP + `.cursor/skills/coreward` → live mandate/gate checks while you edit |
| **Zero-token chores** | Match gate in `gates.json` + depth 0–2 → deterministic patch, no API keys |
| **High-trust ship** | TaskBond + Signed Mandate/Ward + gauntlet + replay + promotion gate + attribution → audit-ready PR with capsule receipt |

### Who it's for

| Persona | Why |
| --- | --- |
| **Solo vibe coder** | Delegate bounded changes overnight; review 2–4 files instead of whole-repo diffs |
| **Agentic engineer** | One constitution catalog + MCP — same rules in Cursor, Actions, and custom agents |
| **Compliance / security MVP** | Capsule hashes, replay, and gauntlet turn “the AI did it” into evidence |
| **Enterprise operator** | Mandates, approvers, depth dial, and required checks on `main` |

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
| **Agent identity (today)** | `src/agent-id` + `authorized_actor` + Assisted-by (+ principals)—not eIDAS; see [agent-identity.md](./agent-identity.md) |

### Honest limits

- **Branch protection on private free repos** — enabling required checks on `main` needs admin scope; use GitHub UI (Settings → Branches) when the API returns 403. See [Launch Proof runbook](./launch-proof.md#manual-ops-after-proof-passes).
- **Hosted Pages receipts** — public proof base is `https://afelin.github.io/coreward/proof` (`DEFAULT_PROOF_BASE`); override with `VIBE_PROOF_BASE` when mirroring. Local `proof/index.html` still works offline.
- **IDE Ward** — Edit/Shell and soft MCP paths can bypass Ward; do not claim universal IDE interception (`ide_ward_interceptor` stays unclaimed).
- **Receipts ≠ certification** — capsules and `ward_decision` events are tamper-evident evidence, not legal or auditor certification.

## Use only what you need

Coreward is compositional — start at Tier 1; add forever/Ward only if you want overnight issue→PR or session budgets. Same monorepo; enable slices, not separate packages.

| Tier | What | Forever required? |
| --- | --- | --- |
| 1 | MCP `authorize_write` / `preflight` + `resolve_gate` / house `evaluate_mandate` | No |
| 2 | TaskBond + house `mandates.json` | No |
| 3 | `coreward:init` (or legacy `activate`) + attribution / PR gate workflows | Actions yes; forever no |
| 4 | Forever loop (`vibe/run`) | Yes |
| 5 | Signed Mandate + Ward STRICT + principals | Promote path / CI |
| 6 | `savings:attest` after gated weeks | No (CLI) |

Ladder + install: [adopt](https://afelin.github.io/coreward/adopt/) · host packs: [host-packs.md](./host-packs.md) · local-first: [local-first-savings.md](./local-first-savings.md).

## Deeper walks

| Doc | Audience |
| --- | --- |
| [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) | Solo founders — init, first issue, operator commands |
| [Plain-Language Briefing](./plain-language-briefing.md) | Stakeholders — capabilities, problems solved |
| [Agent Protocol](./agent-protocol.md) | Agents & integrators — MCP, TaskBond, schemas, gates |
| [Agent Adapter](./agent-adapter.md) | Any framework — manifest, MCP + issue ingress |
| [Nocode Quickstart](./nocode-quickstart.md) | Issue → PR → receipt, no terminal |
| [Launch Proof](./launch-proof.md) | Zero-token E2E runbook |
| [Platform Enforcement](./platform-enforcement.md) | Deploy-from-capsule, GitHub Pro-free enforcement |
| [Public surface](./PUBLIC.md) | What is public vs `internal/` |
| [Host packs](./host-packs.md) | Cursor / Claude Code / OpenClaw / Hermes |
| [Local-first savings](./local-first-savings.md) | Bound context, gate hits, `savings:attest` |
| [Compare: Cursor rules](./compare-cursor-rules.md) | AGENTS.md / rules alone vs Coreward |
| [OS Phases](./os-phases.md) | Promotion phase diagram |
| [GitHub App](./github-app.md) | Enterprise — required checks, branch protection |
