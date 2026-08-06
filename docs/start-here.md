# Start here

*5 minutes, any tool.* Pick one path. Ship a governed change with a receipt.

This is the canonical entry for vibe-engine-os. Everything else (solo guide, nocode walkthrough, adapter protocol) deepens a path you choose here.

---

## 1. GitHub-only (nocode)

No terminal. No Cursor. Issue → PR → receipt.

1. Open a [Vibe Request](../.github/ISSUE_TEMPLATE/vibe-request.yml) (labels `vibe/run` + `vibe:safe`).
2. Fill **Intent**, **Outcome**, and **Files to touch** (2–4 paths).
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

Designate which legal/compliance posture governs this repo (NIS2/CRA, US baseline, or none).

**Coming soon** (Phase 0.5f stackables): selectable packs merged onto mandates/gates at eval time.

Until then, know the dial conceptually:

- MCP `set_legal_space` will write `.vibe/active-stack.json` (`legalSpace`, optional `projectProfile`).
- Agents and gates will read the active stack; they never rewrite `mandates.json` / `gates.json`.
- Default remains `none` — vibe mandates only.

When packs land, this section will link the pack list and the dial UI/docs.
