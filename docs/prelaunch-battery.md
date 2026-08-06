# Prelaunch test battery

One command that answers three questions with **evidence, not vibes** before you tell the world “try vibe-engine”:

1. Can a non-engineer succeed fast? (activation)
2. Does the constitution still refuse bad paths under attack? (trust)
3. Is free a complete product, and paid only convenience? (free → pay)

```bash
npm run battery:prelaunch          # fast (default)
npm run battery:prelaunch -- --full
VIBE_BATTERY_CLOUD=1 npm run battery:prelaunch -- --cloud
```

Scoreboard: `.vibe/battery-prelaunch.json` (claims + killers + funnel + `elapsedMs`).

---

## Wedge sentence (demo)

> I labeled a GitHub issue, got a PR with a tamper-evident receipt, and the constitution blocked a forbidden path — no terminal, $0 AI on the happy path.

Only quote that (or any marketing line) when the claim ledger marks the backing claims `pass`. Never invent hosted / CyberReady-ready copy from an `unclaimed` row.

---

## Claim ledger rules

Battery writes claims into `.vibe/battery-prelaunch.json`. Each public claim maps to an assert ID.

| Status | Meaning | May appear in GTM / scar / docs? |
| --- | --- | --- |
| `pass` | Assert green this run | **Yes — only these** |
| `fail` | Assert red | No |
| `unclaimed` | Product not built / assert null | No |

**Hard rule:** CI, scar posts, and docs may only quote claims with `status: pass`. Hosted HPURL and live CyberReady stay `unclaimed` until those products exist.

---

## Killer features (K1–K14)

A feature is **killer** if removing it makes vibe-engine “just another agent.”

| ID | Name | So what | Micromoment |
| --- | --- | --- | --- |
| K1 | TaskBond + mandates | Scope creep becomes impossible | Forbidden path → `ok: false` fast |
| K2 | Capsule receipt | Proof vs “trust me” | Proof JSON has `capsuleHash` |
| K3 | Zero-token gates + depth dial | Routine work at $0 AI | Activate/smoke without LLM keys |
| K4 | Forever loop | Sleep while work ships | Starter → PR (cloud / J1) |
| K5 | Gauntlet | Guardrails cannot rot quietly | Gauntlet green + baseline |
| K6 | MCP + skill | One rulebook every IDE | Bootstrap + MCP smoke |
| K7 | Replay | Determinism is proven | `replay` exit 0 |
| K8 | `/go` + trust summary | Non-engineers know next step | Exactly 3 actions; trust block |
| K9 | Heal + Pearl | Failures get cheaper | Orchestrate L0/L1; Pearl renders |
| K10 | Legal-space stackables | Regime dial without rewriting policy | Pack tightens paths |
| K11 | Auto-merge readiness | Finish line stays free | Merge-ready dry eval |
| K12 | Narratives / scar | Every run is GTM | Scar keywords from fixture |
| K13 | CyberReady bridge | Paid plug, free-safe | `not_installed` fail-open |
| K14 | HPURL params | Shareable verify story | `space=` round-trip |

Fast mode hard-fails free heroes. Paid stubs (K13 soft, hosted verify) soft-pass / stay unclaimed.

---

## Activation journeys (J1–J5)

| Journey | Killers | Pass bar | Funnel signal |
| --- | --- | --- | --- |
| **J1** Nocode starter | K4, K2, K8 | &lt;15 min, no terminal, `/go` + trust | Time-to-first-green (wall-clock once) |
| **J2** Bootstrap MCP | K6, K10 | &lt;5 min to first mandate check | Time-to-first-tool (`bootstrapMs` when measured) |
| **J3** Stop burglar | K1, K5 | &lt;2s structured refuse | Trust micromoment |
| **J4** Free complete | K3, K11 | No paid dependency | Free-Aha proof |
| **J5** Second run | K8 | `/go` still 3 actions on completed | Retention (`goGuideActions`) |

Automated proxies land in the battery JSON `funnel` object (e.g. `goGuideActions: 3`). **J1 wall-clock is human once** — see below.

### J1 wall-clock notes (record under `.vibe/`)

Once before public launch, run the nocode starter path from [start-here](./start-here.md) with a stopwatch. Write a short note (gitignored under `.vibe/` is fine), for example:

```text
# .vibe/j1-activation-notes.txt  (local; do not commit secrets)
date: YYYY-MM-DD
operator: <name>
start: open starter issue
end: /go shows 3 actions + trust summary; PR + receipt visible
wall_clock_min: <number>   # pass if < 15
pr_url: <url>
capsule_hash: sha256:…
notes: <anything that slowed you down>
```

Optional: copy `wall_clock_min` into launch-proof notes or scar context. Do not invent a CI claim from an unmeasured J1.

---

## Free vs paid (battery rules)

| Tier | Battery rule |
| --- | --- |
| **Vibe (free)** | Hard-fail if broken — issue→PR+receipt, MCP, gauntlet, replay, `/go`, local legal-space |
| **Vibe+** | Soft local proof only; claim “hosted receipt verify” **forbidden** until built |
| **CyberReady** | Soft `not_installed`; claim “CyberReady-ready” **forbidden** until live sock eval exists |

Never paywall: activate, bootstrap, MCP, gauntlet, replay, zero-token gates, adopt, `/go`, trust summary, starter, local legal-space dial.

Product soft metric `runs >= 5` may *suggest* Vibe+ in GTM; the battery must still pass at $0.

---

## How to run

| Mode | When | Command | Target |
| --- | --- | --- | --- |
| **fast** | Every CI PR | `npm run battery:prelaunch` or `-- --fast` / `VIBE_BATTERY_MODE=fast` | &lt;2–3 min local |
| **full** | Pre-tag / weekly | `npm run battery:prelaunch -- --full` | &lt;10 min |
| **cloud** | Launch hero / manual | `VIBE_BATTERY_CLOUD=1 npm run battery:prelaunch -- --cloud` | Actions-bound |

CI runs **fast only**. Do not enable cloud on every PR.

**fast** includes: `check` once, `eval:bond`, battery moments, MCP/stackables smoke, CyberReady soft, claim ledger.  
**full** adds: launch readiness, orchestrate smoke, metrics, ship dry-run, redteam gauntlet (when present).  
**cloud** adds: launch-proof E2E when `VIBE_BATTERY_CLOUD=1`.

---

## Related

- [Start here](./start-here.md) — pick a path
- [Launch proof](./launch-proof.md) — cloud hero E2E
- Quote only ledger `pass` claims in any public copy; monetization notes stay under `internal/` (not published)
