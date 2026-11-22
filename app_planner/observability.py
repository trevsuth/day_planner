import json
import logging
import re
import sys
from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
PROBES = {"/api/health", "/api/livez"}

logger = logging.getLogger("day_planner.http")
handler = logging.StreamHandler(sys.stdout)
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


class RequestLogMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        request_id = incoming if REQUEST_ID.fullmatch(incoming) else uuid4().hex
        start = perf_counter()
        status = None
        failure = None

        async def capture_response(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, capture_response)
        except Exception as error:
            failure = type(error).__name__
            if status is not None:
                raise
            await JSONResponse({"detail": "Internal server error."}, status_code=500)(
                scope, receive, capture_response
            )
        finally:
            if scope["path"] not in PROBES or status is None or status >= 400:
                level = (
                    logging.ERROR
                    if failure or status is None or status >= 500
                    else logging.INFO
                )
                entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(
                        timespec="milliseconds"
                    ),
                    "event": "http_request",
                    "service": "daily-planner-api",
                    "level": logging.getLevelName(level),
                    "request_id": request_id,
                    "method": scope["method"],
                    "route": getattr(scope.get("route"), "path", "unmatched"),
                    "status": status,
                    "duration_ms": round((perf_counter() - start) * 1000, 2),
                }
                if failure:
                    entry["error_type"] = failure
                logger.log(level, json.dumps(entry, separators=(",", ":")))
