container_compose := env_var_or_default("CONTAINER_COMPOSE", "docker compose")
database_url := env_var_or_default("DATABASE_URL", "postgresql://daily_planner:daily_planner@127.0.0.1:5432/daily_planner")
test_database_url := env_var_or_default("TEST_DATABASE_URL", database_url)

# List available recipes
default:
    @just --list

# Run the test suite
test:
    uv run pytest

# Run the full Postgres-backed test suite
test-postgres:
    TEST_DATABASE_URL='{{test_database_url}}' uv run pytest

# Start only the local Postgres database for development
db-up:
    {{container_compose}} up -d postgres

# Stop the local Postgres database
db-down:
    {{container_compose}} stop postgres

# Run focused browser smoke tests with an isolated Postgres schema
web-test:
    npm --prefix web run test:e2e

# Capture README screenshots with an isolated Postgres schema
screenshots:
    npm --prefix web run screenshots

# Run frontend domain unit tests
web-unit:
    npm --prefix web run test:unit

# Export planner and project data to a portable JSON backup
backup file="daily-planner-backup.json":
    DATABASE_URL='{{database_url}}' uv run python -m app_planner.backup export "{{file}}"

# Restore planner and project data from a portable JSON backup, replacing local data
restore file="daily-planner-backup.json":
    DATABASE_URL='{{database_url}}' uv run python -m app_planner.backup restore "{{file}}"

# Import existing SQLite databases into the configured Postgres database
migrate-sqlite planner_db="planner.db" project_db="project_mgmt.db":
    DATABASE_URL='{{database_url}}' uv run python -m app_planner.sqlite_migration --planner-db "{{planner_db}}" --project-db "{{project_db}}"

# Run the API server for the React frontend
api:
    DATABASE_URL='{{database_url}}' uv run uvicorn app_planner.api:app --reload

# Run the React development server
web:
    npm --prefix web run dev

# Run the terminal planner
tui:
    DATABASE_URL='{{database_url}}' uv run python -m app_planner.ui

# Run the API and React development servers together
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    export DATABASE_URL='{{database_url}}'
    uv run uvicorn app_planner.api:app --reload &
    api_pid=$!
    npm --prefix web run dev &
    web_pid=$!
    cleanup() {
      kill "$api_pid" "$web_pid" 2>/dev/null || true
      wait "$api_pid" "$web_pid" 2>/dev/null || true
    }
    trap cleanup EXIT
    trap 'exit 0' INT TERM
    wait -n "$api_pid" "$web_pid"

# Build and run the hosted container app; set CONTAINER_COMPOSE='podman compose' to switch engines
host-up:
    {{container_compose}} up --build

# Stop the hosted container app
host-down:
    {{container_compose}} down

# Stop the hosted container app and remove its local database volume
host-reset:
    {{container_compose}} down --volumes

# Build the hosted container image without starting it
host-build:
    {{container_compose}} build

# Show hosted container logs
host-logs:
    {{container_compose}} logs -f

# Show hosted container status
host-ps:
    {{container_compose}} ps

# Render the k3s manifests with kustomize
k3s-render:
    kubectl kustomize deploy/k3s

# Apply the k3s manifests
k3s-apply:
    kubectl apply -k deploy/k3s

# Show k3s deployment status
k3s-status:
    kubectl -n daily-planner get ingress,pods,pvc,cronjob

# Export hosted data to a portable JSON backup on this machine
host-backup file="daily-planner-backup.json":
    {{container_compose}} exec -T daily-planner python -m app_planner.backup export /tmp/daily-planner-backup.json
    {{container_compose}} cp daily-planner:/tmp/daily-planner-backup.json "{{file}}"

# Restore hosted data from a portable JSON backup, replacing hosted data
host-restore file="daily-planner-backup.json":
    {{container_compose}} cp "{{file}}" daily-planner:/tmp/daily-planner-backup.json
    {{container_compose}} exec -T daily-planner python -m app_planner.backup restore /tmp/daily-planner-backup.json

# Build and run the hosted app with Docker Compose
docker-up:
    CONTAINER_COMPOSE='docker compose' just host-up

# Stop the hosted Docker Compose app
docker-down:
    CONTAINER_COMPOSE='docker compose' just host-down

# Stop Docker Compose and remove its local database volume
docker-reset:
    CONTAINER_COMPOSE='docker compose' just host-reset

# Build the hosted app with Docker Compose
docker-build:
    CONTAINER_COMPOSE='docker compose' just host-build

# Show Docker Compose logs
docker-logs:
    CONTAINER_COMPOSE='docker compose' just host-logs

# Build and run the hosted app with Podman Compose
podman-up:
    CONTAINER_COMPOSE='podman compose' just host-up

# Stop the hosted Podman Compose app
podman-down:
    CONTAINER_COMPOSE='podman compose' just host-down

# Stop Podman Compose and remove its local database volume
podman-reset:
    CONTAINER_COMPOSE='podman compose' just host-reset

# Build the hosted app with Podman Compose
podman-build:
    CONTAINER_COMPOSE='podman compose' just host-build

# Show Podman Compose logs
podman-logs:
    CONTAINER_COMPOSE='podman compose' just host-logs

# Build the React frontend
web-build:
    npm --prefix web run build

# Typecheck the TypeScript frontend foundation
web-typecheck:
    npm --prefix web run typecheck

# Format the code with ruff
format:
    uvx ruff format .

# Lint code with ruff
lint:
    uvx ruff check . --fix

# Build a standalone executable
build:
    pyinstaller planner.spec
# Clean up build artifacts
clean:
    rm -rf build dist __pycache__

# Rebuild from scratch
rebuild: clean build
