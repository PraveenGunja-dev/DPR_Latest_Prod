"""Indian Standard Time helpers.

Every clock the product shows - report dates, submission times, audit logs - is Indian. The app
and database servers are not necessarily on that clock (Azure hosts default to UTC), so nothing
should read "now" or stamp a row from the host's local time.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

IST_NAME = "Asia/Kolkata"
IST = ZoneInfo(IST_NAME)


def now_ist() -> datetime:
    """The current moment as an aware datetime in IST."""
    return datetime.now(IST)


def as_ist(value: datetime) -> datetime:
    """Label a naive datetime as IST, or convert an aware one into IST.

    The database session runs with timezone=Asia/Kolkata (see app.database), so a naive
    TIMESTAMP column already holds IST wall-clock time and only needs the label attached.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=IST)
    return value.astimezone(IST)
