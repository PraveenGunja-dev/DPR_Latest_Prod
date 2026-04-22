import sys
import asyncio

# ─── Windows Loop Policy ──────────────────────────────────────
# psycop3's async mode requires SelectorEventLoop on Windows.
# This MUST happen before any other imports that might start a loop.
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_pool, close_pool
from app.migrations import run_migrations

# ─── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("adani-flow")


# ─── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # STARTUP
    logger.info("=" * 60)
    logger.info("  Adani Flow - FastAPI Backend Starting")
    logger.info("=" * 60)

    # 1. Create DB pool
    await create_pool()
    logger.info("✓ Database pool created")

    # 2. Run migrations
    try:
        await run_migrations()
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")

    # 3. Background job scheduler has been disabled as per request

    logger.info(f"✓ Server ready on port {settings.PORT}")
    logger.info("=" * 60)

    yield

    # SHUTDOWN
    logger.info("Shutting down...")
    await close_pool()
    logger.info("✓ Database pool closed")


# ─── FastAPI App ──────────────────────────────────────────────
app = FastAPI(
    title=os.getenv("APP_TITLE", "Adani Flow - Execution Tracker"),
    description=os.getenv("APP_DESCRIPTION", "Backend API for the Execution Tracker system"),
    version="2.0.0",
    lifespan=lifespan,
    root_path=os.getenv("FASTAPI_ROOT_PATH", ""),
)


# ─── CORS ─────────────────────────────────────────────────────
# For production, we specify the allowed origins to enable allow_credentials=True
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://digitalized-dpr.adani.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if os.getenv("NODE_ENV") != "development" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Type"],
)


# ─── Path prefix stripping middleware ─────────────────────────
# Matches Express: remove prefix from URLs for internal routing
@app.middleware("http")
async def strip_path_prefix(request: Request, call_next):
    """Strip prefix from URL path if it exists."""
    path = request.scope["path"]
    prefix = settings.FASTAPI_ROOT_PATH
    
    # 1. Clean up old prefixes or specific project prefixes
    if prefix and path.startswith(prefix + "/api"):
        request.scope["path"] = path.replace(prefix + "/api", "/api", 1)
    elif prefix and path.startswith(prefix):
        request.scope["path"] = path.replace(prefix, "", 1)
    # Maintain backward compatibility or handle alternate common prefixes
    elif path.startswith("/dpr-project/api"):
        request.scope["path"] = path.replace("/dpr-project/api", "/api", 1)
    elif path.startswith("/dpr-project"):
        request.scope["path"] = path.replace("/dpr-project", "", 1)
        
    response = await call_next(request)
    return response


# ─── Import & Register Routers ───────────────────────────────
from app.routers import (
    auth,
    projects,
    activities,
    dpr_supervisor,
    project_assignment,
    sso,
    oracle_p6,
    super_admin,
    charts,
    cell_comments,
    p6_token,
    issues,
    notifications,
    column_preferences,
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(activities.router)
app.include_router(dpr_supervisor.router)
app.include_router(project_assignment.router)
app.include_router(sso.router)
app.include_router(oracle_p6.router)
app.include_router(super_admin.router)
app.include_router(charts.router)
app.include_router(cell_comments.router)
app.include_router(p6_token.router)
app.include_router(issues.router)
app.include_router(notifications.router)
app.include_router(column_preferences.router)


# ─── Health Check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "backend": "fastapi", "version": "2.0.0"}


# Root route removed to allow fallback to SPA (index.html)


@app.get("/api/health")
async def api_health():
    """API health check (matches Express /api/health)."""
    return {"status": "ok", "backend": "fastapi", "version": "2.0.0"} 


# ─── Refresh token (standalone endpoint matching Express) ─────
from app.auth.jwt_handler import verify_refresh_token, generate_tokens


@app.post("/refresh-token")
async def standalone_refresh_token(request: Request):
    """Standalone refresh token endpoint (matches Express /refresh-token)."""
    body = await request.json()
    refresh_token = body.get("refreshToken")
    if not refresh_token:
        return JSONResponse(status_code=401, content={"message": "Refresh token required"})

    try:
        decoded = verify_refresh_token(refresh_token)
    except Exception:
        return JSONResponse(status_code=403, content={"message": "Invalid refresh token"})

    tokens = generate_tokens(decoded["userId"], decoded["email"], decoded["role"])
    return {"accessToken": tokens["accessToken"], "refreshToken": tokens["refreshToken"]}


# ─── Global error handler ────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error", "error": str(exc)},
    )


# ─── Static file serving for frontend SPA ────────────────────
from fastapi.responses import FileResponse

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")

if os.path.exists(frontend_dist):
    # 1. Mount the assets directory specifically
    assets_path = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # 2. Catch-all route for SPA
    @app.get("/{rest_of_path:path}")
    async def serve_spa(rest_of_path: str):
        # If it's an API call or something that shouldn't be handled by the SPA, let it 404 or be handled elsewhere
        # But since this is the LAST route, it's safe to assume it's for the SPA
        
        # Check if the file exists in the root of dist (like logo.png, etc.)
        file_path = os.path.join(frontend_dist, rest_of_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Otherwise return index.html
        return FileResponse(os.path.join(frontend_dist, "index.html"))

    logger.info(f"✓ Serving frontend from: {frontend_dist}")
else:
    logger.warning(f"⚠ Frontend dist not found at: {frontend_dist}")
