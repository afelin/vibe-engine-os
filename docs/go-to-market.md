# Go-to-Market (Internal)

*Positioning, tiers, outreach, and when to charge—for vibe-engine-os magic layer.*

---

## Positioning

**10x promise:** Solo and nocode users vibe in chat and hope. With vibe-engine-os they **label an issue, get a PR + tamper-evident receipt, and production only moves when the receipt validates**—without GitHub Pro.

**Competitor gap:**

| Category | Examples | What they do | What they miss |
| --- | --- | --- | --- |
| Codegen agents | Cursor, Copilot, Devin | Propose/edit code | No promotion authority or portable proof |
| PR review bots | CodeRabbit, Bugbot | Review after diff exists | Reactive; no pre-write bonds or replay |
| Security CI | Semgrep, Snyk | Pattern scan | Not agent-scope or intent-bound |
| Vibe builders | Lovable, Bolt | Fast UI in sandbox | No audit trail when leaving sandbox |
| **vibe-engine-os** | (us) | Bounded propose → verify → promote + capsule + replay | Constitution agents must pass through |

---

## Tiers (monetization — do not build billing until 50+ activations)

| Tier | Trigger | Price | Built on stack |
| --- | --- | --- | --- |
| **Vibe** (free) | Always | $0 | OSS + customer's GitHub Actions |
| **Vibe+** | Run #5+, "don't lose receipts" | ~$12/mo | Hosted HPURL verify + capsule backup to R2 |
| **CyberReady** | B2B pilot asks for proof | Custom | Signed HPURL + audit PDF from manifest + gauntlet baseline |

**Never paywall:** activate, MCP, gauntlet, replay, zero-token gates, install script.

---

## Outreach (CAC ~$0)

1. **Three "scar posts"** — gauntlet blocked a bad path; screenshot the gate failure.
2. **One nocode post** — "Lovable → GitHub with receipts" using [Nocode Quickstart](./nocode-quickstart.md).
3. **Solo guide as landing doc** — [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) linked from README and issue template.

**Repo visibility:** Merge engine hardening PRs, make `vibe-engine-os` public for OSS credibility and free branch protection on the engine repo. Customer apps stay private.

---

## Activation metrics

| Metric | Signal |
| --- | --- |
| Issue with `vibe/run` → PR without manual CLI | Nocode loop works |
| Cockpit comment has PR + receipt link | Magic layer visible |
| Deploy skips without valid capsule when `VIBE_DEPLOY=1` | Hard block works |
| No new npm deps; one static verify shell | Maintenance stays low |

---

## When to pay (customer-facing summary)

- **Free forever:** run the engine on your repo, gauntlet, replay, MCP, activate script.
- **Consider Vibe+:** when you have 5+ runs and want hosted receipt backup and verify URL.
- **CyberReady:** when a buyer needs signed proof and audit export for compliance.
