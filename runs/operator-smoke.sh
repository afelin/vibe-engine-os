#!/usr/bin/env bash
set -euo pipefail

LEDGER=".runs/operator-events.ndjson"
DEDUPE=".runs/operator-processed-comments.ndjson"
TMP_DIR="$(mktemp -d)"

cleanup() {
  mkdir -p .runs
  if [ -f "$TMP_DIR/operator-events.ndjson" ]; then
    cp "$TMP_DIR/operator-events.ndjson" "$LEDGER"
  else
    rm -f "$LEDGER"
  fi
  if [ -f "$TMP_DIR/operator-processed-comments.ndjson" ]; then
    cp "$TMP_DIR/operator-processed-comments.ndjson" "$DEDUPE"
  else
    rm -f "$DEDUPE"
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -f "$LEDGER" ]; then
  cp "$LEDGER" "$TMP_DIR/operator-events.ndjson"
fi
if [ -f "$DEDUPE" ]; then
  cp "$DEDUPE" "$TMP_DIR/operator-processed-comments.ndjson"
fi
# Isolate smoke from prior local runs of the same fixed comment IDs
rm -f "$DEDUPE"

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

# Fast /go three-action guide (direct render — no full agent path)
npx tsx <<'TS' >"$TMP_DIR/go.log"
import { renderGoGuide } from "./src/operator/cockpit.js";

const body = renderGoGuide({ preRun: true });
const numbered = [...body.matchAll(/^\d+\.\s/gm)];
if (!body.startsWith("## Go")) {
  console.error("go guide missing ## Go heading");
  process.exit(1);
}
if (numbered.length !== 3) {
  console.error(`go guide expected 3 actions, got ${numbered.length}`);
  process.exit(1);
}
if (!/\*\*Blocking:\*\*/.test(body) || !/\*\*Fastest unblock:\*\*/.test(body) || !/\*\*Merge or deploy next:\*\*/.test(body)) {
  console.error("go guide missing required action labels");
  process.exit(1);
}
console.log("operator.go_guide_ok");
TS

grep -q "operator.go_guide_ok" "$TMP_DIR/go.log"
