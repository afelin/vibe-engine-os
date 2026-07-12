#!/usr/bin/env bash
set -euo pipefail

if command -v gh >/dev/null 2>&1; then
  echo "✓ gh CLI $(gh --version | head -1)"
  exit 0
fi

echo "⚠ gh CLI not installed"
echo "  PRs: npm run pr:create (uses GITHUB_TOKEN) or GitHub web UI"
if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
  echo "  Install: brew install gh && gh auth login"
else
  echo "  Install: https://cli.github.com/"
fi
exit 0
