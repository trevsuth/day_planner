# Local development and data

Day Planner uses Python 3.13 or newer, [uv](https://docs.astral.sh/uv/),
Node.js 22.12 or newer with npm, and PostgreSQL 17 or newer. Docker Compose
can run the included PostgreSQL service. The [just recipe guide](just.md)
covers the full command set.

## Run from source

From the repository root, install dependencies, start PostgreSQL, and launch
the development servers:

```bash
just setup
just db-up
just dev
```

Open `http://127.0.0.1:5173/`. Planner, Projects, API, and Validation update
through Vite. Use `just graph-build` or `just viewer-build` to refresh the
hosted Graph or Viewer bundle after edits. Use `just graph-dev` or
`just viewer-dev` for their standalone development servers.

Without `just`, use the equivalent commands from the repository root:

```bash
uv sync --locked
npm --prefix web ci
npm --prefix obsidian-arrow ci
npm --prefix viewer ci
docker compose up -d --wait postgres
uv run --locked python -m app_planner.migrate
npm --prefix obsidian-arrow run build:hosted
npm --prefix viewer run build
uv run --locked uvicorn app_planner.api:app --reload --no-access-log
```

In a second terminal, still at the repository root, start Vite:

```bash
npm --prefix web run dev -- --host 127.0.0.1
```

Run the terminal app with `just tui` or, after migrations, with
`uv run --locked python -m app_planner.ui`. The PyInstaller build
(`just build` or `uv run --locked pyinstaller planner.spec`) includes
`app_planner/ui.css`. Migrate a fresh database before launching it.

## Compose and database settings

The hosted stack runs Nginx, FastAPI, and PostgreSQL. A one-shot service
migrates the database before the API starts. Nginx serves the frontends and
proxies API requests. Each Compose project has its own PostgreSQL volume.
Rebuild with `just host-start` or `docker compose up --build -d` and reuse
the Compose project name to keep its data. If upgrading an older stack with
retired services, bring it down using its original checkout first.

Root `just` recipes load `.env`. Set `DAILY_PLANNER_PORT` there to choose
a different web port. If you change `POSTGRES_PORT`, update `DATABASE_URL`
and `TEST_DATABASE_URL` for host-side commands. For direct Python commands,
export the relevant environment variables before running them.
`DATABASE_SCHEMA` can isolate local tables in a named schema.

To use Podman, substitute `podman compose` for `docker compose`, or set
`CONTAINER_COMPOSE='podman compose'` before invoking a `just host-*` recipe.
Keep the same container engine when switching between manual and Just commands.
To stop the stack and keep its data, run `just host-down` or
`docker compose --profile legacy-graph down`. The `host-reset` recipe
removes the local database volume.

## Tests and screenshots

```bash
just test
just db-up
just test-postgres
just browser-install
just web-typecheck
just web-unit
just web-test
just screenshots
```

The browser suite builds all three frontend bundles and migrates an isolated
PostgreSQL schema. Screenshots use synthetic data and are written to
[`docs/screenshots/`](screenshots). Set `TEST_DATABASE_URL` for a dedicated
test database. Use `uv run pytest` and the npm scripts in [`web/package.json`](../web/package.json)
to run checks without `just`. CI also renders and validates the k3s HTTP and
TLS overlays.

## Import older SQLite data

With PostgreSQL running, run `just migrate-sqlite planner.db project_mgmt.db`
to import older Planner and Projects data. Use the [Graph migration steps](../deploy/k3s/README.md#move-an-existing-graph)
for Graph data saved in a browser on another origin.

## Backup and restore

Export all planner entries, linked priority assignments, projects, cards, and card activity to a portable JSON file:

```bash
just backup
```

Restore replaces the current local planner and project data with the contents of that file:

```bash
just restore
```

Provide a filename when needed:

```bash
just backup backups/workstation.json
just restore backups/workstation.json
```

For a running hosted container, use the matching host recipes. `CONTAINER_COMPOSE='podman compose'` switches the same recipes to Podman:

```bash
just host-backup backups/hosted.json
just host-restore backups/hosted.json
```

These JSON recipes cover Planner and Projects. Use **Export backup** for a
portable Graph copy. A full Postgres dump, including the k3s nightly backup,
covers Planner, Projects, Graph, and hosted attachment bytes. See the
[k3s backup and recovery runbook](../deploy/k3s/README.md#backups-and-recovery).
