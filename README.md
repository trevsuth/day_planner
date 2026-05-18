# Daily Planner

A simple daily planner and project management app with a Python [Textual](https://textual.textualize.io/) TUI and a React web frontend. The planner is inspired by the layout of the Sidekick planner and gives each day a schedule, priorities, tasks, and notes.

## Features

- Daily planner view with schedule, priorities, tasks, and notes sections
- Three daily priority fields
- Five task fields with completion checkboxes
- Previous/next day navigation
- Local SQLite persistence in `planner.db`
- Textual TUI and React web interfaces backed by the same SQLite databases
- Project management workspace with projects, epics, features, stories, subtasks, start dates, due dates, statuses, and deliverables
- Card-level project hierarchy: epics contain features, features contain stories, and stories contain subtasks
- Project cards with linked epics and quick epic creation
- Portfolio, roadmap, timeline, Gantt, calendar, and board views for project work
- Drag-and-drop Kanban status updates in the web project board
- Card comments with Markdown preview and Mermaid/MMD fenced block support
- Project deletion from the Projects sidebar
- FastAPI JSON API for web access
- Docker Compose hosting with per-machine persisted SQLite databases
- Optional standalone executable build with PyInstaller

## Quickstart

### Docker Hosting

On another computer with Docker installed:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8080`.

Each computer gets its own databases in that computer's Docker named volume, `daily_planner_data`. The container stores planner data at `/data/planner.db` and project data at `/data/project_mgmt.db`. To stop the app while keeping the databases:

```bash
docker compose down
```

To remove that computer's hosted databases as well:

```bash
docker compose down --volumes
```

Change the host port by editing `.env`:

```bash
DAILY_PLANNER_PORT=8081
```

With `just`, the same hosted app can be run with:

```bash
just docker-up
```

Stop it with:

```bash
just docker-down
```

### Local Development

From the repository root:

```bash
uv sync
npm --prefix web install
```

Run the web app:

```bash
just dev
```

Open `http://127.0.0.1:5173/` in your browser. Use the top tabs to switch between the daily planner and project management views. Press `Ctrl+C` in the terminal running `just dev` to stop both servers.

To run the terminal planner instead:

```bash
just tui
```

To see all task shortcuts:

```bash
just
```

## Requirements

- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/) for dependency management
- Node.js and npm for the React frontend
- Optional: [just](https://github.com/casey/just) for the included task shortcuts

## Getting Started

Install Python dependencies:

```bash
uv sync
```

Install web dependencies:

```bash
npm --prefix web install
```

Run the TUI planner:

```bash
just tui
```

Run the web app during development:

```bash
just dev
```

Then open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

The TUI and web planner both create or update `planner.db` in the directory where they are run. The TUI and web project manager both create or update `project_mgmt.db`. Set `PLANNER_DB_PATH` and `PROJECT_MGMT_DB_PATH` to override those paths.

For Docker Compose hosting, the app uses `/data/planner.db` and `/data/project_mgmt.db` inside the container and persists them in the local Docker volume `daily_planner_data`.

List available task shortcuts:

```bash
just
```

## API

The web frontend talks to the FastAPI app through these endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/planner/entries/{entry_date}` | Load a planner entry by `YYYY-MM-DD` date |
| `PUT` | `/api/planner/entries/{entry_date}` | Save a planner entry for that date |
| `GET` | `/api/projmgmt/projects` | List projects |
| `POST` | `/api/projmgmt/projects` | Create a project |
| `DELETE` | `/api/projmgmt/projects/{project_id}` | Delete a project and its cards |
| `GET` | `/api/projmgmt/projects/{project_id}/cards` | List project cards |
| `POST` | `/api/projmgmt/cards` | Create an epic, feature, story, or subtask |
| `PUT` | `/api/projmgmt/cards/{card_id}` | Update a card |
| `DELETE` | `/api/projmgmt/cards/{card_id}` | Delete a card |

## Project Cards

Project cards follow this hierarchy:

```text
Project
  Epic
    Feature
      Story
        Subtask
```

In the Projects tab, opening a project card shows linked epics and an inline field for adding epics without leaving the project card. Opening an epic, feature, or story card shows its parent, child cards, valid parent choices, and an inline field for adding the next child type. Type a child card name and press `Enter` or click `Add`; the child is added to the list and the parent card stays open so multiple child cards can be created quickly. The API enforces the same hierarchy, so a story must be tied to a feature and a subtask must be tied to a story.

## Controls

Planner TUI shortcuts:

| Key | Action |
| --- | --- |
| `F2` | Switch to project management |
| `Left Arrow` | Save the current day and move to the previous day |
| `Right Arrow` | Save the current day and move to the next day |
| `Ctrl+1` | Focus the schedule section |
| `Ctrl+2` | Focus the first priority field |
| `Ctrl+3` | Focus the first task field |
| `Ctrl+4` | Focus the notes section |

`Ctrl+M` is also supported as an alternate project-management shortcut, but `F2` is more reliable across terminal emulators.

Entries are saved when changing days and when the app exits.

Project manager TUI shortcuts:

| Key | Action |
| --- | --- |
| `F1` | Switch to planner |
| `F5` | Create a project from the project name and description fields |
| `F6` | Add a backlog epic to the selected project |
| `F7` | Add the next child type to the selected card |
| `F10` | Save edits to the selected card |
| `PageUp` / `PageDown` | Select the previous or next project |
| `F8` / `F9` | Select the previous or next card |

The previous `Ctrl+P`, `Ctrl+N`, `Ctrl+E`, `Ctrl+A`, `Ctrl+Up` / `Ctrl+Down`, and `Ctrl+K` / `Ctrl+J` shortcuts remain available as alternates. In the TUI project view, select an epic and press `F7` to add a feature, select a feature and press `F7` to add a story, or select a story and press `F7` to add a subtask. Deliverables can be entered as a comma-separated list before adding a card.

The selected-card edit form updates as you move through cards with `F8` and `F9`. Edit the title, description, comments, status, start date, due date, parent number, or deliverables, then press `F10` to save. Status values are `backlog`, `in_progress`, `blocked`, and `done`. Dates use `YYYY-MM-DD`. Feature, story, and subtask cards require a parent number from the eligible parent list shown under the edit form.

Project manager web shortcuts:

| Key | Action |
| --- | --- |
| `Alt+N` | Focus the new project field |
| `Alt+P` | Open the active project card |
| `Alt+C` | Create a new backlog epic card |
| `Alt+J` or `Alt+Down` | Select the next project |
| `Alt+K` or `Alt+Up` | Select the previous project |
| `Alt+1` | Create a backlog epic |
| `Alt+2` | Create an in-progress epic |
| `Alt+3` | Create a blocked epic |
| `Alt+4` | Create a done epic |
| `Esc` | Close the open card editor |
| `Ctrl+S` / `Cmd+S` | Save the open card editor |

Project shortcuts are ignored while typing in form fields. Deleting a project requires confirmation and removes its cards.

## Development

Run tests:

```bash
just test
```

Or without `just`:

```bash
uv run pytest
```

Format code:

```bash
just format
```

Lint code:

```bash
just lint
```

Build a standalone executable:

```bash
just build
```

The PyInstaller build uses `planner.spec` and includes `app_planner/ui.css` in the bundled app.

Build the React frontend:

```bash
just web-build
```

After building, the FastAPI app can serve the compiled frontend from `web/dist`.

Available `just` recipes:

| Recipe | Description |
| --- | --- |
| `just` | List all available recipes |
| `just test` | Run the Python test suite |
| `just dev` | Run the API and React development servers together |
| `just docker-up` | Build and run the Docker Compose hosted app |
| `just docker-down` | Stop the Docker Compose hosted app |
| `just docker-logs` | Follow Docker Compose logs |
| `just api` | Run the FastAPI development server |
| `just web` | Run the React development server |
| `just tui` | Run the terminal planner |
| `just web-build` | Build the React frontend |
| `just format` | Format Python code with Ruff |
| `just lint` | Lint and fix Python code with Ruff |
| `just build` | Build the standalone PyInstaller executable |
| `just clean` | Remove build artifacts |
| `just rebuild` | Clean and rebuild the standalone executable |

## Project Structure

```text
app_planner/
  api.py       FastAPI app, planner API, project routes, and static frontend serving
  database.py  SQLite setup and persistence helpers
  models.py    Pydantic models for planner entries and tasks
  ui.css       Textual styles
  ui.py        Textual application and keyboard handling
app_projmgmt/
  api.py       Project management API routes
  database.py  SQLite setup and persistence helpers for projects and cards
  models.py    Pydantic models for projects, cards, statuses, and card types
tests/
  test_database.py
  test_projmgmt_database.py
web/
  src/          React planner UI
justfile
planner.spec
pyproject.toml
```
