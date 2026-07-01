#!/usr/bin/env bash
set -Eeuo pipefail
source .env

# Simple log function
log() {
    echo "[populate-db] $1"
}

log "Using container name: $WEB_CONTAINER"

# Ensure the container is running
if ! docker compose ps --status running | grep -q "$WEB_CONTAINER"; then
    log "Error: Watcher container '$WEB_CONTAINER' is not running."
    log "Start the stack first:"
    echo "  docker compose up -d"
    exit 1
fi

# Populate Watcher database
log "Launching Watcher db population..."
docker compose exec "$WEB_CONTAINER" python manage.py populate_db

log "Database population completed successfully."