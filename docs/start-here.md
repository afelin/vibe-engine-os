# Start here

*≤5 minutes.* Activate Coreward, call one preflight, ship with a receipt.

**Three living docs:** this page (activate) · [operate.md](./operate.md) (Go / Approve / Merge) · [ward-security.md](./ward-security.md) (governed Ward).

**Nomenclature:** a signed **Mandate** is a session contract; **Ward** enforces ALLOW/DENY on CI/promote when a Mandate is on; **house rules** (`mandates.json` + legal-space stackables) are standing forbids — MCP `evaluate_mandate` / alias `evaluate_house_rules`. Receipts never authorize. IDE Edit/Shell can still bypass Ward.

> **Product boundary:** Ward is CI/promote-only when a Mandate is on; IDE Edit/Shell remains out of band for this product generation; `ide_ward_interceptor` stays unbuilt.

> **License: FSL-1.1-Apache-2.0** — free internal use; not free to resell as hosted Coreward until Change Date. See [`LICENSE`](../LICENSE) / [`LICENSE.md`](../LICENSE.md).

Design partners: [design-partner.md](./design-partner.md).

---

## Fastest path

```bash
npm run coreward:init          # Node check → Mode ON → MCP smoke → ward:doctor → operate URL
# or
npm run activate -- --governed # Visibility strip: Ward LEGACY|ON · Mode OFF|ON · ticket …
```

Cockpit and activate always print the strip — never silent LEGACY/OFF.

---

## 1. GitHub-only (no terminal)

1. Open a [Coreward Request](../.github/ISSUE_TEMPLATE/vibe-request.yml).
2. Fill **Intent**, **Outcome**, **Files to touch** (2–4 paths).
3. Comment **`/go`** for the three next actions. Merge when CI is green.

Details: [operate.md](./operate.md).

---

## 2. Cursor + MCP + skill

1. `npm run coreward:init` (or `npm run activate -- --governed`).
2. Enable MCP `coreward-release-gates` from [`mcp.json`](../mcp.json).
3. Agents call MCP **`preflight` once** with proposed paths — then stop. Skill: [`.cursor/skills/coreward/SKILL.md`](../.cursor/skills/coreward/SKILL.md).

---

## 3. Legal space (optional dial)

MCP `list_stackables` → `set_legal_space` (`none` | `eu-nis2-cra` | `us-baseline`). Merges house-rule deltas at eval time; agents never edit policy packs.

---

## Deeper / archive

Historical and specialized guides live under [history/](./history/) or remain linked for search: host packs, solo guide, adapter protocol, prelaunch battery, launch-proof. Prefer the triad above for day-one work.
