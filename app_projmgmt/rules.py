from datetime import date

from app_projmgmt.models import CardStatus, CardType, ProjectCard, ProjectCardIssue


CARD_TYPE_HIERARCHY = (
    CardType.EPIC,
    CardType.FEATURE,
    CardType.STORY,
    CardType.SUBTASK,
)

PARENT_TYPE_BY_CARD_TYPE = {
    CardType.EPIC: None,
    CardType.FEATURE: CardType.EPIC,
    CardType.STORY: CardType.FEATURE,
    CardType.SUBTASK: CardType.STORY,
}


def expected_parent_type(card_type: CardType) -> CardType | None:
    return PARENT_TYPE_BY_CARD_TYPE[card_type]


def card_start(card: ProjectCard) -> date | None:
    return card.start_date or card.due_date


def card_end(card: ProjectCard) -> date | None:
    return card.due_date or card.start_date


def collect_descendants(parent_id: str, cards: list[ProjectCard]) -> list[ProjectCard]:
    descendants: list[ProjectCard] = []
    for card in cards:
        if card.parent_id != parent_id:
            continue
        descendants.append(card)
        descendants.extend(collect_descendants(card.id, cards))
    return descendants


def shifted_card_type(
    card_type: CardType,
    previous_type: CardType,
    next_type: CardType,
) -> CardType | None:
    offset = CARD_TYPE_HIERARCHY.index(next_type) - CARD_TYPE_HIERARCHY.index(
        previous_type
    )
    next_index = CARD_TYPE_HIERARCHY.index(card_type) + offset
    if next_index < 0 or next_index >= len(CARD_TYPE_HIERARCHY):
        return None
    return CARD_TYPE_HIERARCHY[next_index]


def descendant_schedule_bounds(
    card: ProjectCard,
    cards: list[ProjectCard],
) -> tuple[date | None, date | None, ProjectCard | None, ProjectCard | None]:
    dated_descendants = [
        descendant
        for descendant in collect_descendants(card.id, cards)
        if descendant.start_date or descendant.due_date
    ]
    if not dated_descendants:
        return None, None, None, None

    starts = sorted(
        [descendant for descendant in dated_descendants if card_start(descendant)],
        key=lambda descendant: (card_start(descendant), descendant.title),
    )
    ends = sorted(
        [descendant for descendant in dated_descendants if card_end(descendant)],
        key=lambda descendant: (card_end(descendant), descendant.title),
    )
    start_card = starts[0] if starts else None
    end_card = ends[-1] if ends else None
    return (
        card_start(start_card) if start_card else None,
        card_end(end_card) if end_card else None,
        start_card,
        end_card,
    )


def dependency_cards_for(
    card: ProjectCard,
    cards: list[ProjectCard],
) -> list[ProjectCard]:
    cards_by_id = {candidate.id: candidate for candidate in cards}
    return [
        cards_by_id[dependency_id]
        for dependency_id in card.dependency_ids
        if dependency_id in cards_by_id
    ]


def card_dependency_issues(
    card: ProjectCard,
    cards: list[ProjectCard],
) -> list[ProjectCardIssue]:
    issues: list[ProjectCardIssue] = []
    for dependency in dependency_cards_for(card, cards):
        if dependency.status == CardStatus.BLOCKED and card.status != CardStatus.DONE:
            issues.append(
                ProjectCardIssue(
                    card_id=card.id,
                    type="blocked_dependency",
                    dependency_id=dependency.id,
                    message=f'Depends on blocked card "{dependency.title}".',
                )
            )

        if (
            dependency.due_date
            and card.start_date
            and card.start_date < dependency.due_date
        ):
            issues.append(
                ProjectCardIssue(
                    card_id=card.id,
                    type="date_conflict",
                    dependency_id=dependency.id,
                    message=(
                        f"Starts {card.start_date.isoformat()} before dependency "
                        f'"{dependency.title}" is due {dependency.due_date.isoformat()}.'
                    ),
                )
            )
        elif (
            dependency.due_date
            and card.due_date
            and card.due_date < dependency.due_date
        ):
            issues.append(
                ProjectCardIssue(
                    card_id=card.id,
                    type="date_conflict",
                    dependency_id=dependency.id,
                    message=(
                        f"Due {card.due_date.isoformat()} before dependency "
                        f'"{dependency.title}" is due {dependency.due_date.isoformat()}.'
                    ),
                )
            )
    return issues


def card_hierarchy_date_issues(
    card: ProjectCard,
    cards: list[ProjectCard],
) -> list[ProjectCardIssue]:
    if not card.start_date and not card.due_date:
        return []

    descendant_start, descendant_end, start_card, end_card = descendant_schedule_bounds(
        card, cards
    )
    issues: list[ProjectCardIssue] = []
    if card.start_date and descendant_start and descendant_start < card.start_date:
        issues.append(
            ProjectCardIssue(
                card_id=card.id,
                type="hierarchy_date_conflict",
                boundary="start",
                dependency_id=start_card.id if start_card else None,
                message=(
                    f'"{start_card.title}" begins {descendant_start.isoformat()} '
                    f"before this card starts {card.start_date.isoformat()}."
                ),
            )
        )
    if card.due_date and descendant_end and descendant_end > card.due_date:
        issues.append(
            ProjectCardIssue(
                card_id=card.id,
                type="hierarchy_date_conflict",
                boundary="end",
                dependency_id=end_card.id if end_card else None,
                message=(
                    f'"{end_card.title}" ends {descendant_end.isoformat()} '
                    f"after this card is due {card.due_date.isoformat()}."
                ),
            )
        )
    return issues


def card_issues(card: ProjectCard, cards: list[ProjectCard]) -> list[ProjectCardIssue]:
    return [
        *card_dependency_issues(card, cards),
        *card_hierarchy_date_issues(card, cards),
    ]


def project_issues(cards: list[ProjectCard]) -> list[ProjectCardIssue]:
    return [issue for card in cards for issue in card_issues(card, cards)]
