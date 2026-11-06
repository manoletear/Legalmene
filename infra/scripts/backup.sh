#!/usr/bin/env bash
# Backup script para Postgres (local o Aurora).
# Uso:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./infra/scripts/backup.sh
#   DATABASE_URL=... S3_BACKUP_BUCKET=legalmene-prod-backups ./infra/scripts/backup.sh
#
# En prod debería correr como ECS scheduled task o GitHub Action con OIDC role.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requerido}"
: "${BACKUP_DIR:=/tmp/legalmene-backups}"
: "${RETENTION_DAYS:=30}"

mkdir -p "$BACKUP_DIR"

TS=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="$BACKUP_DIR/legalmene-$TS.sql.gz"

echo "[backup] dumping $DATABASE_URL → $FILE"
pg_dump \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --serializable-deferrable \
  "$DATABASE_URL" \
  | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] dump completo · $SIZE"

if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  PREFIX="${S3_BACKUP_PREFIX:-legalmene}"
  S3_URI="s3://$S3_BACKUP_BUCKET/$PREFIX/$(basename "$FILE")"
  echo "[backup] subiendo a $S3_URI"
  aws s3 cp "$FILE" "$S3_URI" --storage-class STANDARD_IA
fi

echo "[backup] limpiando dumps locales > $RETENTION_DAYS días"
find "$BACKUP_DIR" -type f -name "legalmene-*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[backup] OK"
