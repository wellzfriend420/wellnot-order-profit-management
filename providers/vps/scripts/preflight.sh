#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE_DIR=$(dirname "$SCRIPT_DIR")
cd "$BASE_DIR"

test -f .env || { echo ".env is missing" >&2; exit 1; }
test "$(stat -c %a .env)" = "600" || { echo ".env must have mode 600" >&2; exit 1; }
docker compose config --quiet
docker compose build
