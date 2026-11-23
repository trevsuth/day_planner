import json
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from app_planner.postgres import get_connection
from app_projmgmt.models import (
    Project,
    ProjectCard,
    ProjectCardActivity,
    ProjectCardCreate,
    ProjectCreate,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def project_from_row(row) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def card_from_row(row) -> ProjectCard:
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
        dependency_ids=row["dependency_ids"],
        deliverables=row["deliverables"],
        graph_node_id=row["graph_node_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def activity_from_row(row) -> ProjectCardActivity:
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


def record_card_activity(conn, before: ProjectCard, after: ProjectCard) -> None:
    tracked_fields = (
        "card_type",
        "status",
        "start_date",
        "due_date",
        "parent_id",
        "comments",
    )
    created_at = datetime.now(timezone.utc)
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
            VALUES (%s, %s, %s, %s, %s, %s, %s)
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
            "SELECT * FROM projects WHERE id = %s", (project_id,)
        ).fetchone()
    return project_from_row(row) if row else None


def create_project(data: ProjectCreate) -> Project:
    project = Project(name=data.name, description=data.description)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO projects (id, name, description, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                project.id,
                project.name,
                project.description,
                project.created_at,
                project.updated_at,
            ),
        )
    return project


def update_project(project: Project) -> Project:
    project.updated_at = datetime.now(timezone.utc)
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE projects
            SET name = %s, description = %s, updated_at = %s
            WHERE id = %s
            """,
            (
                project.name,
                project.description,
                project.updated_at,
                project.id,
            ),
        )
    return project


def delete_project(project_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM projects WHERE id = %s", (project_id,))


def list_cards(project_id: str) -> list[ProjectCard]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM project_cards
            WHERE project_id = %s
            ORDER BY created_at ASC
            """,
            (project_id,),
        ).fetchall()
    return [card_from_row(row) for row in rows]


def get_card(card_id: str) -> ProjectCard | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM project_cards WHERE id = %s", (card_id,)
        ).fetchone()
    return card_from_row(row) if row else None


def create_card(data: ProjectCardCreate) -> ProjectCard:
    card = ProjectCard(**data.model_dump())
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO project_cards (
                id, project_id, card_type, title, description, comments, status,
                start_date, due_date, parent_id, dependency_ids, deliverables, graph_node_id,
                created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                "SELECT * FROM project_cards WHERE id = %s", (card.id,)
            ).fetchone()
            before = card_from_row(before_row) if before_row else None
            conn.execute(
                """
                UPDATE project_cards
                SET card_type = %s, title = %s, description = %s, comments = %s,
                    status = %s, start_date = %s, due_date = %s, parent_id = %s,
                    dependency_ids = %s, deliverables = %s, graph_node_id = %s, updated_at = %s
                WHERE id = %s
                """,
                (
                    str(card.card_type),
                    card.title,
                    card.description,
                    card.comments,
                    str(card.status),
                    card.start_date,
                    card.due_date,
                    card.parent_id,
                    Jsonb(card.dependency_ids),
                    Jsonb(card.deliverables),
                    card.graph_node_id,
                    card.updated_at,
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
        conn.execute("DELETE FROM project_cards WHERE id = %s", (card_id,))


def serialize_card(card: ProjectCard) -> tuple[object, ...]:
    return (
        card.id,
        card.project_id,
        str(card.card_type),
        card.title,
        card.description,
        card.comments,
        str(card.status),
        card.start_date,
        card.due_date,
        card.parent_id,
        Jsonb(card.dependency_ids),
        Jsonb(card.deliverables),
        card.graph_node_id,
        card.created_at,
        card.updated_at,
    )


def list_card_activity(card_id: str) -> list[ProjectCardActivity]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM project_card_activity
            WHERE card_id = %s
            ORDER BY created_at DESC
            """,
            (card_id,),
        ).fetchall()
    return [activity_from_row(row) for row in rows]


def list_all_cards() -> list[ProjectCard]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM project_cards ORDER BY created_at ASC"
        ).fetchall()
    return [card_from_row(row) for row in rows]


def list_all_card_activity() -> list[ProjectCardActivity]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM project_card_activity ORDER BY created_at ASC"
        ).fetchall()
    return [activity_from_row(row) for row in rows]


def replace_project_data(
    projects: list[Project],
    cards: list[ProjectCard],
    activity: list[ProjectCardActivity],
) -> None:
    with get_connection() as conn:
        conn.execute("SET CONSTRAINTS ALL DEFERRED")
        conn.execute("DELETE FROM projects")
        for project in projects:
            conn.execute(
                """
                INSERT INTO projects (id, name, description, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    project.id,
                    project.name,
                    project.description,
                    project.created_at,
                    project.updated_at,
                ),
            )
        for card in cards:
            conn.execute(
                """
                INSERT INTO project_cards (
                    id, project_id, card_type, title, description, comments, status,
                    start_date, due_date, parent_id, dependency_ids, deliverables, graph_node_id,
                    created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                serialize_card(card),
            )
        for item in activity:
            conn.execute(
                """
                INSERT INTO project_card_activity (
                    id, project_id, card_id, field_name, old_value, new_value, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    item.id,
                    item.project_id,
                    item.card_id,
                    item.field_name,
                    item.old_value,
                    item.new_value,
                    item.created_at,
                ),
            )
