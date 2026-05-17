import os
import sqlite3
import tempfile

import pytest
from fastapi import HTTPException

from app_projmgmt.api import card_has_children, validate_card_relationships
from app_projmgmt.database import (
    create_card,
    create_project,
    delete_project,
    get_card,
    get_project,
    init_db,
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
            status=CardStatus.IN_PROGRESS,
            deliverables=["Design approval", "Release checklist"],
        )
    )

    loaded_project = get_project(project.id)
    loaded_card = get_card(card.id)

    assert loaded_project == project
    assert loaded_card is not None
    assert loaded_card.title == "Launch redesign"
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
    card.deliverables = ["OAuth flow"]
    updated = update_card(card)

    assert updated.status == CardStatus.DONE
    assert get_card(card.id).deliverables == ["OAuth flow"]


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
