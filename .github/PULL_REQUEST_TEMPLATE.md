## Summary

<!-- What changed and why (mechanism, not marketing). -->

## Checklist

- [ ] `authorize_write` / `npm run coreward:authorize` covered proposed paths (Coreward Mode)
- [ ] Claim-safe language: tamper-**evident** (not tamper-proof); receipts ≠ certification; no fake CyberReady/hosted-verify claims
- [ ] Wire aliases preserved where needed (`vibe/*`, `.vibe/`, `VIBE_*`) unless this PR intentionally documents a rename
- [ ] `npm run check` (or focused tests) when touching engine / constitution / workflows
