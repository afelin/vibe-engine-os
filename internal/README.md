# Internal (not for public mirrors)

This directory is reserved for **operator stubs and pointers** that must not ship on GitHub Pages, RI.SE, or a RISE public mirror.

## Rules

- **Not published to Pages.** The Pages workflow uploads only `site/` (built from `site/` + `papers/` + `proof/`).
- **Not in RISE export.** `scripts/prepare-public-tree.sh` and `.public-mirror-exclude` deny `internal/` entirely.
- **Do not link from public README / site / white paper.**
- **Do not commit commercial GTM here.** Pricing, tiers, outreach calendars, and paid packaging belong in private notes / RISE-internal — not this public GitHub tree. Clones of this repo see everything under `internal/`.

## Contents

| Path | Purpose |
|------|---------|
| [`go-to-market.md`](./go-to-market.md) | Stub only — GTM body must not live in this public repo |

For the public vs internal contract, see [`docs/PUBLIC.md`](../docs/PUBLIC.md) and [`docs/rise-export.md`](../docs/rise-export.md).
