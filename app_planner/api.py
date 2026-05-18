from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app_projmgmt.api import router as project_router
from app_projmgmt.database import init_db as init_project_db
from app_planner.database import init_db, load_entry, save_entry
from app_planner.models import PlannerEntry


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


def empty_entry(entry_date: date) -> PlannerEntry:
    return PlannerEntry(entry_date=entry_date)


@app.get("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def get_entry(entry_date: date) -> PlannerEntry:
    return load_entry(entry_date.isoformat()) or empty_entry(entry_date)


@app.put("/api/planner/entries/{entry_date}", response_model=PlannerEntry)
def put_entry(entry_date: date, entry: PlannerEntry) -> PlannerEntry:
    if entry.entry_date != entry_date:
        raise HTTPException(
            status_code=400,
            detail="Entry date in the URL must match the request body.",
        )

    save_entry(entry)
    return entry


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
