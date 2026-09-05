import argparse
import json
import sqlite3
from pathlib import Path

from app_planner.database import init_db as init_planner_db
from app_planner.database import replace_entries
from app_planner.models import PlannerEntry, Task
from app_projmgmt.database import init_db as init_project_db
from app_projmgmt.database import replace_project_data
from app_projmgmt.models import Project, ProjectCard, ProjectCardActivity


def connect_sqlite(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def load_planner_entries(path: Path) -> list[PlannerEntry]:
    with connect_sqlite(path) as conn:
        rows = conn.execute("SELECT * FROM planner ORDER BY entry_date ASC").fetchall()
    return [
        PlannerEntry(
            entry_date=row["entry_date"],
            priorities=json.loads(row["priorities"]),
            priority_card_ids=json.loads(row["priority_card_ids"]),
            tasks=[Task(**task) for task in json.loads(row["tasks"])],
            schedule=row["schedule"],
            notes=row["notes"],
        )
        for row in rows
    ]


def load_projects(path: Path) -> list[Project]:
    with connect_sqlite(path) as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [Project(**dict(row)) for row in rows]


def load_cards(path: Path) -> list[ProjectCard]:
    with connect_sqlite(path) as conn:
        rows = conn.execute(
            "SELECT * FROM project_cards ORDER BY created_at ASC"
        ).fetchall()
    return [
        ProjectCard(
            **{
                **dict(row),
                "dependency_ids": json.loads(row["dependency_ids"]),
                "deliverables": json.loads(row["deliverables"]),
            }
        )
        for row in rows
    ]


def load_card_activity(path: Path) -> list[ProjectCardActivity]:
    with connect_sqlite(path) as conn:
        rows = conn.execute(
            "SELECT * FROM project_card_activity ORDER BY created_at ASC"
        ).fetchall()
    return [ProjectCardActivity(**dict(row)) for row in rows]


def migrate_sqlite_to_postgres(planner_db: Path, project_db: Path) -> None:
    init_planner_db()
    init_project_db()
    replace_entries(load_planner_entries(planner_db))
    replace_project_data(
        load_projects(project_db),
        load_cards(project_db),
        load_card_activity(project_db),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import existing SQLite planner data into Postgres."
    )
    parser.add_argument("--planner-db", type=Path, default=Path("planner.db"))
    parser.add_argument("--project-db", type=Path, default=Path("project_mgmt.db"))
    args = parser.parse_args()

    migrate_sqlite_to_postgres(args.planner_db, args.project_db)
    print(f"Imported {args.planner_db} and {args.project_db} into Postgres.")


if __name__ == "__main__":
    main()
