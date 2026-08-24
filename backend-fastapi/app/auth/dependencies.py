# app/auth/dependencies.py
"""
FastAPI dependencies for authentication and authorization.
Replaces the Express authenticateToken middleware and role-checking middlewares.
"""

import logging
from typing import Optional


from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt, ExpiredSignatureError

from app.auth.jwt_handler import SCOPE_ACCESS, verify_access_token
from app.database import get_db

logger = logging.getLogger("adani-flow.auth")

# Swagger OAuth2 Scheme
security = OAuth2PasswordBearer(tokenUrl="/api/auth/swagger-login", auto_error=False)

# Routes an EMAIL user must still reach while their password is blocked -
# otherwise the forced-change flow could never complete. Everything else in
# the application is gated. Matched as prefixes against the rewritten path.
_LIFECYCLE_EXEMPT_PATHS = (
    "/api/auth/email/password",
    "/api/auth/email/otp",
    "/api/auth/email/password-status",
    "/api/auth/email/recovery-email",
    "/api/auth/profile",
    "/api/auth/logout",
)


def _is_lifecycle_exempt_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _LIFECYCLE_EXEMPT_PATHS)


async def get_current_user(
    request: Request,
    token_str: Optional[str] = Depends(security),
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

    # 1. Bearer token from Authorization header (Swagger OAuth2)
    if token_str:
        token = token_str

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

        # ── Scope check ────────────────────────────────────────────
        # Password-flow tokens are signed with the same key but carry a
        # different scope. Refusing them here is what stops a challenge token
        # from being replayed against application routes. Tokens minted before
        # scopes existed have no claim and remain valid access tokens.
        scope = payload.get("scope")
        if scope is not None and scope != SCOPE_ACCESS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "This token cannot be used to access the application",
                    "error": {
                        "code": "AUTH_TOKEN_SCOPE_INVALID",
                        "description": "Token was issued for a password operation only",
                    },
                },
            )

        # ── Password lifecycle enforcement (EMAIL users only) ──────
        # The backend, not the frontend, decides whether a user with a pending
        # password setup or an expired password may proceed. This runs for
        # every protected route in the application, so a direct API call or a
        # hand-edited URL is blocked exactly like the UI is.
        await _enforce_password_lifecycle(request, payload)

        # ── Presence ───────────────────────────────────────────────
        # Keeps the "who is online" view current. The database write is
        # throttled inside touch_session, so this costs nothing on most
        # requests, and a failure here never affects the response.
        await _touch_presence(payload)

        logger.debug(f"Token verified, user: {payload.get('userId')}")
        return payload
    except HTTPException:
        raise
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


async def _touch_presence(payload: dict) -> None:
    """
    Record that this session is still active.

    Sessions minted before this feature existed carry no `sid`, so they are
    simply skipped rather than guessed at - they close naturally when the user
    signs out or the token expires.
    """
    session_id = payload.get("sid")
    if not session_id:
        return
    try:
        from app.database import get_pool
        from app.services.session_service import touch_session

        pool = await get_pool()
        await touch_session(pool, session_id, payload.get("userId"))
    except Exception as e:
        logger.debug(f"Presence touch skipped: {e}")


async def _enforce_password_lifecycle(request: Request, payload: dict) -> None:
    """
    Block application access for EMAIL users whose password needs attention.

    Cost control: SSO tokens carry authType='SSO' and return immediately, so
    the 67 SSO users pay nothing. EMAIL users hit a status lookup cached for
    AUTH_STATUS_CACHE_SECONDS, and the cache is invalidated the moment a
    password or account state changes.
    """
    if payload.get("authType") == "SSO":
        return

    path = request.scope.get("path", "")
    if _is_lifecycle_exempt_path(path):
        return

    user_id = payload.get("userId")
    if not user_id:
        return

    try:
        from app.database import get_pool
        from app.services.account_service import get_cached_access_state

        pool = await get_pool()
        state = await get_cached_access_state(pool, user_id)
    except Exception as e:
        # A lookup failure must not lock everyone out of a working system.
        logger.error(f"Password lifecycle check failed for user {user_id}: {e}")
        return

    if state.get("authType") == "SSO" or not state.get("blocked"):
        return

    code = state.get("code")
    http_status = (
        status.HTTP_423_LOCKED if code == "ACCOUNT_LOCKED"
        else status.HTTP_401_UNAUTHORIZED if code == "ACCOUNT_INACTIVE"
        else status.HTTP_403_FORBIDDEN
    )
    raise HTTPException(
        status_code=http_status,
        detail={
            "message": state.get("message") or "Access denied",
            "error": {"code": code, "description": state.get("message")},
            "code": code,
        },
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
