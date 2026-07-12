---
name: vibe-auto-merge
description: Opt-in autonomous PR merge when Vibe Promotion Gate and branch protection checks are green.
---

# Vibe Auto Merge

## Instructions

Use only when the operator has opted in to **autonomous merge on green CI**.

### Opt-in (required by default)

Add label **`vibe/auto-merge`** to the PR (or to the linked Vibe Request issue before the PR opens, then add to the PR).

Repo-wide bypass (use sparingly): set GitHub repository variable **`VIBE_AUTO_MERGE=1`** — then every PR to `main` is eligible without the label.

### Preconditions (all must pass)

1. PR is open and `mergeable_state` is **clean** (branch protection + required checks satisfied).
2. **Vibe Promotion Gate** check on the PR head SHA is **success**.
3. Label `vibe/auto-merge` is present (unless `VIBE_AUTO_MERGE=1`).

The workflow `.github/workflows/vibe-auto-merge.yml` runs on PR updates and when check suites complete. It squash-merges via the GitHub API.

### Manual dry-run

```bash
export GITHUB_TOKEN=...   # or GH_TOKEN
export GITHUB_REPOSITORY=owner/repo
npm run pr:auto-merge -- 15 --dry-run
```

### When NOT to auto-merge

- Protected paths required `/approve` on the issue (depth 5 or approval-gated files).
- PR lacks `vibe/auto-merge` and `VIBE_AUTO_MERGE` is not set.
- Any required check (including attribution audit) is still pending or failed.

## Examples

- Operator adds `vibe/auto-merge` to PR #15 after review → CI finishes green → workflow merges automatically.
- Local verification: `npm run pr:auto-merge -- 15 --dry-run` prints `{ "ok": true, "reason": "dry_run_ready" }`.

## Performance Notes

- Triggered by `check_suite: completed` so merge happens as soon as the last check finishes — no polling loop.
- Exits quietly (code 0) when label is missing — safe for repos that rarely use auto-merge.

## Troubleshooting

- `missing_auto_merge_label` — add label or set repo variable `VIBE_AUTO_MERGE=1`.
- `mergeable_state_blocked` — wait for CI or fix failing checks.
- `promotion_gate_not_green` — Vibe Promotion Gate must succeed on the PR head commit.
- `missing_github_token` — set `GITHUB_TOKEN` / `GH_TOKEN` with `pull_requests: write`.
