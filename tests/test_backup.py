from datetime import date
import json
import sqlite3
from pathlib import Path


from app_planner.backup import restore_backup, write_backup
from app_planner.sqlite_migration import migrate_sqlite_to_postgres
from app_planner.database import list_entries, save_entry
from app_planner.models import PlannerEntry
from app_projmgmt.database import (
    create_card,
    create_project,
    get_card,
    list_card_activity,
    list_projects,
    update_card,
)
from app_projmgmt.models import CardStatus, CardType, ProjectCardCreate, ProjectCreate


def test_backup_round_trip_restores_planner_and_project_data(temp_db, tmp_path):

    project = create_project(ProjectCreate(name="Portable project"))
    card = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Linked epic",
        )
    )
    card.status = CardStatus.IN_PROGRESS
    update_card(card)
    save_entry(
        PlannerEntry(
            entry_date=date(2026, 6, 10),
            priorities=["Portable project - Epic: Linked epic"],
            priority_card_ids=[card.id],
        )
    )

    backup_path = tmp_path / "backup.json"
    backup = write_backup(backup_path)
    assert backup_path.exists()
    assert backup.planner_entries[0].priority_card_ids == [card.id]
    assert len(backup.card_activity) == 1

    restored = restore_backup(Path(backup_path))

    assert restored.format_version == 1
    assert list_entries()[0].priority_card_ids == [card.id]
    assert list_projects()[0].id == project.id
    assert get_card(card.id).status == CardStatus.IN_PROGRESS
    assert list_card_activity(card.id)[0].field_name == "status"


def test_sqlite_migration_imports_existing_data(temp_db, tmp_path):
    planner_path = tmp_path / "planner.db"
    project_path = tmp_path / "project_mgmt.db"

    with sqlite3.connect(planner_path) as conn:
        conn.execute("""
            CREATE TABLE planner (
                entry_date TEXT PRIMARY KEY,
                priorities TEXT,
                tasks TEXT,
                schedule TEXT,
                notes TEXT,
                priority_card_ids TEXT NOT NULL DEFAULT '[]'
            )
        """)
        conn.execute(
            """
            INSERT INTO planner (
                entry_date, priorities, tasks, schedule, notes, priority_card_ids
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "2026-06-10",
                json.dumps(["Imported priority"]),
                json.dumps([]),
                "",
                "Imported notes",
                json.dumps(["card-1"]),
            ),
        )

    with sqlite3.connect(project_path) as conn:
        conn.execute("""
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE project_cards (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                card_type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                comments TEXT,
                status TEXT NOT NULL,
                start_date TEXT,
                due_date TEXT,
                parent_id TEXT,
                dependency_ids TEXT NOT NULL DEFAULT '[]',
                deliverables TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE project_card_activity (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                card_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute(
            """
            INSERT INTO projects (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                "project-1",
                "Imported project",
                None,
                "2026-06-01T00:00:00+00:00",
                "2026-06-01T00:00:00+00:00",
            ),
        )
        conn.execute(
            """
            INSERT INTO project_cards (
                id, project_id, card_type, title, description, comments, status,
                start_date, due_date, parent_id, dependency_ids, deliverables,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "card-1",
                "project-1",
                "epic",
                "Imported card",
                None,
                None,
                "backlog",
                None,
                None,
                None,
                json.dumps([]),
                json.dumps(["Imported deliverable"]),
                "2026-06-01T00:00:00+00:00",
                "2026-06-01T00:00:00+00:00",
            ),
        )

    migrate_sqlite_to_postgres(planner_path, project_path)

    assert list_entries()[0].notes == "Imported notes"
    assert list_projects()[0].name == "Imported project"
    assert get_card("card-1").deliverables == ["Imported deliverable"]
