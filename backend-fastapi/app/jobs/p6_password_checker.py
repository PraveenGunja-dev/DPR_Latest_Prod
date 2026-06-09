import logging
from datetime import datetime
from app.config import settings
from app.services.email_service import send_p6_password_expiry_email

logger = logging.getLogger("adani-flow.jobs.p6_password")

async def check_p6_password_expiry():
    """Job to check P6 password expiry and notify super admins if necessary."""
    logger.info("Checking P6 password expiry...")
    
    last_reset = settings.P6_PASSWORD_LAST_RESET_DATE
    if not last_reset:
        logger.warning("P6_PASSWORD_LAST_RESET_DATE not set, assuming expired.")
        days_left = 0
    else:
        try:
            reset_date = datetime.strptime(last_reset, "%Y-%m-%d").date()
            days_since = (datetime.now().date() - reset_date).days
            days_left = 45 - days_since
        except Exception as e:
            logger.error(f"Failed to parse P6_PASSWORD_LAST_RESET_DATE '{last_reset}': {e}")
            days_left = 0

    if days_left <= 10:
        logger.info(f"P6 password expires in {days_left} days. Sending notifications...")
        super_admins = settings.super_admin_emails
        if super_admins:
            await send_p6_password_expiry_email(super_admins, days_left)
        else:
            logger.warning("No SUPER_ADMIN_EMAIL configured to receive P6 expiry notification.")
