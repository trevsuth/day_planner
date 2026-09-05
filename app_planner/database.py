import os

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app_planner.models import PlannerEntry, Task


def database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://daily_planner:daily_planner@127.0.0.1:5432/daily_planner",
    )


def get_connection():
    conn = psycopg.connect(database_url(), row_factory=dict_row)
    configure_schema(conn)
    return conn


def configure_schema(conn) -> None:
    schema = os.environ.get("DATABASE_SCHEMA")
    if not schema:
        return
    conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))
    conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))


def check_connection() -> None:
    with get_connection() as conn:
        conn.execute("SELECT 1").fetchone()


def applied_migrations(conn) -> set[int]:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS planner_schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    rows = conn.execute("SELECT version FROM planner_schema_migrations").fetchall()
    return {row["version"] for row in rows}


def record_migration(conn, version: int, name: str) -> None:
    conn.execute(
        """
        INSERT INTO planner_schema_migrations (version, name)
        VALUES (%s, %s)
        """,
        (version, name),
    )


def migration_001_create_planner(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS planner (
            entry_date DATE PRIMARY KEY,
            priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
            priority_card_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
            schedule TEXT,
            notes TEXT
        )
    """)


MIGRATIONS = [
    (1, "create_planner", migration_001_create_planner),
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
            INSERT INTO planner (
                entry_date, priorities, priority_card_ids, tasks, schedule, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (entry_date) DO UPDATE
            SET priorities = EXCLUDED.priorities,
                priority_card_ids = EXCLUDED.priority_card_ids,
                tasks = EXCLUDED.tasks,
                schedule = EXCLUDED.schedule,
                notes = EXCLUDED.notes
            """,
            (
                entry.entry_date,
                Jsonb(entry.priorities),
                Jsonb(entry.priority_card_ids),
                Jsonb([task.model_dump() for task in entry.tasks]),
                entry.schedule,
                entry.notes,
            ),
        )


def load_entry(entry_date: str) -> PlannerEntry | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM planner WHERE entry_date = %s", (entry_date,)
        ).fetchone()
    return entry_from_row(row) if row else None


def entry_from_row(row) -> PlannerEntry:
    return PlannerEntry(
        entry_date=row["entry_date"],
        priorities=row["priorities"],
        tasks=[Task(**task) for task in row["tasks"]],
        schedule=row["schedule"],
        notes=row["notes"],
        priority_card_ids=row["priority_card_ids"],
    )


def list_entries() -> list[PlannerEntry]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM planner ORDER BY entry_date ASC"
        ).fetchall()
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
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    entry.entry_date,
                    Jsonb(entry.priorities),
                    Jsonb(entry.priority_card_ids),
                    Jsonb([task.model_dump() for task in entry.tasks]),
                    entry.schedule,
                    entry.notes,
                ),
            )


def assign_card_priority(
    entry_date: str, card_id: str, priority_text: str
) -> PlannerEntry:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM planner ORDER BY entry_date ASC FOR UPDATE"
        ).fetchall()
        target_row = next(
            (row for row in rows if row["entry_date"].isoformat() == entry_date), None
        )
        target_priorities = target_row["priorities"] if target_row else []
        target_links = target_row["priority_card_ids"] if target_row else []
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
            elif current_entry.priority_card_ids != row["priority_card_ids"]:
                conn.execute(
                    """
                    UPDATE planner
                    SET priorities = %s, priority_card_ids = %s
                    WHERE entry_date = %s
                    """,
                    (
                        Jsonb(current_entry.priorities),
                        Jsonb(current_entry.priority_card_ids),
                        row["entry_date"],
                    ),
                )

        target_entry = target_entry or PlannerEntry(entry_date=entry_date)
        target_entry.priorities.append(priority_text)
        target_entry.priority_card_ids.append(card_id)
        conn.execute(
            """
            INSERT INTO planner (
                entry_date, priorities, priority_card_ids, tasks, schedule, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (entry_date) DO UPDATE
            SET priorities = EXCLUDED.priorities,
                priority_card_ids = EXCLUDED.priority_card_ids,
                tasks = EXCLUDED.tasks,
                schedule = EXCLUDED.schedule,
                notes = EXCLUDED.notes
            """,
            (
                target_entry.entry_date,
                Jsonb(target_entry.priorities),
                Jsonb(target_entry.priority_card_ids),
                Jsonb([task.model_dump() for task in target_entry.tasks]),
                target_entry.schedule,
                target_entry.notes,
            ),
        )
    return target_entry


def unlink_card_priority(card_id: str) -> None:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM planner FOR UPDATE").fetchall()
        for row in rows:
            priorities = row["priorities"]
            priority_card_ids = row["priority_card_ids"]
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
                SET priorities = %s, priority_card_ids = %s
                WHERE entry_date = %s
                """,
                (Jsonb(priorities), Jsonb(priority_card_ids), row["entry_date"]),
            )
