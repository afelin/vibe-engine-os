#!/usr/bin/env bash
set -euo pipefail

# Install vibe-engine-os promotion layer into a target repo.
# Usage: ./runs/install-into-repo.sh /path/to/target-repo

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <target-repo-path>"
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$TARGET/src" "$TARGET/.github/workflows" "$TARGET/.cursor/skills/vibe-engine" "$TARGET/runs" "$TARGET/.vibe"

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
    echo "  ✓ $(basename "$src")"
  fi
}

echo "Installing vibe-engine-os into $TARGET"

copy_if_exists "$SOURCE/src" "$TARGET/"
copy_if_exists "$SOURCE/agent.ts" "$TARGET/agent.ts"
copy_if_exists "$SOURCE/agent.md" "$TARGET/agent.md"
copy_if_exists "$SOURCE/VOWS.md" "$TARGET/VOWS.md"
copy_if_exists "$SOURCE/mcp.json" "$TARGET/mcp.json"
copy_if_exists "$SOURCE/package.json" "$TARGET/package.json.vibe-ref"
copy_if_exists "$SOURCE/.github/workflows/forever.yml" "$TARGET/.github/workflows/forever.yml"
copy_if_exists "$SOURCE/.cursor/skills/vibe-engine/SKILL.md" "$TARGET/.cursor/skills/vibe-engine/SKILL.md"
copy_if_exists "$SOURCE/runs/activate.sh" "$TARGET/runs/activate.sh"
copy_if_exists "$SOURCE/runs/local-issue.sh" "$TARGET/runs/local-issue.sh"
copy_if_exists "$SOURCE/action.yml" "$TARGET/action.yml"
copy_if_exists "$SOURCE/.vibe/.gitkeep" "$TARGET/.vibe/.gitkeep"

echo ""
echo "Done. Next steps in target repo:"
echo "  npm install"
echo "  npm run activate"
