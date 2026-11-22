import os
from contextlib import contextmanager

import psycopg
from psycopg import sql
from psycopg.rows import dict_row


def database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://daily_planner:daily_planner@127.0.0.1:5432/daily_planner",
    )


@contextmanager
def get_connection():
    with psycopg.connect(
        database_url(), row_factory=dict_row, connect_timeout=5
    ) as conn:
        if schema := os.environ.get("DATABASE_SCHEMA"):
            conn.execute(
                sql.SQL("SET LOCAL search_path TO {}").format(sql.Identifier(schema))
            )
        yield conn


def check_connection() -> None:
    with get_connection() as conn:
        conn.execute("SELECT 1").fetchone()
