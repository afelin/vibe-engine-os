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

**Prelaunch battery gate:** `npm run battery:prelaunch` hard-fails if the free Aha path is broken (issue→PR+receipt, gauntlet, MCP, `/go`, zero-token). Hosted HPURL and live CyberReady claims stay `unclaimed` in `.vibe/battery-prelaunch.json` until those products exist — scar posts and GTM copy may only quote ledger rows with `status: pass`. Details: [Prelaunch battery](./prelaunch-battery.md).

---

## Outreach (CAC ~$0)

1. **Three "scar posts"** — gauntlet blocked a bad path; screenshot the gate failure.
2. **One nocode post** — "Lovable → GitHub with receipts" using [Nocode Quickstart](./nocode-quickstart.md).
3. **Solo guide as landing doc** — [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) linked from README and issue template.

**Repo visibility:** Merge engine hardening PRs, make `vibe-engine-os` public for OSS credibility and free branch protection on the engine repo. Customer apps stay private.

---

## Scar post templates (fill from launch-proof artifacts)

Run `npm run launch:scar` after [Launch Proof](./launch-proof.md) passes. Replace placeholders with values from `.vibe/launch-proof.json`.

### Template 1 — Gauntlet block

> The constitution blocked a forbidden path before it reached `main`.
>
> **Launch proof:** issue #`<issueNumber>` → [PR](`<prUrl>`)  
> **Capsule:** `sha256:<capsuleHash>`  
> **Gauntlet:** 32/32 green — one bad mandate would have shipped.
>
> Agents propose. The constitution promotes or blocks.

### Template 2 — Nocode loop

> I labeled a GitHub issue. No terminal. Got a PR + tamper-evident receipt.
>
> Issue: `<issueUrl>`  
> Receipt: [View proof](`<receiptLink>`)  
> Checks: Vibe Promotion Gate green on `<prUrl>`
>
> See [Nocode Quickstart](./nocode-quickstart.md).

### Template 3 — Zero-token economics

> Zero-token gate path saved ~4000 tokens on the launch-proof run.
>
> **Issue #`<issueNumber>`** → deterministic cloud-loop smoke → PR with capsule hash.  
> No LLM API keys in CI. Promotion only when the receipt validates.
>
> `npm run launch:readiness` + workflow_dispatch launch-proof — reproducible on private GitHub.

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
