#!/usr/bin/env bash
# Prepare a public-safe tree under dist/public/ for RISE mirror / OSS export.
# Copies allowlisted paths, applying .public-mirror-exclude.
# Never includes internal/ or go-to-market content.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${PUBLIC_TREE_OUT:-$ROOT/dist/public}"
EXCLUDE_FILE="$ROOT/.public-mirror-exclude"

# Paths that may appear in a RISE docs+site mirror (strategy A) or full OSS export.
# Keep aligned with docs/rise-export.md allowlist.
ALLOW_PATHS=(
  "README.md"
  "VOWS.md"
  "CITATION.cff"
  "agent.md"
  "action.yml"
  "mcp.json"
  "package.json"
  "package-lock.json"
  "tsconfig.json"
  ".nvmrc"
  ".gitignore"
  ".public-mirror-exclude"
  "docs"
  "papers"
  "site"
  "proof"
  "evals"
  "src"
  "runs"
  "scripts"
)

die() { echo "prepare-public-tree: $*" >&2; exit 1; }

command -v rsync >/dev/null 2>&1 || die "rsync is required"
[[ -f "$EXCLUDE_FILE" ]] || die "missing $EXCLUDE_FILE"

rm -rf "$OUT"
mkdir -p "$OUT"

for rel in "${ALLOW_PATHS[@]}"; do
  src="$ROOT/$rel"
  [[ -e "$src" ]] || continue
  if [[ -d "$src" ]]; then
    mkdir -p "$OUT/$rel"
    # Directory-local transfer: exclude GTM by basename; root exclude file still applies.
    rsync -a \
      --exclude-from="$EXCLUDE_FILE" \
      --exclude 'go-to-market.md' \
      --exclude 'internal/' \
      --exclude '.env' \
      --exclude '.env.*' \
      "$src/" "$OUT/$rel/"
  else
    rsync -a --exclude-from="$EXCLUDE_FILE" "$src" "$OUT/"
  fi
done

# Hard deny — fail closed if anything slipped through
if [[ -e "$OUT/internal" ]]; then
  die "refuse to publish: dist/public/internal present"
fi
if [[ -e "$OUT/docs/go-to-market.md" ]]; then
  die "refuse to publish: docs/go-to-market.md present in public tree"
fi
if find "$OUT" \( -iname '*go-to-market*' -o -path '*/internal/*' -o -name 'internal' \) 2>/dev/null | grep -q .; then
  die "refuse to publish: go-to-market or internal path found under $OUT"
fi

cat > "$OUT/.public-tree-README" <<'EOF'
This tree was produced by scripts/prepare-public-tree.sh.
Sync only this directory (or re-run the script) to a RISE public remote.
Do not copy internal/ or secrets. See docs/PUBLIC.md and docs/rise-export.md.

Git sparse alternative (engineering clone, public checkout only):
  git sparse-checkout init --cone
  git sparse-checkout set site papers proof docs src runs scripts evals
  # then delete docs/go-to-market.md and never check out internal/
EOF

echo "prepare-public-tree: wrote $OUT"
