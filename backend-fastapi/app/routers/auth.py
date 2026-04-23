# app/routers/auth.py
"""
Auth router – login, register, refresh, logout, profile, supervisors, sitepms.
Updated to store refresh tokens in DB for multi-worker compatibility.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import generate_tokens, verify_refresh_token
from app.auth.password import hash_password, verify_password
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

    # Store refresh token in DB
    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        "INSERT INTO refresh_tokens (token, user_id, email, role, expires_at) VALUES ($1, $2, $3, $4, $5)",
        tokens["refreshToken"], row["user_id"], row["email"], row["role"], expires_at
    )

    try:
        from app.services.email_service import send_welcome_email
        await send_welcome_email(body.email, body.name, body.password)
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")

    return {
        "message": "User registered successfully.",
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
async def login(body: LoginRequest, pool: PoolWrapper = Depends(get_db)):
    """Authenticate user and return tokens."""
    if not body.email or not body.password:
        raise HTTPException(400, detail={"message": "Email and password are required"})

    logger.info(f"--- LOGIN ATTEMPT for {body.email} ---")
    row = await pool.fetchrow(
        "SELECT user_id, name, email, password, role, is_active FROM users WHERE LOWER(email) = LOWER($1)",
        body.email.strip(),
    )

    if not row or not row["is_active"] or not verify_password(body.password, row["password"]):
        logger.warning(f"Login failed for {body.email}")
        raise HTTPException(401, detail={"message": "Invalid credentials or account inactive"})

    logger.info(f"--- LOGIN SUCCESS for {body.email} ---")
    tokens = generate_tokens(row["user_id"], row["email"], row["role"])

    # Store refresh token in DB
    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        "INSERT INTO refresh_tokens (token, user_id, email, role, expires_at) VALUES ($1, $2, $3, $4, $5)",
        tokens["refreshToken"], row["user_id"], row["email"], row["role"], expires_at
    )

    # P6 token logic
    p6_token = None
    try:
        from app.services.p6_token_service import generate_p6_token
        import asyncio
        p6_token = await asyncio.wait_for(generate_p6_token(), timeout=5.0)
    except Exception as e:
        logger.error(f"P6 Token error: {e}")

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

    # 4. Generate new tokens and rotate in DB
    tokens = generate_tokens(stored["user_id"], stored["email"], stored["role"])
    
    # Rotate token: delete old, insert new
    await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        "INSERT INTO refresh_tokens (token, user_id, email, role, expires_at) VALUES ($1, $2, $3, $4, $5)",
        tokens["refreshToken"], stored["user_id"], stored["email"], stored["role"], expires_at
    )

    return {
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/logout
# ──────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(body: LogoutRequest, pool: PoolWrapper = Depends(get_db)):
    """Logout – invalidate refresh token in DB."""
    if body.refreshToken:
        await pool.execute("DELETE FROM refresh_tokens WHERE token = $1", body.refreshToken)
    return {"message": "Logout successful"}


# ──────────────────────────────────────────────────────────────
# GET /api/auth/profile
# ──────────────────────────────────────────────────────────────
@router.get("/profile")
async def get_profile(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = await pool.fetchrow("SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1", current_user["userId"])
    if not row or not row["is_active"]:
        raise HTTPException(401, detail={"message": "User inactive or not found"})

    return {
        "user": {
            "ObjectId": row["user_id"],
            "Name": row["name"],
            "Email": row["email"],
            "Role": row["role"],
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
