from app_projmgmt import database
from app_projmgmt.models import (
    CardType,
    Project,
    ProjectCard,
    ProjectCardActivity,
    ProjectCardIssue,
    ProjectCardCreate,
    ProjectCardUpdate,
    ProjectCreate,
    ProjectUpdate,
)
from app_projmgmt.rules import (
    CARD_TYPE_HIERARCHY,
    collect_descendants,
    expected_parent_type,
    project_issues,
    shifted_card_type,
)


class ProjectServiceError(ValueError):
    pass


class ProjectNotFoundError(ProjectServiceError):
    pass


def list_all_projects() -> list[Project]:
    return database.list_projects()


def create_new_project(project: ProjectCreate) -> Project:
    return database.create_project(project)


def get_existing_project(project_id: str) -> Project:
    project = database.get_project(project_id)
    if not project:
        raise ProjectNotFoundError("Project not found.")
    return project


def update_existing_project(project_id: str, data: ProjectUpdate) -> Project:
    existing = get_existing_project(project_id)
    existing.name = data.name
    existing.description = data.description
    return database.update_project(existing)


def delete_existing_project(project_id: str) -> None:
    get_existing_project(project_id)
    database.delete_project(project_id)


def list_project_cards(project_id: str) -> list[ProjectCard]:
    get_existing_project(project_id)
    return database.list_cards(project_id)


def list_project_issues(project_id: str) -> list[ProjectCardIssue]:
    return project_issues(list_project_cards(project_id))


def create_new_card(card: ProjectCardCreate) -> ProjectCard:
    validate_card_dates(card.start_date, card.due_date)
    validate_card_relationships(card.project_id, card.card_type, card.parent_id)
    validate_card_dependencies(card.project_id, card.dependency_ids)
    return database.create_card(card)


def get_existing_card(card_id: str) -> ProjectCard:
    card = database.get_card(card_id)
    if not card:
        raise ProjectNotFoundError("Card not found.")
    return card


def list_existing_card_activity(card_id: str) -> list[ProjectCardActivity]:
    get_existing_card(card_id)
    return database.list_card_activity(card_id)


def update_existing_card(card_id: str, data: ProjectCardUpdate) -> ProjectCard:
    existing = get_existing_card(card_id)
    validate_card_relationships(
        existing.project_id, data.card_type, data.parent_id, card_id
    )
    validate_card_dependencies(existing.project_id, data.dependency_ids, card_id)
    validate_card_dates(data.start_date, data.due_date)
    descendants = shifted_descendants(
        existing.project_id, card_id, existing.card_type, data.card_type
    )
    existing.card_type = data.card_type
    existing.title = data.title
    existing.description = data.description
    existing.comments = data.comments
    existing.status = data.status
    existing.start_date = data.start_date
    existing.due_date = data.due_date
    existing.parent_id = data.parent_id
    existing.dependency_ids = data.dependency_ids
    existing.deliverables = data.deliverables
    return database.update_cards([existing, *descendants])[0]


def delete_existing_card(card_id: str) -> None:
    card = get_existing_card(card_id)
    if card_has_children(card.project_id, card_id):
        raise ProjectServiceError("Cards with child cards cannot be deleted.")
    database.delete_card(card_id)


def card_has_children(project_id: str, card_id: str) -> bool:
    return any(card.parent_id == card_id for card in database.list_cards(project_id))


def shifted_descendants(
    project_id: str,
    card_id: str,
    previous_type: CardType,
    requested_type: CardType,
) -> list[ProjectCard]:
    offset = CARD_TYPE_HIERARCHY.index(requested_type) - CARD_TYPE_HIERARCHY.index(
        previous_type
    )
    if not offset:
        return []

    descendants = collect_descendants(card_id, database.list_cards(project_id))
    for descendant in descendants:
        descendant_type = shifted_card_type(
            descendant.card_type, previous_type, requested_type
        )
        if not descendant_type:
            raise ProjectServiceError(
                "Changing this card type would move a descendant outside "
                "the epic-to-subtask hierarchy."
            )
        descendant.card_type = descendant_type
    return descendants


def validate_card_dates(start_date, due_date) -> None:
    if start_date and due_date and start_date > due_date:
        raise ProjectServiceError("Start date must be on or before due date.")


def validate_card_relationships(
    project_id: str,
    card_type: CardType,
    parent_id: str | None,
    card_id: str | None = None,
) -> None:
    get_existing_project(project_id)

    expected_type = expected_parent_type(card_type)

    if not parent_id:
        if expected_type:
            raise ProjectServiceError(
                f"{card_type.value} cards must be tied to a {expected_type.value}."
            )
        return

    if parent_id == card_id:
        raise ProjectServiceError("A card cannot parent itself.")

    parent = database.get_card(parent_id)
    if not parent or parent.project_id != project_id:
        raise ProjectServiceError("Parent card must belong to the same project.")

    if parent.card_type != expected_type:
        raise ProjectServiceError(
            f"{card_type.value} cards must be tied to a {expected_type.value}."
        )


def validate_card_dependencies(
    project_id: str,
    dependency_ids: list[str],
    card_id: str | None = None,
) -> None:
    if len(dependency_ids) != len(set(dependency_ids)):
        raise ProjectServiceError("Dependency list contains duplicates.")

    for dependency_id in dependency_ids:
        if dependency_id == card_id:
            raise ProjectServiceError("A card cannot depend on itself.")

        dependency = database.get_card(dependency_id)
        if not dependency or dependency.project_id != project_id:
            raise ProjectServiceError(
                "Dependency cards must belong to the same project."
            )
