# app/services/session_service.py
"""
Login session and presence tracking.

The audit log records instants ("this person changed their password at 14:03").
A session is a span - signed in at, last seen at, signed out at - which is what
answers "who is online right now" and "when did they last log in and out".

This applies to EVERY user, SSO and email alike: it is access tracking, not
part of the email password lifecycle. It only ever *records* what the existing
auth flows already do; it never gates or alters them.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Request

from app.config import settings
from app.services import audit_service
from app.services.cache_service import cache

logger = logging.getLogger("adani-flow.sessions")

# Why a session ended.
REASON_LOGOUT = "USER_LOGOUT"          # the user pressed Sign Out
REASON_REVOKED = "REVOKED"             # password change / reset / admin action
REASON_EXPIRED = "EXPIRED"             # refresh token lifetime ran out
REASON_IDLE = "IDLE_TIMEOUT"           # no activity for SESSION_IDLE_TIMEOUT_MINUTES
REASON_ADMIN = "ADMIN_TERMINATED"      # a Super Admin signed the session out

_TOUCH_CACHE_PREFIX = "session_touch:"


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def start_session(
    pool,
    user: dict[str, Any],
    request: Optional[Request] = None,
    auth_type: str = "EMAIL",
) -> str:
    """
    Open a session and return its id.

    The id is embedded in the access token as `sid`, so later requests can
    touch and close this exact session rather than guessing which of a user's
    sessions is which.
    """
    session_id = uuid.uuid4().hex
    try:
        await pool.execute(
            """INSERT INTO user_sessions
                 (session_id, user_id, auth_type, ip_address, user_agent)
               VALUES ($1, $2, $3, $4, $5)""",
            session_id, user["user_id"], auth_type,
            audit_service.client_ip(request), audit_service.user_agent(request),
        )
    except Exception as e:
        # Presence tracking must never block a login.
        logger.error(f"Could not open session for user {user.get('user_id')}: {e}")
    return session_id


async def touch_session(pool, session_id: Optional[str], user_id: Optional[int]) -> None:
    """
    Mark a session as still active.

    Called on every authenticated request, so the database write is throttled
    to once per SESSION_TOUCH_INTERVAL_SECONDS per session. Without that this
    would turn every read in the application into a write.
    """
    if not session_id or not user_id:
        return

    key = f"{_TOUCH_CACHE_PREFIX}{session_id}"
    if await cache.get(key) is not None:
        return
    await cache.set(key, True, ttl=settings.SESSION_TOUCH_INTERVAL_SECONDS)

    try:
        await pool.execute(
            """UPDATE user_sessions SET last_seen_at = $1
               WHERE session_id = $2 AND logout_at IS NULL""",
            _now(), session_id,
        )
    except Exception as e:
        logger.error(f"Could not touch session {session_id}: {e}")


async def end_session(
    pool,
    session_id: Optional[str] = None,
    reason: str = REASON_LOGOUT,
    refresh_token: Optional[str] = None,
) -> Optional[int]:
    """
    Close a single session, identified by its id or by its refresh token.

    Returns the user id whose session was closed, or None if nothing matched.
    """
    if not session_id and refresh_token:
        session_id = await pool.fetchval(
            "SELECT session_id FROM refresh_tokens WHERE token = $1", refresh_token
        )
    if not session_id:
        return None

    try:
        row = await pool.fetchrow(
            """UPDATE user_sessions
               SET logout_at = $1, logout_reason = $2
               WHERE session_id = $3 AND logout_at IS NULL
               RETURNING user_id""",
            _now(), reason, session_id,
        )
        await cache.delete(f"{_TOUCH_CACHE_PREFIX}{session_id}")
        return row["user_id"] if row else None
    except Exception as e:
        logger.error(f"Could not close session {session_id}: {e}")
        return None


async def end_sessions_for_user(pool, user_id: int, reason: str = REASON_REVOKED) -> int:
    """
    Close every open session for a user.

    Called wherever refresh tokens are revoked - a password change, a reset, an
    administrator forcing a change - so the session view agrees with reality
    instead of showing people as online after their access was withdrawn.
    """
    try:
        rows = await pool.fetch(
            """UPDATE user_sessions
               SET logout_at = $1, logout_reason = $2
               WHERE user_id = $3 AND logout_at IS NULL
               RETURNING session_id""",
            _now(), reason, user_id,
        )
        for row in rows:
            await cache.delete(f"{_TOUCH_CACHE_PREFIX}{row['session_id']}")
        return len(rows)
    except Exception as e:
        logger.error(f"Could not close sessions for user {user_id}: {e}")
        return 0


async def sweep_idle_sessions(pool) -> int:
    """
    Close sessions that simply went quiet.

    A browser closed without pressing Sign Out leaves the session open forever;
    without this the "online now" list would only ever grow.
    """
    cutoff = _now() - timedelta(minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES)
    try:
        rows = await pool.fetch(
            """UPDATE user_sessions
               SET logout_at = last_seen_at, logout_reason = $1
               WHERE logout_at IS NULL AND last_seen_at < $2
               RETURNING session_id""",
            REASON_IDLE, cutoff,
        )
        if rows:
            logger.info(f"Closed {len(rows)} idle session(s)")
        return len(rows)
    except Exception as e:
        logger.error(f"Idle session sweep failed: {e}")
        return 0


# ──────────────────────────────────────────────────────────────
# Reporting
# ──────────────────────────────────────────────────────────────

async def get_online_users(pool, window_minutes: Optional[int] = None) -> list[dict[str, Any]]:
    """
    Users currently signed in and active.

    "Online" means a session that has not been closed and has been seen inside
    the presence window. One row per user, even if they are signed in from
    several browsers, with the session count alongside.
    """
    window = window_minutes or settings.SESSION_ONLINE_WINDOW_MINUTES
    cutoff = _now() - timedelta(minutes=window)

    rows = await pool.fetch(
        """SELECT u.user_id, u.name, u.email, u.role,
                  COALESCE(u.authentication_type, 'EMAIL') AS auth_type,
                  COUNT(s.id)          AS session_count,
                  MIN(s.login_at)      AS since,
                  MAX(s.last_seen_at)  AS last_seen,
                  MAX(s.ip_address)    AS ip_address,
                  MAX(s.user_agent)    AS user_agent
           FROM user_sessions s
           JOIN users u ON u.user_id = s.user_id
           WHERE s.logout_at IS NULL AND s.last_seen_at >= $1
           GROUP BY u.user_id, u.name, u.email, u.role, u.authentication_type
           ORDER BY MAX(s.last_seen_at) DESC""",
        cutoff,
    )
    return [dict(r) for r in rows]


async def get_sessions(
    pool,
    user_id: Optional[int] = None,
    days: int = 7,
    only_open: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Login history: who signed in, from where, and when they signed out."""
    where = ["s.login_at >= $1"]
    params: list[Any] = [_now() - timedelta(days=max(days, 1))]
    idx = 2

    if user_id:
        where.append(f"s.user_id = ${idx}")
        params.append(user_id)
        idx += 1
    if only_open:
        where.append("s.logout_at IS NULL")

    clause = "WHERE " + " AND ".join(where)
    total = await pool.fetchval(
        f"SELECT COUNT(*) FROM user_sessions s {clause}", *params
    )

    params.extend([limit, offset])
    rows = await pool.fetch(
        f"""SELECT s.session_id, s.user_id, u.name, u.email, u.role,
                   s.auth_type, s.login_at, s.last_seen_at, s.logout_at,
                   s.logout_reason, s.ip_address, s.user_agent,
                   EXTRACT(EPOCH FROM (COALESCE(s.logout_at, s.last_seen_at) - s.login_at)) AS duration_seconds
            FROM user_sessions s
            JOIN users u ON u.user_id = s.user_id
            {clause}
            ORDER BY s.login_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}""",
        *params,
    )
    return {"items": [dict(r) for r in rows], "total": total or 0}
