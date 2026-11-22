from importlib import import_module

import psycopg
import pytest
from psycopg import sql

from app_planner.migrate import check_schema, migrate
from app_planner.postgres import get_connection


def test_migration_adopts_legacy_schema(unmigrated_db):
    with get_connection() as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(unmigrated_db)))
        conn.execute("""
            CREATE TABLE planner_schema_migrations (
                version INTEGER PRIMARY KEY, name TEXT NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            INSERT INTO planner_schema_migrations (version, name) VALUES (1, 'create_planner');
            CREATE TABLE planner (
                entry_date DATE PRIMARY KEY,
                priorities JSONB NOT NULL DEFAULT '[]',
                priority_card_ids JSONB NOT NULL DEFAULT '[]',
                tasks JSONB NOT NULL DEFAULT '[]',
                schedule TEXT,
                notes TEXT
            );
            INSERT INTO planner (entry_date, notes) VALUES ('2026-01-01', 'keep this entry');
            CREATE TABLE projects (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
                created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
            );
            INSERT INTO projects (id, name, created_at, updated_at)
            VALUES ('old-project', 'Keep this project', now(), now());
            CREATE TABLE graph_workspace (
                singleton BOOLEAN PRIMARY KEY CHECK (singleton),
                revision BIGINT NOT NULL DEFAULT 0,
                document JSONB
            );
            INSERT INTO graph_workspace VALUES (TRUE, 7, '{"keep": true}');
            CREATE TABLE graph_attachments (storage_key TEXT PRIMARY KEY, data BYTEA NOT NULL);
            INSERT INTO graph_attachments VALUES ('original', convert_to('attachment', 'UTF8'));
        """)

    with pytest.raises(psycopg.errors.UndefinedTable):
        check_schema()
    migrate()
    migrate()
    check_schema()

    with get_connection() as conn:
        assert conn.execute("SELECT notes FROM planner").fetchone() == {
            "notes": "keep this entry"
        }
        assert conn.execute("SELECT name FROM projects").fetchone() == {
            "name": "Keep this project",
        }
        assert conn.execute(
            "SELECT revision, document FROM graph_workspace"
        ).fetchone() == {
            "revision": 7,
            "document": {"keep": True},
        }
        assert conn.execute("SELECT data FROM graph_attachments").fetchone() == {
            "data": b"attachment",
        }
        assert conn.execute(
            "SELECT version FROM planner_schema_migrations"
        ).fetchone() == {
            "version": 1,
        }


def test_failed_migration_rolls_back_schema_and_history(
    unmigrated_db, monkeypatch, tmp_path
):
    migration_module = import_module("app_planner.migrate")
    broken = tmp_path / "002_broken.sql"
    broken.write_text("CREATE TABLE partial_table (id INT); SELECT invalid_column;")
    monkeypatch.setattr(
        migration_module, "MIGRATIONS", (*migration_module.MIGRATIONS, broken)
    )

    with pytest.raises(psycopg.errors.UndefinedColumn):
        migrate()

    with get_connection() as conn:
        assert conn.execute("SELECT current_schema() AS name").fetchone() == {
            "name": None
        }
