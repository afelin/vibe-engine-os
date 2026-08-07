#!/usr/bin/env bash
set -euo pipefail

# One-command adoption: install bundle + npm install + activate.
# Usage: bash runs/adopt.sh /path/to/target-repo
#        bash runs/adopt.sh .   (when already installed)

TARGET="${1:-.}"
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$TARGET" != "." ] && [ ! -f "$TARGET/package.json" ] && [ ! -f "$TARGET/package.json.vibe-ref" ]; then
  echo "Installing coreward (vibe-engine) into $TARGET..."
  bash "$SOURCE/runs/install-into-repo.sh" "$TARGET"
fi

cd "$TARGET"

if [ ! -f package.json ] && [ -f package.json.vibe-ref ]; then
  echo "⚠ package.json not merged — copy scripts/deps from package.json.vibe-ref"
fi

if [ ! -d node_modules ]; then
  echo "📦 npm install..."
  npm install
fi

echo "🔧 npm run activate..."
npm run activate

echo ""
echo "✅ Adoption complete. See docs/nocode-quickstart.md for issue → PR → receipt loop."
