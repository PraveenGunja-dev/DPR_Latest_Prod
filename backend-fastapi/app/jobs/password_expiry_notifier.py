# app/jobs/password_expiry_notifier.py
"""
Daily password-expiry warnings for EMAIL-login users.

Runs at 09:00 from the APScheduler instance created in app/main.py, alongside
the existing P6 password check and auto-sync jobs.

SSO users are excluded by the query itself - their password lifetime is
governed by Entra ID, not by this application.
"""

import logging

from app.config import settings
from app.database import get_pool
from app.services import account_service as accounts
from app.services import audit_service

logger = logging.getLogger("adani-flow.password_expiry")


async def notify_password_expiry() -> dict:
    """
    Email every EMAIL user whose password crosses a warning threshold today.

    last_expiry_warning_day records the threshold a user was last warned at, so
    a 7-day warning is not repeated on days 6, 5 and 4 - each of 7, 3 and 1
    fires exactly once per password.
    """
    thresholds = settings.password_expiry_warning_days
    if not thresholds:
        return {"checked": 0, "notified": 0}

    pool = await get_pool()

    rows = await pool.fetch(
        f"""SELECT {accounts.USER_AUTH_COLUMNS}
            FROM users
            WHERE authentication_type = 'EMAIL'
              AND COALESCE(is_active, TRUE) = TRUE
              AND password_expires_at IS NOT NULL
              AND must_change_password = FALSE
              AND password_expires_at > CURRENT_TIMESTAMP
              AND password_expires_at <= CURRENT_TIMESTAMP + ($1 || ' days')::interval
        """,
        str(max(thresholds)),
    )

    notified = 0
    for row in rows:
        user = dict(row)
        if accounts.is_lifecycle_exempt(user):
            continue

        status = accounts.get_password_status(user)
        days = status["daysRemaining"]
        if days is None:
            continue

        # The threshold this user has now reached: the smallest configured
        # value that is still >= the days remaining.
        matched = next((t for t in sorted(thresholds) if days <= t), None)
        if matched is None:
            continue

        already = user.get("last_expiry_warning_day")
        if already is not None and already <= matched:
            continue  # already warned at this threshold or a closer one

        from app.services.email_service import send_password_expiry_warning_email

        try:
            result = await send_password_expiry_warning_email(user["email"], user["name"], days)
        except Exception as e:
            logger.error(f"Failed to send expiry warning to user {user['user_id']}: {e}")
            continue

        await pool.execute(
            "UPDATE users SET last_expiry_warning_day = $1 WHERE user_id = $2",
            matched, user["user_id"],
        )
        await audit_service.record_audit(
            audit_service.PASSWORD_EXPIRING,
            target_user_id=user["user_id"],
            target_entity=audit_service.describe_user(user),
            result=audit_service.RESULT_SUCCESS if result.get("success") else audit_service.RESULT_FAILURE,
            remarks=f"Expiry warning at {days} day(s) remaining",
        )
        notified += 1

    logger.info(f"Password expiry check: {len(rows)} approaching expiry, {notified} warned")
    return {"checked": len(rows), "notified": notified}
