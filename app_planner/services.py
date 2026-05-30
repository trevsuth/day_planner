from datetime import date

from app_planner.database import (
    assign_card_priority,
    load_entry,
    save_entry,
    unlink_card_priority,
)
from app_planner.models import PlannerEntry
from app_projmgmt.database import get_card


class PlannerServiceError(ValueError):
    pass


class PlannerNotFoundError(PlannerServiceError):
    pass


def get_planner_entry(entry_date: date) -> PlannerEntry:
    return load_entry(entry_date.isoformat()) or PlannerEntry(entry_date=entry_date)


def save_planner_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    if entry.entry_date != entry_date:
        raise PlannerServiceError("Entry date in the URL must match the request body.")
    save_entry(entry)
    return entry


def assign_project_card_to_priority(
    card_id: str,
    entry_date: date,
    priority_text: str,
) -> PlannerEntry:
    if not get_card(card_id):
        raise PlannerNotFoundError("Card not found.")
    try:
        return assign_card_priority(entry_date.isoformat(), card_id, priority_text)
    except ValueError as error:
        raise PlannerServiceError(str(error)) from error


def remove_project_card_priority(card_id: str) -> None:
    unlink_card_priority(card_id)
