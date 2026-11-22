from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app_graph.database import (
    InvalidAttachment,
    RevisionConflict,
    load_attachment,
    load_workspace,
)
from app_graph.models import (
    AttachmentKey,
    MAX_REQUEST_BYTES,
    Workspace,
    WorkspaceUpdate,
)
from app_graph.services import update_workspace

router = APIRouter(prefix="/api/graphs/workspace", tags=["graph"])
no_cache = {"Cache-Control": "no-store"}


@router.get("", response_model=Workspace)
def get_workspace(response: Response) -> Workspace:
    response.headers.update(no_cache)
    return load_workspace()


@router.put("")
async def put_workspace(request: Request) -> dict[str, int]:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(413, "A graph save may be at most 24 MiB.")
        body.extend(chunk)
    try:
        update = WorkspaceUpdate.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(422, "Invalid graph workspace payload.") from error
    try:
        revision = await run_in_threadpool(update_workspace, update)
    except InvalidAttachment as error:
        raise HTTPException(422, str(error)) from error
    except RevisionConflict as error:
        raise HTTPException(409, "The graph was changed in another browser.") from error
    return {"revision": revision}


@router.get("/attachments/{key}")
def get_attachment(key: AttachmentKey) -> Response:
    data = load_attachment(key)
    if data is None:
        raise HTTPException(404, "Attachment file not found.")
    return Response(
        data,
        media_type="application/octet-stream",
        headers={
            **no_cache,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment",
        },
    )
