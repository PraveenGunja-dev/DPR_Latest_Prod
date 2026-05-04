# app/routers/external_api.py
"""
External API Router – Token-based access for third-party applications.

Flow:
  1. External app calls POST /api/external/token with email + password
     → receives a long-lived Bearer token (valid 365 days).
  2. External app uses the Bearer token in Authorization header
     to access GET /api/external/projects.

Access is restricted:
  - Only the /projects endpoint is available.
  - Only project Name and PercentComplete fields are returned.
"""

import logging
from datetime import timedelta
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from jose import JWTError, ExpiredSignatureError

from app.auth.jwt_handler import create_access_token, verify_access_token
from app.auth.password import verify_password
from app.database import get_db, PoolWrapper

logger = logging.getLogger("adani-flow.external_api")

router = APIRouter(prefix="/api/external", tags=["External API"])

# Dedicated Bearer scheme for external API
_ext_security = HTTPBearer(auto_error=False)


# ── External-only auth dependency ─────────────────────────────
async def get_external_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_ext_security),
) -> dict:
    """
    Verify the Bearer token and ensure the user has the 'External' role.
    Rejects all other roles – this prevents internal tokens from being
    used on the external API and vice-versa.
    """
    token: Optional[str] = None

    if credentials and credentials.credentials:
        token = credentials.credentials

    if not token:
        token = request.headers.get("x-api-token")

    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "API token required. Call POST /api/external/token first."},
        )

    try:
        payload = verify_access_token(token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Token expired. Generate a new one via POST /api/external/token."},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Invalid token."},
        )

    # Enforce External role only
    if payload.get("role") != "External":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"message": "Access denied. This API is for external applications only."},
        )

    return payload


# ── Models ────────────────────────────────────────────────────────

class ExternalTokenRequest(BaseModel):
    email: str
    password: str


class ExternalTokenResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_in_days: int = 365
    message: str = "Use this token in the Authorization header as: Bearer <token>"


class ProjectInfo(BaseModel):
    project_id: str
    name: str
    project_type: Optional[str] = None
    percent_complete: float
    data_date: Optional[str] = None
    finish_date: Optional[str] = None
    summary_planned_labor_units: Optional[float] = None
    summary_actual_labor_units: Optional[float] = None


# ── Token Generation (Public – no auth required) ─────────────────

@router.post("/token", response_model=ExternalTokenResponse)
async def generate_external_token(
    body: ExternalTokenRequest,
    pool: PoolWrapper = Depends(get_db),
):
    """
    Generate a long-lived API token for external applications.

    **Request Body:**
    - `email`: Registered external email (e.g. dpr.external@adani.com)
    - `password`: Account password

    **Response:**
    - `token`: A JWT Bearer token valid for 365 days.

    **Usage:**
    ```
    GET /api/external/projects
    Authorization: Bearer <token>
    ```
    """
    if not body.email or not body.password:
        raise HTTPException(400, detail={"message": "Email and password are required"})

    row = await pool.fetchrow(
        "SELECT user_id, name, email, password, role, is_active FROM users WHERE LOWER(email) = LOWER($1)",
        body.email.strip(),
    )

    if not row or not row["is_active"]:
        raise HTTPException(401, detail={"message": "Invalid credentials or account inactive"})

    if not verify_password(body.password, row["password"]):
        raise HTTPException(401, detail={"message": "Invalid credentials"})

    # Only allow users with "External" role to generate tokens here
    if row["role"] != "External":
        raise HTTPException(403, detail={"message": "This account is not authorized for external API access."})

    # Generate a long-lived token (365 days)
    token = create_access_token(
        user_id=row["user_id"],
        email=row["email"],
        role=row["role"],
        expires_delta=timedelta(days=365),
    )

    logger.info(f"External API token generated for {body.email}")

    return ExternalTokenResponse(
        token=token,
        token_type="Bearer",
        expires_in_days=365,
        message="Use this token in the Authorization header as: Bearer <token>",
    )


# ── Protected Endpoint (External token required) ─────────────────

@router.get("/projects", response_model=list[ProjectInfo])
async def get_projects(
    project_type: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_external_user),
):
    """
    Get all projects with Name and PercentComplete from P6.

    **Authorization:** Bearer token from `/api/external/token`

    **Query Parameters:**
    - `project_type` (optional): Filter by project type (Solar, Wind, PSS)

    **Response:** Array of `{ project_id, name, project_type, percent_complete, data_date }`

    The `percent_complete` is computed as the average of all activity-level
    PercentComplete values synced from Oracle P6 (excluding milestones and LOE).
    """
    if project_type:
        rows = await pool.fetch("""
            SELECT 
                p.id AS p6_id,
                p.name,
                p.project_type,
                p.data_date,
                p.finish_date,
                p.summary_planned_labor_units,
                p.summary_actual_labor_units,
                COALESCE(
                    (SELECT ROUND(AVG(sa.percent_complete)::numeric, 2)
                     FROM solar_activities sa
                     WHERE sa.project_object_id = p.object_id
                       AND sa.activity_type NOT IN ('Start Milestone', 'Finish Milestone', 'Level of Effort')
                    ), 0
                ) AS percent_complete
            FROM projects p
            WHERE p.app_status = 'live'
              AND LOWER(p.project_type) = LOWER($1)
            ORDER BY p.name
        """, project_type.strip())
    else:
        rows = await pool.fetch("""
            SELECT 
                p.id AS p6_id,
                p.name,
                p.project_type,
                p.data_date,
                p.finish_date,
                p.summary_planned_labor_units,
                p.summary_actual_labor_units,
                COALESCE(
                    (SELECT ROUND(AVG(sa.percent_complete)::numeric, 2)
                     FROM solar_activities sa
                     WHERE sa.project_object_id = p.object_id
                       AND sa.activity_type NOT IN ('Start Milestone', 'Finish Milestone', 'Level of Effort')
                    ), 0
                ) AS percent_complete
            FROM projects p
            WHERE p.app_status = 'live'
            ORDER BY p.name
        """)

    return [
        {
            "project_id": r["p6_id"] or str(r["name"]),
            "name": r["name"],
            "project_type": r["project_type"],
            "percent_complete": float(r["percent_complete"]),
            "data_date": r["data_date"].isoformat() if r["data_date"] else None,
            "finish_date": r["finish_date"].isoformat() if r["finish_date"] else None,
            "summary_planned_labor_units": float(r["summary_planned_labor_units"]) if r["summary_planned_labor_units"] is not None else None,
            "summary_actual_labor_units": float(r["summary_actual_labor_units"]) if r["summary_actual_labor_units"] is not None else None,
        }
        for r in rows
    ]
