from psycopg.types.json import Jsonb

from app_graph.models import Workspace, WorkspaceUpdate
from app_planner.postgres import get_connection


class RevisionConflict(Exception):
    pass


class InvalidAttachment(ValueError):
    pass


def load_workspace() -> Workspace:
    with get_connection() as conn:
        row = conn.execute("""
            SELECT revision, document FROM graph_workspace WHERE singleton
        """).fetchone()
    return Workspace.model_validate(row)


def load_attachment(key: str) -> bytes | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT data FROM graph_attachments WHERE storage_key = %s", (key,)
        ).fetchone()
    return row["data"] if row else None


def save_workspace(
    update: WorkspaceUpdate, files: dict[str, bytes], sizes: dict[str, int]
) -> int:
    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE graph_workspace
            SET document = %s, revision = revision + 1
            WHERE singleton AND revision = %s
            RETURNING revision
            """,
            (Jsonb(update.document.model_dump(exclude_none=True)), update.revision),
        ).fetchone()
        if row is None:
            raise RevisionConflict

        for key, data in files.items():
            inserted = conn.execute(
                """
                INSERT INTO graph_attachments (storage_key, data)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
                """,
                (key, data),
            )
            if not inserted.rowcount:
                match = conn.execute(
                    "SELECT 1 FROM graph_attachments WHERE storage_key = %s AND data = %s",
                    (key, data),
                ).fetchone()
                if match is None:
                    raise InvalidAttachment(
                        "An attachment key already holds a different file."
                    )

        stored = conn.execute(
            """
            SELECT storage_key, octet_length(data) AS size FROM graph_attachments
            WHERE storage_key = ANY(%s)
            """,
            (list(sizes),),
        ).fetchall()
        if {file["storage_key"]: file["size"] for file in stored} != sizes:
            raise InvalidAttachment(
                "A referenced attachment is missing or has an invalid size."
            )

    return row["revision"]
