# vibe-engine-os: Portable Promotion Primitives for Agent-Written Code

**Technical white paper (claim-safe)**  
**Version:** `UNPUBLISHED` — replace with release tag at publish  
**Date:** `YYYY-MM-DD` — fill at publish  
**Source SHA:** `TO_BE_FILLED_AT_PUBLISH` — set to the git commit SHA of the published tree  
**How to cite:** see [How to cite](#how-to-cite) and repository root [`CITATION.cff`](../CITATION.cff)

> **Honesty note.** This document describes free open-source software mechanisms that run on the operator’s own GitHub repository and CI. It does not claim certification, legal compliance, absolute percentages, or commercial product tiers. Capsules are **tamper-evident**, not tamper-proof. Hosted receipt verify and live CyberReady signed buyer proof remain **unclaimed** until those products exist.

---

## Abstract

vibe-engine-os is a **promotion gate** for AI-assisted software change: generative models may propose artifacts; house rules (vows, mandates, bonds, gates) and automated checks decide what may land in Git. The portable core is a set of OSS primitives—TaskBond, mandate evaluation, zero-token release gates, a depth dial, forever-loop automation, capsules with HPURL proof links, deterministic replay, an adversarial gauntlet, MCP tool surfaces, light heal/Pearl operators, and Assisted-by attribution—that make agent work **bounded, replayable, and evidence-bearing**.

The engine is **regulation-agnostic**. Optional posture packs are **house-rule overlays** (path forbids and approval prefixes). They are not NIS2, CRA, or any statute. An optional CyberReady bridge is documented as **Planned** only: when absent it fail-opens and does not block promotion.

---

## 1. Problem statement

Coding agents expand the volume of proposed diffs faster than review and policy can keep up. Common failure modes:

1. **Scope creep** — a request for one file becomes a multi-directory rewrite.
2. **Policy bypass** — rules that live in one IDE are ignored by the next agent or by CI-only workflows.
3. **Unverifiable history** — “the model did it” without a replayable record or fingerprint.
4. **Silent guardrail rot** — promotion checks pass while refusal behavior quietly weakens.
5. **Opaque authorship** — AI assistance is unmarked in commit history.

vibe-engine-os addresses these with **structural** controls (bonds, mandates, gates) and **evidence** (capsule hash, event log replay, gauntlet baseline), not with marketing guarantees.

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
Issue / MCP / agent
        │
        ▼
  TaskBond seal ──► mandate eval (base + optional posture pack)
        │
        ▼
  Zero-token gate match? ──yes──► deterministic patch
        │ no
        ▼
  Depth-capped plan / codegen / verify
        │
        ▼
  Capsule + events.ndjson + HPURL comment
        │
        ▼
  Replay + gauntlet + attribution + Vibe Promotion Gate
        │
        ▼
  Git promotion (optional auto-merge when checks green)
```

Constitution artifacts live under a Zod catalog (`@xmachines/play-*` + local schemas). Structured outputs that fail schema validation do not promote.

---

## 4. TaskBond

A **TaskBond** is a sealed work order: intent (bounded length), expected outcomes, and an explicit list of **bound files** (hard cap, currently 16). Seal and validate flows are available via CLI (`npm run bond:seal`) and MCP (`seal_bond`, `validate_bond`).

At seal and preflight time, the engine rejects bonds that violate mandates (forbidden prefixes, approval-required paths without operator consent, oversized scope). Scope outside the plan ∪ bound set is blocked by bond-compliance checks during the run.

**What a bond proves:** the run was authorized against a declared file set.  
**What a bond does not prove:** correctness of business logic, security of dependencies, or regulatory compliance.

---

## 5. Mandates and zero-token gates

**Mandates** (`src/policy/mandates.json`, evaluated via MCP `evaluate_mandate`) encode house rules: forbidden path prefixes, approval prefixes, max attempts, approver allowlist. High-risk paths require operator `/approve` on the controlling issue.

**Zero-token gates** (`src/release-gate/gates.json`, MCP `resolve_gate` / `list_gates`) match issue title/body to deterministic patch templates. Matched chores need no LLM call—by construction, token cost for those templates is zero. Agents are expected to call `resolve_gate` before invoking generative codegen.

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

Each verified run produces a **capsule**: a cryptographic fingerprint (`capsuleHash`) over run artifacts, plus `vowsHash` (SHA-256 of canonical vows JSON). Changing recorded material invalidates the fingerprint relative to the published capsule—hence **tamper-evident**.

**Claim boundary:** hashes detect mismatch between claimed and recomputed digests. They do not make storage media physically “tamper-proof,” nor do they prove that upstream GitHub or CI logs were unaltered before encapsulation.

**HPURL** (proof link) encodes run id, capsule hash, vows hash, and optional `space=` (active legal-space id) in a URL fragment so parameters need not hit a proof server. Local inspection uses `proof/index.html` and MCP `validate_capsule`. Public hosted verify URLs may be deferred until Pages is enabled; until a hosted verify product ships, that capability stays **unclaimed** in the project claim ledger.

---

## 9. Deterministic replay

Runs append an event sequence (`events.ndjson`). Before promotion, `npm run replay` re-executes the recorded flight and compares ending fingerprints. Mismatch blocks promotion. CI can wire the same check on PRs.

Replay is a **determinism and integrity check for the recorded machine path**, not a proof that the surrounding CI runner or third-party Actions marketplace steps were free of compromise (see [Threat model](#14-threat-model)).

---

## 10. Gauntlet

The TaskBond gauntlet (`npm run eval:bond`) executes a fixed adversarial suite (bond + mandate scenarios, including legal-space overlays). Results are compared to a locked baseline; drift that weakens refusal behavior fails the suite. The suite is wired into **Vibe Promotion Gate** preflight so weakening guards blocks merge when the check is required on the branch.

Coverage is **exactly the scenarios in the suite**. Expanding the suite expands covered refusal classes; uncovered attack classes are not implied safe.

A separate red-team pack exercises additional adversarial cases for launch readiness; treat results as regression evidence for those cases, not as a certification exam.

---

## 11. MCP surface

The `vibe-release-gates` MCP server exposes live rulebook tools to Cursor and other MCP clients, including (non-exhaustive): `evaluate_mandate`, `resolve_gate`, `list_gates`, `seal_bond`, `validate_bond`, `constitution_schemas`, `validate_capsule`, `build_scoped_context`, `recall_lessons`, `list_stackables`, `set_legal_space`, `get_active_stack`, and optional `cyberready_validate_delta`.

Smoke: `npm run gate:mcp`. The same constitution applies whether the agent is in-IDE or in Actions—reducing “rules only in one tool” bypass, provided operators actually enable the MCP and follow the skill vows.

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

## 13. Assisted-by attribution

On pull requests, an attribution audit blocks merge when commit messages mention AI tooling without an `Assisted-by:` trailer. The engine tags its own commits `Assisted-by: vibe-engine-os`.

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
| vibe-engine-os code + vows | Reviewed and activated (`npm run activate`) | Bugs or incomplete gauntlet coverage |
| **GitHub** (Issues, Actions, Checks, API) | **Subprocessor for hosting, CI, and collaboration** | GitHub outages; compromised Actions; privileged token misuse; log retention policies outside this project |
| Optional external LLM APIs | Used only when depth/heal dials call them | Prompt injection, data exfiltration to providers |
| Optional CyberReady socket | Fail-open when not installed | Not a substitute for compliance tooling |

### Honesty: GitHub as subprocessor

vibe-engine-os **does not replace GitHub**. Issue text, Actions logs, PR metadata, and artifacts transit GitHub’s infrastructure under the repository owner’s GitHub agreement. Capsules and HPURLs improve **evidence legibility for governed runs**; they do not magically extend trust into GitHub’s control plane. Operators who need stronger independence must export proofs and retain copies outside GitHub.

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
# From a clone of vibe-engine-os:
bash runs/adopt.sh /path/to/target-repo
# or, already installed in-tree:
bash runs/adopt.sh .
```

`adopt.sh` installs the bundle when needed (`runs/install-into-repo.sh`), runs `npm install`, then `npm run activate` (check, zero-token smoke, MCP smoke, schema export, vows attestation → `.vibe/activated.json`).

After adopt:

1. Enable branch protection / required **Vibe Promotion Gate** as appropriate for the target repo.  
2. Enable MCP from `mcp.json` for Cursor agents.  
3. Open a Vibe Request or Starter issue; label `vibe/run` for the forever loop.  
4. Optionally set legal space via MCP (`set_legal_space`) — house rules only.

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

> vibe-engine-os contributors. *vibe-engine-os: Portable Promotion Primitives for Agent-Written Code*. Technical white paper, version VERSION (YYYY-MM-DD). Source SHA: COMMIT_SHA. Available at: https://github.com/afelin/vibe-engine-os

When citing a specific mechanism (bond, capsule, gauntlet), include the commit SHA so readers can resolve exact schemas and baselines.

---

## 20. Versioning and publish checklist

| Field | Policy |
|-------|--------|
| Version | Release tag or semver chosen at publish |
| Date | Calendar date of the published PDF/HTML |
| Source SHA | Full git commit SHA of the tree that was rendered |

Until publish, leave placeholders (`UNPUBLISHED`, `YYYY-MM-DD`, `TO_BE_FILLED_AT_PUBLISH`) so drafts cannot be mistaken for pinned evidence.

---

## Appendix A — Operator entry points

| Path | Entry |
|------|-------|
| Nocode | GitHub Vibe Request / Starter issue → `vibe/run` |
| Cursor | `npm run activate` + MCP + `.cursor/skills/vibe-engine` |
| External agent | Adapter + Agent Protocol + same MCP tools |
| Evidence before storytelling | `npm run battery:prelaunch` (claim ledger honesty compiler) |

---

## Appendix B — Related in-repo docs

- [`docs/start-here.md`](../docs/start-here.md) — five-minute paths  
- [`docs/solo-vibe-coder-guide.md`](../docs/solo-vibe-coder-guide.md) — daily operator loop  
- [`docs/agent-protocol.md`](../docs/agent-protocol.md) — schemas and slash commands  
- [`docs/launch-proof.md`](../docs/launch-proof.md) — zero-token cloud proof runbook  
- [`docs/rise-export.md`](../docs/rise-export.md) — public vs internal export allowlist  
- [`VOWS.md`](../VOWS.md) — normative vows  

---

*End of white paper.*
