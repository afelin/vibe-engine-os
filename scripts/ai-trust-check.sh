#!/usr/bin/env bash
# Trust boundary: refuse experiment LLM env in corp-marked repos.
set -euo pipefail

ROOT="${VIBE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
CORP_MARKER="$ROOT/.vibe/corp-boundary"

is_corp_repo() {
  [[ -f "$CORP_MARKER" ]]
}

has_experiment_env() {
  [[ -n "${GROQ_API_KEY:-}" ]] ||
    [[ "${VIBE_PLANNER_PROVIDER:-}" == "groq" ]] ||
    [[ "${VIBE_CODEGEN_PROVIDER:-}" == "groq" ]]
}

has_banned_provider_env() {
  [[ -n "${OMNIROUTE_OAUTH_PROVIDER:-}" ]] ||
    [[ -n "${COPILOT_M365_TOKEN:-}" ]] ||
    [[ -n "${CLAUDE_WEB_SESSION:-}" ]] ||
    [[ -n "${CHATGPT_WEB_SESSION:-}" ]]
}

if is_corp_repo && has_experiment_env; then
  echo "ai-trust-check: FAIL — experiment LLM env (GROQ_API_KEY / VIBE_*_PROVIDER=groq) in corp-marked repo." >&2
  echo "Remove experiment keys or unset .vibe/corp-boundary for personal repos." >&2
  exit 1
fi

if has_banned_provider_env; then
  echo "ai-trust-check: FAIL — banned web-cookie / OAuth proxy env vars detected." >&2
  exit 1
fi

if [[ "${CLAUDE_CONFIG_DIR:-}" == *experiment* ]] && is_corp_repo; then
  echo "ai-trust-check: FAIL — experiment Claude profile in corp-marked repo." >&2
  exit 1
fi

echo "ai-trust-check: ok"
