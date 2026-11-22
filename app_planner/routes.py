from datetime import date

from fastapi import APIRouter, HTTPException

from app_planner.models import PlannerCardAssignment, PlannerEntry
from app_planner.services import (
    PlannerNotFoundError,
    PlannerServiceError,
    assign_project_card_to_priority,
    get_planner_entry,
    remove_project_card_priority,
    save_planner_entry,
)


router = APIRouter(tags=["planner"])


@router.get("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def get_entry(entry_date: date) -> PlannerEntry:
    return get_planner_entry(entry_date)


@router.put("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def put_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    try:
        return save_planner_entry(entry_date, entry)
    except PlannerServiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/planner/card-assignments/{card_id}", response_model=PlannerEntry)
def put_card_assignment(
    card_id: str, assignment: PlannerCardAssignment
) -> PlannerEntry:
    try:
        return assign_project_card_to_priority(
            card_id,
            assignment.entry_date,
            assignment.priority_text,
        )
    except PlannerNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PlannerServiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/planner/card-assignments/{card_id}", status_code=204)
def delete_card_assignment(card_id: str) -> None:
    remove_project_card_priority(card_id)


@router.get("/api/entries/{entry_date}", response_model=PlannerEntry)
def get_legacy_entry(entry_date: date) -> PlannerEntry:
    return get_entry(entry_date)


@router.put("/api/entries/{entry_date}", response_model=PlannerEntry)
def put_legacy_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    return put_entry(entry_date, entry)
