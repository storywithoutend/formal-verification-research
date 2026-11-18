#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
JAVA="$ROOT/experiments/.tools/jdk/bin/java"
JAR="$ROOT/experiments/.tools/tla2tools.jar"
MODEL_DIR="$ROOT/experiments/retry-queue/model"

if [[ ! -x "$JAVA" || ! -f "$JAR" ]]; then
  echo "Run experiments/retry-queue/scripts/install-tools.sh first." >&2
  exit 1
fi

run() {
  local module=$1
  local config=$2
  shift 2
  (
    cd "$MODEL_DIR"
    "$JAVA" -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
      -workers 1 -fp 0 "$@" -config "$config" "$module"
  )
}

run RetryQueue RetryQueue -coverage 1

for config in \
  FaultMissingAtomicity \
  FaultDuplicatedEffect \
  FaultStaleWorkerRace \
  FaultBadRetry
do
  set +e
  output=$(run RetryQueueFaults "$config" 2>&1)
  status=$?
  set -e
  printf '%s\n' "$output"
  if [[ $status -ne 12 ]] || ! grep -q 'Error: Invariant .* is violated' <<<"$output"; then
    echo "$config did not fail with the expected invariant-violation class" >&2
    exit 1
  fi
done
