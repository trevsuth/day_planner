"""Apply Day Planner's ordered PostgreSQL schema migrations."""

import os
from pathlib import Path

from psycopg import sql

from app_planner.postgres import get_connection


MIGRATIONS = tuple(sorted(Path(__file__).with_name("migrations").glob("[0-9]*.sql")))
# This lock is shared by Day Planner migration processes in the same database.
MIGRATION_LOCK = 619614842387996328


def migrate() -> None:
    if not MIGRATIONS:
        raise RuntimeError("No Day Planner migration files found.")

    with get_connection() as conn:
        conn.execute("SET LOCAL lock_timeout = '30s'")
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK,))
        if schema := os.environ.get("DATABASE_SCHEMA"):
            conn.execute(
                sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema))
            )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS day_planner_schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        applied = {
            row["version"]
            for row in conn.execute("SELECT version FROM day_planner_schema_migrations")
        }
        pending = []
        for migration in MIGRATIONS:
            if migration.stem in applied:
                continue
            print(f"Applying {migration.stem}", flush=True)
            conn.execute(migration.read_text(encoding="utf-8"))
            conn.execute(
                "INSERT INTO day_planner_schema_migrations (version) VALUES (%s)",
                (migration.stem,),
            )
            pending.append(migration.stem)
    print(
        "Committed " + ", ".join(pending) if pending else "Schema is up to date.",
        flush=True,
    )


def check_schema() -> None:
    with get_connection() as conn:
        applied = {
            row["version"]
            for row in conn.execute("SELECT version FROM day_planner_schema_migrations")
        }
    if not MIGRATIONS or any(migration.stem not in applied for migration in MIGRATIONS):
        raise RuntimeError("Day Planner schema migrations are required.")


if __name__ == "__main__":
    migrate()
