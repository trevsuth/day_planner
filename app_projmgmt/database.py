import json
import sqlite3
from datetime import datetime, timezone

from app_projmgmt.models import Project, ProjectCard, ProjectCardCreate, ProjectCreate


def get_connection():
    conn = sqlite3.connect("project_mgmt.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
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
                comments TEXT,
                status TEXT NOT NULL,
                start_date TEXT,
                due_date TEXT,
                parent_id TEXT,
                dependency_ids TEXT NOT NULL DEFAULT '[]',
                deliverables TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY(parent_id) REFERENCES project_cards(id) ON DELETE SET NULL
            )
        """)
        ensure_project_card_columns(conn)


def ensure_project_card_columns(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(project_cards)").fetchall()
    }
    if "start_date" not in columns:
        conn.execute("ALTER TABLE project_cards ADD COLUMN start_date TEXT")
    if "comments" not in columns:
        conn.execute("ALTER TABLE project_cards ADD COLUMN comments TEXT")
    if "dependency_ids" not in columns:
        conn.execute(
            "ALTER TABLE project_cards ADD COLUMN dependency_ids TEXT NOT NULL DEFAULT '[]'"
        )


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


def update_card(card: ProjectCard) -> ProjectCard:
    card.updated_at = datetime.now(timezone.utc)
    with get_connection() as conn:
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
    return card


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
