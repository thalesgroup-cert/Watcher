#!/usr/bin/env bash
set -Eeuo pipefail
source .env

mkdir -p ./backups
FILE="./backups/db_$(date +%Y%m%d_%H%M%S).sql"

echo "💾 Backing up database into $FILE ..."

docker exec "${DB_CONTAINER}" mysql-dump \
    -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" > "$FILE"

echo "✅ Backup created: $FILE"
