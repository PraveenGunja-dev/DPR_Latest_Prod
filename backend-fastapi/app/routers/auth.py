# app/routers/auth.py
"""
Auth router – login, register, refresh, logout, profile, supervisors, sitepms.
Direct port of Express routes/auth.js
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import generate_tokens, verify_refresh_token
from app.auth.password import hash_password, verify_password
from app.database import get_db
from app.models.auth import (
    LoginRequest,
    RegisterRequest,
    RefreshTokenRequest,
    LogoutRequest,
)

logger = logging.getLogger("adani-flow.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory refresh token store (matches Express behaviour)
_refresh_tokens: dict[str, dict] = {}


# ──────────────────────────────────────────────────────────────
# POST /api/auth/register
# ──────────────────────────────────────────────────────────────
@router.post("/register", status_code=201)
async def register(
    body: RegisterRequest,
    pool: object = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Register a new user. Requires authentication and role-hierarchy check."""

    # Role hierarchy enforcement (matches Express logic)
    # Normalize and validate role
    role_map = {r.lower(): r for r in ["Supervisor", "Site PM", "PMAG", "Super Admin", "admin"]}
    target_role_lower = target_role.lower()
    
    if target_role_lower not in role_map:
        raise HTTPException(400, detail={"message": f"Invalid role. Must be one of: {', '.join(role_map.values())}"})
    
    target_role = role_map[target_role_lower]

    if requester_role in ("Super Admin", "admin"):
        pass  # can create any
    elif requester_role == "PMAG":
        if target_role not in ("Site PM", "Supervisor"):
            raise HTTPException(
                403, detail={"message": "PMAG users can only create Site PM and Supervisor users."}
            )
    elif requester_role == "Site PM":
        if target_role != "Supervisor":
            raise HTTPException(
                403, detail={"message": "Site PM users can only create Supervisor users."}
            )
    else:
        raise HTTPException(
            403, detail={"message": "Access denied. Only Super Admin, admin, PMAG, and Site PM users can create new users."}
        )

    # (Already validated and normalized above)

    # Validate email
    import re
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", body.email):
        raise HTTPException(400, detail={"message": "Invalid email format"})

    # Validate password
    if len(body.password) < 8:
        raise HTTPException(400, detail={"message": "Password must be at least 8 characters long"})

    hashed = hash_password(body.password)

    try:
        row = await pool.fetchrow(
            "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role",
            body.name, body.email, hashed, target_role,
        )
    except Exception:
        raise HTTPException(400, detail={"message": "Email already exists"})

    tokens = generate_tokens(row["user_id"], row["email"], row["role"])

    _refresh_tokens[tokens["refreshToken"]] = {
        "userId": row["user_id"],
        "email": row["email"],
        "role": row["role"],
    }

    # Send welcome email (non-blocking, best-effort)
    try:
        from app.services.email_service import send_welcome_email
        await send_welcome_email(body.email, body.name, body.password)
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")

    return {
        "message": "User registered successfully. Note: Projects can only be assigned at user creation time.",
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
        },
        "sessionId": tokens["accessToken"],
        "loginStatus": "SUCCESS",
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/login
# ──────────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginRequest, pool: object = Depends(get_db)):
    """Authenticate user and return tokens. Matches Express login endpoint."""

    if not body.email or not body.password:
        raise HTTPException(400, detail={"message": "Email and password are required"})

    import re
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", body.email):
        raise HTTPException(400, detail={"message": "Invalid email format"})

    logger.info(f"--- LOGIN ATTEMPT for {body.email} ---")
    row = await pool.fetchrow(
        "SELECT user_id, name, email, password, role, is_active FROM users WHERE LOWER(email) = LOWER($1)",
        body.email.strip(),
    )

    if not row:
        logger.warning(f"Login failed: User not found for email (checked case-insensitively): '{body.email}'")
        raise HTTPException(401, detail={"message": "Invalid credentials"})

    if not row["is_active"]:
        logger.warning(f"Login failed: User is inactive (id={row['user_id']})")
        raise HTTPException(401, detail={"message": "You are inactive. Contact admin."})

    if not verify_password(body.password, row["password"]):
        logger.warning(f"Login failed: Invalid password for user {body.email}")
        raise HTTPException(401, detail={"message": "Invalid credentials"})

    logger.info(f"--- LOGIN SUCCESS for {body.email} ---")
    tokens = generate_tokens(row["user_id"], row["email"], row["role"])

    _refresh_tokens[tokens["refreshToken"]] = {
        "userId": row["user_id"],
        "email": row["email"],
        "role": row["role"],
    }

    # Try to generate P6 token (non-blocking, short timeout)
    p6_token = None
    try:
        from app.services.p6_token_service import generate_p6_token
        import asyncio
        # Short timeout for login specifically to prevent frontend timeout
        p6_token = await asyncio.wait_for(generate_p6_token(), timeout=5.0)
        logger.info("[Login] P6 token generated successfully")
    except asyncio.TimeoutError:
        logger.warning("[Login] P6 token generation timed out (5s)")
    except Exception as e:
        logger.error(f"[Login] Failed to generate P6 token: {e}")

    return {
        "message": "Login successful",
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
        "p6Token": p6_token,
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
        },
        "sessionId": tokens["accessToken"],
        "loginStatus": "SUCCESS",
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/refresh-token
# ──────────────────────────────────────────────────────────────
@router.post("/refresh-token")
async def refresh_token(body: RefreshTokenRequest):
    """Refresh access token using a valid refresh token."""
    if not body.refreshToken:
        raise HTTPException(401, detail={"message": "Refresh token required"})

    try:
        decoded = verify_refresh_token(body.refreshToken)
    except Exception as e:
        error_str = str(e).lower()
        if "expired" in error_str:
            raise HTTPException(401, detail={"message": "Refresh token expired"})
        raise HTTPException(403, detail={"message": "Invalid refresh token"})

    if body.refreshToken not in _refresh_tokens:
        raise HTTPException(403, detail={"message": "Invalid refresh token"})

    user_data = _refresh_tokens.pop(body.refreshToken)
    tokens = generate_tokens(
        user_data.get("userId", decoded.get("userId")),
        user_data.get("email", decoded.get("email")),
        user_data.get("role", decoded.get("role")),
    )

    _refresh_tokens[tokens["refreshToken"]] = user_data

    return {
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/logout
# ──────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(body: LogoutRequest):
    """Logout – invalidate refresh token."""
    if body.refreshToken and body.refreshToken in _refresh_tokens:
        del _refresh_tokens[body.refreshToken]
    return {"message": "Logout successful"}


# ──────────────────────────────────────────────────────────────
# GET /api/auth/profile
# ──────────────────────────────────────────────────────────────
@router.get("/profile")
async def get_profile(
    pool: object = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get user profile."""
    row = await pool.fetchrow(
        "SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1",
        current_user["userId"],
    )
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})

    if not row["is_active"]:
        raise HTTPException(401, detail={"message": "You are inactive. Contact admin to make your account active."})

    return {
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
        }
    }


# ──────────────────────────────────────────────────────────────
# GET /api/auth/supervisors
# ──────────────────────────────────────────────────────────────
@router.get("/supervisors")
async def get_supervisors(
    pool: object = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get all supervisors (PMAG and Site PM only)."""
    if current_user["role"] not in ("PMAG", "Site PM"):
        raise HTTPException(403, detail={"message": "Access denied. PMAG or Site PM privileges required."})

    rows = await pool.fetch(
        'SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role" FROM users WHERE role = $1 ORDER BY name',
        "Supervisor",
    )
    return [dict(r) for r in rows]


# ──────────────────────────────────────────────────────────────
# GET /api/auth/sitepms
# ──────────────────────────────────────────────────────────────
@router.get("/sitepms")
async def get_sitepms(
    pool: object = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get all Site PMs (PMAG only)."""
    if current_user["role"] != "PMAG":
        raise HTTPException(403, detail={"message": "Access denied. PMAG privileges required."})

    rows = await pool.fetch(
        'SELECT user_id AS "ObjectId", name AS "Name", email AS "Email", role AS "Role" FROM users WHERE role = $1 ORDER BY name',
        "Site PM",
    )
    return [dict(r) for r in rows]
