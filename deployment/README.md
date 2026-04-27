# Deployment Guide

This folder contains the Docker Compose deployment for Watcher.

## Requirements

- Docker
- Docker Compose v2 (`docker compose`)

## Configuration

All deployment configuration is centralized in:

- `.env.example` (template, committed)
- `.env` (real values, local only)

Initialize your local configuration once:

```bash
cp .env.example .env
```

Important secrets are managed directly in `deployment/.env`:

- `DJANGO_SECRET_KEY`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_ROOT_PASSWORD`

The Watcher service also reads `${WATCHER_PATH}/.env` for application-specific variables.

## Initialization

Run the checklist:

```bash
make init
```

This checks binaries, prepares `.env`, validates directories, updates TLS config, and creates certificates if missing.

## Main commands

```bash
make up
make down
make build
make pull
make deploy
make migrate
make backup
make populate-db
make superuser
make create-certs
```

Equivalent manual start:

```bash
docker compose --env-file .env up -d
```

## Project structure

```
.
├── docker-compose.yml
├── docker-compose.overide.yml
├── compose_apps.yaml
├── compose_databases.yaml
├── compose_reverse_proxy.yaml
├── .env.example
├── scripts/
│   ├── init.sh
│   ├── check-network.sh
│   ├── deploy.sh
│   ├── migrate.sh
│   ├── backup-db.sh
│   ├── populate-db.sh
│   ├── create-superuser.sh
│   ├── replace-tls.sh
│   └── openssl-certificates-generator.sh
└── Makefile
```

## Security notes

- Never commit `.env`.
- Rotate `DJANGO_SECRET_KEY` and DB credentials for production.
- Prefer secret managers/CI variables for production deployments.
