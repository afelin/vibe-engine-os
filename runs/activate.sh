#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "🔧 Vibe Engine activation"

# 1. Node >=22 (auto-switch via nvm when .nvmrc is present)
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
      nvm install
      nvm use
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

# 2. npm install if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
fi
echo "✓ Dependencies present"

# 3. npm run check
echo "🧪 Running npm run check..."
npm run check
echo "✓ check passed"

# 4. Zero-token gate smoke
echo "⚡ Zero-token cloud-loop smoke..."
ISSUE_NUMBER=3 \
ISSUE_TITLE="cloud loop" \
ISSUE_BODY="src/cloud-loop-smoke.ts src/cloud-loop-smoke.test.ts" \
npm run local-issue
echo "✓ zero-token gate passed"

# 5–8. Node activation checks + MCP smoke + activated.json
npx tsx src/activate/run.ts
