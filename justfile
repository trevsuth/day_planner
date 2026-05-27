container_compose := env_var_or_default("CONTAINER_COMPOSE", "docker compose")

# List available recipes
default:
    @just --list

# Run the test suite
test:
    pytest

# Run focused browser smoke tests with isolated test databases
web-test:
    npm --prefix web run test:e2e

# Export planner and project data to a portable JSON backup
backup file="daily-planner-backup.json":
    uv run python -m app_planner.backup export "{{file}}"

# Restore planner and project data from a portable JSON backup, replacing local data
restore file="daily-planner-backup.json":
    uv run python -m app_planner.backup restore "{{file}}"

# Run the API server for the React frontend
api:
    uv run uvicorn app_planner.api:app --reload

# Run the React development server
web:
    npm --prefix web run dev

# Run the terminal planner
tui:
    uv run python -m app_planner.ui

# Run the API and React development servers together
dev:
    #!/usr/bin/env bash
    set -euo pipefail
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
