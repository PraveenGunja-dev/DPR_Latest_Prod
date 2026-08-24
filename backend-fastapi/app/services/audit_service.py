# app/services/audit_service.py
"""
Security audit trail.

Writes to the existing system_logs table rather than introducing a second,
parallel log, so the Super Admin "System Logs" screen keeps working unchanged
and security events sit alongside the operational ones.

Nothing secret is ever recorded here: callers pass action names and free-text
remarks only. Passwords, OTP values and reset secrets never reach this module.
"""

import logging
from typing import Any, Optional

from fastapi import Request

from app.database import get_pool

logger = logging.getLogger("adani-flow.audit")

# Security audit actions (spec section 17).
USER_CREATED = "USER_CREATED"
FIRST_LOGIN = "FIRST_LOGIN"
PASSWORD_CREATED = "PASSWORD_CREATED"
PASSWORD_CHANGED = "PASSWORD_CHANGED"
PASSWORD_EXPIRED = "PASSWORD_EXPIRED"
PASSWORD_RESET = "PASSWORD_RESET"
PASSWORD_EXPIRING = "PASSWORD_EXPIRING"
FORCE_PASSWORD_CHANGE = "FORCE_PASSWORD_CHANGE"
OTP_SENT = "OTP_SENT"
OTP_VERIFIED = "OTP_VERIFIED"
OTP_FAILED = "OTP_FAILED"
RECOVERY_EMAIL_CHANGED = "RECOVERY_EMAIL_CHANGED"
RECOVERY_EMAIL_VERIFIED = "RECOVERY_EMAIL_VERIFIED"
LOGIN_SUCCESS = "LOGIN_SUCCESS"
LOGIN_FAILED = "LOGIN_FAILED"
LOGOUT = "LOGOUT"
SESSION_TERMINATED = "SESSION_TERMINATED"
ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
ACCOUNT_UNLOCKED = "ACCOUNT_UNLOCKED"
USER_ACTIVATED = "USER_ACTIVATED"
USER_DEACTIVATED = "USER_DEACTIVATED"
ROLE_CHANGED = "ROLE_CHANGED"
PROJECT_ACCESS_CHANGED = "PROJECT_ACCESS_CHANGED"
ACCOUNT_SETUP_NOTIFIED = "ACCOUNT_SETUP_NOTIFIED"

# Actions surfaced by the per-user security timeline in User Management.
SECURITY_ACTIONS = [
    USER_CREATED, FIRST_LOGIN, PASSWORD_CREATED, PASSWORD_CHANGED, PASSWORD_EXPIRED,
    PASSWORD_RESET, PASSWORD_EXPIRING, FORCE_PASSWORD_CHANGE, OTP_SENT, OTP_VERIFIED,
    OTP_FAILED, RECOVERY_EMAIL_CHANGED, RECOVERY_EMAIL_VERIFIED, LOGIN_SUCCESS,
    LOGIN_FAILED, LOGOUT, SESSION_TERMINATED, ACCOUNT_LOCKED, ACCOUNT_UNLOCKED,
    USER_ACTIVATED, USER_DEACTIVATED, ROLE_CHANGED, PROJECT_ACCESS_CHANGED,
    ACCOUNT_SETUP_NOTIFIED,
]

RESULT_SUCCESS = "SUCCESS"
RESULT_FAILURE = "FAILURE"


def client_ip(request: Optional[Request]) -> Optional[str]:
    """
    Best-effort client IP.

    Behind Azure App Service / Front Door the real address is the first hop of
    X-Forwarded-For; request.client is the proxy.
    """
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        # App Service appends :port to the forwarded address.
        if first.count(":") == 1 and "." in first:
            first = first.split(":")[0]
        if first:
            return first[:64]
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def user_agent(request: Optional[Request]) -> Optional[str]:
    """Raw User-Agent string, used to show the device/browser in the audit view."""
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    return ua[:500] if ua else None


async def record_audit(
    action: str,
    *,
    actor_id: Optional[int] = None,
    target_user_id: Optional[int] = None,
    target_entity: Optional[str] = None,
    request: Optional[Request] = None,
    result: str = RESULT_SUCCESS,
    remarks: Optional[str] = None,
) -> None:
    """
    Record one security event.

    Never raises: an audit failure must not break the operation being audited,
    exactly as the existing create_system_log helper behaves.

    actor_id       - who performed the action (None for anonymous attempts)
    target_user_id - the account the action was performed on
    """
    try:
        pool = await get_pool()
        await pool.execute(
            """INSERT INTO system_logs
                 (action_type, performed_by, target_entity, remarks,
                  target_user_id, ip_address, user_agent, result)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            action,
            actor_id,
            target_entity,
            remarks,
            target_user_id,
            client_ip(request),
            user_agent(request),
            result,
        )
    except Exception as e:
        logger.error(f"Error recording audit event {action}: {e}")


def describe_user(row: Optional[dict[str, Any]]) -> str:
    """Consistent 'Name (email)' label for the target_entity column."""
    if not row:
        return "Unknown user"
    name = row.get("name") or row.get("Name") or "Unknown"
    email = row.get("email") or row.get("Email") or ""
    return f"User: {name} ({email})" if email else f"User: {name}"
