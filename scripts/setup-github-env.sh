#!/usr/bin/env sh
# GitHub API access for Cursor Agent (no secrets in this file).
#
# 1. Create a fine-grained or classic PAT with repo scope:
#    https://github.com/settings/tokens
#
# 2. Export in the shell that launches Cursor (or add to ~/.zshrc):
#    export GITHUB_TOKEN="your_token_here"
#
# 3. Fully quit and restart Cursor so the agent inherits the variable.
#
# Verify (prints only set/unset, never the value):
#   [ -n "$GITHUB_TOKEN" ] && echo OK || echo MISSING

if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
  echo "GitHub token: set (GITHUB_TOKEN or GH_TOKEN)"
  exit 0
fi
echo "GitHub token: not set — export GITHUB_TOKEN and restart Cursor"
exit 1
