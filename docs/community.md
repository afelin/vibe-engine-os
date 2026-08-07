# Community — Telegram + voluntary support

Thin public surface: [`site/community/`](../site/community/). Config lives in [`site/community/config.json`](../site/community/config.json) (no bot secrets in git).

**Claim-safe:** community chat ≠ support SLA. A tip is voluntary support for development, not a license purchase, product tier, or Competing Use hosting entitlement. Software remains under [FSL-1.1-Apache-2.0](../LICENSE) / [LICENSE.md](../LICENSE.md).

## Owner setup

### 1. Telegram invite link

1. In Telegram, create a **public channel** or **group** (or a username for DMs).
2. Open invite / link settings → copy `https://t.me/...`.
3. Set `telegram_url` in `site/community/config.json`.
4. Redeploy Pages (`site/` is what [pages.yml](../.github/workflows/pages.yml) publishes).

No in-repo bot runtime. Optional later: [BotFather](https://t.me/BotFather) + a webhook host of your choosing — keep tokens in env/secrets only; do not commit them or ship Competing Use hosted Coreward from this tree.

### 2. Stripe Payment Link (one tip)

**Already live** (Creaido Stripe account):

- Product: `prod_V1yl0rYP0MudKs` — Support Coreward development (custom amount, min $5, preset $25)
- Payment Link: [donate.stripe.com/…](https://donate.stripe.com/8x24gzfZy2gG0g3bRCbsc00) — stored in `site/community/config.json`

To recreate later: Stripe Dashboard → Product catalog → one-time/custom tip → Payment Link → paste URL into `stripe_payment_link`. Do not put Stripe secret keys in the repo.

### 3. Verify placeholders are gone

Until Telegram is set, the community page shows an owner TODO when `telegram_url` still contains `YOUR_HANDLE`. Stripe is live when `stripe_payment_link` has no `TEST_PLACEHOLDER`.

## Related

- [docs/PUBLIC.md](./PUBLIC.md) — public vs internal
- [docs/start-here.md](./start-here.md)
- [SECURITY.md](../SECURITY.md)
- [site/trust/](../site/trust/)
