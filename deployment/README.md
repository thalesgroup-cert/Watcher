# Modern Deployment Guide

This project provides a **modular, automated, Docker-based deployment system** designed for reliability, maintainability, and ease of use.
It relies on:

* **Docker Compose v2**
* **Environment configuration via `.env`**
* **Self-contained helper scripts** (`scripts/`)
* **Optional Makefile shortcuts** for convenience
* A comprehensive **checklist** that prepares all required files, directories, and certificates

---

## Requirements

Before running any commands, ensure you have:

* **Docker**
* **Docker Compose v2 (`docker compose` subcommand)**

The `scripts/init.sh` and `scripts/check-network.sh` utilities will verify and prepare the environment automatically.

---

## Initialization

Run the full initialization script:

```bash
make init
```

This performs:

* Creation of the `.env` file (or uses yours if present)
* Directory structure validation
* Download/creation of config files
* Certificate generation (if missing)
  …and other required system checks.

This step ensures the project is ready to run.

---

## Starting the Stack

### Start all services

```bash
make up
```

or manually:

```bash
docker compose --env-file .env up -d
```

### Stop all services

```bash
make down
```

---

## Deployment Workflow

To pull new images, rebuild if needed, and restart services safely:

```bash
make deploy
```

This command runs:

* Network checks
* TLS/hostname replacement
* Deployment script execution

---

## 🛠 Development & Maintenance Commands

### Build images

```bash
make build
```

### Pull latest images

```bash
make pull
```

### Run database migrations

```bash
make migrate
```

### Create a superuser

```bash
make superuser
```

### Populate Db

```bash
make populate-db
```

### Backup the database

```bash
make backup
```

### Regenerate certificates

```bash
make create-certs
```

---

## Project Structure

```
.
├── docker-compose.yml           # Main orchestration file
├── .env.example                 # Example configuration (safe to commit)
├── .env                         # Real configuration (never commit)
├── scripts/                     # Modular shell scripts
│   ├── init.sh                  # Main initializer (system checks + setup)
│   ├── check-network.sh
│   ├── wait-empty.sh
│   ├── deploy.sh
│   ├── migrate.sh
│   ├── backup-db.sh
│   ├── populate-db.sh
│   ├── create-superuser.sh
│   └── openssl-certificates-generator.sh
└── Makefile                     # User-friendly command shortcuts
```

---

## Security Notes

* `.env` **must never be committed** — it contains secrets.
* `.env` is already included in `.gitignore`.
* Secrets can also be provided through:

  * environment variables
  * CI/CD secret stores
  * Docker Compose overrides

---

## Summary

| Action                | Command             |
| --------------------- | ------------------- |
| Initialize everything | `make init`         |
| Start services        | `make up`           |
| Stop services         | `make down`         |
| Deploy updates        | `make deploy`       |
| Run migrations        | `make migrate`      |
| Backup database       | `make backup`       |
| Populate database     | `make populate-db`  |
| Create superuser      | `make superuser`    |
| Generate certificates | `make create-certs` |
