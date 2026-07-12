# GitHub App (follow-on)

Tier 3C-ii documents the GitHub App upgrade path. Tiers 0–2 use `GITHUB_TOKEN` Checks API.

## Planned App Permissions

| Permission | Access |
|------------|--------|
| Checks | Read & write |
| Contents | Read & write |
| Issues | Read & write |
| Pull requests | Read & write |

## Webhook Events

Same events as `.github/workflows/forever.yml`:

- `issues`, `issue_comment`
- `pull_request_review`, `pull_request_review_comment`

Delivery idempotency: `src/os/idempotency.ts` key `event_name:delivery_id:issue_number`.

## Installation

1. Create GitHub App from manifest (future PR).
2. Install on org/repo.
3. Replace `GITHUB_TOKEN` with app installation token in workflow.
4. Enable branch protection: required check **Vibe Promotion Gate**.

## Current State (Tier 1)

`src/publishing/github-checks.ts` posts Check Runs via REST with `GITHUB_TOKEN`.

`npm run promote:apply` (wired in `.github/workflows/forever.yml` **vibe-promote** job) creates or updates a check named **Vibe Promotion Gate** on `GITHUB_SHA` after capsule validation and bond preflight.

No App certification required for initial adoption.

## Required status check (branch protection)

The check name to require on `main` is exactly:

**`Vibe Promotion Gate`**

It is registered when a vibe run promotes successfully (`src/promote/apply-cli.ts` → `createOrUpdateCheckRun`). Until at least one promotion has run on a branch, the check may not appear in the branch-protection picker.

### Manual setup for `afelin/vibe-engine-os` (GitHub UI)

Repo admin access is required; the REST API cannot set required checks without admin scope.

1. Open **Settings → Branches** → **Branch protection rules** → **Add rule** (or edit existing rule for `main`).
2. Enable **Require status checks to pass before merging**.
3. Search for **`Vibe Promotion Gate`** and select it.
4. Enable **Require branches to be up to date before merging** (recommended).
5. Save the rule.

After the first successful `vibe-promote` run on a PR, the check appears on the PR checks tab with capsule hash and vows attestation in the summary.

### Verify locally

```bash
npm run gate:validate-capsule -- . <run_id>
npm run promote:apply -- . <run_id>   # posts check when GITHUB_TOKEN + GITHUB_REPOSITORY + GITHUB_SHA are set
```

## Ship-work nudge (no auto-run)

PR review comments and issue comments that name multiple `src/` paths with implementation verbs — but lack `vibe/run` or a sealed bond — receive a **This looks like ship work** nudge pointing to the Vibe Request template. The engine does not auto-run from drive-by chat; only labeled issues, `/vibe`, or operator slash commands trigger runs.

See `src/operator/ship-heuristic.ts`.
