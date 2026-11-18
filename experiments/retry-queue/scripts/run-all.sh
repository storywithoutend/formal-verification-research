#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PROJECT="$ROOT/experiments/retry-queue"

"$PROJECT/scripts/install-tools.sh"
cd "$PROJECT"
npm ci
npm run typecheck
npm test
npm run trace:generate
npm run trace:validate-all
npm run tlc
npm run apalache
npm run mutate
