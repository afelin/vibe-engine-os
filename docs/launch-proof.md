# Launch Proof Runbook

Canonical zero-token E2E proof: **issue → PR → receipt → green checks** on a private GitHub repo.

## When to run

After `npm run launch:readiness` passes on `main`, trigger **Launch Proof (zero-token E2E)** via Actions → `workflow_dispatch`.

## Expected durations

Runs feel slow when healthy — this is normal. Use the table below so you know when to wait vs. investigate.

| Phase | Typical | Max (script timeout) | Stuck if… |
| --- | --- | --- | --- |
| `npm run launch:readiness` (local) | 3–30 s | — | Gauntlet or MCP smoke fails locally |
| Launch Proof workflow queued | 0–2 min | — | Queue backlog on GitHub Free |
| Create issue + dispatch `forever.yml` | ~30–90 s | — | `gh` auth or label missing |
| `forever.yml` (gate-check → vibe-run → vibe-promote) | 1–4 min | ~25 min | `vibe-promote` failed — open linked forever run |
| Poll issue for PR + receipt | 1–5 min | **30 min** | No PR comment after promote succeeded |
| Wait for PR checks green | 2–6 min | **25 min** | Promotion gate or attribution pending |
| **Total (happy path)** | **~5–12 min** | **~45–75 min** | Exceeds max column → see Troubleshooting |

**Tips:** Run **one** proof at a time (`npm run launch:ship` dedupes concurrent runs). Use `npm run launch:ship -- --dry-run` for a fast local preflight without cloud polling.

## What it does

1. Creates a Vibe Request issue with cloud-loop smoke paths (no LLM secrets)
2. Dispatches `forever.yml` (Actions-created issues do not auto-trigger workflows)
3. Polls issue comments for PR link + capsule receipt
4. Polls PR checks for **Vibe Promotion Gate** (+ attribution when present)
5. Writes `.vibe/launch-proof.json`

Local dry-run (requires `gh` auth): `node scripts/launch-e2e.mjs`

## Artifact slots

Fill after a successful run (local `.vibe/launch-proof.json` is gitignored; copy from Actions artifact or see `.vibe/launch-proof.json.example`):

| Slot | Example / placeholder |
| --- | --- |
| Issue # | `#___` |
| Issue URL | `https://github.com/<owner>/<repo>/issues/___` |
| PR URL | `https://github.com/<owner>/<repo>/pull/___` |
| Capsule hash | `sha256:…` |
| Receipt link | `[View proof](…)` from cockpit comment |
| Screenshot — issue comment | `docs/assets/launch-proof-issue.png` |
| Screenshot — PR checks | `docs/assets/launch-proof-checks.png` |
| Checks green | `true` |

## Acceptance

- [ ] `npm run launch:readiness` exits 0 on `main`
- [ ] `.vibe/launch-proof.json` has `issueNumber`, `prUrl`, `capsuleHash`, `checksGreen: true`
- [ ] Issue comment contains PR link + receipt
- [ ] **Vibe Promotion Gate** green on vibe branch PR

## Manual ops (after proof passes)

Do **not** automate these in launch PRs — complete in GitHub UI when acceptance above is met.

### Branch protection on `main`

Per [GitHub App / branch protection](./github-app.md):

- [ ] Require **Vibe Promotion Gate** on PRs to `main`
- [ ] Require **Audit Assisted-by attribution** on PRs to `main`
- [ ] Require status checks to pass before merge

### Post-launch public gate (deferred)

Only after private smoke passes:

- [ ] Make repository public (OSS GTM)
- [ ] Enable GitHub Pages (`pages.yml` workflow)
- [ ] Verify hosted receipt URLs (`DEFAULT_PROOF_BASE` in `src/constitution/hpurl.ts`)
- [ ] Update README clone URL

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Issue created but no PR within 45m | Check Actions logs for `forever.yml`; confirm `vibe/run` label |
| Launch proof issue never triggers `forever.yml` | Actions `GITHUB_TOKEN` issue create does not fire `issues` events — `launch-e2e` dispatches `forever.yml` via `workflow_dispatch` |
| Branch protection API 403 | Set repo variable `VIBE_SKIP_BRANCH_PROTECTION=1` or use admin PAT; ship records `skipped_needs_admin` |
| Receipt missing in comment | Wait for promote job; check `.runs/` artifact upload |
| Vibe Promotion Gate pending | `vibe-pr-gate.yml` runs on PR open — re-sync PR |
| `gh: not found` in workflow | Use `runs/ensure-gh.sh` pattern or `actions/setup-node` + preinstalled gh on runner |

## Related

- `npm run launch:readiness` — local preflight
- `npm run battery:prelaunch` — fast/full claim ledger + killers; cloud mode wraps this E2E when `VIBE_BATTERY_CLOUD=1` ([Prelaunch battery](./prelaunch-battery.md))
- `npm run launch:scar` — GTM snippet from proof + gauntlet (quote only ledger `pass` claims)
- [Go-to-Market](./go-to-market.md) — scar post templates

## One-command ship

After readiness is green locally:

```bash
npm run launch:ship -- --dry-run   # readiness + push check only
VIBE_LAUNCH_TROUBLESHOOT=0 npm run launch:ship  # skip fail-open troubleshoot after readiness fail
npm run launch:ship                # readiness → launch-proof workflow → branch protection
```

Set `VIBE_SKIP_BRANCH_PROTECTION=1` (repo variable or env) to skip the admin API step; state is written to `.vibe/launch-ship-state.json`.

This runs `launch:readiness`, triggers **Launch Proof (zero-token E2E)** on `main`, polls until success, then attempts branch protection via `scripts/enable-branch-protection.mjs`. State is written to `.vibe/launch-ship-state.json`.

In GitHub Actions, use **Launch Ship** (`workflow_dispatch`). Branch protection may require a PAT with admin repo scope — see script output for UI fallback steps.

