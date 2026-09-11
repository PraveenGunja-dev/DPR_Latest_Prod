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
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.encoders import ENCODERS_BY_TYPE
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_pool, close_pool
from app.migrations import run_migrations
from app.utils.timezone import as_ist

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

    # 0. Refuse to run a deployed environment on development secrets.
    from app.config import assert_production_ready

    assert_production_ready()

    # 1. Create DB pool
    await create_pool()
    if settings.otp_bypass_active:
        logger.warning(
            "OTP BYPASS ACTIVE until %s (inclusive): email login and password setup/change skip the "
            "OTP step. Clear OTP_BYPASS_UNTIL once SMTP is back.", settings.OTP_BYPASS_UNTIL,
        )
    elif settings.OTP_BYPASS_UNTIL and settings.otp_bypass_until_date is None:
        logger.error("OTP_BYPASS_UNTIL=%r is not a YYYY-MM-DD date - ignored, OTP stays enforced.", settings.OTP_BYPASS_UNTIL)
    logger.info("✓ Database pool created")

    # 2. Run migrations
    try:
        await run_migrations()
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")

    # 3. Background job scheduler
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from app.jobs.auto_sync import auto_sync_new_projects
    from app.jobs.auto_approval import run_auto_approval
    from app.jobs.p6_password_checker import check_p6_password_expiry

    from app.jobs.password_expiry_notifier import notify_password_expiry
    from app.jobs.session_sweeper import sweep_sessions

    scheduler = AsyncIOScheduler()
    scheduler.add_job(check_p6_password_expiry, 'cron', hour=10, minute=0)
    # Auto-sync all projects from P6 at 1 AM IST daily
    scheduler.add_job(auto_sync_new_projects, 'cron', hour=1, minute=0, id='auto_sync_1am')
    # Warn EMAIL-login users before their password expires (7/3/1 days).
    scheduler.add_job(notify_password_expiry, 'cron', hour=9, minute=0, id='password_expiry_warning')
    # Close sessions abandoned without a sign-out, so "online now" stays honest.
    scheduler.add_job(sweep_sessions, 'interval', minutes=15, id='session_idle_sweep')
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("✓ Background job scheduler started (Auto-sync 1 AM, P6 password 10 AM, expiry warnings 9 AM)")

    logger.info(f"✓ Server ready on port {settings.PORT}")
    logger.info("=" * 60)

    yield

    # SHUTDOWN
    logger.info("Shutting down...")
    
    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown()
        logger.info("✓ Scheduler shut down")
        
    await close_pool()
    logger.info("✓ Database pool closed")


# ─── FastAPI App ──────────────────────────────────────────────
# Swagger UI, ReDoc and the OpenAPI schema are served only where explicitly
# enabled. Left on, they hand an unauthenticated caller the full endpoint
# inventory, including the /api/super-admin routes.
_DOCS_ENABLED = settings.ENABLE_API_DOCS

# Timestamps leave the API labelled as IST. A naive TIMESTAMP column serialised as
# "2026-09-11T18:09:31" is read by the browser as *its* local time - right on a laptop in India,
# 5h30m out anywhere else and, worse, out of step with the TIMESTAMPTZ columns on the same page,
# which always carry an offset. The DB session runs on Asia/Kolkata (app.database), so a naive
# value is IST wall-clock and only needs the offset attached; an aware one is converted.
ENCODERS_BY_TYPE[datetime] = lambda value: as_ist(value).isoformat()

app = FastAPI(
    title=os.getenv("APP_TITLE", "Adani Flow - Digitalized DPR"),
    description=os.getenv("APP_DESCRIPTION", "Backend API for the Digitalized DPR system"),
    version="2.0.0",
    lifespan=lifespan,
    root_path=os.getenv("FASTAPI_ROOT_PATH", ""),
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

if not _DOCS_ENABLED:
    logger.info("API documentation disabled (set ENABLE_API_DOCS=true to serve /docs)")


# ─── CORS ─────────────────────────────────────────────────────
# Explicit origin list (required: a wildcard is illegal together with
# allow_credentials=True, and Starlette answers the OPTIONS preflight with
# 400 "Disallowed CORS origin" for any origin that is not listed here).
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",          # vite dev server (vite.config.ts)
    "http://127.0.0.1:8080",
    "https://digitalized-dpr.adani.com",      # production custom domain
    "https://az10lappdprp01.azurewebsites.net",  # frontend App Service
]

# Anything additional can be added through the CORS_ORIGINS app setting
# (comma separated) without a code change.
for _extra in settings.extra_cors_origins:
    if _extra not in origins:
        origins.append(_extra)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Type"],
)


# ─── Security response headers ────────────────────────────────
# The SPA and the API can be served from separate App Services, so the same
# headers are also set on the static host in frontend/public/web.config. Keep
# the two in step.
def _build_csp() -> str:
    """Content-Security-Policy for the SPA and the API responses.

    'unsafe-eval' is deliberately absent: the only eval-shaped code in the
    bundle is ECharts' pre-JSON fallback and exceljs' unused vm shim, neither
    of which executes. 'unsafe-inline' is needed for style only - the built
    index.html carries no inline script.
    """
    extra = [o.strip().rstrip("/") for o in (settings.CSP_EXTRA_ORIGINS or "").split(",") if o.strip()]
    connect = " ".join(["'self'"] + extra)
    img = " ".join(["'self'", "data:", "blob:"] + extra)
    return "; ".join([
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        f"img-src {img}",
        "font-src 'self' data:",
        f"connect-src {connect}",
        "frame-ancestors 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ])


_CSP = _build_csp()
_CSP_HEADER = (
    "Content-Security-Policy-Report-Only" if settings.CSP_REPORT_ONLY
    else "Content-Security-Policy"
)


def apply_security_headers(response):
    """Stamp the security headers onto one response.

    Shared with the 500 handler: Starlette builds an unhandled-exception
    response in ServerErrorMiddleware, which sits OUTSIDE every user
    middleware, so an error page would otherwise ship without any of these.
    """
    if not settings.SECURITY_HEADERS_ENABLED:
        return response

    if settings.CSP_ENABLED:
        response.headers[_CSP_HEADER] = _CSP
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Strict-Transport-Security"] = (
        f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains"
    )
    # Retired from every current browser, and its legacy auditor mode
    # introduced vulnerabilities of its own. 0 is the value that disables it.
    response.headers["X-XSS-Protection"] = "0"
    # Finding 4 is the proxy's own banner, which this cannot reach. Removing
    # the application's is still worth doing for a direct-to-origin request.
    # MutableHeaders has no .pop(); __delitem__ is a no-op when absent.
    for banner in ("server", "x-powered-by"):
        if banner in response.headers:
            del response.headers[banner]
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    return apply_security_headers(await call_next(request))


# ─── Path prefix stripping and Request Logging middleware ─────────────────────────
# Matches Express: remove prefix from URLs for internal routing
@app.middleware("http")
async def strip_path_prefix_and_log(request: Request, call_next):
    """Strip prefix from URL path if it exists and log the request."""
    path = request.scope["path"]
    method = request.method
    prefix = settings.FASTAPI_ROOT_PATH
    
    # Log the incoming request
    logger.info(f"--> {method} {path}")
    
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
        
    try:
        response = await call_next(request)
        logger.info(f"<-- {method} {path} [{response.status_code}]")
        return response
    except Exception as e:
        logger.error(f"<-- {method} {path} [ERROR: {str(e)}]")
        raise e


# ─── Import & Register Routers ───────────────────────────────
from app.routers import (
    auth,
    auth_email,
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
    external_api,
    drone_verification,
    custom_activities,
    config,
    solar_overrides,
    bess_expand,
)

app.include_router(auth.router)
app.include_router(auth_email.router)
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
app.include_router(external_api.router)
app.include_router(drone_verification.router)
app.include_router(custom_activities.router)
app.include_router(config.router)
app.include_router(solar_overrides.router)
app.include_router(bess_expand.router)

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


# ─── Refresh token ────────────────────────────────────────────
# The standalone POST /refresh-token that used to live here (a leftover from
# the Express port) verified only the signature: no refresh_tokens lookup, no
# rotation, no account-status re-check and no session id on the minted token.
# It let anyone holding a refresh token keep issuing themselves access for the
# full 7 days after a sign-out, password reset or account lock, and the tokens
# it produced carried no `sid`, so they also escaped the session check in
# get_current_user. Removed: POST /api/auth/refresh-token in routers/auth.py
# is the real implementation and the only one the frontend calls.


# ─── Global error handler ────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log the detail, return a correlation id.

    The exception text carries constraint names, column types and SQL hints.
    The reference is what lets support find this exact stack trace in the logs
    from what the user reports.
    """
    ref = uuid.uuid4().hex[:12]
    logger.error(
        f"[{ref}] Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    return apply_security_headers(JSONResponse(
        status_code=500,
        content={"message": "Internal server error", "reference": ref},
    ))


# ─── Static file serving for frontend SPA ────────────────────
from fastapi.responses import FileResponse

frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")

_DIST_ROOT = Path(frontend_dist).resolve()


def _file_inside_dist(rest_of_path: str):
    """Resolve a request path within dist, or None if it escapes.

    os.path.join cannot be trusted here. On Windows a drive-qualified component
    replaces the base outright - os.path.join(dist, "c:/windows/win.ini") returns
    "c:/windows/win.ini" - and ".." segments walk out of the directory on every
    platform. FastAPI URL-decodes the path parameter before this sees it, so
    "/c%3a/windows/win.ini" arrives already in that form. Resolving first and
    then requiring containment is what closes both.
    """
    try:
        candidate = (_DIST_ROOT / rest_of_path.lstrip("/\\")).resolve()
    except (OSError, ValueError):
        # Malformed paths (null bytes, over-long names) resolve to nothing.
        return None
    if not candidate.is_relative_to(_DIST_ROOT):
        return None
    return candidate if candidate.is_file() else None


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
        
        # An unmatched /api path is a missing route, not a page to render.
        if rest_of_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"message": "Not found"})

        # Real files in the root of dist (logo.png, favicon, manifest, ...).
        hit = _file_inside_dist(rest_of_path)
        if hit:
            return FileResponse(hit)

        # Otherwise return index.html. It must never be cached: the hashed asset
        # filenames it points at change on every build, so a cached shell keeps
        # loading the previous bundle.
        return FileResponse(
            os.path.join(frontend_dist, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    logger.info(f"✓ Serving frontend from: {frontend_dist}")
else:
    logger.warning(f"⚠ Frontend dist not found at: {frontend_dist}")
