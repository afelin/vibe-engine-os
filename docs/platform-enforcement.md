# Platform Enforcement

*Production moves from a validated capsule—not from whatever happens to be on `main`.*

This document explains how vibe-engine-os enforces deploy authority without GitHub Pro branch protection UI.

---

## Core rule

**`main` is not the deploy source. The capsule is.**

After `vibe-promote` completes, a tamper-evident **capsule** lives under `.runs/<runId>/` (manifest + vows hash). Only a workflow step that validates that capsule may trigger production deploy.

A bad merge to `main` does **not** update production when deploy is wired correctly—the deploy job reads `RUN_ID` from `.runs/run-id.txt` and runs `npm run gate:validate-capsule` before any cloud publish.

---

## GitHub Pro-free hard block

Branch protection on private repos requires GitHub Pro. vibe-engine-os avoids that dependency:

| Layer | Enforcement |
| --- | --- |
| **Promotion** | Capsule + replay + bond preflight before `promote:apply` |
| **Deploy** | Separate job gated on `vars.VIBE_DEPLOY == '1'`; validates capsule again |
| **Cloud identity** | OIDC token scoped to deploy role—not repo write on `main` |

Solo users leave `VIBE_DEPLOY` unset (default off). Teams opt in when they configure a cloud target.

---

## OIDC deploy pattern (Cloudflare Pages example)

The `vibe-deploy` job in `.github/workflows/forever.yml` is a **placeholder** until you wire your cloud provider:

```yaml
vibe-deploy:
  needs: [gate-check, vibe-promote]
  if: ${{ needs.vibe-promote.result == 'success' && vars.VIBE_DEPLOY == '1' }}
  permissions:
    contents: read
    id-token: write   # required for OIDC
  steps:
    - name: Validate capsule for deploy
      run: npm run gate:validate-capsule -- . "$RUN_ID"

    - name: Deploy to Cloudflare Pages
      uses: cloudflare/pages-action@v1
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        projectName: my-app
        directory: dist
```

**Key points:**

1. Enable `vars.VIBE_DEPLOY = 1` in repo **Settings → Secrets and variables → Actions → Variables**.
2. Only the deploy job gets `id-token: write`; the agent job does not.
3. Deploy reads `RUN_ID` from `.runs/run-id.txt` (written by `agent.ts`), not `github.sha` on `main`.
4. Replace the placeholder step with your provider action (Vercel, Workers, etc.) using the same capsule gate.

---

## Composite action opt-in

The `vibe-validate` composite action (`action.yml`) accepts `deploy_after_validate: false` by default. Set to `true` to echo the deploy placeholder after local capsule validation—useful for customer repos that wrap validation in their own workflows.

---

## Related docs

- [Nocode Quickstart](./nocode-quickstart.md) — issue → PR → receipt without CLI
- [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md) — full operator workflow
