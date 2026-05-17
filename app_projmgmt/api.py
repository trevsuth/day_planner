from fastapi import APIRouter, HTTPException

from app_projmgmt.database import (
    create_card,
    create_project,
    delete_card,
    delete_project,
    get_card,
    get_project,
    init_db,
    list_cards,
    list_projects,
    update_card,
    update_project,
)
from app_projmgmt.models import (
    CardType,
    Project,
    ProjectCard,
    ProjectCardCreate,
    ProjectCardUpdate,
    ProjectCreate,
    ProjectUpdate,
)


router = APIRouter(prefix="/api/projmgmt", tags=["project management"])


@router.on_event("startup")
def startup() -> None:
    init_db()


@router.get("/projects", response_model=list[Project])
def get_projects() -> list[Project]:
    return list_projects()


@router.post("/projects", response_model=Project)
def post_project(project: ProjectCreate) -> Project:
    return create_project(project)


@router.get("/projects/{project_id}", response_model=Project)
def get_project_by_id(project_id: str) -> Project:
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.put("/projects/{project_id}", response_model=Project)
def put_project(project_id: str, data: ProjectUpdate) -> Project:
    existing = get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found.")

    existing.name = data.name
    existing.description = data.description
    return update_project(existing)


@router.delete("/projects/{project_id}", status_code=204)
def remove_project(project_id: str) -> None:
    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    delete_project(project_id)


@router.get("/projects/{project_id}/cards", response_model=list[ProjectCard])
def get_project_cards(project_id: str) -> list[ProjectCard]:
    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")
    return list_cards(project_id)


@router.post("/cards", response_model=ProjectCard)
def post_card(card: ProjectCardCreate) -> ProjectCard:
    validate_card_relationships(card.project_id, card.card_type, card.parent_id)
    return create_card(card)


@router.get("/cards/{card_id}", response_model=ProjectCard)
def get_card_by_id(card_id: str) -> ProjectCard:
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    return card


@router.put("/cards/{card_id}", response_model=ProjectCard)
def put_card(card_id: str, data: ProjectCardUpdate) -> ProjectCard:
    existing = get_card(card_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Card not found.")

    if data.card_type != existing.card_type and card_has_children(
        existing.project_id, card_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Cards with child cards cannot change type.",
        )

    validate_card_relationships(
        existing.project_id, data.card_type, data.parent_id, card_id
    )
    existing.card_type = data.card_type
    existing.title = data.title
    existing.description = data.description
    existing.status = data.status
    existing.due_date = data.due_date
    existing.parent_id = data.parent_id
    existing.deliverables = data.deliverables
    return update_card(existing)


@router.delete("/cards/{card_id}", status_code=204)
def remove_card(card_id: str) -> None:
    card = get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card_has_children(card.project_id, card_id):
        raise HTTPException(
            status_code=400,
            detail="Cards with child cards cannot be deleted.",
        )
    delete_card(card_id)


def card_has_children(project_id: str, card_id: str) -> bool:
    return any(card.parent_id == card_id for card in list_cards(project_id))


def validate_card_relationships(
    project_id: str,
    card_type: CardType,
    parent_id: str | None,
    card_id: str | None = None,
) -> None:
    if not get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found.")

    expected_parent_type = {
        CardType.EPIC: None,
        CardType.FEATURE: CardType.EPIC,
        CardType.STORY: CardType.FEATURE,
        CardType.SUBTASK: CardType.STORY,
    }[card_type]

    if not parent_id:
        if expected_parent_type:
            raise HTTPException(
                status_code=400,
                detail=f"{card_type.value} cards must be tied to a {expected_parent_type.value}.",
            )
        return

    if parent_id == card_id:
        raise HTTPException(status_code=400, detail="A card cannot parent itself.")

    parent = get_card(parent_id)
    if not parent or parent.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Parent card must belong to the same project.",
        )

    if parent.card_type != expected_parent_type:
        raise HTTPException(
            status_code=400,
            detail=f"{card_type.value} cards must be tied to a {expected_parent_type.value}.",
        )
