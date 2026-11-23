#!/usr/bin/env bash
# Serve Spectacle locally with the migration working copy as --local_dir.
# Open http://127.0.0.1:8000, then Load → From local server → Model.tla
# and set ModelMode="hardened", DisabledGuard="None", EnabledScenarios={"CORE"}.
set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
ROOT="${ROOT:-$HOME/fv-visual}"
DEST="${DEST:-$ROOT/migration}"
APP="${APP:-$ROOT/spectacle}"

if [[ ! -f "$DEST/Model.tla" ]]; then
  echo "Working copy not found at $DEST." >&2
  exit 1
fi
if ! command -v python3 >/dev/null; then
  echo "python3 is required to serve Spectacle." >&2
  exit 1
fi
if [[ ! -d "$APP/.git" ]]; then
  git clone https://github.com/will62794/spectacle.git "$APP"
fi
cd "$APP"
echo "Spectacle: http://127.0.0.1:8000"
echo "Load tab → From local server → Model.tla"
echo "Constants: ModelMode=\"hardened\", DisabledGuard=\"None\", EnabledScenarios={\"CORE\"}"
exec python3 serve.py --local_dir "$DEST"
