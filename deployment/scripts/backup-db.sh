#!/usr/bin/env bash
set -Eeuo pipefail
source .env

mkdir -p ./backups
FILE="./backups/db_$(date +%Y%m%d_%H%M%S).sql"

echo "💾 Backing up database into $FILE ..."

docker exec "${DB_CONTAINER}" mysql-dump \
    -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" > "$FILE"

echo "✅ Backup created: $FILE"
