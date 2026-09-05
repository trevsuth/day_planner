from datetime import date

import os
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row

from app_planner import database as planner_database
from app_planner.database import (
    assign_card_priority,
    init_db,
    load_entry,
    save_entry,
    unlink_card_priority,
)
from app_planner.models import PlannerEntry, Task
from app_planner.services import (
    PlannerNotFoundError,
    PlannerServiceError,
    assign_project_card_to_priority,
    get_planner_entry,
    save_planner_entry,
)


@pytest.fixture
def temp_db(monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for Postgres database tests.")

    schema = f"test_{uuid4().hex}"
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))

    def _get_temp_connection():
        conn = psycopg.connect(database_url, row_factory=dict_row)
        conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        return conn

    monkeypatch.setattr("app_planner.database.get_connection", _get_temp_connection)
    init_db()
    yield
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_save_and_load_entry(temp_db):
    entry = PlannerEntry(
        entry_date=date(2025, 4, 10),
        priorities=["Finish report", "Workout", "Meditate"],
        priority_card_ids=["card-1", None, None],
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
    assert loaded.priority_card_ids == entry.priority_card_ids
    assert loaded.tasks == entry.tasks
    assert loaded.schedule == entry.schedule
    assert loaded.notes == entry.notes


def test_init_db_records_planner_migration(temp_db):
    with planner_database.get_connection() as conn:
        migrations = conn.execute(
            "SELECT version, name FROM planner_schema_migrations ORDER BY version"
        ).fetchall()
        columns = {
            row["column_name"]
            for row in conn.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'planner'
                """
            ).fetchall()
        }

    assert migrations == [{"version": 1, "name": "create_planner"}]
    assert {"entry_date", "priorities", "priority_card_ids", "tasks"}.issubset(
        columns
    )


def test_assigning_card_priority_moves_and_unlinks_card(temp_db):
    save_entry(
        PlannerEntry(
            entry_date=date(2026, 6, 1),
            priorities=["Card work"],
            priority_card_ids=["card-1"],
        )
    )

    moved = assign_card_priority("2026-06-02", "card-1", "Moved card work")

    first_day = load_entry("2026-06-01")
    assert first_day is not None
    assert first_day.priorities == []
    assert first_day.priority_card_ids == []
    assert moved.priorities == ["Moved card work"]
    assert moved.priority_card_ids == ["card-1"]

    unlink_card_priority("card-1")
    second_day = load_entry("2026-06-02")
    assert second_day is not None
    assert second_day.priorities == []
    assert second_day.priority_card_ids == []


def test_assigning_card_to_full_day_keeps_existing_link(temp_db):
    save_entry(
        PlannerEntry(
            entry_date=date(2026, 6, 1),
            priorities=["Card work"],
            priority_card_ids=["card-1"],
        )
    )
    save_entry(
        PlannerEntry(
            entry_date=date(2026, 6, 2),
            priorities=["One", "Two", "Three"],
            priority_card_ids=[None, None, None],
        )
    )

    with pytest.raises(ValueError, match="no open priority slots"):
        assign_card_priority("2026-06-02", "card-1", "Moved card work")

    original = load_entry("2026-06-01")
    assert original is not None
    assert original.priority_card_ids == ["card-1"]


def test_planner_service_loads_empty_entries_and_rejects_date_mismatch(temp_db):
    empty = get_planner_entry(date(2030, 1, 2))
    assert empty.entry_date == date(2030, 1, 2)
    assert empty.priorities == []

    with pytest.raises(PlannerServiceError, match="Entry date"):
        save_planner_entry(
            date(2030, 1, 2),
            PlannerEntry(entry_date=date(2030, 1, 3)),
        )


def test_planner_service_assigns_known_project_cards(monkeypatch, temp_db):
    monkeypatch.setattr("app_planner.services.get_card", lambda card_id: object())

    assigned = assign_project_card_to_priority(
        "card-1",
        date(2030, 1, 2),
        "Feature: Review",
    )

    assert assigned.priorities == ["Feature: Review"]
    assert assigned.priority_card_ids == ["card-1"]


def test_planner_service_rejects_missing_project_cards(monkeypatch, temp_db):
    monkeypatch.setattr("app_planner.services.get_card", lambda card_id: None)

    with pytest.raises(PlannerNotFoundError):
        assign_project_card_to_priority("missing", date(2030, 1, 2), "Missing")
