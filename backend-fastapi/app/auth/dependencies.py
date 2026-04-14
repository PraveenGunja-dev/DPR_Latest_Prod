# app/auth/dependencies.py
"""
FastAPI dependencies for authentication and authorization.
Replaces the Express authenticateToken middleware and role-checking middlewares.
"""

import logging
from typing import Optional


from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt, ExpiredSignatureError

from app.auth.jwt_handler import verify_access_token
from app.database import get_db

logger = logging.getLogger("adani-flow.auth")

# Bearer token scheme – also allows token in headers / query
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Extract and verify the JWT token from the request.
    Checks (in order):
      1. Authorization: Bearer <token>
      2. x-adani-token / x-p6-token header
      3. ?token= query parameter

    Returns decoded payload: { userId, email, role }
    """
    token: Optional[str] = None

    # 1. Bearer token from Authorization header
    if credentials and credentials.credentials:
        token = credentials.credentials

    # 2. Custom headers (Oracle P6 style)
    if not token:
        token = request.headers.get("x-adani-token") or request.headers.get("x-p6-token")

    # 3. Query parameter (less secure, P6-compatible)
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Access token required",
                "error": {
                    "code": "AUTH_TOKEN_MISSING",
                    "description": "Authentication token is required",
                },
            },
        )

    try:
        payload = verify_access_token(token)
        logger.debug(f"Token verified, user: {payload}")
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "message": "Token expired",
                "error": {
                    "code": "AUTH_TOKEN_EXPIRED",
                    "description": "Authentication token has expired",
                },
            },
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Invalid token",
                "error": {
                    "code": "AUTH_TOKEN_INVALID",
                    "description": "Authentication token is invalid",
                },
            },
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Authentication failed"}
        )


# ─── Role-based dependencies ─────────────────────────────────────


def require_role(*allowed_roles: str):
    """
    Factory that returns a dependency enforcing one or more allowed roles.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role("Super Admin"))])
    """

    async def _check(user: dict = Depends(get_current_user)):
        user_role = (user.get("role") or "").lower()
        allowed_roles_lower = [r.lower() for r in allowed_roles]
        
        if user_role not in allowed_roles_lower:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": f"Access denied. Required role(s): {', '.join(allowed_roles)}"
                },
            )
        return user

    return _check


# Convenience shortcuts matching the Express middleware names
require_super_admin = require_role("Super Admin")
require_pmag = require_role("PMAG")
require_site_pm = require_role("Site PM")
require_supervisor = require_role("Supervisor")
require_pmag_or_super_admin = require_role("PMAG", "Super Admin")
require_site_pm_or_super_admin = require_role("Site PM", "Super Admin")
require_pm_or_admin = require_role("Site PM", "PMAG", "Super Admin", "Supervisor")
