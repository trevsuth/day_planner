import os
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app_planner.migrate import migrate


@pytest.fixture
def unmigrated_db(monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for Postgres database tests.")

    schema = f"test_{uuid4().hex}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("DATABASE_SCHEMA", schema)
    try:
        yield schema
    finally:
        with psycopg.connect(database_url, autocommit=True) as conn:
            conn.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(schema)
                )
            )


@pytest.fixture
def temp_db(unmigrated_db):
    migrate()
    return unmigrated_db
