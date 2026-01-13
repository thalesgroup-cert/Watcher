# --- Makefile ---
include .env

.PHONY: help netcheck up down build pull deploy migrate backup populate-db superuser create-certs init

NETCHECK_CMD = ./scripts/check-network.sh
REPLACE_TLS_CMD = ./scripts/replace-tls.sh

help:
	@echo "Available commands:"
	@echo "  up            - Start services"
	@echo "  down          - Stop services"
	@echo "  build         - Build Docker images"
	@echo "  pull          - Pull Docker images"
	@echo "  deploy        - Deploy application"
	@echo "  migrate       - Run database migrations"
	@echo "  backup        - Backup the database"
	@echo "  populate-db   - Populate database with sample data"
	@echo "  superuser     - Create a superuser account"
	@echo "  create-certs  - Generate TLS certificates"
	@echo "  init          - Initialize the project"

up:
	$(NETCHECK_CMD)
	$(REPLACE_TLS_CMD)
	@echo "Starting services..."
	@docker compose --env-file .env up -d

down:
	@echo "Stopping services..."
	@docker compose --env-file .env down --remove-orphans

build:
	@echo "Building images..."
	@docker compose --env-file .env build

pull:
	@echo "Pulling images..."
	@docker compose --env-file .env pull

deploy:
	$(NETCHECK_CMD)
	$(REPLACE_TLS_CMD)
	@echo "Deploying..."
	@./scripts/deploy.sh

migrate:
	@echo "Running migrations..."
	@./scripts/migrate.sh

backup:
	@echo "Backing up database..."
	@./scripts/backup-db.sh

populate-db:
	@echo "Populating database with sample data..."
	@./scripts/populate-db.sh

superuser:
	@echo "Creating superuser..."
	@./scripts/create-superuser.sh

create-certs:
	@echo "Generating certificates..."
	@./scripts/openssl-certificates-generator.sh

init:
	@echo "Initializing project..."
	@./scripts/init.sh
	@echo "Initialization complete."
