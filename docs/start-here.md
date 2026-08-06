# Start here

*5 minutes, any tool.* Pick one path. Ship a governed change with a receipt.

This is the canonical entry for vibe-engine-os. Everything else (solo guide, nocode walkthrough, adapter protocol) deepens a path you choose here.

---

## 1. GitHub-only (nocode)

No terminal. No Cursor. Issue → PR → receipt.

1. **First green PR** → use the [Starter template](../.github/ISSUE_TEMPLATE/vibe-starter.yml) (prefilled cloud-loop smoke; labels `vibe/run` + `vibe:safe`).
2. Or open a blank [Vibe Request](../.github/ISSUE_TEMPLATE/vibe-request.yml) and fill **Intent**, **Outcome**, and **Files to touch** (2–4 paths).
3. Wait for the forever loop; merge when checks are green (optional `vibe/auto-merge`).

Full walkthrough: [Nocode Quickstart](./nocode-quickstart.md).

---

## 2. Cursor + MCP + skill

Local agent that respects mandates and gates before edits.

1. `npm run activate` — exports schemas + adapter manifest.
2. Enable MCP from [`mcp.json`](../mcp.json) (`npm run gate:mcp` to smoke).
3. Follow [`.cursor/skills/vibe-engine`](../.cursor/skills/vibe-engine/SKILL.md) — preflight `evaluate_mandate` → `resolve_gate` before proposing paths.

Daily workflow: [Solo Vibe Coder Guide](./solo-vibe-coder-guide.md).

---

## 3. External agent / IDE

Bring Claude, Codex, or another IDE via the adapter contract.

1. Read [Agent Adapter](./agent-adapter.md) — preflight/postrun tool order and manifest.
2. Follow [Agent Protocol](./agent-protocol.md) — slash commands, bonds, and what blocks promotion.
3. Point your agent at the same MCP surface (`evaluate_mandate`, `resolve_gate`, `validate_capsule`).

---

## 4. Pick legal space

Designate which legal/compliance posture governs this repo — a dial, not a rewrite of policy files.

1. Call MCP `list_stackables` — packs on disk: `none`, `eu-nis2-cra`, `us-baseline` (plus project profiles like `tabdab`).
2. Call MCP `set_legal_space` with your choice (default `none`). Writes only `.vibe/active-stack.json`.
3. Subsequent `evaluate_mandate` / bond eval merge pack deltas onto base mandates at eval time — agents never edit `mandates.json` / `gates.json`.

| Space | Posture |
| --- | --- |
| `none` | Vibe mandates only |
| `eu-nis2-cra` | Stricter EU NIS2/CRA path forbids + approvals |
| `us-baseline` | Lighter US baseline extra approvals |

Contract: [agent-contract.md](./agent-contract.md). Packs: `src/policy/stackables/legal-spaces/`.

---

## 5. Prelaunch battery (evidence before you ship the story)

Before public “try vibe-engine” copy, run the honesty compiler:

```bash
npm run battery:prelaunch
```

Plain-speak killers, claim ledger rules, journeys J1–J5, and free vs paid gates: [Prelaunch battery](./prelaunch-battery.md).
