import logging
import time
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("campusbite.http")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs method + path + status, measures response time, and tags each request with an ID."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001
            logger.exception("Unhandled error rid=%s %s %s", request_id, request.method, request.url.path)
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.2f}"
        logger.info(
            "%s %s -> %s in %.2fms rid=%s",
            request.method, request.url.path, response.status_code, elapsed_ms, request_id,
        )
        if elapsed_ms > 1000:
            logger.warning("Slow request: %s %s took %.0fms", request.method, request.url.path, elapsed_ms)
        return response
