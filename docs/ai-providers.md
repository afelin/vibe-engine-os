# AI Providers — Strict Compliance Doctrine

Phase 1 default: **direct Groq API** via [`src/llm/router.ts`](../src/llm/router.ts). OmniRoute is **optional Phase 2 only**.

## Approved paths

| Tier | Tool | Integration |
|------|------|-------------|
| Corporate | Claude Code | Official CLI; `CLAUDE_CONFIG_DIR` for org profile |
| Corporate | M365 Copilot | Browser BizChat — orchestrator `m365-guide` primitive |
| Research | NotebookLM | **Manual browser tab only** — no MCP automation |
| Experiment | Groq | `VIBE_*_PROVIDER=groq` + `GROQ_API_KEY` |
| Optional | Hermes | Official [NousResearch/hermes-agent](https://github.com/Nousresearch/hermes-agent) CLI |

## Discover corporate Claude

```bash
claude /status
ls ~/.claude/profiles/corp 2>/dev/null
```

Set `CLAUDE_CONFIG_DIR` to your org profile path (see `.env.corporate.example`). The corp-claude primitive auto-detects `~/.claude/profiles/corp` when present.

## Permanent ban list

Never configure or script:

1. Web-cookie providers (`claude-web`, `chatgpt-web`, `copilot-m365-web`)
2. OAuth session extraction into proxies
3. Unofficial NotebookLM MCP / browser automation
4. OmniRoute Fusion, multi-model panels, aggressive compression
5. Experiment API keys in corp-marked repos (`.vibe/corp-boundary`)
6. Corporate credentials in Cursor Cloud

## Trust boundaries

```bash
source scripts/ai-trust-check.sh && npm run local-issue
npm run ai:compliance-check   # monthly
```

Copy `.vibe/corp-boundary.example` → `.vibe/corp-boundary` for work repos.

## Env templates

- `.env.experiment.example` — Groq for personal repos
- `.env.corporate.example` — org gateway / corp Claude
- `.env.omniroute.example` — Phase 2 optional gateway

## Quarterly maintenance (~15 min)

Re-read Groq (+ Gemini if used) ToS. Update this doc if allowlist changes.

See also: [Orchestrator](./orchestrator.md), [solo vibe coder guide](./solo-vibe-coder-guide.md).
