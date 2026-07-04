#!/usr/bin/env bash
set -euo pipefail

LEDGER=".runs/operator-events.ndjson"
TMP_DIR="$(mktemp -d)"

cleanup() {
  if [ -f "$TMP_DIR/operator-events.ndjson" ]; then
    mkdir -p .runs
    cp "$TMP_DIR/operator-events.ndjson" "$LEDGER"
  else
    rm -f "$LEDGER"
    rmdir .runs 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -f "$LEDGER" ]; then
  cp "$LEDGER" "$TMP_DIR/operator-events.ndjson"
fi

env \
  GITHUB_EVENT_NAME=issue_comment \
  ISSUE_NUMBER=101 \
  ISSUE_TITLE="Local status smoke" \
  ISSUE_BODY="/status" \
  GITHUB_ACTOR="local-operator" \
  GITHUB_COMMENT_ID="local-status-smoke" \
  npm run local-issue >"$TMP_DIR/status.log"

grep -q "operator.status_requested" "$TMP_DIR/status.log"
grep -q "Operator comment skipped" "$TMP_DIR/status.log"

env \
  GITHUB_EVENT_NAME=issue_comment \
  ISSUE_NUMBER=101 \
  ISSUE_TITLE="Local rollback smoke" \
  ISSUE_BODY="/rollback" \
  GITHUB_ACTOR="local-operator" \
  GITHUB_COMMENT_ID="local-rollback-smoke" \
  npm run local-issue >"$TMP_DIR/rollback.log"

grep -q "operator.rollback_requested" "$TMP_DIR/rollback.log"
grep -q "Operator comment skipped" "$TMP_DIR/rollback.log"
grep -q "operator.status_requested" "$LEDGER"
grep -q "operator.rollback_requested" "$LEDGER"
