import os
import sqlite3
import tempfile
from datetime import date

import pytest
from fastapi import HTTPException

from app_projmgmt.api import (
    card_has_children,
    validate_card_dependencies,
    validate_card_dates,
    validate_card_relationships,
)
from app_projmgmt.database import (
    create_card,
    create_project,
    delete_project,
    get_card,
    get_project,
    init_db,
    list_card_activity,
    list_cards,
    list_projects,
    update_card,
)
from app_projmgmt.models import CardStatus, CardType, ProjectCardCreate, ProjectCreate


@pytest.fixture
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp()
    os.close(fd)

    def _get_temp_connection():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    monkeypatch.setattr("app_projmgmt.database.get_connection", _get_temp_connection)
    init_db()
    yield
    os.remove(path)


def test_create_project_and_card(temp_db):
    project = create_project(
        ProjectCreate(name="Website redesign", description="Refresh core flows")
    )

    card = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Launch redesign",
            description="Coordinate design and engineering work",
            comments="## Notes\n\n```mermaid\ngraph TD\nA-->B\n```",
            status=CardStatus.IN_PROGRESS,
            start_date=date(2026, 5, 20),
            due_date=date(2026, 6, 1),
            dependency_ids=[],
            deliverables=["Design approval", "Release checklist"],
        )
    )

    loaded_project = get_project(project.id)
    loaded_card = get_card(card.id)

    assert loaded_project == project
    assert loaded_card is not None
    assert loaded_card.title == "Launch redesign"
    assert loaded_card.comments == "## Notes\n\n```mermaid\ngraph TD\nA-->B\n```"
    assert loaded_card.start_date == date(2026, 5, 20)
    assert loaded_card.due_date == date(2026, 6, 1)
    assert loaded_card.dependency_ids == []
    assert loaded_card.deliverables == ["Design approval", "Release checklist"]
    assert list_projects() == [project]
    assert list_cards(project.id) == [loaded_card]


def test_update_card(temp_db):
    project = create_project(ProjectCreate(name="Mobile app"))
    card = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.STORY,
            title="Add sign in",
        )
    )

    card.status = CardStatus.DONE
    card.comments = "Ready for release"
    card.start_date = date(2026, 6, 2)
    card.due_date = date(2026, 6, 4)
    card.dependency_ids = []
    card.deliverables = ["OAuth flow"]
    updated = update_card(card)

    assert updated.status == CardStatus.DONE
    assert get_card(card.id).comments == "Ready for release"
    assert get_card(card.id).start_date == date(2026, 6, 2)
    assert get_card(card.id).due_date == date(2026, 6, 4)
    assert get_card(card.id).dependency_ids == []
    assert get_card(card.id).deliverables == ["OAuth flow"]


def test_update_card_records_activity_for_tracked_fields(temp_db):
    project = create_project(ProjectCreate(name="Audit trail"))
    epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Parent epic",
        )
    )
    other_epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Other epic",
        )
    )
    card = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.FEATURE,
            title="Tracked feature",
            parent_id=epic.id,
        )
    )

    card.status = CardStatus.IN_PROGRESS
    card.start_date = date(2026, 6, 1)
    card.due_date = date(2026, 6, 5)
    card.parent_id = other_epic.id
    card.comments = "Ready for review"
    update_card(card)

    activity = list_card_activity(card.id)
    changed_fields = {item.field_name for item in activity}

    assert changed_fields == {
        "status",
        "start_date",
        "due_date",
        "parent_id",
        "comments",
    }
    assert (
        next(item for item in activity if item.field_name == "status").old_value
        == "backlog"
    )
    assert (
        next(item for item in activity if item.field_name == "status").new_value
        == "in_progress"
    )
    assert (
        next(item for item in activity if item.field_name == "comments").new_value
        == "Ready for review"
    )
    assert (
        next(item for item in activity if item.field_name == "parent_id").old_value
        == epic.id
    )
    assert (
        next(item for item in activity if item.field_name == "parent_id").new_value
        == other_epic.id
    )


def test_delete_project_removes_cards(temp_db):
    project = create_project(ProjectCreate(name="Retired project"))
    create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Archive me",
        )
    )

    delete_project(project.id)

    assert get_project(project.id) is None
    assert list_cards(project.id) == []


def test_validate_card_hierarchy(temp_db):
    project = create_project(ProjectCreate(name="Roadmap"))
    epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Planning",
        )
    )
    feature = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.FEATURE,
            title="Project board",
            parent_id=epic.id,
        )
    )

    validate_card_relationships(project.id, CardType.STORY, feature.id)
    assert card_has_children(project.id, epic.id)
    assert not card_has_children(project.id, feature.id)

    with pytest.raises(HTTPException):
        validate_card_relationships(project.id, CardType.STORY, epic.id)

    with pytest.raises(HTTPException):
        validate_card_relationships(project.id, CardType.FEATURE, None)


def test_validate_card_dates(temp_db):
    validate_card_dates(date(2026, 5, 1), date(2026, 5, 2))
    validate_card_dates(None, date(2026, 5, 2))
    validate_card_dates(date(2026, 5, 1), None)

    with pytest.raises(HTTPException):
        validate_card_dates(date(2026, 5, 3), date(2026, 5, 2))


def test_validate_card_dependencies(temp_db):
    project = create_project(ProjectCreate(name="Dependencies"))
    other_project = create_project(ProjectCreate(name="Other"))
    dependency = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="API contract",
        )
    )
    card = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Frontend wiring",
            dependency_ids=[dependency.id],
        )
    )
    other_card = create_card(
        ProjectCardCreate(
            project_id=other_project.id,
            card_type=CardType.EPIC,
            title="Separate project",
        )
    )

    validate_card_dependencies(project.id, [dependency.id], card.id)

    with pytest.raises(HTTPException):
        validate_card_dependencies(project.id, [dependency.id, dependency.id], card.id)

    with pytest.raises(HTTPException):
        validate_card_dependencies(project.id, [card.id], card.id)

    with pytest.raises(HTTPException):
        validate_card_dependencies(project.id, [other_card.id], card.id)


def test_init_db_adds_new_columns_to_existing_cards_table(monkeypatch):
    fd, path = tempfile.mkstemp()
    os.close(fd)

    with sqlite3.connect(path) as conn:
        conn.execute("""
            CREATE TABLE project_cards (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                card_type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                due_date TEXT,
                parent_id TEXT,
                deliverables TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

    def _get_temp_connection():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    monkeypatch.setattr("app_projmgmt.database.get_connection", _get_temp_connection)
    init_db()

    with _get_temp_connection() as conn:
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(project_cards)").fetchall()
        }
        migrations = conn.execute(
            "SELECT version, name FROM schema_migrations ORDER BY version"
        ).fetchall()

    assert {"start_date", "comments", "dependency_ids"}.issubset(columns)
    assert [(row["version"], row["name"]) for row in migrations] == [
        (1, "create_project_tables"),
        (2, "add_card_scheduling_comments_and_dependencies"),
        (3, "create_card_activity"),
    ]
    os.remove(path)
