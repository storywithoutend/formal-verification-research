#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
APALACHE="$ROOT/experiments/.tools/apalache/bin/apalache-mc"
MODEL_DIR="$ROOT/experiments/retry-queue/model"
OUT_DIR="$ROOT/experiments/retry-queue/.tmp/apalache"

if [[ ! -x "$APALACHE" ]]; then
  echo "Run experiments/retry-queue/scripts/install-tools.sh first." >&2
  exit 1
fi

rm -rf "$OUT_DIR"
cd "$MODEL_DIR"
JAVA_HOME="$ROOT/experiments/.tools/jdk" "$APALACHE" \
  --features=no-rows \
  --out-dir="$OUT_DIR" \
  check \
  --config=RetryQueueApalache.cfg \
  --length=12 \
  --no-deadlock \
  --inv=TypeOK,ExclusiveLease,LeasePhaseConsistent,SubmitAtMostOnce,CompletionAfterSubmission,RetryBound,TerminalUnowned \
  RetryQueue.tla
