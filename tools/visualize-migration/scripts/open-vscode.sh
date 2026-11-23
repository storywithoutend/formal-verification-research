#!/usr/bin/env bash
# Open the working copy of the migration model in VS Code, with the TLA+
# extension settings and a debug launch config already in place.
set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
DEST="${DEST:-$HOME/fv-visual/migration}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v code >/dev/null; then
  echo "The VS Code 'code' CLI is not on PATH." >&2
  exit 1
fi
if [[ ! -f "$DEST/Model.tla" ]]; then
  echo "Working copy not found at $DEST." >&2
  exit 1
fi

# Ensure the TLA+ extension is installed (no-op if it already is).
code --install-extension tlaplus.vscode-ide >/dev/null

mkdir -p "$DEST/.vscode"
cp "$TOOL_DIR/configs/settings.json" "$DEST/.vscode/settings.json"
cp "$TOOL_DIR/configs/launch.json" "$DEST/.vscode/launch.json"
# Prefer the reduced CORE config as the first file so Check/Debug uses it.
code "$DEST" "$DEST/Graph-CORE.cfg" "$DEST/Model.tla"
echo "Opened $DEST in VS Code."
echo "Then: Command Palette → “TLA+: Check model with TLC” or “TLA+: Check and debug model with TLC”."
