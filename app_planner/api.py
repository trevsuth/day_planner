from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app_projmgmt.api import router as project_router
from app_projmgmt.database import init_db as init_project_db
from app_planner.database import init_db
from app_planner.models import PlannerCardAssignment, PlannerEntry
from app_planner.services import (
    PlannerNotFoundError,
    PlannerServiceError,
    assign_project_card_to_priority,
    get_planner_entry,
    remove_project_card_priority,
    save_planner_entry,
)


BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIST_DIR = BASE_DIR / "web" / "dist"

app = FastAPI(title="Daily Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(project_router)


@app.on_event("startup")
def startup() -> None:
    init_db()
    init_project_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def get_entry(entry_date: date) -> PlannerEntry:
    return get_planner_entry(entry_date)


@app.put("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def put_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    try:
        return save_planner_entry(entry_date, entry)
    except PlannerServiceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/api/planner/card-assignments/{card_id}", response_model=PlannerEntry)
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


@app.delete("/api/planner/card-assignments/{card_id}", status_code=204)
def delete_card_assignment(card_id: str) -> None:
    remove_project_card_priority(card_id)


@app.get("/api/entries/{entry_date}", response_model=PlannerEntry)
def get_legacy_entry(entry_date: date) -> PlannerEntry:
    return get_entry(entry_date)


@app.put("/api/entries/{entry_date}", response_model=PlannerEntry)
def put_legacy_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    return put_entry(entry_date, entry)


if WEB_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST_DIR / "assets"), name="assets")


@app.get("/")
def serve_index() -> FileResponse:
    index_path = WEB_DIST_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="React frontend has not been built. Run `npm run build` in web/.",
        )
    return FileResponse(index_path)
