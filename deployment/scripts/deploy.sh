#!/usr/bin/env bash
set -Eeuo pipefail

echo "🚀 Deploying full stack..."

docker compose pull
docker compose build
docker compose down --remove-orphans
docker compose up -d

echo "✅ Deployment done."
