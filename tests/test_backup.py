from datetime import date
from pathlib import Path

from app_planner.backup import restore_backup, write_backup
from app_planner.database import init_db as init_planner_db
from app_planner.database import list_entries, save_entry
from app_planner.models import PlannerEntry
from app_projmgmt.database import (
    create_card,
    create_project,
    get_card,
    init_db as init_project_db,
    list_card_activity,
    list_projects,
    update_card,
)
from app_projmgmt.models import CardStatus, CardType, ProjectCardCreate, ProjectCreate


def test_backup_round_trip_restores_planner_and_project_data(monkeypatch, tmp_path):
    planner_path = tmp_path / "source-planner.db"
    project_path = tmp_path / "source-projects.db"
    monkeypatch.setenv("PLANNER_DB_PATH", str(planner_path))
    monkeypatch.setenv("PROJECT_MGMT_DB_PATH", str(project_path))
    init_planner_db()
    init_project_db()

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

    monkeypatch.setenv("PLANNER_DB_PATH", str(tmp_path / "restored-planner.db"))
    monkeypatch.setenv("PROJECT_MGMT_DB_PATH", str(tmp_path / "restored-projects.db"))
    restored = restore_backup(Path(backup_path))

    assert restored.format_version == 1
    assert list_entries()[0].priority_card_ids == [card.id]
    assert list_projects()[0].id == project.id
    assert get_card(card.id).status == CardStatus.IN_PROGRESS
    assert list_card_activity(card.id)[0].field_name == "status"
