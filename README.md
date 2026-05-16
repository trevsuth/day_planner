# Daily Planner

A simple daily planner with a Python [Textual](https://textual.textualize.io/) TUI and a React web frontend. It is inspired by the layout of the Sidekick planner and gives each day a schedule, priorities, tasks, and notes.

## Features

- Daily planner view with schedule, priorities, tasks, and notes sections
- Three daily priority fields
- Five task fields with completion checkboxes
- Previous/next day navigation
- Local SQLite persistence in `planner.db`
- Textual TUI and React web interfaces backed by the same SQLite database
- FastAPI JSON API for web access
- Optional standalone executable build with PyInstaller

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
uv run python -m app.ui
```

Run the web app during development:

```bash
just api
```

In a second terminal:

```bash
just web
```

Then open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

The TUI and web app both create or update `planner.db` in the directory where they are run.

## API

The web frontend talks to the FastAPI app through these endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/entries/{entry_date}` | Load a planner entry by `YYYY-MM-DD` date |
| `PUT` | `/api/entries/{entry_date}` | Save a planner entry for that date |

## Controls

| Key | Action |
| --- | --- |
| `Left Arrow` | Save the current day and move to the previous day |
| `Right Arrow` | Save the current day and move to the next day |
| `Ctrl+1` | Focus the schedule section |
| `Ctrl+2` | Focus the first priority field |
| `Ctrl+3` | Focus the first task field |
| `Ctrl+4` | Focus the notes section |

Entries are saved when changing days and when the app exits.

## Development

Run tests:

```bash
just test
```

Or without `just`:

```bash
PYTHONPATH=app pytest
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

The PyInstaller build uses `planner.spec` and includes `app/ui.css` in the bundled app.

Build the React frontend:

```bash
just web-build
```

After building, the FastAPI app can serve the compiled frontend from `web/dist`.

## Project Structure

```text
app/
  api.py       FastAPI API and static frontend serving
  database.py  SQLite setup and persistence helpers
  models.py    Pydantic models for planner entries and tasks
  ui.css       Textual styles
  ui.py        Textual application and keyboard handling
tests/
  test_database.py
web/
  src/          React planner UI
justfile
planner.spec
pyproject.toml
```
