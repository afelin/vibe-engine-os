# Contributing

## Start here

1. Read [docs/start-here.md](docs/start-here.md) and [AGENTS.md](AGENTS.md).
2. `npm run activate` (Node ≥ 22).
3. Before proposing file edits: MCP **`authorize_write`** (or `npm run coreward:authorize -- --files …`) when Coreward Mode is on.
4. Prefer zero-token gates (`resolve_gate` / `prefer_gate`) over LLM for templated chores.
5. Keep claim-safe language: tamper-**evident**, not tamper-proof; receipts ≠ certification.

## Pull requests

- Small, focused changes; conventional commits (`feat`, `fix`, `docs`, …).
- Run `npm run check` when touching engine/constitution surfaces.
- Do not weaken gauntlet baselines or house forbids without an explicit operator decision.
- See the PR template checklist.

## Conduct & support

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SUPPORT.md](SUPPORT.md)
- [GOVERNANCE.md](GOVERNANCE.md)
