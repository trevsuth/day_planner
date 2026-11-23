# Just recipes

Run these commands from the repository root. `just` or `just --list` lists
recipes. The [justfile](../justfile) defines their defaults and loads `.env`
when present. Set `CONTAINER_COMPOSE` to switch container engines, and set
`TEST_DATABASE_URL` to select a test database.

- For a Compose install or rebuild, run `just host-start`.
- For development, run `just setup`, `just db-up`, then `just dev`.
- For k3s deployment and recovery, follow the [k3s runbook](../deploy/k3s/README.md).

## Development and builds

| Recipe | Description |
| --- | --- |
| `just setup` | Install locked Python and frontend dependencies |
| `just db-up` | Start local Postgres and wait for connections |
| `just db-migrate` | Apply versioned schema changes to the workstation database |
| `just db-down` | Stop the local Postgres database |
| `just dev` | Build Graph and Viewer, then run FastAPI and Planner Vite |
| `just api` | Run the FastAPI development server |
| `just web` | Run the React development server |
| `just tui` | Run the terminal planner |
| `just web-build` | Build the React frontend |
| `just graph-dev` | Run Graph by itself with hot reload |
| `just graph-build` | Build Graph for the shared `/graph/` route |
| `just viewer-dev` | Run Viewer with Vite hot reload |
| `just viewer-build` | Build Viewer for `/viewer/` |
| `just frontend-build` | Build the web shell, Graph, and Viewer |
| `just format` | Format Python code with Ruff |
| `just lint` | Lint and fix Python code with Ruff |
| `just build` | Build the standalone PyInstaller executable |
| `just clean` | Remove build artifacts |
| `just rebuild` | Clean and rebuild the standalone executable |

## Tests and screenshots

| Recipe | Description |
| --- | --- |
| `just test` | Run the Python test suite |
| `just test-postgres` | Run the full Postgres-backed Python test suite |
| `just test-db-check` | Check connectivity to the database used for browser tests |
| `just browser-install` | Install Chromium for smoke tests and screenshots |
| `just web-typecheck` | Typecheck the TypeScript frontend foundation |
| `just web-unit` | Run frontend domain unit tests |
| `just web-test` | Run focused Playwright browser smoke tests using an isolated Postgres schema |
| `just screenshots` | Capture README screenshots from isolated demo data in an isolated Postgres schema |

## Local hosting

| Recipe | Description |
| --- | --- |
| `just host-start [services…]` | Build and start Compose services in the background |
| `just host-up [services…]` | Build and run Compose services in the foreground |
| `just host-down` | Stop the hosted container app |
| `just host-reset` | Stop the hosted container app and remove its local database volume |
| `just host-build [services…]` | Build Compose service images |
| `just host-logs [services…]` | Follow Compose logs |
| `just host-ps` | Show running and stopped Compose containers |
| `just docker-up` | Build and run the Docker Compose hosted app |
| `just docker-down` | Stop the Docker Compose hosted app |
| `just docker-reset` | Stop Docker Compose and remove its local database volume |
| `just docker-build` | Build the Docker Compose hosted app |
| `just docker-logs` | Follow Docker Compose logs |
| `just podman-up` | Build and run the Podman Compose hosted app |
| `just podman-down` | Stop the Podman Compose hosted app |
| `just podman-reset` | Stop Podman Compose and remove its local database volume |
| `just podman-build` | Build the Podman Compose hosted app |
| `just podman-logs` | Follow Podman Compose logs |

The reset recipes delete the local Compose database volume. Use a down recipe to keep it.

## Local backup and migration

| Recipe | Description |
| --- | --- |
| `just backup [file]` | Export local planner and project data to portable JSON |
| `just restore [file]` | Replace local data from a portable JSON backup |
| `just migrate-sqlite [planner_db] [project_db]` | Import existing SQLite databases into Postgres |
| `just host-backup [file]` | Export hosted Planner and Projects data to JSON |
| `just host-restore [file]` | Replace hosted Planner and Projects data from JSON |

The JSON restore recipes replace existing Planner and Projects data. Graph attachments are included in full PostgreSQL dumps.

## k3s operations

| Recipe | Description |
| --- | --- |
| `just k3s-render [overlay]` | Preview the example or a configured k3s overlay |
| `just k3s-init-db CONTEXT` | Initialize or reuse the database secret |
| `just k3s-preflight CONTEXT [overlay]` | Validate the configured overlay against the target cluster |
| `just k3s-apply CONTEXT [overlay]` | Validate and apply the configured overlay |
| `just k3s-smoke URL` | Verify the web and API routes through ingress |
| `just k3s-backup CONTEXT FILE` | Stream a full Postgres archive to a new local file |
| `just k3s-backup-status CONTEXT [max_age_hours]` | Check scheduled backup success and freshness |
