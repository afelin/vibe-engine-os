# Coreward — agent instructions

Before proposing any file edits:

1. Call MCP **`authorize_write`** with proposed paths (and issue title/body when known). Never propose paths without it when Coreward Mode is on.
2. Prefer `prefer_gate` / **`resolve_gate`** over LLM for templated chores.
3. Call **`evaluate_mandate`** for house rules; respect Ward when a signed Mandate is active.
4. Shape planner output to `ExecutionDag` via **`constitution_schemas`**.
5. After a run, **`validate_capsule`**.

MCP server: `coreward-release-gates` (alias `vibe-release-gates`). CLI: `npm run coreward:authorize -- --files a.ts,b.ts`.

**License:** [`LICENSE`](LICENSE) / [`LICENSE.md`](LICENSE.md) — FSL-1.1-Apache-2.0 (free internal use; not free to resell as hosted Coreward until Change Date). Machine index: [`llms.txt`](llms.txt).

**Local/open runtimes:** OpenClaw / Hermes / Ollama are customers of Coreward MCP—not substitutes. Packs: [docs/host-packs.md](docs/host-packs.md). Savings export: `npm run savings:attest`.

See [docs/host-packs.md](docs/host-packs.md) and [.cursor/skills/coreward/SKILL.md](.cursor/skills/coreward/SKILL.md).
