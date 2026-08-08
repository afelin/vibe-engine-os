# Governance

## Maintainer

Coreward is **solo-maintained** by the repository owner. There is no separate foundation, steering committee, or multi-party board in this tree.

## How law changes

| Surface | How it changes |
| --- | --- |
| Agent vows | [AGENTS.md](AGENTS.md), [VOWS.md](VOWS.md), `src/constitution/vows.json` via PR + green checks |
| House mandates | `src/policy/mandates.json` (operator-controlled; agents cannot self-authorize edits) |
| Signed Mandates / Ward | Operator-issued keys and `.vibe/` session artifacts — see [docs/ward-security.md](docs/ward-security.md) |
| Public claims | Claim ledger + [site/status](https://afelin.github.io/coreward/status/) / [site/trust](https://afelin.github.io/coreward/trust/) |

## What does not live here

Per [docs/PUBLIC.md](docs/PUBLIC.md): **no** equity, spin-off, or governance-handoff strategy in public files. No pricing or GTM packaging in this tree.

## Decisions

Day-to-day merge authority rests with the maintainer. Community PRs are welcome under [CONTRIBUTING.md](CONTRIBUTING.md); breaking constitution or gauntlet changes require explicit maintainer approval.
