# Ward security (one page)

> **Product boundary:** Ward is CI/promote-only when a Mandate is on; IDE Edit/Shell remains out of band for this product generation; `ide_ward_interceptor` stays unbuilt.

Matches claim-ledger `UNCLAIMABLE_IDS` (`hosted_hpurl`, `cyberready_live`, `ide_ward_interceptor`) — never quote those as shipped.

## The invariant

When a Signed Mandate is in play, **authorization = `verifyOnce(principals)` + house rules (`evaluate_mandate` / `evaluate_house_rules`) AND + actor rules (STRICT / no `*`)**.

`ward_decision` / `ward.json` receipts are **evidence, never authorization**. Promote always re-verifies the persisted Mandate under `.runs/<id>/mandate.json`. IDE Edit/Shell bypass is **out of band and unbuilt** in the claim ledger.

**House rules** = standing forbids / approval prefixes (`mandates.json` + legal-space stackables). **Mandate** = signed session budget. Do not conflate the two.

## Visibility (never silent)

Cockpit + `npm run activate` print: `Ward LEGACY|ON · Mode OFF|ON · ticket fresh|expired|none`.

- **LEGACY** — no active Signed Mandate (house rules only).
- **Mode ON** — Coreward Mode fail-closes engine path without ticket or Mandate (`npm run activate -- --governed` or `coreward:init`).

## 15-minute regulated checklist

1. Create GitHub Actions secrets: `VIBE_MANDATE_PRIVATE_KEY` + `VIBE_MANDATE_PUBLIC_KEY` (Ed25519; never commit the private key). Empty secrets ⇒ Ward stays LEGACY — explicit, not silent.
2. Commit one default AgentProfile in `.vibe/principals.json` (or let first `npm run mandate:issue` write the issuer skeleton).
3. `npm run mandate:issue` — set `VIBE_MANDATE_ACTOR` or rely on the default profile (**never invents `*`**).
4. `npm run ward:doctor` — must be green (STRICT in `forever.yml`, no `*` on active Mandate, principals non-empty when Mandate present).
5. CI sets `VIBE_WARD_STRICT=1` on promote paths when Mandate secrets are configured.

## Scenarios

| Scenario | What happens |
| --- | --- |
| Hospital / regulated CI | STRICT on; unknown actor or `*` ⇒ DENY; promote re-verifies |
| Compromised agent forges ALLOW receipts | Promote fails — receipts never authorize |
| Stolen Mandate file, wrong principals | `verifyOnce` fails (issuer key not trusted) |
| Operator `/approve` | Only when `requiresApproval`; Option B CI-bot override Mandate |
| Mandate expired at promote | Fail-closed (`mandate_expired`) |
| Fork without principals | No trust file ⇒ verify fails when Mandate present; absent Mandate ⇒ LEGACY house-only |

## Honest limits

- **IDE bypass** — Cursor Edit/Shell can still write outside the engine path; product claim is *CI/promote cannot move without Ward when a Mandate is on*.
- **Option B** — plain-text `/approve` may mint a short-lived CI-bot override (not human-attributed crypto).
- **Not eIDAS / not FROST / not KMS** — Ed25519 principals + house AND only.

See also: [start-here](./start-here.md) · [operate](./operate.md) · [Agent Identity](agent-identity.md)
