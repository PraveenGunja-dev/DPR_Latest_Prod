"""Exercise the daily password-expiry warning job against disposable accounts."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from conftest import Results, backdate_password, cleanup_all, close_db, create_test_user, db
from app.jobs.password_expiry_notifier import notify_password_expiry


async def run():
    r = Results("Expiry warning job")
    pool = await db()
    try:
        # 7, 3 and 1 days remaining, plus one well inside its window and one SSO.
        cases = {}
        for slug, days_ago in [("job7", 23), ("job3", 27), ("job1", 29), ("jobsafe", 5)]:
            u = await create_test_user(pool, slug)
            await backdate_password(pool, u["user_id"], days_ago)
            cases[slug] = u
        sso = await create_test_user(pool, "jobsso", auth_type="SSO")

        result = await notify_password_expiry()
        print(f"\n  job returned: {result}")

        warned = {}
        for slug, u in cases.items():
            warned[slug] = await pool.fetchval(
                "SELECT last_expiry_warning_day FROM users WHERE user_id = $1", u["user_id"])

        r.check(warned["job7"] == 7, f"7 days remaining warned at threshold 7 (got {warned['job7']})")
        r.check(warned["job3"] == 3, f"3 days remaining warned at threshold 3 (got {warned['job3']})")
        r.check(warned["job1"] == 1, f"1 day remaining warned at threshold 1 (got {warned['job1']})")
        r.check(warned["jobsafe"] is None, "25 days remaining is not warned")

        sso_warn = await pool.fetchval(
            "SELECT last_expiry_warning_day FROM users WHERE user_id = $1", sso["user_id"])
        r.check(sso_warn is None, "SSO account never receives an expiry warning")

        # Running again the same day must not re-warn anyone.
        second = await notify_password_expiry()
        r.check(second["notified"] == 0,
                f"a second run the same day sends nothing (notified={second['notified']})")

        # Crossing into a closer threshold does warn again.
        await backdate_password(pool, cases["job7"]["user_id"], 27)
        third = await notify_password_expiry()
        again = await pool.fetchval(
            "SELECT last_expiry_warning_day FROM users WHERE user_id = $1", cases["job7"]["user_id"])
        r.check(again == 3, f"crossing 7 -> 3 days warns again (threshold now {again})")

        audits = await pool.fetchval(
            "SELECT COUNT(*) FROM system_logs WHERE action_type = 'PASSWORD_EXPIRING' AND target_user_id = ANY($1)",
            [u["user_id"] for u in cases.values()])
        r.check(audits >= 4, f"each warning is audited ({audits} PASSWORD_EXPIRING records)")
    finally:
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()
    return r.report()


raise SystemExit(asyncio.run(run()))
