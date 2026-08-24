# app/services/otp_service.py
"""
Email OTP issuing and verification for EMAIL-login users.

Security properties this module guarantees:
  * The code is generated with `secrets`, never `random`.
  * Only a bcrypt hash of the code is persisted - the digits exist in memory
    just long enough for the caller to hand them to the SMTP service.
  * The plaintext is never logged, never returned to any HTTP response, and
    never stored in the database.
  * Issuing a new code for the same (user, purpose) invalidates the previous
    one immediately.
  * Attempts, resend cooldown and hourly send caps are enforced in the
    database, so the limits hold across all uvicorn worker processes.
"""

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.auth.password import hash_password_async, verify_password_async
from app.config import settings

logger = logging.getLogger("adani-flow.otp")

# OTP purposes.
PURPOSE_LOGIN = "LOGIN"
PURPOSE_PASSWORD_SETUP = "PASSWORD_SETUP"
PURPOSE_PASSWORD_CHANGE = "PASSWORD_CHANGE"
PURPOSE_PASSWORD_RESET = "PASSWORD_RESET"
PURPOSE_RECOVERY_EMAIL = "RECOVERY_EMAIL_VERIFY"

ALL_PURPOSES = {
    PURPOSE_LOGIN,
    PURPOSE_PASSWORD_SETUP,
    PURPOSE_PASSWORD_CHANGE,
    PURPOSE_PASSWORD_RESET,
    PURPOSE_RECOVERY_EMAIL,
}

PURPOSE_LABELS = {
    PURPOSE_LOGIN: "Sign in to Digitalized DPR",
    PURPOSE_PASSWORD_SETUP: "Set your Digitalized DPR password",
    PURPOSE_PASSWORD_CHANGE: "Confirm your password change",
    PURPOSE_PASSWORD_RESET: "Reset your Digitalized DPR password",
    PURPOSE_RECOVERY_EMAIL: "Verify your recovery email",
}


class OtpError(Exception):
    """Base class for OTP failures, carrying a machine-readable code."""

    code = "OTP_ERROR"
    http_status = 400

    def __init__(self, message: str, **extra: Any):
        super().__init__(message)
        self.message = message
        self.extra = extra


class OtpRateLimited(OtpError):
    code = "OTP_RATE_LIMITED"
    http_status = 429


class OtpInvalid(OtpError):
    code = "OTP_INVALID"
    http_status = 400


class OtpExpired(OtpError):
    code = "OTP_EXPIRED"
    http_status = 400


class OtpAttemptsExceeded(OtpError):
    code = "OTP_ATTEMPTS_EXCEEDED"
    http_status = 429


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise a database timestamp to an aware UTC datetime."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def generate_otp() -> str:
    """Generate a cryptographically secure numeric OTP of the configured length."""
    length = max(4, settings.OTP_LENGTH)
    return "".join(secrets.choice("0123456789") for _ in range(length))


def mask_email(email: str) -> str:
    """Mask an address for display: 'john.smith@company.com' -> 'jo*******@company.com'."""
    if not email or "@" not in email:
        return "your registered email"
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = local[0] + "*" * max(len(local) - 1, 1)
    else:
        masked = local[:2] + "*" * (len(local) - 2)
    return f"{masked}@{domain}"


async def issue_otp(
    pool,
    user_id: int,
    purpose: str,
    destination: str,
    ip_address: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    enforce_cooldown: bool = True,
) -> tuple[str, str]:
    """
    Issue a fresh OTP.

    Returns (challenge_id, otp_plaintext). The plaintext is for the caller to
    pass straight to the email service and then drop - it must never be
    returned in an HTTP response or written to a log.

    enforce_cooldown governs the 60-second gap between codes. It applies to the
    "Resend code" button, which is what the cooldown exists to throttle. A flow
    that starts afresh - re-entering a password after abandoning an earlier
    attempt - passes False, because blocking that would strand the user for a
    minute with no way forward. Abuse is still bounded by OTP_MAX_SENDS_PER_HOUR,
    which is enforced on every issue regardless.

    Raises OtpRateLimited if the applicable limit is hit.
    """
    if purpose not in ALL_PURPOSES:
        raise ValueError(f"Unknown OTP purpose: {purpose}")

    now = _now()

    # Hourly cap per (user, purpose), counted in the database so it survives
    # across worker processes and restarts.
    sent_last_hour = await pool.fetchval(
        """SELECT COALESCE(SUM(send_count), 0) FROM auth_otps
           WHERE user_id = $1 AND purpose = $2 AND created_at > $3""",
        user_id, purpose, now - timedelta(hours=1),
    )
    if sent_last_hour and int(sent_last_hour) >= settings.OTP_MAX_SENDS_PER_HOUR:
        raise OtpRateLimited(
            "Too many verification codes requested. Please try again later.",
            retryAfterSeconds=3600,
        )

    # Resend cooldown, measured from the most recent live code.
    if enforce_cooldown:
        latest = await pool.fetchrow(
            """SELECT last_sent_at FROM auth_otps
               WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
               ORDER BY id DESC LIMIT 1""",
            user_id, purpose,
        )
        if latest and latest["last_sent_at"]:
            elapsed = (now - _aware(latest["last_sent_at"])).total_seconds()
            if elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
                raise OtpRateLimited(
                    "Please wait before requesting another code.",
                    retryAfterSeconds=int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed),
                )

    # A new code invalidates every outstanding one for this purpose.
    await pool.execute(
        """UPDATE auth_otps SET consumed_at = $1
           WHERE user_id = $2 AND purpose = $3 AND consumed_at IS NULL""",
        now, user_id, purpose,
    )

    otp = generate_otp()
    challenge_id = uuid.uuid4().hex
    expires_at = now + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)

    import json
    await pool.execute(
        """INSERT INTO auth_otps
             (user_id, purpose, challenge_id, otp_hash, destination, payload,
              expires_at, ip_address, last_sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
        user_id, purpose, challenge_id, await hash_password_async(otp), destination,
        json.dumps(payload) if payload else None, expires_at, ip_address, now,
    )

    # Deliberately logs the purpose and the masked destination only.
    logger.info(f"[OTP] Issued {purpose} challenge for user {user_id} to {mask_email(destination)}")
    return challenge_id, otp


async def resend_otp(pool, challenge_id: str, ip_address: Optional[str] = None) -> tuple[str, str, dict]:
    """
    Re-issue the code for an existing challenge, preserving its payload.

    Returns (new_challenge_id, otp_plaintext, original_row). Raises OtpInvalid
    if the challenge is unknown or already used, OtpRateLimited on cooldown.
    """
    row = await pool.fetchrow(
        "SELECT * FROM auth_otps WHERE challenge_id = $1", challenge_id
    )
    if not row or row["consumed_at"] is not None:
        raise OtpInvalid("This verification session is no longer valid. Please start again.")

    payload = row["payload"]
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)

    new_challenge_id, otp = await issue_otp(
        pool,
        user_id=row["user_id"],
        purpose=row["purpose"],
        destination=row["destination"],
        ip_address=ip_address,
        payload=payload,
    )
    return new_challenge_id, otp, dict(row)


async def peek_challenge(pool, challenge_id: str) -> Optional[dict[str, Any]]:
    """Fetch a challenge row without consuming it. Returns None when unknown."""
    row = await pool.fetchrow("SELECT * FROM auth_otps WHERE challenge_id = $1", challenge_id)
    return dict(row) if row else None


async def verify_otp(pool, challenge_id: str, otp: str, purpose: Optional[str] = None) -> dict[str, Any]:
    """
    Verify a submitted code and consume the challenge on success.

    Returns the challenge row (including its decoded payload) so the caller can
    complete the operation the OTP was guarding.

    Raises OtpInvalid / OtpExpired / OtpAttemptsExceeded.

    Concurrency
    -----------
    The attempt is claimed with a single conditional UPDATE *before* the code is
    compared, so N requests arriving at once consume N distinct attempts. A
    read-then-write here would let an attacker fire all their guesses in
    parallel, have every one of them read attempts=0, and slip past the
    three-attempt limit entirely.

    The same applies to consuming a correct code: the UPDATE is conditional on
    consumed_at still being NULL, so exactly one of several simultaneous
    submissions can win and issue a session.

    Both statements are atomic in Postgres, so this holds across all uvicorn
    worker processes, not just within one event loop.
    """
    # Claim one attempt. The WHERE clause encodes every precondition, so a
    # concurrent caller cannot squeeze past between the check and the update.
    row = await pool.fetchrow(
        """UPDATE auth_otps
           SET attempts = attempts + 1
           WHERE challenge_id = $1
             AND consumed_at IS NULL
             AND expires_at > $2
             AND attempts < $3
           RETURNING *""",
        challenge_id, _now(), settings.OTP_MAX_ATTEMPTS,
    )

    if not row:
        # Nothing was claimed. Read the row back to report *why* precisely.
        existing = await pool.fetchrow(
            "SELECT * FROM auth_otps WHERE challenge_id = $1", challenge_id)
        if not existing:
            raise OtpInvalid("This verification session is no longer valid. Please start again.")
        if existing["consumed_at"] is not None:
            raise OtpInvalid("This code has already been used. Please request a new one.")
        if _aware(existing["expires_at"]) < _now():
            raise OtpExpired("This code has expired. Please request a new one.")
        raise OtpAttemptsExceeded("Too many incorrect attempts. Please request a new code.")

    if purpose and row["purpose"] != purpose:
        raise OtpInvalid("This verification session is no longer valid. Please start again.")

    attempts = row["attempts"]
    if not await verify_password_async(otp or "", row["otp_hash"]):
        remaining = max(settings.OTP_MAX_ATTEMPTS - attempts, 0)
        if remaining == 0:
            # Burn the challenge rather than leaving it open for more guesses.
            await pool.execute(
                "UPDATE auth_otps SET consumed_at = $1 WHERE id = $2 AND consumed_at IS NULL",
                _now(), row["id"],
            )
            raise OtpAttemptsExceeded("Too many incorrect attempts. Please request a new code.")
        raise OtpInvalid(
            f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
            attemptsRemaining=remaining,
        )

    # Correct code. Only the caller that flips consumed_at may proceed.
    claimed = await pool.fetchrow(
        """UPDATE auth_otps SET consumed_at = $1
           WHERE id = $2 AND consumed_at IS NULL
           RETURNING id""",
        _now(), row["id"],
    )
    if not claimed:
        raise OtpInvalid("This code has already been used. Please request a new one.")

    result = dict(row)
    payload = result.get("payload")
    if isinstance(payload, str):
        import json
        result["payload"] = json.loads(payload)
    return result


async def redeem_challenge(pool, challenge_id: str) -> bool:
    """
    Claim a verified challenge exactly once.

    Returns True for the first caller and False for every later one. The
    conditional UPDATE is atomic in Postgres, so two workers racing on the same
    reset token cannot both win - which is what makes the forgot-password reset
    token single-use rather than replayable for its full lifetime.
    """
    row = await pool.fetchrow(
        """UPDATE auth_otps SET redeemed_at = $1
           WHERE challenge_id = $2 AND redeemed_at IS NULL
           RETURNING id""",
        _now(), challenge_id,
    )
    return row is not None


async def invalidate_otps(pool, user_id: int, purpose: Optional[str] = None) -> None:
    """Consume every outstanding challenge for a user, optionally scoped to one purpose."""
    if purpose:
        await pool.execute(
            """UPDATE auth_otps SET consumed_at = $1
               WHERE user_id = $2 AND purpose = $3 AND consumed_at IS NULL""",
            _now(), user_id, purpose,
        )
    else:
        await pool.execute(
            "UPDATE auth_otps SET consumed_at = $1 WHERE user_id = $2 AND consumed_at IS NULL",
            _now(), user_id,
        )
