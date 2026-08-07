#!/usr/bin/env bash
set -euo pipefail

# Install coreward (vibe-engine) promotion layer into a target repo.
# Usage: ./runs/install-into-repo.sh /path/to/target-repo

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <target-repo-path>"
  exit 1
fi

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$TARGET/src" "$TARGET/.github/workflows" "$TARGET/.github/ISSUE_TEMPLATE" "$TARGET/.cursor/skills/vibe-engine" "$TARGET/runs" "$TARGET/.vibe" "$TARGET/proof" "$TARGET/evals" "$TARGET/scripts" "$TARGET/docs"

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
    echo "  ✓ $(basename "$src")"
  fi
}

echo "Installing coreward (vibe-engine) into $TARGET"

copy_if_exists "$SOURCE/src" "$TARGET/"
copy_if_exists "$SOURCE/agent.ts" "$TARGET/agent.ts"
copy_if_exists "$SOURCE/agent.md" "$TARGET/agent.md"
copy_if_exists "$SOURCE/VOWS.md" "$TARGET/VOWS.md"
copy_if_exists "$SOURCE/mcp.json" "$TARGET/mcp.json"
copy_if_exists "$SOURCE/package.json" "$TARGET/package.json.vibe-ref"
copy_if_exists "$SOURCE/tsconfig.json" "$TARGET/tsconfig.json"
copy_if_exists "$SOURCE/.nvmrc" "$TARGET/.nvmrc"
copy_if_exists "$SOURCE/action.yml" "$TARGET/action.yml"
copy_if_exists "$SOURCE/.env.example" "$TARGET/.env.example"
copy_if_exists "$SOURCE/.vibe/.gitkeep" "$TARGET/.vibe/.gitkeep"

# GitHub workflows (all 5 promotion workflows)
for wf in forever.yml vibe-pr-gate.yml tdd-attribution.yml vibe-auto-merge.yml pages.yml; do
  copy_if_exists "$SOURCE/.github/workflows/$wf" "$TARGET/.github/workflows/$wf"
done

# Issue templates
copy_if_exists "$SOURCE/.github/ISSUE_TEMPLATE" "$TARGET/.github/ISSUE_TEMPLATE"

# Proof, evals, scripts
copy_if_exists "$SOURCE/proof" "$TARGET/proof"
copy_if_exists "$SOURCE/evals" "$TARGET/evals"
copy_if_exists "$SOURCE/scripts" "$TARGET/scripts"

# Docs subset
for doc in nocode-quickstart.md agent-protocol.md github-app.md agent-adapter.md launch-proof.md; do
  copy_if_exists "$SOURCE/docs/$doc" "$TARGET/docs/$doc"
done

# Runs scripts
copy_if_exists "$SOURCE/runs/activate.sh" "$TARGET/runs/activate.sh"
copy_if_exists "$SOURCE/runs/local-issue.sh" "$TARGET/runs/local-issue.sh"
copy_if_exists "$SOURCE/runs/install-into-repo.sh" "$TARGET/runs/install-into-repo.sh"
copy_if_exists "$SOURCE/runs/adopt.sh" "$TARGET/runs/adopt.sh"
copy_if_exists "$SOURCE/runs/ensure-gh.sh" "$TARGET/runs/ensure-gh.sh"
copy_if_exists "$SOURCE/runs/scoreboard.sh" "$TARGET/runs/scoreboard.sh"
copy_if_exists "$SOURCE/runs/autoresearch.sh" "$TARGET/runs/autoresearch.sh"
copy_if_exists "$SOURCE/runs/smoke.sh" "$TARGET/runs/smoke.sh"

# Cursor skill
copy_if_exists "$SOURCE/.cursor/skills/vibe-engine/SKILL.md" "$TARGET/.cursor/skills/vibe-engine/SKILL.md"

echo ""
echo "Done. Next steps in target repo:"
echo "  bash runs/adopt.sh ."
echo "  # or manually: npm install && npm run activate"
