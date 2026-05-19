from datetime import date

import os
import sqlite3
import tempfile

import pytest

from app_planner.database import init_db, save_entry, load_entry
from app_planner.models import PlannerEntry, Task


@pytest.fixture
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp()
    os.close(fd)

    def _get_temp_connection():
        return sqlite3.connect(path)

    monkeypatch.setattr("app_planner.database.get_connection", _get_temp_connection)
    init_db()
    yield
    os.remove(path)


def test_save_and_load_entry(temp_db):
    entry = PlannerEntry(
        entry_date=date(2025, 4, 10),
        priorities=["Finish report", "Workout", "Meditate"],
        tasks=[
            Task(text="Write unit test", completed=True),
            Task(text="Push to Git", completed=False),
        ],
        schedule="8am: Coffee\n9am: Meeting",
        notes="Felt productive today",
    )

    save_entry(entry)

    loaded = load_entry("2025-04-10")
    assert loaded is not None
    assert loaded.entry_date == entry.entry_date
    assert loaded.priorities == entry.priorities
    assert loaded.tasks == entry.tasks
    assert loaded.schedule == entry.schedule
    assert loaded.notes == entry.notes


def test_init_db_records_planner_migration_for_existing_database(monkeypatch):
    fd, path = tempfile.mkstemp()
    os.close(fd)

    with sqlite3.connect(path) as conn:
        conn.execute("""
            CREATE TABLE planner (
                entry_date TEXT PRIMARY KEY,
                priorities TEXT,
                tasks TEXT,
                schedule TEXT,
                notes TEXT
            )
        """)
        conn.execute(
            """
            INSERT INTO planner (entry_date, priorities, tasks, schedule, notes)
            VALUES ('2026-05-18', '["Ship migration"]', '[]', '', 'Existing row')
            """
        )

    def _get_temp_connection():
        return sqlite3.connect(path)

    monkeypatch.setattr("app_planner.database.get_connection", _get_temp_connection)
    init_db()

    with _get_temp_connection() as conn:
        migrations = conn.execute(
            "SELECT version, name FROM schema_migrations ORDER BY version"
        ).fetchall()
        row = conn.execute(
            "SELECT notes FROM planner WHERE entry_date = '2026-05-18'"
        ).fetchone()

    assert migrations == [(1, "create_planner")]
    assert row == ("Existing row",)
    os.remove(path)
