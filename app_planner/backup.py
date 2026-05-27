import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app_planner.database import (
    init_db as init_planner_db,
    list_entries,
    replace_entries,
)
from app_planner.models import PlannerEntry
from app_projmgmt.database import (
    init_db as init_project_db,
    list_all_card_activity,
    list_all_cards,
    list_projects,
    replace_project_data,
)
from app_projmgmt.models import Project, ProjectCard, ProjectCardActivity


class BackupBundle(BaseModel):
    format_version: Literal[1] = 1
    exported_at: datetime
    planner_entries: list[PlannerEntry]
    projects: list[Project]
    project_cards: list[ProjectCard]
    card_activity: list[ProjectCardActivity]


def create_backup() -> BackupBundle:
    init_planner_db()
    init_project_db()
    return BackupBundle(
        exported_at=datetime.now(timezone.utc),
        planner_entries=list_entries(),
        projects=list_projects(),
        project_cards=list_all_cards(),
        card_activity=list_all_card_activity(),
    )


def write_backup(path: Path) -> BackupBundle:
    backup = create_backup()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(backup.model_dump_json(indent=2), encoding="utf-8")
    return backup


def restore_backup(path: Path) -> BackupBundle:
    backup = BackupBundle.model_validate_json(path.read_text(encoding="utf-8"))
    init_planner_db()
    init_project_db()
    replace_entries(backup.planner_entries)
    replace_project_data(backup.projects, backup.project_cards, backup.card_activity)
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description="Export or restore application data.")
    parser.add_argument("action", choices=("export", "restore"))
    parser.add_argument("path", type=Path)
    arguments = parser.parse_args()

    if arguments.action == "export":
        backup = write_backup(arguments.path)
        print(
            f"Exported {len(backup.planner_entries)} planner entries and "
            f"{len(backup.project_cards)} project cards to {arguments.path}."
        )
        return

    backup = restore_backup(arguments.path)
    print(
        f"Restored {len(backup.planner_entries)} planner entries and "
        f"{len(backup.project_cards)} project cards from {arguments.path}."
    )


if __name__ == "__main__":
    main()
