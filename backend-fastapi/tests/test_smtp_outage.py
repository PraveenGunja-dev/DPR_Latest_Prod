"""Behaviour when SMTP is unreachable: fail loudly, do not strand the user."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import httpx
from conftest import BASE_URL, PASSWORD_A, Results, cleanup_all, close_db, create_test_user, db


async def run():
    r = Results("SMTP outage behaviour")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=40.0)
    try:
        user = await create_test_user(pool, "smtpdown", password=PASSWORD_A)

        resp = await client.post("/api/auth/email/login",
                                 json={"email": user["email"], "password": PASSWORD_A})
        r.check(resp.status_code == 503,
                f"login reports a delivery failure instead of a false success (got {resp.status_code})")
        detail = resp.json().get("detail", {})
        r.check(detail.get("code") == "OTP_DELIVERY_FAILED",
                f"the failure carries a machine code ({detail.get('code')})")
        r.check("could not send" in detail.get("message", "").lower(),
                "the message tells the user what actually went wrong")

        live = await pool.fetchval(
            "SELECT COUNT(*) FROM auth_otps WHERE user_id = $1 AND consumed_at IS NULL",
            user["user_id"])
        r.check(live == 0, "no dangling challenge is left behind for a code that was never sent")

        audited = await pool.fetchrow(
            """SELECT result, remarks FROM system_logs
               WHERE target_user_id = $1 AND action_type = 'OTP_SENT'
               ORDER BY id DESC LIMIT 1""", user["user_id"])
        r.check(audited and audited["result"] == "FAILURE",
                "the failed delivery is audited as a FAILURE")
        r.check(audited and "DELIVERY FAILED" in (audited["remarks"] or ""),
                "the audit remark names the delivery failure")

        # Forgot-password must stay generic even when delivery breaks, or it
        # becomes an account-enumeration oracle.
        known = await client.post("/api/auth/email/forgot-password", json={"email": user["email"]})
        unknown = await client.post("/api/auth/email/forgot-password",
                                    json={"email": "nobody@authtest.local"})
        r.check(known.status_code == 200 and unknown.status_code == 200,
                "forgot-password still answers 200 for both")
        r.check(known.json()["message"] == unknown.json()["message"],
                "an SMTP outage does not turn forgot-password into an enumeration oracle")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()
    return r.report()


raise SystemExit(asyncio.run(run()))
