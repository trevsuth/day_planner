set dotenv-load := true

container_compose := env_var_or_default("CONTAINER_COMPOSE", "docker compose")
database_url := env_var_or_default("DATABASE_URL", "postgresql://daily_planner:daily_planner@127.0.0.1:5432/daily_planner")
test_database_url := env_var_or_default("TEST_DATABASE_URL", database_url)
k3s_namespace := "daily-planner"

# List available recipes
default:
    @just --list

# Install locked Python and frontend dependencies
setup:
    uv sync --locked
    npm --prefix web ci
    npm --prefix obsidian-arrow ci
    npm --prefix viewer ci

# Install Chromium for the browser tests and screenshot recipes
browser-install:
    npm --prefix web exec -- playwright install chromium

# Run the test suite
test:
    uv run pytest

# Run the full Postgres-backed test suite
test-postgres:
    TEST_DATABASE_URL='{{test_database_url}}' uv run pytest

# Start local Postgres and wait for connections
db-up:
    {{container_compose}} up -d postgres
    @for attempt in $(seq 1 30); do \
      if {{container_compose}} exec -T postgres pg_isready -h 127.0.0.1 -U daily_planner -d daily_planner; then exit 0; fi; \
      sleep 1; \
    done; \
    exit 1

# Stop the local Postgres database
db-down:
    {{container_compose}} stop postgres

# Check the Postgres connection used by the browser recipes
test-db-check:
    @DATABASE_URL={{quote(test_database_url)}} DATABASE_SCHEMA= PGCONNECT_TIMEOUT=5 uv run python -c 'from app_planner.database import check_connection; check_connection()' 2>/dev/null || { printf '%s\n' 'Cannot connect to the test Postgres database. For local Compose, run just db-up. For an existing database, check TEST_DATABASE_URL.' >&2; exit 1; }

# Test the web suite with an isolated Postgres schema
web-test: test-db-check
    TEST_DATABASE_URL={{quote(test_database_url)}} npm --prefix web run test:e2e

# Capture web suite screenshots with isolated data
screenshots: test-db-check
    TEST_DATABASE_URL={{quote(test_database_url)}} npm --prefix web run screenshots

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

# Build hosted Graph and Viewer, then run FastAPI and Planner Vite
dev: graph-build viewer-build
    #!/usr/bin/env bash
    set -euo pipefail
    export DATABASE_URL={{quote(database_url)}}
    uv run uvicorn app_planner.api:app --reload &
    api_pid=$!
    (cd web && exec node node_modules/vite/bin/vite.js --host 127.0.0.1) &
    web_pid=$!
    cleanup() {
      kill "$api_pid" "$web_pid" 2>/dev/null || true
      wait "$api_pid" "$web_pid" 2>/dev/null || true
    }
    trap cleanup EXIT
    trap 'exit 0' INT TERM
    while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
      sleep 1
    done
    if kill -0 "$api_pid" 2>/dev/null; then
      wait "$web_pid"
    else
      wait "$api_pid"
    fi

# Build and run the Compose stack in the foreground, optionally selecting services
[positional-arguments]
host-up *services:
    {{container_compose}} up --build "$@"

# Build and start the Compose stack in the background, optionally selecting services
[positional-arguments]
host-start *services:
    {{container_compose}} up --build -d "$@"

# Stop the hosted container app
host-down:
    {{container_compose}} --profile legacy-graph down

# Stop the hosted container app and remove its local database volume
host-reset:
    {{container_compose}} --profile legacy-graph down --volumes

# Build Compose images, optionally selecting services
[positional-arguments]
host-build *services:
    {{container_compose}} build "$@"

# Follow Compose logs, optionally selecting services
[positional-arguments]
host-logs *services:
    {{container_compose}} logs -f "$@"

# Show running and stopped Compose containers
host-ps:
    {{container_compose}} --profile legacy-graph ps --all

# Render the k3s manifests with kustomize
k3s-render:
    kubectl kustomize deploy/k3s

# Apply the k3s manifests
k3s-apply:
    kubectl apply -k deploy/k3s

# Build and push an image target (web, api, or viewer) for the cluster's platform
k3s-publish image platform target="web":
    docker buildx build --target {{quote(target)}} --platform {{quote(platform)}} --tag {{quote(image)}} --push .

# Show k3s deployment status
k3s-status:
    kubectl -n {{k3s_namespace}} get ingress,services,deployments,statefulsets,pods,pvc,cronjobs

# Wait for Postgres, API, web, and Viewer to roll out
k3s-rollout:
    kubectl -n {{k3s_namespace}} rollout status statefulset/postgres --timeout=5m
    kubectl -n {{k3s_namespace}} rollout status deployment/daily-planner-api --timeout=5m
    kubectl -n {{k3s_namespace}} rollout status deployment/daily-planner --timeout=5m
    kubectl -n {{k3s_namespace}} rollout status deployment/markdown-viewer --timeout=5m

# Follow logs for a suite deployment
k3s-logs deployment="daily-planner-api":
    kubectl -n {{k3s_namespace}} logs -f deployment/{{quote(deployment)}}

# Export hosted Planner and Projects data to JSON on this machine
host-backup file="daily-planner-backup.json":
    {{container_compose}} exec -T daily-planner-api python -m app_planner.backup export /tmp/daily-planner-backup.json
    {{container_compose}} cp daily-planner-api:/tmp/daily-planner-backup.json "{{file}}"

# Replace hosted Planner and Projects data from a JSON backup
host-restore file="daily-planner-backup.json":
    {{container_compose}} cp "{{file}}" daily-planner-api:/tmp/daily-planner-backup.json
    {{container_compose}} exec -T daily-planner-api python -m app_planner.backup restore /tmp/daily-planner-backup.json

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

# Run Graph by itself with Vite hot reload
graph-dev:
    npm --prefix obsidian-arrow run dev -- --host 127.0.0.1

# Typecheck and build Graph for the shared /graph/ route
graph-build:
    npm --prefix obsidian-arrow run build:hosted

# Run the Viewer on its own Vite development server
viewer-dev:
    npm --prefix viewer run dev

# Build the Viewer for the shared /viewer/ route
viewer-build:
    npm --prefix viewer run build

# Build Planner, Projects, Graph, and Viewer assets
frontend-build: web-build graph-build viewer-build

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
