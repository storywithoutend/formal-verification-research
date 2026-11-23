#!/usr/bin/env bash
# Draw a reader-facing statechart of the migration model with pstack /statechart.
# Requires a local checkout of the skill (not vendored here):
#   https://github.com/cursor/plugins/tree/main/pstack/skills/statechart
# MIT License, Copyright (c) 2026 Lauren Tan.
#
# Usage: run-statechart.sh [OUT_DIR]
# Never writes into the apps-monorepo worktree.
set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export JAVA="${JAVA:-$HOME/.local/share/mise/installs/java/temurin-25.0.5+8.0.LTS/bin/java}"
export TLA2TOOLS="${TLA2TOOLS:-$HOME/.local/share/mise/installs/http-tla2tools/1.7.4/tla2tools.jar}"
PSTACK="${PSTACK:-$HOME/fv-visual/pstack/pstack/skills/statechart/scripts/statechart}"
DEST="${DEST:-$HOME/fv-visual/migration}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="${1:-}"

if [[ ! -x "$PSTACK" ]]; then
  echo "pstack statechart not found at $PSTACK" >&2
  echo "Clone https://github.com/cursor/plugins (sparse: pstack/skills/statechart) and set PSTACK." >&2
  exit 1
fi
if [[ ! -f "$DEST/Model.tla" ]]; then
  echo "Working copy not found at $DEST." >&2
  exit 1
fi

cp "$TOOL_DIR/configs/Graph-Branching.cfg" "$DEST/Graph-Branching.cfg"
cp "$TOOL_DIR/MigrationView.mjs" "$DEST/MigrationView.mjs"

if [[ -z "$OUT" ]]; then
  OUT="$HOME/fv-visual/statechart-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$OUT"
# statechart requires an empty folder
if [[ -n "$(ls -A "$OUT" 2>/dev/null || true)" ]]; then
  echo "$OUT is not empty. Pass a new folder." >&2
  exit 1
fi

"$PSTACK" "$DEST/Model.tla" \
  --config "$DEST/Graph-Branching.cfg" \
  --view "$DEST/MigrationView.mjs" \
  --out "$OUT"
echo "Wrote $OUT"
