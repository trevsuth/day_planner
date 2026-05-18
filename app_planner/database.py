import json
import os
import sqlite3
from pathlib import Path
from typing import Optional

from app_planner.models import PlannerEntry, Task


def database_path() -> str:
    return os.environ.get("PLANNER_DB_PATH", "planner.db")


def get_connection():
    db_path = database_path()
    parent = Path(db_path).parent
    if str(parent) != ".":
        parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(db_path)


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS planner (
            entry_date TEXT PRIMARY KEY,
            priorities TEXT,
            tasks TEXT,
            schedule TEXT,
            notes TEXT
            )
        """)


def save_entry(entry: PlannerEntry):
    with get_connection() as conn:
        conn.execute(
            """
        INSERT OR REPLACE INTO planner (entry_date, priorities, tasks, schedule, notes)
        VALUES (?, ?, ?, ?, ?)
        """,
            (
                entry.entry_date.isoformat(),
                json.dumps(entry.priorities),
                json.dumps([task.model_dump() for task in entry.tasks]),
                entry.schedule,
                entry.notes,
            ),
        )


def load_entry(entry_date: str) -> Optional[PlannerEntry]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM planner WHERE entry_date = ?", (entry_date,)
        )
        row = cursor.fetchone()
        if row:
            return PlannerEntry(
                entry_date=row[0],
                priorities=json.loads(row[1]),
                tasks=[Task(**task) for task in json.loads(row[2])],
                schedule=row[3],
                notes=row[4],
            )
    return None
