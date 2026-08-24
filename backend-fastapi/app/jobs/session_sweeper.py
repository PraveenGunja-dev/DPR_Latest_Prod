# app/jobs/session_sweeper.py
"""
Periodic housekeeping for login sessions.

Runs every 15 minutes from the APScheduler instance in app/main.py.

A browser closed without pressing Sign Out leaves its session open forever.
Without this sweep the "who is online" list would only ever grow, and the
access history would show people as still signed in months later.
"""

import logging

from app.database import get_pool
from app.services import session_service

logger = logging.getLogger("adani-flow.session_sweeper")


async def sweep_sessions() -> dict:
    """Close sessions that have gone quiet, and drop expired refresh tokens."""
    try:
        pool = await get_pool()
        closed = await session_service.sweep_idle_sessions(pool)

        # Refresh tokens past their expiry keep no session alive; clearing them
        # keeps the table from growing without bound.
        expired = await pool.fetch(
            """DELETE FROM refresh_tokens
               WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
               RETURNING session_id"""
        )
        for row in expired:
            if row["session_id"]:
                await session_service.end_session(
                    pool, session_id=row["session_id"], reason=session_service.REASON_EXPIRED
                )

        return {"idleClosed": closed, "expiredTokens": len(expired)}
    except Exception as e:
        logger.error(f"Session sweep failed: {e}")
        return {"idleClosed": 0, "expiredTokens": 0}
