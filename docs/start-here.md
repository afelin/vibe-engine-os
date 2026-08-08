# Start here

*≤5 minutes.* Init Coreward, call one preflight, ship with a receipt.

**Three living docs:** this page (init) · [operate.md](./operate.md) (Go / Approve / Merge) · [ward-security.md](./ward-security.md) (governed Ward).

**Nomenclature:** a signed **Mandate** is a session contract; **Ward** enforces ALLOW/DENY on CI/promote when a Mandate is on; **house rules** (`mandates.json` + legal-space stackables) are standing forbids — MCP `evaluate_mandate` / alias `evaluate_house_rules`. Receipts never authorize. IDE Edit/Shell can still bypass Ward.

> **Product boundary:** Ward is CI/promote-only when a Mandate is on; IDE Edit/Shell remains out of band for this product generation; `ide_ward_interceptor` stays unbuilt.

> **License: FSL-1.1-Apache-2.0** — free internal use; not free to resell as hosted Coreward until Change Date. See [`LICENSE`](../LICENSE) / [`LICENSE.md`](../LICENSE.md).

Design partners: [design-partner.md](./design-partner.md). Warm catalog (after first green PR): [capabilities.md](./capabilities.md).

---

## Fastest path

```bash
npm run coreward:init          # Node check → Mode ON → MCP smoke → ward:doctor → operate URL
# legacy alias (compat):
npm run activate -- --governed # Visibility strip: Ward LEGACY|ON · Mode OFF|ON · ticket …
```

**Recommended bootstrap:** `npm run coreward:init` only. `npm run activate` is a legacy alias kept for compatibility — do not treat it as a second product path.

Cockpit and activate always print the strip — never silent LEGACY/OFF.

---

## 1. GitHub-only (no terminal)

1. Open a [Coreward Request](../.github/ISSUE_TEMPLATE/vibe-request.yml).
2. Fill **Intent**, **Outcome**, **Files to touch** (2–4 paths).
3. Comment **`/go`** for the three next actions. Merge when CI is green.

Details: [operate.md](./operate.md).

---

## 2. Cursor + MCP + skill

**One-click path:** this repo already commits [`.cursor/mcp.json`](../.cursor/mcp.json). Open Cursor **Customize → MCP** → ensure **coreward-release-gates** is on (reload if grey). Not Marketplace deeplinks — we don’t own a Settings toggle.

1. `npm run coreward:init`
2. Customize → MCP → **coreward-release-gates** green (reload if needed)
3. Chat — agent already has the rule; expect one `preflight`

**CLI statusline (optional):** bind Agent CLI to presence via [`runs/coreward-statusline.sh`](../runs/coreward-statusline.sh) in `~/.cursor/cli-config.json`:

```json
"statusLine": {
  "type": "command",
  "command": "/absolute/path/to/repo/runs/coreward-statusline.sh"
}
```

Reads cwd `.vibe/coreward-presence.json` → `Coreward Mode=… ticket=… Ward=…`. Same command works for Claude Code statusline if your host supports a cwd-based command statusline.

### Hosts

Same vow everywhere: `preflight` once → prefer_gate → ContextPack. Packs: [host-packs.md](./host-packs.md). Generator: `npx tsx src/coreward/host-pack.ts --host …`.

**Cursor** — Committed `.cursor/mcp.json` + alwaysApply rule + soft hooks. `npm run coreward:init` → Customize → MCP green (reload if grey). Or `--host cursor`.

**Claude Code** — `--host claude` writes `.mcp.json` (`npx -y @coreward/mcp`) + slim `CLAUDE.md`. Reload MCP; expect one `preflight`.

**OpenCode** — `--host opencode` writes `opencode.json` MCP local server + slim `AGENTS.md`.

**Zed** — `--host zed` writes `.zed/settings.json` `context_servers` (`source: custom`) + slim `AGENTS.md`.

**Codex** — Paste `templates/hosts/codex/mcp-snippet.json` (`@coreward/mcp`); keep vow in `AGENTS.md`.

**Local / CI** — No MCP. `npm run coreward:init` then `npm run coreward:authorize -- --files a.ts,b.ts`.

---

## 3. Legal space (optional dial)

MCP `list_stackables` → `set_legal_space` (`none` | `eu-nis2-cra` | `us-baseline`). Merges house-rule deltas at eval time; agents never edit policy packs.

---

## Deeper / archive

Historical and specialized guides live under [history/](./history/) or remain linked for search: host packs, solo guide, adapter protocol, prelaunch battery, launch-proof. Prefer the triad above for day-one work. Full capability tables: [capabilities.md](./capabilities.md).
