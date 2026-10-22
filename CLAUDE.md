# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Watcher?

Watcher is an AI-powered cybersecurity threat detection and monitoring platform built by Thales Group CERT, packaged as a single Django project with a React (webpack, not Vite) frontend embedded in it. It continuously watches for threats targeting an organisation: trending CVEs and ransomware activity, RSS-fed CERT advisories, look-alike/typosquatted domains (DNS permutation + Certificate Transparency), data leaks across paste sites and code registries, and changes to monitored malicious/legitimate domains — then correlates, scores, and pushes the results into TheHive/MISP, Slack, Citadel, or email.

## Commands

### Deployment (from `deployment/`)

```bash
make init            # First-time setup: certs, network, config dirs
make up               # Start all services (netcheck + TLS refresh, then docker compose up -d)
make down             # Stop services (--remove-orphans)
make build            # Build Docker images
make pull             # Pull Docker images
make deploy           # netcheck + TLS refresh, then ./scripts/deploy.sh
make migrate          # Run Django DB migrations (./scripts/migrate.sh)
make populate-db      # Seed sample data (./scripts/populate-db.sh)
make superuser        # Create Django admin user (./scripts/create-superuser.sh)
make create-certs     # Generate TLS certificates
make backup           # Backup the database (./scripts/backup-db.sh)
```

### Frontend (from repo root, builds into `Watcher/Watcher/frontend/static/frontend/`)

```bash
npm run dev           # webpack --mode development --watch, served by Django via whitenoise
npm run build          # webpack --mode production
npm run cypress:open   # Cypress e2e, interactive
npm run test:e2e       # Cypress e2e, headless
```

There is no separate frontend dev server — React is bundled by webpack and served by Django itself (`frontend` app), unlike a typical Vite-proxied SPA setup.

### Backend (from `Watcher/Watcher/`)

```bash
python manage.py migrate
python manage.py test               # per-app tests.py (accounts, common, connectors, cyber_watch, data_leak, dns_finder, site_monitoring, threats_watcher, timeline)
python manage.py test <app_label>   # run a single app's tests
python manage.py createsuperuser
```

## Architecture

### Services (Docker Compose, assembled from `deployment/compose_*.yaml` + `deployment/docker-compose.yml`)

| Service | Role |
|---|---|
| `watcher` | Django app (runserver on 9002 in dev compose; Gunicorn-style prod image `ghcr.io/thalesgroup-cert/watcher`) — runs the web UI/API *and* the in-process APScheduler jobs (see below); fixed IP `10.10.10.6` |
| `db_watcher` | MySQL 8.0 (`mysql_native_password` auth plugin required) — fixed IP `10.10.10.5` |
| `searxng` | Privacy-respecting metasearch engine, used by `data_leak` for paste/code-leak searches — fixed IP `10.10.10.3` |
| `certstream` | `0rickyy0/certstream-server-go` — Certificate Transparency stream consumed by `dns_finder` for real-time suspicious-domain detection — fixed IP `10.10.10.7` |
| `traefik` (optional, `compose_reverse_proxy.yaml`) | TLS-terminating reverse proxy for the corporate domain |

All services share one Docker network (`10.10.10.0/24` in the simple root `docker-compose.yml`, or `${NETWORK_SUBNET}` in the modular `deployment/` compose set) with static IPs — the app talks to `searxng`/`db_watcher`/`certstream` by fixed address, not just service name, so don't renumber them without updating `no_proxy`/`NO_PROXY` too.

### Detection → notification flow

Every module follows the same shape: an APScheduler job in that app's `core.py` detects or fetches something (a new CVE/ransomware post, a DGA-matched or newly-certstream'd domain, a leaked credential, an RSS breaking-news item, a content/IP/MX drift on a monitored site, a UDRP status change) → creates/updates a model row → hands off to the `connectors` app for outbound delivery (a TheHive alert, a MISP object, a Slack/Citadel message, an email via the `smtp` connector) based on which connectors are configured and healthy → `timeline`'s middleware/signals log the event to the cross-module activity feed. There is no shared cross-app "Case"/job ledger tying these together — each app's `core.py` talks to `connectors` directly and independently, so a given detection's outbound deliveries are only traceable through that app's own models plus `timeline`, not a unified pipeline object.

### Scheduling model — no Celery

There is **no Celery/Redis** in this project. Each Django app that needs background jobs defines a `core.py` with a module-level `start_scheduler()` that creates an APScheduler `BackgroundScheduler` and registers cron/interval jobs; that function is called once at import time from the app's own `urls.py` (e.g. `common/urls.py` does `from .core import start_scheduler` then `start_scheduler()` at module scope). Because it's wired through URL-conf import, the schedulers start as a side effect of Django loading the URL root — not from `apps.py.ready()` — so don't assume moving scheduler code into `AppConfig.ready()` is a no-op refactor.

Representative jobs (see each app's `core.py` for the authoritative list):

| App | Jobs |
|---|---|
| `threats_watcher` | `main_watch` (RSS ingestion, every 30 min), `cleanup` (daily 08:00), `generate_weekly_summary` (AI weekly digest) |
| `dns_finder` | `main_dns_twist` (dnstwist permutation scan, every 2h), `main_certificate_transparency` (certstream consumer, every 1h) |
| `data_leak` | `main_data_leak` (SearxNG-driven leak search, every 5 min, up to 10 concurrent instances), `cleanup` (every 2h) |
| `site_monitoring` | `monitoring_check` (content/IP/MX diff via TLSH, every 15 min), `update_site_monitoring_rdap_data` (every 15 min) |
| `cyber_watch` | `fetch_latest_cves`, `fetch_ransomware_data`, `fetch_ransomlook_data` (all every 30 min) |
| `common` | `update_domain_registrar_info` / `update_legitimate_domains_rdap_data` (WHOIS/RDAP, every 30 min), `update_monitored_sites_rdap_data` / `update_all_ssl_certificates` (hourly/6h), `check_udrp_statuses` (6h), `run_weekly_health_checks` (connector health, Monday 06:00) |

### Django Apps (`Watcher/Watcher/`)

| App | Responsibility |
|---|---|
| `watcher` | Project settings, root `urls.py`, WSGI entrypoint |
| `accounts` | Auth: local, LDAP (`django-auth-ldap`), OIDC/SSO (`mozilla-django-oidc`, PKCE, Knox token issuance) |
| `common` | Cross-cutting: legitimate domain registry, MISP export (`misp.py`), mail templates, WHOIS/RDAP/SSL/UDRP scheduled checks, connector health checks |
| `connectors` | Connector framework: registry/dispatch (`core.py`), encrypted credential storage, per-connector health checks; `contrib/` holds one module per integration — `thehive`, `misp`, `slack`, `citadel`, `smtp`, `searxng`, `certstream`, `ldap`, `oidc`, `mysql`, `cyberwatch_cve`, `ransomlook`, `ransomware_live`, `wipo_udrp` |
| `cyber_watch` | CVE (cve.circl.lu) and ransomware (ransomware.live, ransomlook.io) intelligence fetch/correlation, keyword-based Watch Rules |
| `data_leak` | Leak detection across Pastebin, StackOverflow, GitHub/GitLab/Bitbucket, APKMirror, npm, etc., via SearxNG |
| `dns_finder` | Suspicious/typosquatted domain detection: dnstwist permutations + certstream-driven Certificate Transparency monitoring; `certstream_client.py` is the websocket consumer for the internal `certstream` service |
| `site_monitoring` | Malicious-domain surveillance (IP/MX/content-hash via TLSH, RDAP/WHOIS expiry) and UDRP case tracking (`udrp.py`) |
| `threats_watcher` | RSS-fed threat news (CERT-FR, CERT-EU, US-CERT, ACSC, …), AI summarization/NER pipeline (`model_manager.py`, `summary_manager.py`) for weekly digests and breaking-news alerts |
| `timeline` | Cross-module audit/activity timeline (`middleware.py` + `signals.py` capture events from the other apps) |
| `frontend` | Serves the built React/webpack bundle (`frontend/static/frontend/`) and its Django template/view |

### Frontend (`Watcher/Watcher/frontend/src`)

React 18 (not 19) + React Router v5 + Redux (`redux`, `react-redux`, `redux-thunk`) + MUI v9 (`@mui/material`, `@mui/x-charts`, `@mui/lab`), bundled by webpack 5 (Babel, not Vite/esbuild) straight into Django's static files — no separate frontend server or API proxy to configure. Also pulls in `deck.gl` (WorldMap geospatial view), `chart.js`/`react-chartjs-2`, `react-grid-layout` (resizable dashboard panels), `react-wordcloud`, and `bootstrap`/`react-bootstrap` alongside MUI. E2E tests use Cypress (`Watcher/cypress/`), not Playwright.

### AI / ML

- **`google/flan-t5-base`** (Hugging Face `transformers`) — text-to-text generation for AI-powered weekly threat summaries and on-demand keyword summaries.
- **`dslim/bert-base-NER`** — Named Entity Recognition for automatic CVE/threat-actor/IOC extraction from ingested RSS content (`threats_watcher/core.py:extract_entities_and_threats`).
- **TLSH** (`python-tlsh`) — fuzzy hashing to detect content drift on monitored sites, not a neural model but part of the same detection pipeline.

## Key Configuration Files

| File | Purpose |
|---|---|
| `deployment/.env` (from `.env.example`) | Everything: ports, image versions, network subnet/IPs, DB credentials, `DJANGO_SECRET_KEY`, SearxNG hostname, proxy settings. Watcher has **no `settings.json`** — all runtime config is environment variables consumed directly in `watcher/settings.py` |
| `certstream-config.yaml` | Config for the bundled certstream-server-go instance |
| `Searx/searx/` | SearxNG instance config, mounted read-write into the `searxng` container |
| `deployment/Makefile` | All operational tasks (see Commands above) |
| `deployment/scripts/` | `init.sh`, `deploy.sh`, `migrate.sh`, `populate-db.sh`, `create-superuser.sh`, `backup-db.sh`, `check-network.sh`, `replace-tls.sh` |

The root `.env` is currently **tracked by git** in this repo (not gitignored) — don't assume it's safe to fill in real secrets locally without first checking `git status`/adding it to `.gitignore`, and don't `git add`/commit it without checking what you'd be staging.

## Full Local Dev Deployment — `/deploy-full-e2e`

Trigger phrase for this section: "deploy full e2e", "stand up the full stack", "redo the local deploy", `/deploy-full-e2e`. **Verified end-to-end on this machine** (Windows + Git Bash + Docker Desktop, no `make` installed — every command below run directly, no Makefile) — all 5 services came up healthy, migrations applied cleanly, a superuser and sample data were created, and the real React UI was confirmed served. Every gotcha below was actually hit, not inferred.

Assumes: Docker + Compose v2 (this machine: client 29.7.2 / compose plugin 5.5.1), commands run from `deployment/` unless noted. **On Windows/Git Bash, `make` is typically absent** — run the underlying commands shown under each step directly instead of via `make <target>`.

### 1. Two separate `.env` files — they overlap, and one silently wins

Watcher reads config from **two different `.env` files at once**. `compose_apps.yaml`'s `watcher` service loads `env_file: [${WATCHER_PATH}/.env, ./.env]` — both merged into the container's environment, with the *second* file's values overriding the first on any shared key:

- **`Watcher/.env`** (repo root, sibling to this file) — the actual Django-level config read in `watcher/settings.py` and each app's `core.py`: `DJANGO_SECRET_KEY`, `DB_*`, LDAP/OIDC, SMTP, Slack/Citadel/TheHive/MISP keys, CyberWatch feed URLs, etc. **There is no `.env.example` for this file anywhere in the repo** — construct it from the variable names Django actually reads, or copy an existing deployment's `.env` and blank the secrets.
- **`deployment/.env`** (from `deployment/.env.example`) — the Compose-level config: ports, image versions, network subnet/IPs, container names — but **also** `DB_USER`/`DB_PASSWORD`/`DB_ROOT_PASSWORD`/`DJANGO_SECRET_KEY`/`TZ`/`SEARX_HOSTNAME`/`SEARX_COMMAND`/`DATA_LEAK_SEARX_URL`/`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` — the exact same variable names as the root `.env`.

Because `deployment/.env` loads *last*, it silently wins on all 11 overlapping keys. Set a real `DJANGO_SECRET_KEY` or DB password only in the root `.env` and the container still runs with `deployment/.env`'s (placeholder) value — no error, no warning. Keep those keys in sync by hand across both files.

### 2. `init.sh` (`make init`)

```bash
cd deployment
bash ./scripts/init.sh
```
Creates `deployment/.env` from `.env.example` if missing (does **not** touch the root `.env` — it only checks `${WATCHER_PATH}/.env` exists), checks the `db_watcher`/`Searx/searx`/`certificates` directories, rewrites `${DOMAIN_CORP}` into `traefik/dynamic/tls.yaml`, and generates TLS certs if missing.

**Gotcha (Windows/Git Bash only) — MSYS path conversion breaks the OpenSSL `-subj` argument.** The first `init.sh` run failed with `req: subject name is expected to be in the format /type0=value0/... This name is not in that format: 'C:/Program Files/Git/C=FR/ST=...'` — Git Bash's MSYS runtime rewrites any argument that looks like a leading-`/` POSIX path into a Windows path, mangling `openssl-certificates-generator.sh`'s `-subj "/C=FR/ST=..."`. Fix: prefix every script invocation with `MSYS_NO_PATHCONV=1`, e.g. `MSYS_NO_PATHCONV=1 bash ./scripts/init.sh`. Applies to every script here, not just `init.sh`.

**Gotcha (Windows/Git Bash only) — `.env` is created with CRLF line endings, which breaks the scripts' hand-rolled env parser.** `cp .env.example .env` (inside `init.sh`) preserves the CRLF endings `deployment/.env.example` was checked out with (git's `core.autocrlf` on Windows). `check-network.sh` and `replace-tls.sh` both parse `.env` with a manual `while IFS='=' read -r key value` loop that doesn't strip `\r` — this reads blank lines as a lone `\r` character (not caught by the `-z "$key"` empty check), producing `export: `=': not a valid identifier` spam, and worse, embeds a trailing `\r` into every real value it exports. Fix once, after `init.sh` creates the file: `sed -i 's/\r$//' deployment/.env`. (The root `.env` also has CRLF but is git-tracked — don't rewrite it in place without checking `git diff` first.)

**Gotcha — the domain gets baked into `tls.yaml` exactly once.** `init.sh`/`replace-tls.sh` both run a literal `sed 's/Host(\`watcher\`)/.../''` against `traefik/dynamic/tls.yaml`, whose shipped placeholder is `` Host(`watcher`) # <-- To Be Changed ``. After the first run that literal string is gone. Change `DOMAIN_CORP` later and re-run — nothing happens, the pattern no longer matches. Changing the domain again means hand-editing `traefik/dynamic/tls.yaml` (or restoring it from git) yourself.

**Gotcha — the generated CA private key ends up on disk outside `certificates/`.** `openssl-certificates-generator.sh` writes a full local PKI (`ca.key.pem`, `ca.cert.srl`, `client.crt.pem`/`.key.pem`, `server.csr.pem`, plus the three files `init.sh` actually wants) into `certificates/default/`; only `certfile.pem`/`keyfile.pem`/`rootcafile.pem` get moved up into `certificates/`. The root CA's own private key (`certificates/default/ca.key.pem`) is left behind there — harmless for a throwaway local CA, but don't reuse this output as a real internal CA.

### 3. Network + up

```bash
MSYS_NO_PATHCONV=1 bash ./scripts/check-network.sh
MSYS_NO_PATHCONV=1 bash ./scripts/replace-tls.sh
MSYS_NO_PATHCONV=1 docker compose --env-file .env up -d
```
`check-network.sh` creates the external `${NETWORK_NAME}` bridge network (`watcher_net` by default, with `${NETWORK_SUBNET}`/`${NETWORK_GATEWAY}`/`${NETWORK_IP_RANGE}`) if it doesn't already exist — idempotent, safe to re-run. `docker compose up -d` then pulled all 5 images (`watcher`, `db_watcher`, `searxng`, `certstream`, `traefik`) and brought every container up; `db_watcher` reports healthy first, then `watcher` starts (its `depends_on: condition: service_healthy` on the DB), reaching `healthy` itself roughly a minute later — Django's `runserver` takes a while to import (torch/transformers among the heavier ones) across all 9 apps' `core.py`.

**Note — `docker-compose.overide.yml` is misspelled** (missing the second `r`; Compose's auto-load convention needs the exact name `docker-compose.override.yml`). It exists in `deployment/`, is nearly identical to `docker-compose.yml` (only the `certstream` healthcheck differs — `curl` vs `pgrep`), and is **never picked up automatically** by `docker compose up`. To actually apply it: `docker compose -f docker-compose.yml -f docker-compose.overide.yml --env-file .env up -d`.

`db_watcher`'s bind mounts (`../db_watcher/data`, `../db_watcher/logs` — i.e. `Watcher/db_watcher/` at the repo root, sibling to `deployment/`) don't exist before the first run; Docker creates them, and the official `mysql` image's own entrypoint (starts as root, drops to the `mysql` user itself) handled ownership fine here — no manual `mkdir`/`chown` needed, unlike a from-scratch app image.

### 4. Migrate, seed, create a superuser

```bash
docker compose exec watcher python manage.py migrate
docker compose exec watcher python manage.py populate_db
docker compose exec \
  -e DJANGO_SUPERUSER_USERNAME=admin \
  -e DJANGO_SUPERUSER_PASSWORD='<a real password>' \
  -e DJANGO_SUPERUSER_EMAIL=admin@watcher.local \
  watcher python manage.py createsuperuser --noinput
```
All 113 migrations applied cleanly (one harmless warning: `threats_watcher.Source.url` — `mysql.W003`, a unique `CharField` over MySQL's 255-byte index limit — pre-existing, not something this deployment caused). `createsuperuser` is interactive by default (`make superuser` just runs it with no flags) — use `--noinput` + the three `DJANGO_SUPERUSER_*` env vars instead when scripting this, same as any Django project.

`populate_db` (`threats_watcher/management/commands/populate_db.py`) is the **only** custom management command in the project. It **prints nothing to stdout** (it logs via `logging.getLogger('watcher')`, not `print`/`self.stdout.write`) — a silent run is success, not failure; confirm with `manage.py shell -c "from threats_watcher.models import BannedWord, Source; print(BannedWord.objects.count(), Source.objects.count())"` (104 banned words / 217 RSS sources seeded from `threats_watcher/datas/*.csv` on this run), plus two default Groups (`Analysts Group`, `Analysts Read Only Group`).

### 5. Verify

```bash
docker compose --env-file .env ps                                             # all 5 healthy/up
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:${WATCHER_PORT:-9020}/   # -> 200, confirmed
curl -sk -H "Host: ${DOMAIN_CORP}" -o /dev/null -w '%{http_code}\n' https://localhost/  # via Traefik
```
Direct access on `WATCHER_PORT` (9020) worked immediately: HTTP 200, real React `index.html` served. The `watcher` container's own healthcheck curls `http:/localhost:9002/#/login` (single-slash typo in the healthcheck command itself — harmless, curl normalizes it) expecting HTTP 200 — reached `healthy` about a minute after `up`.

**Gotcha — going through Traefik returns Django 400, not 200.** `traefik/dynamic/tls.yaml`'s `set-host` middleware rewrites the request's `Host` header to `watcher:9002` before proxying to the backend, regardless of what `DOMAIN_CORP` is. If the root `.env`'s `ALLOWED_HOSTS` doesn't include `watcher`, Django rejects the rewritten request with `DisallowedHost` → HTTP 400 (a short ~140-byte body, since `DJANGO_DEBUG` is off). Add `watcher` to `ALLOWED_HOSTS` in the root `.env` if you need the Traefik/TLS path working locally; direct port access doesn't need it.

### 6. Edited `.env` after containers are already running?

Same rule as any Compose stack using `env_file:` — a plain `docker compose restart` does **not** reload `env_file:` values, only `up -d` (which recreates a container whose config changed) does. If a config change doesn't seem to take effect: `docker compose --env-file .env up -d --force-recreate watcher`.

## Conventions

- Commit messages and PRs follow **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) — see `CONTRIBUTING.md`.
- Branch naming: `feature/`, `fix/`, `docs/`, `refactor/`.
- PRs merge into `test` first, then later into `master`. Minimum 80% test coverage expected for new code.
- Security vulnerabilities go through GitHub Security Advisories, not public issues (see `SECURITY.md`).
- Full user/admin documentation is Sphinx-built from `Watcher/docs/` (`myst-parser`, `sphinxawesome-theme`) and published at https://thalesgroup-cert.github.io/Watcher/.
