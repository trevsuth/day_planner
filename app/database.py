import sqlite3
import json
from typing import Optional
from models import PlannerEntry, Task


def get_connection():
    return sqlite3.connect("planner.db")


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
        INSERT OR REPLACE INTO planner ( entry_date, priorities, tasks, schedule, notes)
        VALUES (?, ?, ?, ?, ?)
        """,
            (
                entry.entry_date.isoformat(),
                json.dumps(entry.priorities),
                json.dumps([task.dict() for task in entry.tasks]),
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
                tasks=[
                    # PlannerEntry.__fields__["tasks"].type_.__args[0](**task)
                    Task(**task)
                    for task in json.loads(row[2])
                ],
                schedule=row[3],
                notes=row[4],
            )
    return None
