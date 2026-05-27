import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from app_projmgmt.models import (
    Project,
    ProjectCard,
    ProjectCardActivity,
    ProjectCardCreate,
    ProjectCreate,
)


def database_path() -> str:
    return os.environ.get("PROJECT_MGMT_DB_PATH", "project_mgmt.db")


def get_connection():
    db_path = database_path()
    parent = Path(db_path).parent
    if str(parent) != ".":
        parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def applied_migrations(conn: sqlite3.Connection) -> set[int]:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
    """)
    rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    return {row["version"] for row in rows}


def record_migration(conn: sqlite3.Connection, version: int, name: str) -> None:
    conn.execute(
        """
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
        """,
        (version, name, datetime.now(timezone.utc).isoformat()),
    )


def project_card_columns(conn: sqlite3.Connection) -> set[str]:
    return {
        row["name"]
        for row in conn.execute("PRAGMA table_info(project_cards)").fetchall()
    }


def migration_001_create_project_tables(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS project_cards (
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
            updated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES project_cards(id) ON DELETE SET NULL
        )
    """)


def migration_002_add_card_scheduling_comments_and_dependencies(
    conn: sqlite3.Connection,
) -> None:
    columns = project_card_columns(conn)
    if "start_date" not in columns:
        conn.execute("ALTER TABLE project_cards ADD COLUMN start_date TEXT")
    if "comments" not in columns:
        conn.execute("ALTER TABLE project_cards ADD COLUMN comments TEXT")
    if "dependency_ids" not in columns:
        conn.execute(
            "ALTER TABLE project_cards ADD COLUMN dependency_ids TEXT NOT NULL DEFAULT '[]'"
        )


def migration_003_create_card_activity(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS project_card_activity (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            card_id TEXT NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(card_id) REFERENCES project_cards(id) ON DELETE CASCADE
        )
    """)


MIGRATIONS = [
    (1, "create_project_tables", migration_001_create_project_tables),
    (
        2,
        "add_card_scheduling_comments_and_dependencies",
        migration_002_add_card_scheduling_comments_and_dependencies,
    ),
    (3, "create_card_activity", migration_003_create_card_activity),
]


def init_db() -> None:
    with get_connection() as conn:
        applied = applied_migrations(conn)
        for version, name, migration in MIGRATIONS:
            if version in applied:
                continue
            migration(conn)
            record_migration(conn, version, name)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def project_from_row(row: sqlite3.Row) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def card_from_row(row: sqlite3.Row) -> ProjectCard:
    return ProjectCard(
        id=row["id"],
        project_id=row["project_id"],
        card_type=row["card_type"],
        title=row["title"],
        description=row["description"],
        comments=row["comments"],
        status=row["status"],
        start_date=row["start_date"],
        due_date=row["due_date"],
        parent_id=row["parent_id"],
        dependency_ids=json.loads(row["dependency_ids"]),
        deliverables=json.loads(row["deliverables"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def activity_from_row(row: sqlite3.Row) -> ProjectCardActivity:
    return ProjectCardActivity(
        id=row["id"],
        project_id=row["project_id"],
        card_id=row["card_id"],
        field_name=row["field_name"],
        old_value=row["old_value"],
        new_value=row["new_value"],
        created_at=row["created_at"],
    )


def serialize_activity_value(value: object) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, list):
        return json.dumps(value)
    return str(value)


def record_card_activity(
    conn: sqlite3.Connection,
    before: ProjectCard,
    after: ProjectCard,
) -> None:
    tracked_fields = (
        "card_type",
        "status",
        "start_date",
        "due_date",
        "parent_id",
        "comments",
    )
    created_at = now_iso()
    for field_name in tracked_fields:
        old_value = getattr(before, field_name)
        new_value = getattr(after, field_name)
        if old_value == new_value:
            continue

        activity = ProjectCardActivity(
            project_id=after.project_id,
            card_id=after.id,
            field_name=field_name,
        )
        conn.execute(
            """
            INSERT INTO project_card_activity (
                id, project_id, card_id, field_name, old_value, new_value, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                activity.id,
                activity.project_id,
                activity.card_id,
                activity.field_name,
                serialize_activity_value(old_value),
                serialize_activity_value(new_value),
                created_at,
            ),
        )


def list_projects() -> list[Project]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM projects ORDER BY updated_at DESC, name ASC"
        ).fetchall()
    return [project_from_row(row) for row in rows]


def get_project(project_id: str) -> Project | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
    return project_from_row(row) if row else None


def create_project(data: ProjectCreate) -> Project:
    project = Project(name=data.name, description=data.description)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO projects (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                project.id,
                project.name,
                project.description,
                project.created_at.isoformat(),
                project.updated_at.isoformat(),
            ),
        )
    return project


def update_project(project: Project) -> Project:
    project.updated_at = datetime.now(timezone.utc)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE projects
            SET name = ?, description = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                project.name,
                project.description,
                project.updated_at.isoformat(),
                project.id,
            ),
        )
    return project


def delete_project(project_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


def list_cards(project_id: str) -> list[ProjectCard]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM project_cards
            WHERE project_id = ?
            ORDER BY created_at ASC
            """,
            (project_id,),
        ).fetchall()
    return [card_from_row(row) for row in rows]


def get_card(card_id: str) -> ProjectCard | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM project_cards WHERE id = ?", (card_id,)
        ).fetchone()
    return card_from_row(row) if row else None


def create_card(data: ProjectCardCreate) -> ProjectCard:
    card = ProjectCard(**data.model_dump())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO project_cards (
                id, project_id, card_type, title, description, comments, status,
                start_date, due_date, parent_id, dependency_ids, deliverables,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            serialize_card(card),
        )
    return card


def update_cards(cards: list[ProjectCard]) -> list[ProjectCard]:
    updated_at = datetime.now(timezone.utc)
    with get_connection() as conn:
        for card in cards:
            card.updated_at = updated_at
            before_row = conn.execute(
                "SELECT * FROM project_cards WHERE id = ?", (card.id,)
            ).fetchone()
            before = card_from_row(before_row) if before_row else None
            conn.execute(
                """
                UPDATE project_cards
                SET card_type = ?, title = ?, description = ?, comments = ?,
                    status = ?, start_date = ?, due_date = ?, parent_id = ?,
                    dependency_ids = ?, deliverables = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    card.card_type,
                    card.title,
                    card.description,
                    card.comments,
                    card.status,
                    card.start_date.isoformat() if card.start_date else None,
                    card.due_date.isoformat() if card.due_date else None,
                    card.parent_id,
                    json.dumps(card.dependency_ids),
                    json.dumps(card.deliverables),
                    card.updated_at.isoformat(),
                    card.id,
                ),
            )
            if before:
                record_card_activity(conn, before, card)
    return cards


def update_card(card: ProjectCard) -> ProjectCard:
    return update_cards([card])[0]


def delete_card(card_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM project_cards WHERE id = ?", (card_id,))


def serialize_card(card: ProjectCard) -> tuple[object, ...]:
    return (
        card.id,
        card.project_id,
        card.card_type,
        card.title,
        card.description,
        card.comments,
        card.status,
        card.start_date.isoformat() if card.start_date else None,
        card.due_date.isoformat() if card.due_date else None,
        card.parent_id,
        json.dumps(card.dependency_ids),
        json.dumps(card.deliverables),
        card.created_at.isoformat(),
        card.updated_at.isoformat(),
    )


def list_card_activity(card_id: str) -> list[ProjectCardActivity]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM project_card_activity
            WHERE card_id = ?
            ORDER BY created_at DESC
            """,
            (card_id,),
        ).fetchall()
    return [activity_from_row(row) for row in rows]
