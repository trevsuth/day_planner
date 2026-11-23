from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app_planner.postgres import get_connection


router = APIRouter(prefix="/api", tags=["search"])


class SearchHit(BaseModel):
    module: Literal["planner", "projects", "graph"]
    id: str
    title: str
    excerpt: str


@router.get("/search")
def search(q: Annotated[str, Query(min_length=2, max_length=100)]) -> list[SearchHit]:
    """Find matching Planner entries, project cards, and hosted Graph nodes."""
    query = q.strip()
    if len(query) < 2:
        return []
    with get_connection() as conn:
        rows = conn.execute(
            """
            WITH records AS (
                SELECT 'planner' AS module, entry_date::text AS id,
                       entry_date::text AS title,
                       concat_ws(' ', notes, schedule, priorities::text, tasks::text) AS body,
                       entry_date::text AS sort_key
                FROM planner
                UNION ALL
                SELECT 'projects', c.id, c.title,
                       concat_ws(' ', p.name, c.description, c.comments, c.deliverables::text),
                       c.updated_at::text
                FROM project_cards c JOIN projects p ON p.id = c.project_id
                UNION ALL
                SELECT 'graph', node->>'id', node->>'title',
                       concat_ws(' ', node#>>'{content,markdown}', node->>'tags', node->>'labels'),
                       node#>>'{content,updatedAt}'
                FROM graph_workspace
                CROSS JOIN LATERAL jsonb_array_elements(document->'nodes') AS node
            ), hits AS (
                SELECT module, id, title, strpos(lower(title), lower(%(q)s)) AS title_match,
                       substr(body, greatest(strpos(lower(body), lower(%(q)s)) - 55, 1), 175) AS excerpt,
                       sort_key
                FROM records
                WHERE strpos(lower(title), lower(%(q)s)) > 0
                   OR strpos(lower(body), lower(%(q)s)) > 0
            ), ranked AS (
                SELECT *, row_number() OVER (
                    PARTITION BY module ORDER BY (title_match > 0) DESC, sort_key DESC NULLS LAST, id
                ) AS position
                FROM hits
            )
            SELECT module, id, title, excerpt
            FROM ranked WHERE position <= 12 ORDER BY position, module
            """,
            {"q": query},
        ).fetchall()
    return [SearchHit.model_validate(row) for row in rows]
