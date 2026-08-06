# Internal (not for public mirrors)

This directory holds **operator / founder notes that must not ship** on GitHub Pages, RI.SE, or a RISE public mirror.

## Rules

- **Not published to Pages.** The Pages workflow uploads only `site/` (built from `site/` + `papers/` + `proof/`).
- **Not in RISE export.** `scripts/prepare-public-tree.sh` and `.public-mirror-exclude` deny `internal/` entirely.
- **Do not link from public README / site / white paper.** Point here only from other internal docs or private operator notes.

## Contents

| Path | Purpose |
|------|---------|
| [`go-to-market.md`](./go-to-market.md) | Monetization tiers, outreach, scar templates (engineering-only) |

For the public vs internal contract, see [`docs/PUBLIC.md`](../docs/PUBLIC.md) and [`docs/rise-export.md`](../docs/rise-export.md).
