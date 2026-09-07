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

## Corporate proxy / custom CA certificates

If Watcher runs behind a corporate proxy that intercepts or re-signs TLS
traffic (or must trust an internal CA for internal services), drop the CA
certificate(s) in `deployment/certificates/` alongside the existing
`rootcafile.pem`.

The `watcher` service mounts each CA file into
`/usr/local/share/ca-certificates/` (as a separate `.crt` file per CA) and
runs `update-ca-certificates` at container startup. This merges every
mounted CA with the system's public trust store into
`/etc/ssl/certs/ca-certificates.crt`, which `REQUESTS_CA_BUNDLE` points to —
it **extends** the trust store instead of replacing it, so public HTTPS
endpoints (RSS feeds, CVE APIs, ransomware.live, etc.) keep working
alongside internal ones.

To add more than one custom CA, add one volume line per file in
`compose_apps.yaml`, each with its own destination name:

```yaml
    volumes:
      - "${CA_PATH}/rootcafile.pem:/usr/local/share/ca-certificates/custom-ca.crt:ro"
      - "${CA_PATH}/another-ca.pem:/usr/local/share/ca-certificates/another-ca.crt:ro"
```

No custom CA to trust? Nothing to do — `make init` always generates a
self-signed `rootcafile.pem`, so the mount above is always valid and
`update-ca-certificates` simply merges it with the public CAs on every
start.

See [issue #316](https://github.com/thalesgroup-cert/Watcher/issues/316) for
the original bug report and root cause.

## Security notes

- Never commit `.env`.
- Rotate `DJANGO_SECRET_KEY` and DB credentials for production.
- Prefer secret managers/CI variables for production deployments.
