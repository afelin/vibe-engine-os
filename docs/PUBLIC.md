# Public vs internal surface

Short contract for what may appear on GitHub Pages, a RISE mirror, or RI.SE deep links.

## Public (safe to publish)

| Area | Examples |
|------|----------|
| Engine source | `src/`, `runs/`, `scripts/` (non-secret), `package.json`, vows/constitution |
| Papers & citation | `papers/`, `CITATION.cff` |
| Site & proof | `site/`, `proof/` |
| Operator how-tos | `docs/start-here.md`, `docs/agent-protocol.md`, `docs/rise-export.md`, this file |
| Eval / evidence harness | `evals/`, public claim-ledger code |

Tone: portable **free** OSS primitives — how to run and verify, not how to monetize.

## Internal (never on Pages / RISE public tree)

| Area | Examples |
|------|----------|
| GTM stubs only | `internal/go-to-market.md` and `docs/go-to-market.md` — **stubs**, no pricing/tiers body |
| Entire tree | `internal/**` (still denied from mirrors; keep contents non-sensitive) |
| Secrets | `.env`, `.env.*` (examples may stay), credentials, private tokens |
| Private run data | `.vibe/launch-proof.json` (example file OK), `.runs/` artifacts with secrets |

**GitHub visibility ≠ Pages/RISE denylist.** Anyone who clones this public repo sees `internal/`. Soft denylist only helps `public:prepare` / Pages — it does **not** hide files from GitHub. Do **not** commit commercial GTM, secrets, or paid packaging into this tree; keep that in private notes / RISE-internal.

Paid GTM, hosted offerings, and monetization packaging stay **private** until the claim ledger allows those claims—public tree remains free OSS + soft denylist only. Mandate signing keys belong in GitHub Actions secrets / local env (`VIBE_MANDATE_*`), never in committed files.

Do **not** put spin-off, equity, or governance-handoff strategy in any public file.

## How RISE / public export works

1. Allowlist + denylist live in [`docs/rise-export.md`](./rise-export.md).
2. Deny patterns also live in [`.public-mirror-exclude`](../.public-mirror-exclude).
3. Run `npm run public:prepare` → `scripts/prepare-public-tree.sh` copies an allowlisted tree to `dist/public/` (gitignored).
4. Sync **only** `dist/public/` (or the allowlisted paths) to the RISE public repo / Pages branch.

## Pages build scope

`.github/workflows/pages.yml` builds from `site/` + `papers/` + `proof/` and uploads **`site/` only**. It never deploys `internal/` or GTM docs.
