# Agent Contract (MCP + skill SDK)

See also: [start-here](./start-here.md) · [agent-adapter](./agent-adapter.md) · [agent-protocol](./agent-protocol.md)

Machine-readable copy lives in `.vibe/agent-adapter.json` → `contract` (from `npm run activate`).

## What to call

| Phase | Tools (order) |
| --- | --- |
| First-run / stack | `get_active_stack` → `list_stackables` → optional `set_legal_space` |
| Preflight | `get_active_stack` → `list_stackables` → `evaluate_mandate` → `validate_bond` → `resolve_gate` → `constitution_schemas` |
| Postrun | `validate_capsule` → `build_scoped_context` → `recall_lessons` |

Operator shortcut: comment **`/go`** on the issue for the three-action next-step guide.

`set_legal_space` writes only `.vibe/active-stack.json` (`legalSpace`, optional `projectProfile`, `activatedAt`). It does **not** edit `mandates.json`, `gates.json`, or stackable pack files.

Until legal-space packs land, the only guaranteed legal space id is **`none`**. Unknown ids fail closed.

## What to expect

| Outcome | Signals |
| --- | --- |
| Success | `ok: true`, `valid: true`, `vowsCompliant: true`, non-null `capsuleHash` |
| Failure | `ok: false`, `valid: false`, MCP `isError: true`, or a `reason` string |

## What blocks promotion

Do not promote when any of these apply:

| Blocker | Meaning |
| --- | --- |
| `mandate_violation` | Forbidden path / mandate fail |
| `missing_approval` | Protected path needs `/approve` |
| `invalid_capsule` | Capsule parse / integrity fail |
| `vows_mismatch` | Manifest `vowsHash` ≠ activated vows |
| `bond_invalid` | TaskBond seal/eval failed |
| `gate_failure` | Release / verification gate failed |
| `replay_mismatch` | Event-ledger replay fingerprint mismatch |

These ids are exported as `contract.blocks_promotion` on the adapter manifest.
