import os
from datetime import date
from uuid import uuid4

import psycopg
import pytest
from fastapi import HTTPException
from psycopg import sql
from psycopg.rows import dict_row

from app_projmgmt import database as project_database
from app_projmgmt.api import put_card
from app_projmgmt.services import (
    ProjectServiceError,
    card_has_children,
    list_project_issues,
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
from app_projmgmt.models import (
    CardStatus,
    CardType,
    ProjectCardCreate,
    ProjectCardUpdate,
    ProjectCreate,
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

    monkeypatch.setattr("app_projmgmt.database.get_connection", _get_temp_connection)
    init_db()
    yield
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


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

    with pytest.raises(ProjectServiceError):
        validate_card_relationships(project.id, CardType.STORY, epic.id)

    with pytest.raises(ProjectServiceError):
        validate_card_relationships(project.id, CardType.FEATURE, None)


def test_changing_card_type_shifts_descendants_and_records_activity(temp_db):
    project = create_project(ProjectCreate(name="Hierarchy shift"))
    new_parent = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Portfolio",
        )
    )
    epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Release",
        )
    )
    feature = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.FEATURE,
            title="Reporting",
            parent_id=epic.id,
        )
    )
    story = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.STORY,
            title="Export",
            parent_id=feature.id,
        )
    )

    updated = put_card(
        epic.id,
        ProjectCardUpdate(
            card_type=CardType.FEATURE,
            title=epic.title,
            parent_id=new_parent.id,
        ),
    )

    assert updated.card_type == CardType.FEATURE
    assert get_card(feature.id).card_type == CardType.STORY
    assert get_card(story.id).card_type == CardType.SUBTASK
    assert {item.field_name for item in list_card_activity(feature.id)} == {"card_type"}


def test_changing_card_type_rejects_descendants_below_subtask(temp_db):
    project = create_project(ProjectCreate(name="Hierarchy limit"))
    new_parent = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Portfolio",
        )
    )
    epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Release",
        )
    )
    feature = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.FEATURE,
            title="Reporting",
            parent_id=epic.id,
        )
    )
    story = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.STORY,
            title="Export",
            parent_id=feature.id,
        )
    )
    subtask = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.SUBTASK,
            title="Format CSV",
            parent_id=story.id,
        )
    )

    with pytest.raises(HTTPException, match="outside the epic-to-subtask"):
        put_card(
            epic.id,
            ProjectCardUpdate(
                card_type=CardType.FEATURE,
                title=epic.title,
                parent_id=new_parent.id,
            ),
        )

    assert get_card(epic.id).card_type == CardType.EPIC
    assert get_card(feature.id).card_type == CardType.FEATURE
    assert get_card(story.id).card_type == CardType.STORY
    assert get_card(subtask.id).card_type == CardType.SUBTASK


def test_validate_card_dates(temp_db):
    validate_card_dates(date(2026, 5, 1), date(2026, 5, 2))
    validate_card_dates(None, date(2026, 5, 2))
    validate_card_dates(date(2026, 5, 1), None)

    with pytest.raises(ProjectServiceError):
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

    with pytest.raises(ProjectServiceError):
        validate_card_dependencies(project.id, [dependency.id, dependency.id], card.id)

    with pytest.raises(ProjectServiceError):
        validate_card_dependencies(project.id, [card.id], card.id)

    with pytest.raises(ProjectServiceError):
        validate_card_dependencies(project.id, [other_card.id], card.id)


def test_project_issues_are_computed_by_service_rules(temp_db):
    project = create_project(ProjectCreate(name="Issue rules"))
    epic = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.EPIC,
            title="Launch",
            start_date=date(2030, 6, 8),
            due_date=date(2030, 6, 10),
        )
    )
    dependency = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.FEATURE,
            title="Blocked dependency",
            status=CardStatus.BLOCKED,
            due_date=date(2030, 6, 9),
            parent_id=epic.id,
        )
    )
    dependent = create_card(
        ProjectCardCreate(
            project_id=project.id,
            card_type=CardType.STORY,
            title="Dependent story",
            start_date=date(2030, 6, 7),
            parent_id=dependency.id,
            dependency_ids=[dependency.id],
        )
    )

    issues = list_project_issues(project.id)
    issue_keys = {(issue.card_id, issue.type, issue.dependency_id) for issue in issues}

    assert (epic.id, "hierarchy_date_conflict", dependent.id) in issue_keys
    assert (dependent.id, "blocked_dependency", dependency.id) in issue_keys
    assert (dependent.id, "date_conflict", dependency.id) in issue_keys


def test_init_db_creates_project_schema(temp_db):
    with project_database.get_connection() as conn:
        columns = {
            row["column_name"]: row["data_type"]
            for row in conn.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'project_cards'
                """
            ).fetchall()
        }
        migrations = conn.execute(
            "SELECT version, name FROM projmgmt_schema_migrations ORDER BY version"
        ).fetchall()

    assert columns["start_date"] == "date"
    assert columns["dependency_ids"] == "jsonb"
    assert columns["deliverables"] == "jsonb"
    assert migrations == [{"version": 1, "name": "create_project_tables"}]
