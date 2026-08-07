# Ward security (one page)

## The invariant

When a Signed Mandate is in play, **authorization = `verifyOnce(principals)` + house `evaluateMandates` AND + actor rules (STRICT / no `*`)**.

`ward_decision` / `ward.json` receipts are **evidence, never authorization**. Promote always re-verifies the persisted Mandate under `.runs/<id>/mandate.json`. IDE Edit/Shell bypass is **out of band and unclaimed**.

## 15-minute regulated checklist

1. Create GitHub Actions secrets (Settings → Secrets and variables → Actions): `VIBE_MANDATE_PRIVATE_KEY` + `VIBE_MANDATE_PUBLIC_KEY` (Ed25519; never commit the private key). Locally, the same names may live in env / `.env` (gitignored). Empty secrets ⇒ Ward stays dormant / legacy house-only—compat.
2. Commit one default AgentProfile in `.vibe/principals.json` (or let first `npm run mandate:issue` write the issuer skeleton).
3. `npm run mandate:issue` — set `VIBE_MANDATE_ACTOR` or rely on the default profile (**never invents `*`**).
4. `npm run ward:doctor` — must be green (STRICT in `forever.yml`, no `*` on active Mandate, principals non-empty when Mandate present). Soft hints when keys are unset (`hint: set VIBE_MANDATE_*`) are OK until you enable Mandates.
5. CI already sets `VIBE_WARD_STRICT=1` on vibe-run / vibe-promote and passes Mandate secrets when configured — no extra knobs.

## Scenarios

| Scenario | What happens |
| --- | --- |
| Hospital / regulated CI | STRICT on; unknown actor or `*` ⇒ DENY; promote re-verifies |
| Compromised agent forges ALLOW receipts | Promote fails — receipts never authorize |
| Stolen Mandate file, wrong principals | `verifyOnce` fails (issuer key not trusted) |
| Operator `/approve` | Option B CI-bot override Mandate; actions ⊆ prior; human is audit-only |
| Mandate expired at promote | Fail-closed (`mandate_expired`) |
| Fork without principals | No trust file ⇒ verify fails when Mandate present; absent Mandate ⇒ legacy house-only |

## Honest limits

- **IDE bypass** — Cursor Edit/Shell can still write outside the engine path; product claim is *CI/promote cannot move without Ward when a Mandate is on*.
- **Option B** — plain-text `/approve` may mint a short-lived CI-bot override (not human-attributed crypto).
- **Not eIDAS / not FROST / not KMS** — Ed25519 principals + house AND only.

See also: [Agent Identity](agent-identity.md) · [README Mandate–Ward](../README.md) · [Whitepaper](../papers/vibe-engine-whitepaper.md)
