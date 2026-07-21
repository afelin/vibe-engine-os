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

Run only if the `claude` CLI is installed; if missing, the `corp-claude` slot reports `available: false` and the heal ladder escalates — no crash.

```bash
claude /status
ls ~/.claude/profiles/corp 2>/dev/null
ls /Library/Application\ Support/ClaudeCode/managed-settings.json 2>/dev/null
ls ~/.claude/managed-settings.json 2>/dev/null
```

| Signal from `/status` or env | Meaning | Action |
|------------------------------|---------|--------|
| `ANTHROPIC_BASE_URL` → non-anthropic host | Org LLM gateway | Use as-is; set `CLAUDE_CONFIG_DIR` for corp profile |
| `api.anthropic.com` + org API key | Corporate Anthropic billing | Direct; no OmniRoute |
| claude.ai OAuth / SSO / `forceLoginMethod` | Team/Enterprise SSO | Corp path only — do not override with personal gateway |

Priority for `invokeCorpClaude` / `resolveCorpClaudeConfigDir`:

1. Explicit `CLAUDE_CONFIG_DIR` env
2. `~/.claude/profiles/corp` if that directory exists
3. Fallback `~/.claude`

See `.env.corporate.example`. Never route corp OAuth through OmniRoute or web-cookie providers.

## Optional Hermes (research slot)

Install the official CLI only when you want long research jobs on experiment repos:

```bash
# Follow upstream install for your OS:
# https://github.com/NousResearch/hermes-agent
hermes --version   # must succeed for slot availability
```

Enable in `.vibe/orchestrator/agents.json` (see `agents.json.example`). If `hermes` is not on `PATH`, `detectHermes` returns false and `invokeHermes` returns `hermes_not_installed` — troubleshoot continues without it.

## M365 guide (human-in-loop)

`invokeM365Guide` builds a BizChat-ready prompt + `https://m365.cloud.microsoft/chat` link. It does **not** call Microsoft APIs, extract tokens, or proxy Copilot. A human opens BizChat and pastes the prompt.

## Permanent ban list

Never configure or script:

1. Web-cookie providers (`claude-web`, `chatgpt-web`, `copilot-m365-web`)
2. OAuth session extraction into proxies
3. Unofficial NotebookLM MCP / browser automation
4. OmniRoute Fusion, multi-model panels, aggressive/ultra/stacked compression
5. Experiment API keys in corp-marked repos (`.vibe/corp-boundary`)
6. Corporate credentials in Cursor Cloud
7. OmniRoute Remote on a public VPS; any provider marked `caution` or `ambiguous` for proxy use

## OmniRoute (optional Phase 2)

**Do not install by default.** Phase 1 uses **direct Groq** via `src/llm/router.ts` + `.env.experiment.example`. OmniRoute is **not** a dependency of the orchestrator.

Only consider Phase 2 if Groq alone is insufficient:

1. Pin an exact version (see `.env.omniroute.example`)
2. Connect **only** Groq + Gemini via published API keys
3. Single static combo — **no** Fusion, multi-strategy routing, or compression
4. Experiment / personal repos only — never corp-marked trees

## Trust boundaries

```bash
source scripts/ai-trust-check.sh && npm run local-issue
npm run ai:compliance-check   # monthly
```

Copy `.vibe/corp-boundary.example` → `.vibe/corp-boundary` for work repos.

## Env templates

- `.env.experiment.example` — Groq for personal repos (Phase 1 default)
- `.env.corporate.example` — org gateway / corp Claude
- `.env.omniroute.example` — Phase 2 optional gateway (install only if needed)

## Quarterly maintenance (~15 min)

Re-read Groq (+ Gemini if used) ToS. Update this doc if allowlist changes.

See also: [Orchestrator](./orchestrator.md), [solo vibe coder guide](./solo-vibe-coder-guide.md).
