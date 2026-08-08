# Coreward: Plain-Language Briefing

*For founders, operators, and stakeholders who orchestrate AI agents — no engineering background required.*

## Executive summary

**coreward (Coreward) is a rulebook-and-checkpoint system that sits between AI coding agents and your product.** Nothing an AI writes becomes permanent until it passes inspection and leaves a tamper-evident paper trail.

**The “so what”:** you can let AI build largely unattended — nights, weekends, while you sleep — and still show a customer, investor, or reviewer what changed, why, and that the configured safety checks ran on the governed path. It is not a tool that writes code; it is **border control** for code that AI writes. Receipts are evidence, not certificates; IDE edits outside the engine path are out of band.

---

## Capability walkthrough

### House mandates, Signed Mandate, Ward & task bonds — the work order and the guard

**What it is.** Before an AI agent touches anything, its request is sealed into a **bond**: a signed work order with intent (one sentence, max 500 characters), expected outcomes, and the **exact files** it may touch (max 16). **House mandates** (`mandates.json`) are standing forbids/approvals. An optional signed **Mandate** is a session contract (budget)—paths, actions, expiry, actor—not “AI ethics.” When present, **Ward** enforces ALLOW/DENY on the CI/promote engine path; **AgentId** names who may act. Receipts never authorize; IDE Edit/Shell can still bypass Ward. Option B `/approve` may mint a short-lived CI-bot override Mandate (human is audit-only).

**Problem solved.** AI agents drift. Ask for a button fix, get a rewritten database. Bonds make scope creep structurally impossible.

**So what.** Enterprises get policy in code, not in a PDF. Teams review smaller, bounded changes. Solo builders delegate without babysitting.

**Estimated advantage.** Reviewing 2–4 named files is plausibly **3–5× faster** than reviewing an unbounded AI change *(estimate: review time scales with file count, and bonds cap that up front)*.

---

### Capsule hashes — the run receipt

**What it is.** Every run produces a **capsule**: manifest, final machine state, and activity trace compressed into one cryptographic fingerprint. Change one character and the seal no longer matches.

**Problem solved.** “Trust me, the AI did it right” is not evidence. The capsule is evidence.

**So what.** For compliance-sensitive buyers, this is the difference between a claim and a verifiable record.

**Estimated advantage.** Strong detection of after-the-fact tampering with run records *(cryptographic mismatch when digests diverge)*, at zero ongoing cost — not a claim of physically tamper-proof storage.

---

### Release gates & the depth dial — checkpoints with a volume knob

**What it is.** Work passes through ordered checkpoints (plan → risk review → code → verification → publish). A **0–5 depth dial** sets how far AI may go: 0 = explain only, 3 = tests + code (default), 5 = protected areas need `/approve`. Ten gates are fully deterministic and need **no AI at all**.

**Problem solved.** All-or-nothing autonomy is what makes AI scary. The dial makes trust adjustable per task.

**So what.** Templated routine changes can ship at **$0 AI cost**. Risky paths always route through a human.

**Estimated advantage.** Templated routine changes can ship at **$0 AI cost** *(by construction — no model is called when a deterministic gate matches)*.

---

### The autonomous “forever loop” — the factory that runs while you sleep

**What it is.** A GitHub automation watches for labeled issues. You write a plain-language request, add `vibe/run`, and the loop plans, builds, tests, verifies, and opens a pull request. You control it with issue comments: `/status`, `/approve`, `/retry`, `/rollback`. Every run ships with rollback instructions.

**Problem solved.** A solo founder’s bottleneck is hours in the day. This converts written intent into gated, reversible shipped work.

**Estimated advantage.** A solo operator can plausibly achieve **2–3× throughput on routine changes** *(estimate: issue-writing takes minutes; build/test/verify cycles take hours and run unattended)*.

---

### Gauntlet evals — the standardized entrance exam

**What it is.** A fixed set of scripted scenarios the guard system must answer correctly, compared against a locked baseline before every promotion. If guard behavior shifts, the run is blocked.

**Problem solved.** Guardrails rot silently as code evolves. The gauntlet makes any weakening loud and blocking.

**Estimated advantage.** Covered scenario drift that weakens refusal vs the locked baseline is **blocked pre-ship** *(deterministic comparison; coverage grows as the scenario set grows)*.

---

### MCP integration with Cursor — the shared rulebook for every tool

**What it is.** A standard plug that lets AI tools like Cursor call the engine’s rule-checkers **live while you work**: “May I touch this file?”, “Is this bond valid?”, “Verify this capsule.”

**Problem solved.** Rules in one tool get bypassed by the next. One rulebook, enforceable everywhere.

**Estimated advantage.** Violations caught at proposal time instead of review time — **minutes of feedback loop instead of hours** *(estimate)*.

---

### Time-travel replay gate — the flight recorder

**What it is.** Every run records its complete event sequence. Before promotion, the engine **re-runs the entire flight from the black box** and checks that the replayed ending matches the recorded ending, fingerprint to fingerprint. Any mismatch blocks promotion.

**Problem solved.** Silent logic drift and doctored run records. If either happens, replay fails.

**Estimated advantage.** Converts “we believe it’s deterministic” into a **per-run replay check**; ledger digests that no longer match fail promote.

---

### Assisted-by attribution audit — honest labeling, enforced

**What it is.** A CI check on every pull request: if commit messages mention AI tooling without an `Assisted-by:` attribution tag, the PR is blocked. The engine tags its own commits `Assisted-by: coreward`.

**Problem solved.** Undisclosed AI authorship is becoming a legal, licensing, and customer-trust liability.

**Estimated advantage.** Commits that mention AI tooling on PRs must carry attribution or they don’t merge *(mechanical enforcement; catches mentions, not silent omissions)*.

---

### Adversarial gauntlet — hiring burglars to test the locks

**What it is.** Deliberate attack cases in the test suite: forbidden pipeline files, system password paths, home-directory secrets, absurdly bloated requests, and scenarios like “allow checkout with negative balance” targeting protected payment code. Every one must be **rejected** for the suite to pass.

**Problem solved.** Passing tests prove the system does good things; these prove it **refuses bad things** — and keeps refusing them on every future change.

**Estimated advantage.** Permanent regression-proof coverage of known attack classes, re-verified on every run at **$0 cost**.

---

## Viable / Feasible / Attractive

| Lens | Assessment |
| --- | --- |
| **Viable** | Yes. Deterministic gates and replay burn no AI tokens. The apparatus runs on free-tier GitHub automation. Ongoing cost is approximately the AI calls you *choose* at depth ≥ 3. |
| **Feasible** | Yes, today. 200+ automated tests, crawl proof that the state machine matches published rules, replay wired into promotion, and the engine dogfoods itself through real pull requests. |
| **Attractive (must-have)** | **Must-have** when your product’s credibility *is* trust — e.g. a CyberReady-style security/compliance MVP. Guardrails and audit trails are the demo, not back-office hygiene. For general teams: strong nice-to-have trending mandatory as AI-authorship norms harden. For solo builders: the difference between “I vibe-coded this” and “here’s the audit trail.” |

---

## What you can now say out loud

1. **“Governed AI changes can carry a tamper-evident, independently re-checkable receipt — and each run can be replayed from its event log to check the recorded ending still matches.”**
2. **“Our guardrails are attack-tested: the test suite tries to break in — forbidden files, secret paths, negative-balance checkout — and must be blocked on every release.”**
3. **“AI-assisted commits that mention tooling are labeled as such, enforced by automation that blocks unlabeled mentions — including the engine’s own commits.”**

---

## Summary table

| Capability | Problem solved | Quantified benefit |
| --- | --- | --- |
| House mandates, Signed Mandate/Ward & bonds | AI scope creep | ~3–5× faster review *(est.)* |
| Capsule hashes | Unverifiable AI work | Strong tamper detection *(cryptographic mismatch)* |
| Release gates & depth dial | All-or-nothing autonomy | $0 AI cost on templated gate hits |
| Forever loop | Founder hours are the bottleneck | ~2–3× routine throughput *(est.)* |
| Gauntlet evals | Silent guardrail rot | Covered-scenario drift blocked vs baseline |
| MCP + Cursor | Rules bypassed across tools | Feedback in minutes, not hours *(est.)* |
| Replay gate | Logic drift, doctored records | Per-run determinism check |
| Attribution audit | Undisclosed AI authorship | AI-mentioning PR commits attributed or blocked |
| Adversarial gauntlet | “Do the locks actually hold?” | Attack classes permanently regression-proofed |

---

## Next steps

- **Solo operator:** [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) — activation and daily workflow.
- **Agents & integrators:** [Agent Protocol](./agent-protocol.md) — schemas, MCP tools, TaskBond, gates.
- **Repository:** [README](../README.md) — commands, capsule layout, development.
