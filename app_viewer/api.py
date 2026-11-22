from fastapi import APIRouter

from app_viewer.preview import Preview, PreviewRequest, preview_document


router = APIRouter(prefix="/api/viewer", tags=["viewer"])


@router.post("/preview")
def preview(request: PreviewRequest) -> Preview:
    """Prepare Markdown HTML and extract Mermaid blocks for client-side rendering."""
    return preview_document(request)
