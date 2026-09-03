#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BASE_DIR=$(dirname "$SCRIPT_DIR")
BACKUP_DIR=${BACKUP_DIR:-/var/backups/wfs/wellnot}
RETENTION_DAYS=${RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$BACKUP_DIR/wellnot-$STAMP.sqlite"

cd "$BASE_DIR"
mkdir -p "$BACKUP_DIR"
umask 077

docker compose exec -T app node --input-type=module -e \
  "import { DatabaseSync, backup } from 'node:sqlite'; const source=new DatabaseSync('/var/lib/wellnot/wellnot.sqlite',{readOnly:true}); await backup(source,'/var/backups/wellnot/$(basename "$TARGET")'); source.close();"

sha256sum "$TARGET" > "$TARGET.sha256"
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete
echo "wellnot backup complete: $(basename "$TARGET")"
