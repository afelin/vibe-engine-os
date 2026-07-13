# Nocode Quickstart

*Fill a GitHub issue. Get a PR and receipt. No terminal required.*

This path is for solo founders and operators who want vibe-engine-os to run entirely from GitHub—no Cursor, no CLI, no local setup beyond what the repo already has in Actions.

---

## Step 1 — Open a Vibe Request

1. Go to **Issues → New issue** in your repo.
2. Choose the **Vibe Request** template.
3. Fill in **Intent**, **Outcome**, and **Files to touch** (2–4 exact paths).
4. Submit. The template adds labels `vibe/run` and `vibe:safe` automatically.

[Open a Vibe Request](../../issues/new?template=vibe-request.yml)

---

## Step 2 — Wait for the engine

GitHub Actions runs the **Sovereign OS Event Bus** workflow when your issue has the `vibe/run` label:

- Plans and generates code within your file scope
- Runs tests and verification gates
- Opens or updates a PR on branch `vibe/issue-<number>`
- Posts a comment on your issue with the **PR link** and **receipt** (capsule proof)

You do not need to run anything locally. Watch the **Actions** tab if you want progress details.

---

## Step 3 — Review and merge (optional auto-merge)

1. Open the PR link from the issue comment.
2. Review the diff and check that CI is green.
3. Merge manually, **or** add label `vibe/auto-merge` to squash-merge when all checks pass.

**Operator commands** (reply on the issue as comments): `/status` · `/approve` · `/continue` · `/retry` · `/rollback`

Comments use plain-language updates by default. Add label `vibe:technical` or comment `/details` to expand state, capsule hash, and scoreboard metrics.

**Explain dial** (how much “why” you get in comments): set env `VIBE_EXPLAIN=off|short|long|expand`, add label `vibe:explain-short` / `vibe:explain-long` / `vibe:explain-expand`, or set repository variable `VIBE_EXPLAIN`. Default is `short` for issue runs; agents default to `off`.

---

## What you get

| Artifact | Where |
| --- | --- |
| Pull request | Comment on your issue + branch `vibe/issue-N` |
| Receipt (capsule) | Issue comment + `.runs/<runId>/` in the PR artifact |
| Promotion gate | GitHub check on the PR head commit |

For deeper context, see [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) and [Platform Enforcement](./platform-enforcement.md).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `mergeable_state_unstable` on auto-merge | Wait for all checks to finish; re-add label `vibe/auto-merge` or trigger **Vibe Auto Merge** via `workflow_dispatch` |
| Checks not in branch-protection picker | Run one vibe issue first so **Vibe Promotion Gate** and **Audit Assisted-by attribution** appear — see [GitHub App](./github-app.md) |
| Receipt link 404 (private repo) | Use local `proof/index.html` with capsule hash from the issue comment until repo is public and Pages is enabled |
| `launch:readiness` fails on adopt | Run `bash runs/adopt.sh .` — ensures workflows, evals, proof, and issue template are installed |
| No PR comment after long wait | Check Actions tab for **Sovereign OS Event Bus**; confirm issue has `vibe/run` label |
