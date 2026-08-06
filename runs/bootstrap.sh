#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🔧 Vibe Engine governance bootstrap"

node_major() {
  node -v | sed 's/^v//' | cut -d. -f1
}

ensure_node_22() {
  if [ "$(node_major)" -ge 22 ] 2>/dev/null; then
    return 0
  fi

  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    if [ -f .nvmrc ]; then
      echo "↪ Switching to Node from .nvmrc ($(cat .nvmrc))..."
      # Prefer already-installed runtime; only install when missing
      nvm use || nvm install
    else
      nvm use 22 || nvm install 22
    fi
  fi

  if [ "$(node_major)" -lt 22 ] 2>/dev/null; then
    echo "❌ Node $(node -v) is below required v22 (see package.json engines and .nvmrc)"
    echo "   Fix: nvm install 22 && nvm use"
    exit 1
  fi
}

ensure_node_22
echo "✓ Node $(node -v)"

if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
fi
echo "✓ Dependencies present"

# Activate checks + print/write MCP/skill snippets (no full npm run check — avoid recursion)
npx tsx src/activate/bootstrap-snippets.ts "$ROOT"
echo "✓ bootstrap complete"
