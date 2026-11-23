#!/usr/bin/env bash
# Run TLC on the local copy of the migration model and render a state graph.
# Never writes into the apps-monorepo worktree.
set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
JAVA_HOME="${JAVA_HOME:-$HOME/.local/share/mise/installs/java/temurin-25.0.5+8.0.LTS}"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
TLC_JAR="${TLC_JAR:-$HOME/.local/share/mise/installs/http-tla2tools/1.7.4/tla2tools.jar}"
DEST="${DEST:-$HOME/fv-visual/migration}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="${1:-Graph-CORE.cfg}"

if [[ ! -f "$DEST/Model.tla" ]]; then
  echo "Working copy not found at $DEST." >&2
  echo "Copy Model.tla and MigrationContract.tla from the public branch or the read-only worktree first." >&2
  exit 1
fi
if [[ ! -f "$JAVA_HOME/bin/java" ]]; then
  echo "Java not found at $JAVA_HOME. Install Temurin 25 via mise, or set JAVA_HOME." >&2
  exit 1
fi
if [[ ! -f "$TLC_JAR" ]]; then
  echo "tla2tools.jar not found at $TLC_JAR. Set TLC_JAR." >&2
  exit 1
fi
command -v dot >/dev/null || { echo "Graphviz (dot) is not on PATH. brew install graphviz" >&2; exit 1; }

# Refresh the reduced configs from this repo if present.
if [[ -f "$TOOL_DIR/configs/$CONFIG" ]]; then
  cp "$TOOL_DIR/configs/$CONFIG" "$DEST/$CONFIG"
fi

mkdir -p "$DEST/out"
STEM="${CONFIG%.cfg}"
cd "$DEST"
echo "Running TLC with $CONFIG ..."
"$JAVA_HOME/bin/java" -XX:+UseParallelGC -cp "$TLC_JAR" tlc2.TLC \
  -workers 4 -fp 0 -checkpoint 0 \
  -config "$CONFIG" \
  -metadir "$DEST/out/meta-$STEM" \
  -dump dot,colorize,actionlabels "$DEST/out/Model-$STEM" \
  Model

DOT="$DEST/out/Model-$STEM.dot"
# TLC appends .dot if we didn't include it; accept either name.
if [[ ! -f "$DOT" && -f "$DEST/out/Model-$STEM" ]]; then
  DOT="$DEST/out/Model-$STEM"
fi

python3 "$SCRIPT_DIR/compact-dot.py" "$DOT" "$DEST/out/Model-$STEM-compact.dot" --rankdir LR
python3 "$SCRIPT_DIR/compact-dot.py" "$DOT" "$DEST/out/Model-$STEM-compact-tb.dot" --rankdir TB
dot -Tpng -Gdpi=180 -o "$DEST/out/Model-$STEM-compact.png" "$DEST/out/Model-$STEM-compact.dot"
dot -Tsvg -o "$DEST/out/Model-$STEM-compact.svg" "$DEST/out/Model-$STEM-compact.dot"
dot -Tpng -Gdpi=160 -o "$DEST/out/Model-$STEM-compact-tb.png" "$DEST/out/Model-$STEM-compact-tb.dot"
dot -Tsvg -o "$DEST/out/Model-$STEM-compact-tb.svg" "$DEST/out/Model-$STEM-compact-tb.dot"
# Full-label dump is kept as SVG only; the PNG is usually too tall to view.
dot -Tsvg -o "$DEST/out/Model-$STEM-full.svg" "$DOT"
echo "Wrote:"
ls -la "$DEST/out/Model-$STEM-compact.png" "$DEST/out/Model-$STEM-compact-tb.png" "$DEST/out/Model-$STEM-compact.svg"
