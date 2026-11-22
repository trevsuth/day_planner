from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app_graph.api import router as graph_router
from app_planner.migrate import check_schema
from app_planner.observability import RequestLogMiddleware
from app_planner.routes import router as planner_router
from app_projmgmt.api import router as project_router
from app_viewer.api import router as viewer_router


BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIST_DIR = BASE_DIR / "web" / "dist"
GRAPH_DIST_DIR = BASE_DIR / "obsidian-arrow" / "dist-hosted"
VIEWER_DIST_DIR = BASE_DIR / "viewer" / "dist"


app = FastAPI(title="Daily Planner API")

app.add_middleware(RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.include_router(planner_router)
app.include_router(project_router)
app.include_router(graph_router)
app.include_router(viewer_router)


@app.get("/api/livez")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health")
def health() -> dict[str, str]:
    try:
        check_schema()
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed.",
        ) from error
    return {"status": "ok", "database": "ok"}


if WEB_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST_DIR / "assets"), name="assets")

if GRAPH_DIST_DIR.exists():
    app.mount("/graph", StaticFiles(directory=GRAPH_DIST_DIR, html=True), name="graph")

if VIEWER_DIST_DIR.exists():
    app.mount("/viewer", StaticFiles(directory=VIEWER_DIST_DIR, html=True), name="viewer")


@app.get("/")
def serve_index() -> FileResponse:
    index_path = WEB_DIST_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="React frontend has not been built. Run `npm run build` in web/.",
        )
    return FileResponse(index_path)
