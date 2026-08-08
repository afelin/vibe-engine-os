# Local / CI — no MCP required

```bash
npm run coreward:init
npm run coreward:authorize -- --files a.ts,b.ts --title "…" --body "…"
```

With Coreward Mode on, forever codegen/patch/promote fail-closes without a valid ticket.
Promote still goes through CI Ward when a Mandate is on.
