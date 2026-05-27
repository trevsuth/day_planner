import json
import os
import sqlite3
from datetime import datetime, timezone
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


def applied_migrations(conn: sqlite3.Connection) -> set[int]:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    """)
    rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    return {row[0] for row in rows}


def record_migration(conn: sqlite3.Connection, version: int, name: str) -> None:
    conn.execute(
        """
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
        """,
        (version, name, datetime.now(timezone.utc).isoformat()),
    )


def migration_001_create_planner(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS planner (
        entry_date TEXT PRIMARY KEY,
        priorities TEXT,
        tasks TEXT,
        schedule TEXT,
        notes TEXT
        )
    """)


def migration_002_add_priority_card_links(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(planner)").fetchall()}
    if "priority_card_ids" not in columns:
        conn.execute(
            "ALTER TABLE planner ADD COLUMN priority_card_ids TEXT NOT NULL DEFAULT '[]'"
        )


MIGRATIONS = [
    (1, "create_planner", migration_001_create_planner),
    (2, "add_priority_card_links", migration_002_add_priority_card_links),
]


def init_db():
    with get_connection() as conn:
        applied = applied_migrations(conn)
        for version, name, migration in MIGRATIONS:
            if version in applied:
                continue
            migration(conn)
            record_migration(conn, version, name)


def save_entry(entry: PlannerEntry):
    with get_connection() as conn:
        conn.execute(
            """
        INSERT OR REPLACE INTO planner (
            entry_date, priorities, priority_card_ids, tasks, schedule, notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
            (
                entry.entry_date.isoformat(),
                json.dumps(entry.priorities),
                json.dumps(entry.priority_card_ids),
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
            return entry_from_row(row)
    return None


def entry_from_row(row) -> PlannerEntry:
    return PlannerEntry(
        entry_date=row[0],
        priorities=json.loads(row[1]),
        tasks=[Task(**task) for task in json.loads(row[2])],
        schedule=row[3],
        notes=row[4],
        priority_card_ids=json.loads(row[5]),
    )


def list_entries() -> list[PlannerEntry]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM planner ORDER BY entry_date ASC").fetchall()
    return [entry_from_row(row) for row in rows]


def replace_entries(entries: list[PlannerEntry]) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM planner")
        for entry in entries:
            conn.execute(
                """
                INSERT INTO planner (
                    entry_date, priorities, priority_card_ids, tasks, schedule, notes
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.entry_date.isoformat(),
                    json.dumps(entry.priorities),
                    json.dumps(entry.priority_card_ids),
                    json.dumps([task.model_dump() for task in entry.tasks]),
                    entry.schedule,
                    entry.notes,
                ),
            )


def assign_card_priority(
    entry_date: str, card_id: str, priority_text: str
) -> PlannerEntry:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM planner").fetchall()
        target_row = next((row for row in rows if row[0] == entry_date), None)
        target_priorities = json.loads(target_row[1]) if target_row else []
        target_links = json.loads(target_row[5]) if target_row else []
        if card_id in target_links:
            target_priorities.pop(target_links.index(card_id))
        if len(target_priorities) >= 3:
            raise ValueError(f"{entry_date} has no open priority slots.")

        target_entry = None
        for row in rows:
            current_entry = entry_from_row(row)
            for index, linked_card_id in enumerate(current_entry.priority_card_ids):
                if linked_card_id != card_id:
                    continue
                current_entry.priorities.pop(index)
                current_entry.priority_card_ids.pop(index)
                break
            if current_entry.entry_date.isoformat() == entry_date:
                target_entry = current_entry
            elif current_entry.priority_card_ids != json.loads(row[5]):
                conn.execute(
                    """
                    UPDATE planner
                    SET priorities = ?, priority_card_ids = ?
                    WHERE entry_date = ?
                    """,
                    (
                        json.dumps(current_entry.priorities),
                        json.dumps(current_entry.priority_card_ids),
                        row[0],
                    ),
                )

        target_entry = target_entry or PlannerEntry(entry_date=entry_date)
        target_entry.priorities.append(priority_text)
        target_entry.priority_card_ids.append(card_id)
        conn.execute(
            """
            INSERT OR REPLACE INTO planner (
                entry_date, priorities, priority_card_ids, tasks, schedule, notes
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                target_entry.entry_date.isoformat(),
                json.dumps(target_entry.priorities),
                json.dumps(target_entry.priority_card_ids),
                json.dumps([task.model_dump() for task in target_entry.tasks]),
                target_entry.schedule,
                target_entry.notes,
            ),
        )
    return target_entry


def unlink_card_priority(card_id: str) -> None:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM planner").fetchall()
        for row in rows:
            priorities = json.loads(row[1])
            priority_card_ids = json.loads(row[5])
            linked_indexes = [
                index
                for index, linked_card_id in enumerate(priority_card_ids)
                if linked_card_id == card_id
            ]
            if not linked_indexes:
                continue
            for index in reversed(linked_indexes):
                priorities.pop(index)
                priority_card_ids.pop(index)
            conn.execute(
                """
                UPDATE planner
                SET priorities = ?, priority_card_ids = ?
                WHERE entry_date = ?
                """,
                (json.dumps(priorities), json.dumps(priority_card_ids), row[0]),
            )
