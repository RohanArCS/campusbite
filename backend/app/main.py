import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import SessionLocal, init_db, wait_for_database
from .middleware import RequestLoggingMiddleware
from .routers import ai, auth, delivery, orders, owner, restaurants
from .services.reminders import reminder_scheduler

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("campusbite")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.jwt_secret_key.startswith("dev-only") and settings.environment != "development":
        logger.warning("JWT_SECRET_KEY is using the insecure default! Set it in your environment.")
    await asyncio.to_thread(wait_for_database)
    await asyncio.to_thread(init_db)
    if settings.seed_demo_data:
        from .seed import seed

        db = SessionLocal()
        try:
            await asyncio.to_thread(seed, db)
        finally:
            db.close()

    stop = asyncio.Event()
    task = asyncio.create_task(reminder_scheduler(stop)) if settings.enable_reminder_scheduler else None
    yield
    stop.set()
    if task:
        await task


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="CampusBite - restaurant ordering & delivery platform. "
                "Use **Authorize** with a demo account email/password to try protected endpoints.",
    lifespan=lifespan,
)

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time-Ms", "Retry-After"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
        errors.append({"field": loc, "message": err.get("msg")})
    message = "; ".join(f"{e['field']}: {e['message']}" if e["field"] else e["message"] for e in errors)
    return JSONResponse(status_code=422, content={"detail": message or "Invalid request", "errors": errors})


for r in (auth.router, restaurants.router, orders.router, owner.router, delivery.router, ai.router):
    app.include_router(r)


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "app": settings.app_name}


@app.get("/", include_in_schema=False)
def root():
    return {"message": "CampusBite API", "docs": "/docs", "health": "/api/health"}
