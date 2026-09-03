#!/usr/bin/env sh
set -eu

test "$#" -eq 1 || { echo "usage: $0 BACKUP.sqlite" >&2; exit 2; }
BACKUP=$1
test -f "$BACKUP"
test "${CONFIRM_RESTORE:-}" = "YES" || {
  echo "Restore replaces the production database. Obtain explicit approval and set CONFIRM_RESTORE=YES." >&2
  exit 3
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE_DIR=$(dirname "$SCRIPT_DIR")
cd "$BASE_DIR"

sha256sum -c "$BACKUP.sha256"
docker compose stop app
docker run --rm -v wfs-wellnot_wellnot_data:/data -v "$(dirname "$BACKUP"):/restore:ro" busybox:1.37 \
  sh -c "cp '/restore/$(basename "$BACKUP")' /data/wellnot.sqlite && chown 1000:1000 /data/wellnot.sqlite"
docker compose start app
