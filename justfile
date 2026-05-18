# List available recipes
default:
    @just --list

# Run the test suite
test:
    pytest

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

# Build and run the hosted Docker Compose app
docker-up:
    docker compose up --build

# Stop the hosted Docker Compose app
docker-down:
    docker compose down

# Show hosted Docker Compose logs
docker-logs:
    docker compose logs -f

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
