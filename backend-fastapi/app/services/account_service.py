# app/services/account_service.py
"""
Account and password lifecycle for EMAIL-login users.

Everything that can change a password funnels through set_password() so that
hashing, policy validation, history, expiry stamps, session revocation, cache
invalidation and auditing can never be skipped by a new call site.

SSO accounts are rejected by every function here that mutates a password -
their credentials are owned by Entra ID.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Request

from app.auth.password import hash_password_async, verify_password_async
from app.auth.password_policy import (
    PasswordPolicyError,
    assert_password_allowed,
    is_password_reused_async,
    push_password_history,
)
from app.config import settings
from app.services import audit_service
from app.services.cache_service import cache

logger = logging.getLogger("adani-flow.account")

AUTH_EMAIL = "EMAIL"
AUTH_SSO = "SSO"

# Durable account states stored in users.account_status.
STATUS_ACTIVE = "ACTIVE"
STATUS_PENDING_SETUP = "PENDING_SETUP"
STATUS_INACTIVE = "INACTIVE"

# Display states (spec section 15). The last two are derived, never stored.
DISPLAY_ACTIVE = "Active"
DISPLAY_PENDING_SETUP = "Pending Setup"
DISPLAY_INACTIVE = "Inactive"
DISPLAY_PASSWORD_EXPIRED = "Password Expired"
DISPLAY_LOCKED = "Temporarily Locked"

# Columns every lifecycle-aware query needs.
USER_AUTH_COLUMNS = """
    user_id, name, email, password, role, is_active, created_at,
    sso_provider, azure_oid, authentication_type, is_first_login,
    must_change_password, password_changed_at, password_expires_at,
    password_history, recovery_email, recovery_email_verified,
    account_status, failed_login_attempts, locked_until, last_login_at,
    last_expiry_warning_day
"""

_STATUS_CACHE_PREFIX = "authstatus:"


class AccountError(Exception):
    """Lifecycle failure carrying a machine-readable code for the frontend."""

    def __init__(self, code: str, message: str, http_status: int = 400, **extra: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.extra = extra


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise a database timestamp to an aware UTC datetime."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _load_history(raw: Any) -> list[Any]:
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except ValueError:
            return []
    return list(raw)


# ──────────────────────────────────────────────────────────────
# Classification
# ──────────────────────────────────────────────────────────────

def auth_type_of(row: Optional[dict[str, Any]]) -> str:
    """
    Authentication type for a user row.

    Falls back to the sso_provider/password shape when the column has not been
    backfilled yet, so this is safe to call before the data migration runs.
    """
    if not row:
        return AUTH_EMAIL
    declared = row.get("authentication_type")
    if declared in (AUTH_SSO, AUTH_EMAIL):
        return declared
    return AUTH_SSO if row.get("sso_provider") else AUTH_EMAIL


def is_email_user(row: Optional[dict[str, Any]]) -> bool:
    return auth_type_of(row) == AUTH_EMAIL


def is_lifecycle_exempt(row: Optional[dict[str, Any]]) -> bool:
    """
    True when password expiry / forced change must not be applied.

    The 'External' role is a machine account used by /api/external/token. It
    cannot read an inbox, so it never receives an OTP; setting
    EXTERNAL_ACCOUNT_PASSWORD_EXEMPT additionally lifts the expiry and forced
    change requirements from it.
    """
    if not row:
        return False
    return bool(settings.EXTERNAL_ACCOUNT_PASSWORD_EXEMPT and row.get("role") == "External")


def assert_email_user(row: Optional[dict[str, Any]]) -> None:
    """Guard for every password operation. SSO accounts are owned by Entra ID."""
    if auth_type_of(row) == AUTH_SSO:
        raise AccountError(
            "SSO_ACCOUNT",
            "This account signs in with Microsoft SSO. Its password is managed by your "
            "organisation and cannot be changed from Digitalized DPR.",
            http_status=400,
        )


# ──────────────────────────────────────────────────────────────
# Status
# ──────────────────────────────────────────────────────────────

def is_locked(row: Optional[dict[str, Any]]) -> bool:
    locked_until = _aware((row or {}).get("locked_until"))
    return bool(locked_until and locked_until > _now())


def lock_seconds_remaining(row: Optional[dict[str, Any]]) -> int:
    locked_until = _aware((row or {}).get("locked_until"))
    if not locked_until:
        return 0
    return max(int((locked_until - _now()).total_seconds()), 0)


def get_password_status(row: Optional[dict[str, Any]]) -> dict[str, Any]:
    """
    Password state for a user, used by the UI banner, the expiry job and the
    Super Admin user list.

    SSO and lifecycle-exempt accounts always report state 'NOT_APPLICABLE'.
    """
    if not row or not is_email_user(row) or is_lifecycle_exempt(row):
        return {
            "state": "NOT_APPLICABLE",
            "daysRemaining": None,
            "expiresAt": None,
            "changedAt": None,
            "label": "Managed externally" if row and not is_email_user(row) else "Not applicable",
            "warn": False,
        }

    if row.get("must_change_password"):
        return {
            "state": "MUST_CHANGE",
            "daysRemaining": 0,
            "expiresAt": None,
            "changedAt": _aware(row.get("password_changed_at")),
            "label": "Password change required",
            "warn": True,
        }

    expires_at = _aware(row.get("password_expires_at"))
    if not expires_at:
        return {
            "state": "NO_PASSWORD_SET",
            "daysRemaining": None,
            "expiresAt": None,
            "changedAt": None,
            "label": "No password set",
            "warn": True,
        }

    delta = expires_at - _now()
    # Round partial days up so "expires in 4 hours" reads as 1 day, not 0.
    days_remaining = max(0, -(-int(delta.total_seconds()) // 86400)) if delta.total_seconds() > 0 else 0

    if delta.total_seconds() <= 0:
        return {
            "state": "EXPIRED",
            "daysRemaining": 0,
            "expiresAt": expires_at,
            "changedAt": _aware(row.get("password_changed_at")),
            "label": "Password expired",
            "warn": True,
        }

    warn = days_remaining <= max(settings.password_expiry_warning_days or [0])
    return {
        "state": "OK",
        "daysRemaining": days_remaining,
        "expiresAt": expires_at,
        "changedAt": _aware(row.get("password_changed_at")),
        "label": f"Password expires in {days_remaining} day{'s' if days_remaining != 1 else ''}",
        "warn": warn,
    }


def compute_account_status(row: Optional[dict[str, Any]]) -> str:
    """
    Display status for User Management (spec section 15).

    Ordered by severity: an inactive account reads Inactive even if its
    password also happens to be expired.
    """
    if not row:
        return DISPLAY_INACTIVE
    if row.get("is_active") is False or row.get("account_status") == STATUS_INACTIVE:
        return DISPLAY_INACTIVE
    if is_locked(row):
        return DISPLAY_LOCKED
    if row.get("account_status") == STATUS_PENDING_SETUP or row.get("is_first_login"):
        return DISPLAY_PENDING_SETUP
    if get_password_status(row)["state"] in ("EXPIRED", "MUST_CHANGE"):
        return DISPLAY_PASSWORD_EXPIRED
    return DISPLAY_ACTIVE


def access_block_reason(row: Optional[dict[str, Any]]) -> Optional[tuple[str, str]]:
    """
    (code, message) when this account must not be granted normal access, else None.

    This is the single rule the login endpoint, the token dependency and the
    refresh endpoint all consult, so the three can never disagree - which is
    what makes URL, frontend and direct-API bypasses impossible.
    """
    if not row:
        return ("ACCOUNT_INACTIVE", "Account not found or inactive.")
    if row.get("is_active") is False or row.get("account_status") == STATUS_INACTIVE:
        return ("ACCOUNT_INACTIVE", "Your account is inactive. Please contact your administrator.")

    if not is_email_user(row):
        return None  # SSO accounts are never gated by the email password lifecycle.

    if is_locked(row):
        return ("ACCOUNT_LOCKED", "Your account is temporarily locked. Please try again later.")

    if is_lifecycle_exempt(row):
        return None

    if row.get("must_change_password") or row.get("is_first_login"):
        return ("PASSWORD_CHANGE_REQUIRED", "You must set a new password before continuing.")

    status = get_password_status(row)
    if status["state"] in ("EXPIRED", "NO_PASSWORD_SET"):
        return ("PASSWORD_EXPIRED", "Your password has expired. Please set a new password.")

    return None


# ──────────────────────────────────────────────────────────────
# Cached status lookup used by the auth dependency
# ──────────────────────────────────────────────────────────────

async def get_cached_access_state(pool, user_id: int) -> dict[str, Any]:
    """
    Access state for a user id, cached for AUTH_STATUS_CACHE_SECONDS.

    Called on every authenticated request for EMAIL users, so it must stay
    cheap; SSO users are short-circuited by the caller and never reach here.
    """
    key = f"{_STATUS_CACHE_PREFIX}{user_id}"
    cached = await cache.get(key)
    if cached is not None:
        return cached

    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    block = access_block_reason(row)
    state = {
        "authType": auth_type_of(row),
        "blocked": block is not None,
        "code": block[0] if block else None,
        "message": block[1] if block else None,
        "role": (row or {}).get("role"),
    }
    await cache.set(key, state, ttl=settings.AUTH_STATUS_CACHE_SECONDS)
    return state


async def invalidate_access_state(user_id: int) -> None:
    """Drop the cached state so a status change takes effect immediately."""
    await cache.delete(f"{_STATUS_CACHE_PREFIX}{user_id}")


# ──────────────────────────────────────────────────────────────
# Failed login tracking
# ──────────────────────────────────────────────────────────────

async def register_failed_login(pool, row: dict[str, Any], request: Optional[Request] = None) -> dict[str, Any]:
    """
    Record a failed password attempt and lock the account once the threshold
    is reached.

    The lock is always temporary (LOGIN_LOCKOUT_MINUTES) - a handful of
    mistakes must never permanently lock a user out.
    """
    attempts = (row.get("failed_login_attempts") or 0) + 1
    locked_until = None
    if attempts >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
        locked_until = _now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)

    await pool.execute(
        "UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3",
        attempts, locked_until, row["user_id"],
    )
    await invalidate_access_state(row["user_id"])

    await audit_service.record_audit(
        audit_service.LOGIN_FAILED,
        actor_id=row["user_id"],
        target_user_id=row["user_id"],
        target_entity=audit_service.describe_user(row),
        request=request,
        result=audit_service.RESULT_FAILURE,
        remarks=f"Failed attempt {attempts} of {settings.LOGIN_MAX_FAILED_ATTEMPTS}",
    )

    if locked_until:
        await audit_service.record_audit(
            audit_service.ACCOUNT_LOCKED,
            actor_id=row["user_id"],
            target_user_id=row["user_id"],
            target_entity=audit_service.describe_user(row),
            request=request,
            result=audit_service.RESULT_FAILURE,
            remarks=f"Locked for {settings.LOGIN_LOCKOUT_MINUTES} minutes after "
                    f"{attempts} failed attempts",
        )

    return {
        "attempts": attempts,
        "lockedUntil": locked_until,
        "attemptsRemaining": max(settings.LOGIN_MAX_FAILED_ATTEMPTS - attempts, 0),
    }


async def reset_failed_login(pool, user_id: int) -> None:
    """Clear the failed-attempt counter and any lock after a successful login."""
    await pool.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1",
        user_id,
    )
    await invalidate_access_state(user_id)


async def record_successful_login(pool, row: dict[str, Any], request: Optional[Request] = None) -> None:
    """Stamp last_login_at, clear the failure counter and audit the login."""
    await pool.execute(
        """UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
                            last_login_at = CURRENT_TIMESTAMP
           WHERE user_id = $1""",
        row["user_id"],
    )
    await invalidate_access_state(row["user_id"])
    await audit_service.record_audit(
        audit_service.LOGIN_SUCCESS,
        actor_id=row["user_id"],
        target_user_id=row["user_id"],
        target_entity=audit_service.describe_user(row),
        request=request,
        remarks=f"{auth_type_of(row)} login",
    )


# ──────────────────────────────────────────────────────────────
# Password mutation - the single choke point
# ──────────────────────────────────────────────────────────────

async def validate_new_password(
    pool,
    row: dict[str, Any],
    new_password: str,
    confirm_password: Optional[str] = None,
) -> str:
    """
    Run every rule against a candidate password and return its bcrypt hash.

    Checks, in order: SSO guard, confirmation match, complexity policy,
    difference from the current password, and the reuse history.
    """
    assert_email_user(row)

    if confirm_password is not None and new_password != confirm_password:
        raise AccountError("PASSWORD_MISMATCH", "The passwords entered do not match.")

    try:
        assert_password_allowed(new_password, email=row.get("email"), name=row.get("name"))
    except PasswordPolicyError as e:
        raise AccountError("PASSWORD_POLICY", e.errors[0], errors=e.errors)

    current_hash = row.get("password")
    if current_hash and await verify_password_async(new_password, current_hash):
        raise AccountError(
            "PASSWORD_REUSED",
            "Your new password must be different from your current password.",
        )

    if await is_password_reused_async(new_password, _load_history(row.get("password_history"))):
        raise AccountError(
            "PASSWORD_REUSED",
            f"You cannot reuse any of your last {settings.PASSWORD_HISTORY_COUNT} passwords.",
        )

    return await hash_password_async(new_password)


async def commit_password(
    pool,
    user_id: int,
    password_hash: str,
    *,
    action: str,
    actor_id: Optional[int] = None,
    request: Optional[Request] = None,
    remarks: Optional[str] = None,
    revoke_sessions: bool = True,
) -> dict[str, Any]:
    """
    Persist an already-validated password hash and reset the whole lifecycle.

    Sets password_changed_at / password_expires_at, pushes the previous hash
    into the history, clears the first-login and forced-change flags, unlocks
    the account, revokes refresh tokens and writes the audit record.
    """
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    if not row:
        raise AccountError("USER_NOT_FOUND", "User not found.", http_status=404)
    assert_email_user(row)

    now = _now()
    expires_at = now + timedelta(days=settings.PASSWORD_EXPIRY_DAYS)

    # The password being replaced is what goes into the history.
    history = push_password_history(
        _load_history(row.get("password_history")),
        row.get("password") or password_hash,
        changed_at=(_aware(row.get("password_changed_at")) or now).isoformat(),
    ) if row.get("password") else _load_history(row.get("password_history"))

    await pool.execute(
        """UPDATE users
           SET password = $1,
               password_changed_at = $2,
               password_expires_at = $3,
               password_history = $4,
               must_change_password = FALSE,
               is_first_login = FALSE,
               failed_login_attempts = 0,
               locked_until = NULL,
               last_expiry_warning_day = NULL,
               account_status = CASE WHEN account_status = 'PENDING_SETUP' THEN 'ACTIVE' ELSE account_status END,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $5""",
        password_hash, now, expires_at, json.dumps(history), user_id,
    )

    if revoke_sessions:
        # Any session issued against the old password is no longer trusted.
        await pool.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
        from app.services import session_service
        await session_service.end_sessions_for_user(
            pool, user_id, reason=session_service.REASON_REVOKED)

    await invalidate_access_state(user_id)

    await audit_service.record_audit(
        action,
        actor_id=actor_id if actor_id is not None else user_id,
        target_user_id=user_id,
        target_entity=audit_service.describe_user(row),
        request=request,
        remarks=remarks or f"Password valid until {expires_at.date().isoformat()}",
    )

    return {"passwordChangedAt": now, "passwordExpiresAt": expires_at}


async def set_password(
    pool,
    user_id: int,
    new_password: str,
    *,
    action: str,
    confirm_password: Optional[str] = None,
    actor_id: Optional[int] = None,
    request: Optional[Request] = None,
    remarks: Optional[str] = None,
    revoke_sessions: bool = True,
) -> dict[str, Any]:
    """Validate and commit a new password in one step (used where no OTP gate applies)."""
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    if not row:
        raise AccountError("USER_NOT_FOUND", "User not found.", http_status=404)

    password_hash = await validate_new_password(pool, dict(row), new_password, confirm_password)
    return await commit_password(
        pool, user_id, password_hash,
        action=action, actor_id=actor_id, request=request,
        remarks=remarks, revoke_sessions=revoke_sessions,
    )


async def mark_must_change_password(
    pool,
    user_id: int,
    *,
    actor_id: Optional[int] = None,
    request: Optional[Request] = None,
    remarks: Optional[str] = None,
) -> None:
    """Force a user through the change-password flow on their next login."""
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    if not row:
        raise AccountError("USER_NOT_FOUND", "User not found.", http_status=404)
    assert_email_user(row)

    await pool.execute(
        "UPDATE users SET must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
        user_id,
    )
    await pool.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
    from app.services import session_service
    await session_service.end_sessions_for_user(
        pool, user_id, reason=session_service.REASON_REVOKED)
    await invalidate_access_state(user_id)

    await audit_service.record_audit(
        audit_service.FORCE_PASSWORD_CHANGE,
        actor_id=actor_id,
        target_user_id=user_id,
        target_entity=audit_service.describe_user(row),
        request=request,
        remarks=remarks or "Administrator required a password change",
    )


async def unlock_account(
    pool,
    user_id: int,
    *,
    actor_id: Optional[int] = None,
    request: Optional[Request] = None,
) -> None:
    """Clear a temporary lock and the failed-attempt counter."""
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    if not row:
        raise AccountError("USER_NOT_FOUND", "User not found.", http_status=404)

    await pool.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
        user_id,
    )
    await invalidate_access_state(user_id)

    await audit_service.record_audit(
        audit_service.ACCOUNT_UNLOCKED,
        actor_id=actor_id,
        target_user_id=user_id,
        target_entity=audit_service.describe_user(row),
        request=request,
        remarks="Account unlocked by administrator",
    )


async def get_user_by_email(pool, email: str) -> Optional[dict[str, Any]]:
    """Case-insensitive lookup returning every lifecycle column."""
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE LOWER(email) = LOWER($1)",
        (email or "").strip(),
    )
    return dict(row) if row else None


async def get_user_by_id(pool, user_id: int) -> Optional[dict[str, Any]]:
    row = await pool.fetchrow(
        f"SELECT {USER_AUTH_COLUMNS} FROM users WHERE user_id = $1", user_id
    )
    return dict(row) if row else None


def otp_destination(row: dict[str, Any]) -> str:
    """
    Where a verification code should be sent.

    A verified recovery address is preferred for recovery flows; the login
    address is always a valid fallback. An unverified recovery address is
    never used - that is what stops an attacker pointing recovery at their own
    inbox.
    """
    if row.get("recovery_email") and row.get("recovery_email_verified"):
        return row["recovery_email"]
    return row["email"]
