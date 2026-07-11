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

No App certification required for initial adoption.
