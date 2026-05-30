from fastapi import APIRouter, HTTPException

from app_projmgmt.database import init_db
from app_projmgmt.models import (
    Project,
    ProjectCard,
    ProjectCardActivity,
    ProjectCardIssue,
    ProjectCardCreate,
    ProjectCardUpdate,
    ProjectCreate,
    ProjectUpdate,
)
from app_projmgmt.services import (
    ProjectNotFoundError,
    ProjectServiceError,
    create_new_card,
    create_new_project,
    delete_existing_card,
    delete_existing_project,
    get_existing_card,
    get_existing_project,
    list_all_projects,
    list_existing_card_activity,
    list_project_issues,
    list_project_cards,
    update_existing_card,
    update_existing_project,
)


router = APIRouter(prefix="/api/projmgmt", tags=["project management"])


@router.on_event("startup")
def startup() -> None:
    init_db()


@router.get("/projects", response_model=list[Project])
def get_projects() -> list[Project]:
    return list_all_projects()


@router.post("/projects", response_model=Project)
def post_project(project: ProjectCreate) -> Project:
    return create_new_project(project)


@router.get("/projects/{project_id}", response_model=Project)
def get_project_by_id(project_id: str) -> Project:
    return get_or_404(get_existing_project, project_id)


@router.put("/projects/{project_id}", response_model=Project)
def put_project(project_id: str, data: ProjectUpdate) -> Project:
    return get_or_404(update_existing_project, project_id, data)


@router.delete("/projects/{project_id}", status_code=204)
def remove_project(project_id: str) -> None:
    get_or_404(delete_existing_project, project_id)


@router.get("/projects/{project_id}/cards", response_model=list[ProjectCard])
def get_project_cards(project_id: str) -> list[ProjectCard]:
    return get_or_404(list_project_cards, project_id)


@router.get("/projects/{project_id}/issues", response_model=list[ProjectCardIssue])
def get_project_card_issues(project_id: str) -> list[ProjectCardIssue]:
    return get_or_404(list_project_issues, project_id)


@router.post("/cards", response_model=ProjectCard)
def post_card(card: ProjectCardCreate) -> ProjectCard:
    return service_call(create_new_card, card)


@router.get("/cards/{card_id}", response_model=ProjectCard)
def get_card_by_id(card_id: str) -> ProjectCard:
    return get_or_404(get_existing_card, card_id)


@router.get("/cards/{card_id}/activity", response_model=list[ProjectCardActivity])
def get_card_activity(card_id: str) -> list[ProjectCardActivity]:
    return get_or_404(list_existing_card_activity, card_id)


@router.put("/cards/{card_id}", response_model=ProjectCard)
def put_card(card_id: str, data: ProjectCardUpdate) -> ProjectCard:
    return service_call(update_existing_card, card_id, data)


@router.delete("/cards/{card_id}", status_code=204)
def remove_card(card_id: str) -> None:
    get_or_404(delete_existing_card, card_id)


def get_or_404(function, *args):
    try:
        return function(*args)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ProjectServiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def service_call(function, *args):
    try:
        return function(*args)
    except ProjectNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ProjectServiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
