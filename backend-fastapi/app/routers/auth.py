# app/routers/auth.py
"""
Auth router – login, register, refresh, logout, profile, supervisors, sitepms.
Updated to store refresh tokens in DB for multi-worker compatibility.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import generate_tokens, verify_refresh_token
from app.auth.password import hash_password_async, verify_password_async
from app.database import get_db, PoolWrapper
from app.models.auth import (
    LoginRequest,
    RegisterRequest,
    RefreshTokenRequest,
    LogoutRequest,
)
from app.config import settings

logger = logging.getLogger("adani-flow.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ──────────────────────────────────────────────────────────────
# POST /api/auth/register
# ──────────────────────────────────────────────────────────────
@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Register a new user. Requires authentication and role-hierarchy check."""
    requester_role = current_user["role"]
    target_role = body.role

    # Role hierarchy enforcement
    role_map = {r.lower(): r for r in ["Supervisor", "Site PM", "PMAG", "Super Admin", "admin"]}
    target_role_lower = target_role.lower()
    
    if target_role_lower not in role_map:
        raise HTTPException(400, detail={"message": f"Invalid role. Must be one of: {', '.join(role_map.values())}"})
    
    target_role = role_map[target_role_lower]

    if requester_role in ("Super Admin", "admin"):
        pass
    elif requester_role == "PMAG":
        if target_role not in ("Site PM", "Supervisor"):
            raise HTTPException(403, detail={"message": "PMAG users can only create Site PM and Supervisor users."})
    elif requester_role == "Site PM":
        if target_role != "Supervisor":
            raise HTTPException(403, detail={"message": "Site PM users can only create Supervisor users."})
    else:
        raise HTTPException(403, detail={"message": "Access denied."})

    import re
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", body.email):
        raise HTTPException(400, detail={"message": "Invalid email format"})

    # The initial password is temporary: the new user is forced to replace it
    # on first login, so it only has to be usable once. It is still validated
    # against the full policy so an administrator cannot seed a weak account.
    from app.auth.password_policy import PasswordPolicyError, assert_password_allowed

    try:
        assert_password_allowed(body.password, email=body.email, name=body.name)
    except PasswordPolicyError as e:
        raise HTTPException(400, detail={"message": e.errors[0], "errors": e.errors})

    hashed = await hash_password_async(body.password)

    try:
        row = await pool.fetchrow(
            """INSERT INTO users (name, email, password, role, authentication_type,
                                  is_first_login, must_change_password, account_status)
               VALUES ($1, $2, $3, $4, 'EMAIL', TRUE, TRUE, 'PENDING_SETUP')
               RETURNING user_id, name, email, role""",
            body.name, body.email, hashed, target_role,
        )
    except Exception:
        raise HTTPException(400, detail={"message": "Email already exists"})

    await create_system_log(
        "USER_CREATED", current_user.get("userId"),
        f"User: {body.name} ({body.email})",
        f"Created email-login user with role {target_role}",
    )

    # No credentials in the email. The administrator passes the temporary
    # password on out of band; the user replaces it at first login.
    try:
        from app.services.email_service import send_account_setup_email
        await send_account_setup_email(body.email, body.name, target_role)
    except Exception as e:
        logger.error(f"Failed to send account setup email: {e}")

    # No session is issued: the account must complete first-login setup before
    # it can reach anything in the application.
    return {
        "message": "User registered successfully. They must set their own password at first login.",
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
            "AuthenticationType": "EMAIL",
        },
        "requiresFirstLoginSetup": True,
        "loginStatus": "PENDING_SETUP",
    }


from app.utils.system_logger import create_system_log

# ──────────────────────────────────────────────────────────────
# POST /api/auth/login
# ──────────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginRequest, request: Request, pool: PoolWrapper = Depends(get_db)):
    """
    Authenticate an email user and return tokens.

    Kept at its original path for backward compatibility, but it now delegates
    to the email-login implementation so that OTP, first-login setup, expiry,
    history and lockout are enforced identically whether a client calls this
    endpoint or /api/auth/email/login. There is no weaker way in.
    """
    from app.models.auth import EmailLoginRequest
    from app.routers.auth_email import email_login

    return await email_login(
        EmailLoginRequest(email=body.email, password=body.password), request, pool
    )


# ──────────────────────────────────────────────────────────────
# POST /api/auth/swagger-login
# ──────────────────────────────────────────────────────────────
@router.post("/swagger-login")
async def swagger_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    pool: PoolWrapper = Depends(get_db)
):
    """
    Authenticate user and return standard OAuth2 token for Swagger UI.

    Swagger's password grant has nowhere to prompt for an OTP, so an email
    account with a pending setup, an expired password or a lock is refused
    here rather than being handed a token that skips those checks. Complete
    the flow in the UI and paste the resulting token into Swagger instead.
    """
    from app.services import account_service as accounts

    row = await accounts.get_user_by_email(pool, form_data.username)

    if not row or not row.get("password") or not await verify_password_async(form_data.password, row["password"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    block = accounts.access_block_reason(row)
    if block:
        raise HTTPException(status_code=403, detail=block[1])

    tokens = generate_tokens(
        row["user_id"], row["email"], row["role"], auth_type=accounts.auth_type_of(row)
    )

    # Store refresh token in DB
    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        "INSERT INTO refresh_tokens (token, user_id, email, role, expires_at) VALUES ($1, $2, $3, $4, $5)",
        tokens["refreshToken"], row["user_id"], row["email"], row["role"], expires_at
    )

    return {
        "access_token": tokens["accessToken"],
        "token_type": "bearer"
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/refresh-token
# ──────────────────────────────────────────────────────────────
@router.post("/refresh-token")
async def refresh_token(body: RefreshTokenRequest, pool: PoolWrapper = Depends(get_db)):
    """Refresh access token using a valid refresh token from DB."""
    if not body.refreshToken:
        raise HTTPException(401, detail={"message": "Refresh token required"})

    # 1. Check if token exists in DB
    stored = await pool.fetchrow(
        "SELECT * FROM refresh_tokens WHERE token = $1", body.refreshToken
    )
    if not stored:
        raise HTTPException(403, detail={"message": "Invalid refresh token (not found in DB)"})

    # 2. Check DB expiration
    if stored["expires_at"] and stored["expires_at"].replace(tzinfo=None) < datetime.now():
        await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
        raise HTTPException(401, detail={"message": "Refresh token expired"})

    # 3. Verify JWT signature
    try:
        decoded = verify_refresh_token(body.refreshToken)
    except Exception:
        await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
        raise HTTPException(403, detail={"message": "Invalid refresh token signature"})

    # 4. Re-check the account before extending the session. Without this an
    #    access token could be refreshed indefinitely past a password expiry
    #    or an account lock. Uncached on purpose - refreshes are infrequent.
    from app.services import account_service as accounts

    user_row = await accounts.get_user_by_id(pool, stored["user_id"])
    block = accounts.access_block_reason(user_row)
    if block:
        await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
        raise HTTPException(
            423 if block[0] == "ACCOUNT_LOCKED" else 403,
            detail={"message": block[1], "code": block[0]},
        )

    # 5. Generate new tokens and rotate in DB. The session id is carried over
    #    so a refresh continues the same session rather than appearing as a
    #    fresh login in the access history.
    session_id = stored.get("session_id")
    tokens = generate_tokens(
        stored["user_id"], stored["email"], stored["role"],
        auth_type=accounts.auth_type_of(user_row),
        session_id=session_id,
    )

    # Rotate token: delete old, insert new
    await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        """INSERT INTO refresh_tokens (token, user_id, email, role, expires_at, session_id)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        tokens["refreshToken"], stored["user_id"], stored["email"], stored["role"],
        expires_at, session_id
    )

    return {
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/logout
# ──────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(
    body: LogoutRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """
    Logout - invalidate the refresh token and close the tracked session.

    Closing the session is what lets User Management report when someone
    signed out, rather than leaving them shown as online indefinitely.
    """
    from app.services import audit_service, session_service

    if body.refreshToken:
        user_id = await session_service.end_session(
            pool, reason=session_service.REASON_LOGOUT, refresh_token=body.refreshToken
        )
        await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)

        if user_id:
            row = await pool.fetchrow(
                "SELECT name, email FROM users WHERE user_id = $1", user_id)
            await audit_service.record_audit(
                audit_service.LOGOUT,
                actor_id=user_id, target_user_id=user_id,
                target_entity=audit_service.describe_user(dict(row) if row else None),
                request=request,
                remarks="User signed out",
            )
    return {"message": "Logout successful"}


# ──────────────────────────────────────────────────────────────
# GET /api/auth/profile
# ──────────────────────────────────────────────────────────────
@router.get("/profile")
async def get_profile(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.services import account_service as accounts

    row = await accounts.get_user_by_id(pool, current_user["userId"])
    if not row or not row["is_active"]:
        raise HTTPException(401, detail={"message": "User inactive or not found"})

    status_info = accounts.get_password_status(row)
    return {
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
            # Lets the UI show password/security controls to email users only.
            "AuthenticationType": accounts.auth_type_of(row),
            "RecoveryEmail": row.get("recovery_email"),
            "RecoveryEmailVerified": bool(row.get("recovery_email_verified")),
            "PasswordState": status_info["state"],
            "PasswordDaysRemaining": status_info["daysRemaining"],
            "PasswordWarn": status_info["warn"],
        }
    }


# ──────────────────────────────────────────────────────────────
# GET /api/auth/supervisors & sitepms
# ──────────────────────────────────────────────────────────────
@router.get("/supervisors")
async def get_supervisors(pool: PoolWrapper = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("PMAG", "Site PM"):
        raise HTTPException(403, detail={"message": "Access denied"})
    rows = await pool.fetch('SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role" FROM users WHERE role = $1 ORDER BY name', "Supervisor")
    return [dict(r) for r in rows]

@router.get("/sitepms")
async def get_sitepms(pool: PoolWrapper = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied"})
    rows = await pool.fetch('SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role" FROM users WHERE role = $1 ORDER BY name', "Site PM")
    return [dict(r) for r in rows]
