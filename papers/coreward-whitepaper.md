# Coreward: Portable Promotion Primitives for Agent-Written Code

**Technical white paper (claim-safe)**  
**Version:** `2.0.0`  
**Date:** `2026-08-07`  
**Source SHA:** `1b84892a17229e24b7237bfa0e87cb6565e1477d` — post-uptake sync tree; update to the next publish commit SHA when tagged  
**How to cite:** see [How to cite](#how-to-cite) and repository root [`CITATION.cff`](../CITATION.cff)

> **Honesty note.** This document describes free open-source software mechanisms that run on the operator’s own GitHub repository and CI. It does not claim certification, legal compliance, absolute percentages, or commercial product tiers. Capsules are **tamper-evident**, not tamper-proof. Hosted receipt verify and live CyberReady signed buyer proof remain **unclaimed** until those products exist. An optional signed **Mandate** (session budget) enables engine-path **Ward** checks on CI/promote when present; IDE Edit/Shell and out-of-band MCP soft paths can still bypass Ward—product claim is limited to *CI/promote cannot move without Ward when a Mandate is on*, not universal IDE interception.

**In plain terms:** Coreward is a **promotion gate**—models may propose changes; house rules and automated checks decide what may land in Git. A signed **Mandate** is a session work-order (budget); **Ward** is the CI/promote check that enforces it when present. Capsule and `ward_decision` **receipts are evidence, never authorization**—promote always re-verifies.

---

## Abstract

Coreward is a **promotion gate** for AI-assisted software change: generative models may propose artifacts; house rules (vows, house mandates, bonds, gates) and automated checks decide what may land in Git. The portable core is a set of OSS primitives—TaskBond, house mandate evaluation, optional signed **Mandate** (session contract) with engine-path **Ward**, zero-token release gates, a depth dial, forever-loop automation, capsules with HPURL proof links, deterministic replay, an adversarial gauntlet, MCP tool surfaces, light heal/Pearl operators, and Assisted-by attribution—that make agent work **bounded, replayable, and evidence-bearing**.

The engine is **regulation-agnostic**. Optional posture packs are **house-rule overlays** (path forbids and approval prefixes). They are not NIS2, CRA, or any statute. An optional CyberReady bridge is documented as **Planned** only: when absent it fail-opens and does not block promotion.

---

## 1. Problem statement

Coding agents expand the volume of proposed diffs faster than review and policy can keep up. Common failure modes:

1. **Scope creep** — a request for one file becomes a multi-directory rewrite.
2. **Policy bypass** — rules that live in one IDE are ignored by the next agent or by CI-only workflows.
3. **Unverifiable history** — “the model did it” without a replayable record or fingerprint.
4. **Silent guardrail rot** — promotion checks pass while refusal behavior quietly weakens.
5. **Opaque authorship** — AI assistance is unmarked in commit history.

Coreward addresses these with **structural** controls (bonds, mandates, gates) and **evidence** (capsule hash, event log replay, gauntlet baseline), not with marketing guarantees.

---

## 2. Design principles

| Principle | Meaning in this codebase |
|-----------|---------------------------|
| Generative proposes; vows decide | Models emit candidate artifacts; `VOWS.md` / `src/constitution/vows.json`, mandates, and tests authorize promotion |
| Portable OSS | Run on the operator’s GitHub Actions and local Node ≥ 22; no paywalled Aha path |
| Claim-safe language | Prefer “blocks,” “hashes,” “replays,” “fail-open”; avoid certification and absolute efficacy claims |
| Regulation-agnostic core | Legal statutes are not hard-wired into the OS machine; posture packs overlay house rules |
| Evidence over narrative | Prefer capsules, gauntlet results, and launch-proof artifacts over slogans |

Invariant (from vows): **No promotion without green** typecheck and tests; forbidden prefixes are never written; catalog parse precedes disk write; planner output matches `ExecutionDag`.

---

## 3. Architecture overview

```text
Any agent (Cursor / Claude / OpenCode / Kimi / …)
        │
        ▼
  authorize_write ──► house AND Mandate pathFilter AND AgentId budget
        │              ticket_id (Coreward Mode) · prefer_gate?
        ▼
  TaskBond seal ──► house mandate eval (base + optional posture pack)
        │              ▲ AND SignedMandate (session) when present
        ▼
  Ward assert (engine path only, if Mandate loaded)
        │
        ▼
  Zero-token gate match? ──yes──► deterministic patch ($0)
        │ no
        ▼
  Depth-capped plan / codegen / verify  (context shrink if Mandate)
        │              optional private/on-prem model slot
        ▼
  Capsule + events.ndjson (incl. ward_decision) + HPURL comment
        │              lessons → .evomem (local IP)
        ▼
  Replay + gauntlet + attribution + Coreward Promotion Gate
        │
        ▼
  Git promotion (optional auto-merge when checks green)
```

Constitution artifacts live under a Zod catalog (`@xmachines/play-*` + local schemas). Structured outputs that fail schema validation do not promote.

### Module contribution map (brief)

| Module | Contribution |
|--------|----------------|
| **`authorize_write`** | One-call preflight for any agent; mints ticket; prefers zero-token gate |
| **Coreward Mode** | Fail-closed forever codegen/patch/promote without ticket or Mandate (not an IDE kernel sandbox) |
| TaskBond | Declares the file set a run may touch |
| House `mandates.json` | Standing forbids / approval prefixes |
| SignedMandate | Session work-order/budget; cannot widen house forbids |
| Ward | Enforce-before-execute on engine path when Mandate present |
| **AgentId** | Portable actor profile; gels via Mandate `authorized_actor` |
| Context shrink | Filters planner/lesson paths to Mandate constraints |
| Zero-token gates | Deterministic patches (≥12); preferred when paths ⊆ a gate |
| Capsule / HPURL | Tamper-evident fingerprint + proof link fragment |
| Local lessons | `.evomem/lessons.ndjson` — org scar tissue / retrieval “weights” on disk |
| Pearl | Ops narrative over heal/DENY deltas |
| Claim ledger | Claims ↔ asserts; `ide_ward_interceptor` stays unclaimed |

---

## 4. TaskBond

A **TaskBond** is a sealed work order: intent (bounded length), expected outcomes, and an explicit list of **bound files** (hard cap, currently 16). Seal and validate flows are available via CLI (`npm run bond:seal`) and MCP (`seal_bond`, `validate_bond`).

At seal and preflight time, the engine rejects bonds that violate house mandates (forbidden prefixes, approval-required paths without operator consent, oversized scope). When a verified SignedMandate is loaded, bound paths must also sit inside Mandate path constraints. Scope outside the plan ∪ bound set is blocked by bond-compliance checks during the run.

**What a bond proves:** the run was authorized against a declared file set.  
**What a bond does not prove:** correctness of business logic, security of dependencies, or regulatory compliance.

---

## 5. House mandates, Signed Mandate, Ward, and zero-token gates

**House mandates** (`src/policy/mandates.json`, MCP `evaluate_mandate`) are standing law: forbidden path prefixes, approval prefixes, max attempts, approver allowlist. High-risk paths require operator `/approve` on the controlling issue.

A **Signed Mandate** (catalog `SignedMandate`, file `.vibe/active_mandate.json`) is an opt-in **session contract (budget)**—paths, allowed Ward actions, optional `max_depth`, expiry, and `authorized_actor`—signed Ed25519 and verified against a principals trust file. It is a work-order for the run, not a statement of AI ethics. Absent the file ⇒ legacy house-rules-only behavior (compat). House rules **AND** Mandate: the Mandate cannot widen house forbids.

**Ward** enforces ALLOW/DENY before bond seal, codegen, patch apply, and promote **on the engine path** when a Mandate is present. Decisions append as `ward_decision` receipts in `events.ndjson`. Receipts never authorize promote—promote re-verifies the Mandate live. Product claim: *CI/promote cannot move without Ward when a Mandate is on.* IDE Edit/Shell and soft MCP paths can still bypass Ward—do not claim universal IDE interception. Operator runbook: `docs/ward-security.md`.

**Option B `/approve`:** when the Mandate path is active and a runner key is available, `/approve` may mint a short-lived CI-signed override Mandate (`authorized_actor=github-ci-bot-override`). The human who typed the comment is recorded as `approving_comment_actor` for audit only—this is **not** human cryptographic signature.

**Zero-token gates** (`src/release-gate/gates.json`, MCP `resolve_gate` / `list_gates`) match issue title/body to deterministic patch templates (≥12 chores). Matched chores need no LLM call—by construction, token cost for those templates is zero. Agents call `authorize_write` (which may return `prefer_gate`) and/or `resolve_gate` before generative codegen.

**`authorize_write` / Coreward Mode.** One MCP+CLI contract wraps house `evaluate_mandate` AND Signed Mandate `pathFilter` (when present) AND AgentId effective budget, returning `{ ok, ticket_id, paths, reason, prefer_gate? }`. With Coreward Mode on (`.vibe/coreward-mode.json` or `COREWARD_MODE=1`), the forever engine path fail-closes without a valid ticket or verified Mandate. Honesty: this is **not** a kernel IDE sandbox; Edit/Shell outside the engine path remain out of band. Host packs: [docs/host-packs.md](../docs/host-packs.md).

---

## 5b. Local-first savings & private-model ready

Coreward does **not** train or host foundation weights. It **reduces what you must send** to any model and **keeps governance + memory local** so a future private/on-prem model plugs into the same `authorize_write` → Ward → promote path.

**Day one:** match gates before LLM; use Mandate/AgentId path and context caps; set `VIBE_DEPTH`; read cockpit **Savings** (`gate_hit`, `contextChars`, `tokensEstimate`).

**Local “weights” (IP that stays yours):** lessons in `.evomem/lessons.ndjson`, capsules/events under `.runs/`, Mandates/AgentId/house law under `.vibe/` and `src/policy/`, and the gate catalog. Policy is portable when inference moves in-house.

**Claim-safe:** when gates miss, bounded prompts may still leave the building—Coreward **reduces and bounds** exposure; it does not claim absolute zero IP egress. Operator checklist: [docs/local-first-savings.md](../docs/local-first-savings.md). Export local ROI with `npm run savings:attest` (hash-chained `gate_hit` / `contextChars` / `tokensEstimate`); hosted attestation verify remains **unclaimed**.

### License and local-runtime complementarity

Coreward ships under **FSL-1.1-Apache-2.0** ([`LICENSE`](../LICENSE), FAQ [`LICENSE.md`](../LICENSE.md)): free for internal use on your runners and agents; Competing Use (including offering a hosted substitute for Coreward) is excluded until the Change Date, after which Apache-2.0 applies automatically.

**Complementarity (claim-safe):** OpenClaw, Hermes, and local/open models (e.g. Ollama) are **customers** of Coreward MCP—not runtimes Coreward absorbs. Policy teams can allow local agents **because** writes are Mandated (`authorize_write`) and CI Ward re-verifies promote. Coreward does not claim zero IP egress, IDE sandboxing, or legal certification.

### Compositional adoption

Coreward is one monorepo with progressive enablement—not separate publishable packages. Start at Tier 1; add forever or Ward only if you need overnight automation or session budgets.

| Tier | Slice | Forever required? |
| ---: | --- | --- |
| 1 | MCP `authorize_write` + `resolve_gate` / house `evaluate_mandate` | No |
| 2 | TaskBond + house `mandates.json` | No |
| 3 | `activate` + attribution / PR gate workflows | Actions yes; forever no |
| 4 | Forever loop (`vibe/run`) | Yes |
| 5 | Signed Mandate + Ward STRICT + principals | Promote path / CI |
| 6 | `savings:attest` after gated weeks | No (CLI) |

Operator entry: [docs/start-here.md](../docs/start-here.md) · adopt ladder: [site/adopt](../site/adopt/).

---

## 6. Depth dial (`VIBE_DEPTH`)

Autonomy is a **volume knob**, not an all-or-nothing switch:

| Depth | Typical meaning |
|------:|-----------------|
| 0 | Explain only |
| 1 | Plan |
| 2 | Safe file edits |
| 3 | Tests + code (common default) |
| 4 | Deploy-oriented work |
| 5 | Protected paths; requires `/approve` |

Set via environment `VIBE_DEPTH` or labels such as `vibe:plan-only`, `vibe:safe`, `vibe:ship`. Depth also caps the heal ladder (more restrictive of depth vs `VIBE_HEAL_MAX_LEVEL` wins). Depth 0–1 keeps heal at zero-token levels.

---

## 7. Forever loop

With label `vibe/run` on a Vibe Request (or starter) issue, GitHub Actions drive: plan → codegen (when needed) → verify → PR + cockpit comment. Operators steer with issue comments (`/status`, `/approve`, `/continue`, `/retry`, `/rollback`, `/details`, `/troubleshoot`) without requiring a local terminal for the happy path.

The loop is **automation on the operator’s GitHub**, not a hosted multi-tenant platform. Availability and retention follow GitHub’s product terms for that repository.

---

## 8. Capsule, vows hash, and HPURL

Each verified run produces a **capsule**: a cryptographic fingerprint (`capsuleHash`) over run artifacts, plus `vowsHash` (SHA-256 of canonical vows JSON). Changing recorded material invalidates the fingerprint relative to the published capsule—hence **tamper-evident**. Together with HPURL links and `ward_decision` events, these form a **receipt trail**—evidence, not certification.

**Claim boundary:** hashes detect mismatch between claimed and recomputed digests. They do not make storage media physically “tamper-proof,” nor do they prove that upstream GitHub or CI logs were unaltered before encapsulation.

**HPURL** (proof link) encodes run id, capsule hash, vows hash, and optional `space=` (active legal-space id) in a URL fragment so parameters need not hit a proof server. Local inspection uses `proof/index.html` and MCP `validate_capsule`. Public hosted verify URLs may be deferred until Pages is enabled; until a hosted verify product ships, that capability stays **unclaimed** in the project claim ledger.

---

## 9. Deterministic replay

Runs append an event sequence (`events.ndjson`). Before promotion, `npm run replay` re-executes the recorded flight and compares ending fingerprints. Mismatch blocks promotion. CI can wire the same check on PRs.

Replay is a **determinism and integrity check for the recorded machine path**, not a proof that the surrounding CI runner or third-party Actions marketplace steps were free of compromise (see [Threat model](#14-threat-model)).

---

## 10. Gauntlet

The TaskBond gauntlet (`npm run eval:bond`) executes a fixed adversarial suite (bond + mandate scenarios, including legal-space overlays). Results are compared to a locked baseline; drift that weakens refusal behavior fails the suite. The suite is wired into **Coreward Promotion Gate** preflight so weakening guards blocks merge when the check is required on the branch.

Coverage is **exactly the scenarios in the suite**. Expanding the suite expands covered refusal classes; uncovered attack classes are not implied safe.

A separate red-team pack exercises additional adversarial cases for launch readiness; treat results as regression evidence for those cases, not as a certification exam.

---

## 11. MCP surface

The `coreward-release-gates` MCP server (alias `vibe-release-gates`) exposes live rulebook tools to Cursor and other MCP clients, including (non-exhaustive): `authorize_write`, `coreward_mode_status`, `evaluate_mandate`, `resolve_gate`, `list_gates`, `seal_bond`, `validate_bond`, `constitution_schemas`, `validate_capsule`, `build_scoped_context`, `recall_lessons`, `list_stackables`, `set_legal_space`, `get_active_stack`, `resolve_agent_profile`, and optional `cyberready_validate_delta`.

Smoke: `npm run gate:mcp` / `npm run coreward:authorize`. The same constitution applies whether the agent is in-IDE or in Actions—reducing “rules only in one tool” bypass, provided operators enable the MCP and follow the skill vows. Adapter manifest v2 lists `required_tools: ["authorize_write"]`.

---

## 12. Heal ladder and Pearl (light)

**Heal** (orchestrator troubleshoot path) escalates only as far as dials allow:

| Level | Role |
|------:|------|
| L0 | Deterministic: gates, feedback cache read, bond validate, lessons, preflight/replay/readiness |
| L1 | Known remediation from feedback cache (still zero-token) |
| L2 | One bounded LLM pass + one critic pass (when depth and heal dial allow) |
| L3 | Human / guide escalation |
| L4 | Offline autoresearch — not hot path |

Default GitHub `/troubleshoot` caps at L1. Heal outcomes can be recorded in run metrics (`healLevel`, `deterministicFix`).

**Pearl** is a compact weekly summary of heal/intervention deltas for operators (first-pass green, L0/L1 heal share, token medians, intervention stages). It is an **ops narrative over measured deltas**, not a performance guarantee.

---

## 13. Assisted-by attribution and AgentId

On pull requests, an attribution audit blocks merge when commit messages mention AI tooling without an `Assisted-by:` trailer. The engine tags its own commits `Assisted-by: coreward`.

**AgentId** (`src/agent-id`) is the portable actor-profile primitive shared by Ward, MCP, and CI. Session identity on a Signed Mandate is the string field `authorized_actor`, resolved via `resolveProfile(actor)` against the principals trust file (optional path/budget caps tighten only). That is **authorized actor + optional efficiency defaults**, not organizational PKI and not eIDAS QWAC/QES conformity. A lean interoperable “Agent Binding” (key + optional attestation ref) may extend principals later without claiming legal identity assurance. Ward imports AgentId; AgentId must not import Ward. Operator note: [docs/agent-identity.md](../docs/agent-identity.md).

**Claim boundary:** enforcement is mechanical on **mentioned** AI tools in commit text for PRs that run the check. It does not detect silent omissions where no AI tooling is named.

---

## 14. Threat model

### Assets

- Integrity of promoted Git history and bound file sets  
- Integrity of run capsules, vows attestation, and replay logs  
- Confidentiality of secrets in the operator’s repo and CI  
- Availability of the forever loop and required checks  

### Trust boundaries

| Boundary | Assumption | Residual risk |
|----------|------------|---------------|
| Operator workstation / agent IDE | Operator chooses models and MCP enablement | Malicious or misconfigured agents that skip MCP vows |
| Coreward code + vows | Reviewed and activated (`npm run activate`) | Bugs or incomplete gauntlet coverage |
| **GitHub** (Issues, Actions, Checks, API) | **Subprocessor for hosting, CI, and collaboration** | GitHub outages; compromised Actions; privileged token misuse; log retention policies outside this project |
| Optional external LLM APIs | Used only when depth/heal dials call them | Prompt injection, data exfiltration to providers |
| Optional CyberReady socket | Fail-open when not installed | Not a substitute for compliance tooling |

### Honesty: GitHub as subprocessor

Coreward **does not replace GitHub**. Issue text, Actions logs, PR metadata, and artifacts transit GitHub’s infrastructure under the repository owner’s GitHub agreement. Capsules and HPURLs improve **evidence legibility for governed runs**; they do not magically extend trust into GitHub’s control plane. Operators who need stronger independence must export proofs and retain copies outside GitHub.

### Out of scope (non-claims)

- Physical security of developer laptops  
- Supply-chain proof for every npm dependency  
- Formal verification of generated application code  
- Legal determination of NIS2/CRA (or any regime) compliance  

---

## 15. Posture packs ≠ law

Legal-space **stackables** (`src/policy/stackables/legal-spaces/`, MCP `list_stackables` / `set_legal_space`) overlay mandate deltas (extra forbids / approval prefixes) onto the base house rules at evaluation time. Packs such as `none`, `eu-nis2-cra`, and `us-baseline` are **named after postures humans associate with regimes**; they are **not** encodings of those laws, not auditor certifications, and not a substitute for counsel or a compliance program.

Selecting `eu-nis2-cra` does **not** mean “NIS2 compliant.” It means “apply this repository’s stricter path/approval overlay labeled for that posture.” Active selection is recorded in `.vibe/active-stack.json` and may appear on HPURL as `space=` for audit tagging only.

---

## 16. CyberReady — Planned only

| Capability | Public status |
|------------|---------------|
| Soft bridge `cyberready_validate_delta` via `CYBERREADY_SOCK` | Optional; **fail-open** with `not_installed` when absent — does not block mandate eval or promote |
| Live CyberReady-ready signed buyer proof / hosted signed audit export | **Planned** — remain **unclaimed** in the claim ledger until product exists |

Public status pages and this paper show **one Planned box** for CyberReady. Do not advertise “CyberReady-ready” proof until the ledger marks the corresponding claim pass.

---

## 17. Adopt into an existing repository

Portable primitive path (no greenfield requirement):

```bash
# From a clone of Coreward:
bash runs/adopt.sh /path/to/target-repo
# or, already installed in-tree:
bash runs/adopt.sh .
```

`adopt.sh` installs the bundle when needed (`runs/install-into-repo.sh`), runs `npm install`, then `npm run activate` (check, zero-token smoke, MCP smoke, schema export, vows attestation → `.vibe/activated.json`).

After adopt:

1. Enable branch protection / required **Coreward Promotion Gate** as appropriate for the target repo.  
2. Enable MCP from `mcp.json` (`coreward-release-gates`) for Cursor agents.  
3. Open a Vibe Request or Starter issue; label `vibe/run` for the forever loop (dual-read `vibe/*` labels).  
4. Optionally set legal space via MCP (`set_legal_space`) — house rules only.
5. Optionally enable Coreward Mode and require `authorize_write` before agent edits.

The Aha path (issue → PR + receipt, gauntlet, MCP, zero-token gates) is intended to remain free to run on the operator’s own infrastructure. Internal monetization notes, if any, are **not** part of this paper or the public site allowlist (see [`docs/rise-export.md`](../docs/rise-export.md)).

---

## 18. Limits and non-goals

- Not a codegen product; not a substitute for code review judgment.  
- Not a certification body; no absolute pass-rate marketing.  
- Not a platform-play narrative; this paper describes **software primitives**.  
- Hosted HPURL verify and live CyberReady buyer packaging: **out of claim** until built.  
- Branch protection on private free GitHub repos may require UI/admin steps outside the engine.  

---

## 19. How to cite

Preferred machine-readable citation: repository root [`CITATION.cff`](../CITATION.cff).

Plain-text form (fill version, date, and SHA at publish):

> Coreward contributors. *Coreward: Portable Promotion Primitives for Agent-Written Code*. Technical white paper, version 2.0.0 (2026-08-07). Source SHA: 1b84892a17229e24b7237bfa0e87cb6565e1477d. Available at: https://github.com/afelin/coreward

When citing a specific mechanism (bond, capsule, gauntlet), include the commit SHA so readers can resolve exact schemas and baselines.

---

## 20. Versioning and publish checklist

| Field | Policy |
|-------|--------|
| Version | Release tag or semver chosen at publish |
| Date | Calendar date of the published PDF/HTML |
| Source SHA | Full git commit SHA of the tree that was rendered |

Until a tagged release, cite the filled version/date/SHA in this paper and [`CITATION.cff`](../CITATION.cff). Update the Source SHA to the publish commit when the tree is tagged.

---

## Appendix A — Operator entry points

| Path | Entry |
|------|-------|
| Nocode | GitHub Vibe Request / Starter issue → `vibe/run` |
| Cursor | `npm run activate` + MCP + `.cursor/skills/coreward` |
| External agent | Adapter v2 + Agent Protocol + `authorize_write` |
| Evidence before storytelling | `npm run battery:prelaunch` (claim ledger honesty compiler) |

---

## Appendix B — Related in-repo docs

- [`docs/host-packs.md`](../docs/host-packs.md) — Cursor / Claude / OpenCode / OpenClaw / Hermes / Kimi  
- [`docs/local-first-savings.md`](../docs/local-first-savings.md) — day-one savings + local lessons as IP  
- [`LICENSE.md`](../LICENSE.md) — FSL FAQ (Change Date → Apache-2.0)  
- [`docs/start-here.md`](../docs/start-here.md) — five-minute paths  
- [`docs/ward-security.md`](../docs/ward-security.md) — Mandate–Ward invariant, STRICT checklist, Actions secrets  
- [`docs/agent-identity.md`](../docs/agent-identity.md) — AgentId gel rules and claims  
- [`docs/solo-vibe-coder-guide.md`](../docs/solo-vibe-coder-guide.md) — daily operator loop  
- [`docs/agent-protocol.md`](../docs/agent-protocol.md) — schemas and slash commands  
- [`docs/launch-proof.md`](../docs/launch-proof.md) — zero-token cloud proof runbook  
- [`docs/rise-export.md`](../docs/rise-export.md) — public vs internal export allowlist  
- [`VOWS.md`](../VOWS.md) — normative vows  

---

*End of white paper.*
