# Agent Identity

Portable **AgentId** primitive (`src/agent-id/`) shared by Ward, MCP, and CI. It gels to the session Mandate through one field: `authorized_actor` → `resolveProfile(actor)`.

This is **authorized actor + optional efficiency defaults**, not organizational PKI and not eIDAS. Ed25519 principals + Mandate signatures are the base; optional later layers (e.g. FROST threshold issue) are out of scope for v1.

## What it is

| Piece | Role |
| --- | --- |
| **Principals file** | One store: `.vibe/principals.json` (or `src/policy/principals.json`). Trust pubkeys; optional profile fields on the same entries. |
| **AgentProfile** | `agent_id`, optional `default`, path/budget caps (`default_path_constraints`, `max_bound_files`, `max_context_chars`, `max_depth`). |
| **Builtin CI override** | `github-ci-bot-override` — Option B `/approve` runner identity; never human-attributed. |

## Gel rules

1. **No Mandate / no profile fields ⇒ legacy bit-identical** (trust-only `{ id, public_key }` does not stamp or tighten).
2. **Profile only tightens** Mandate ∩ profile (never widens house forbids).
3. **`VIBE_WARD_STRICT=1`** — unknown actor (no profile) ⇒ Ward DENY; local DX without STRICT still allows string actors.
4. Ward imports AgentId; **AgentId must not import Ward**.

## Operator loop

1. Commit one default profile once (or first `npm run mandate:issue` writes an issuer skeleton with `default: true`).
2. Daily: `npm run mandate:issue` with keys in env — omit path/actor flags to use profile defaults.
3. Runs get smaller context automatically when `max_context_chars` / path constraints are set.
4. Audit: `jq 'select(.type=="ward_decision")' .runs/*/events.ndjson` (no export CLI).

## Surfaces

- **MCP** `resolve_agent_profile` — `{ actor?, default?, root_dir? }` → profile + `profile_hash`.
- **HPURL** optional `agent=` next to capsule/vows (proof UX “who”).
- **Run state** `.runs/<id>/ward.json` may include `agent_id` + `profile_hash` when a profile resolved.
- **Catalog** `AgentProfile` + extended `PrincipalsFile` via `constitution_schemas`.

## Claims (safe)

- Interop building block for hosts that ask “who is this actor?” once.
- Session budget efficiency when profiles set tighten-only caps.
- Not a legal identity assurance product; FROST/DID/cosign are optional future layers, not required for AgentId.
