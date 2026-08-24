# tests/test_no_smtp_mode.py
"""
The no-SMTP fallback.

smtp.adani.com is an internal host that does not resolve outside the corporate
network. With LOGIN_REQUIRE_OTP=false and PASSWORD_SETUP_REQUIRE_OTP=false the
whole application stays usable on password authentication alone, so development
and demos are not blocked by mail.

Everything else - the 9-character policy, expiry, history, lockout, audit and
session tracking - keeps working untouched. Only the emailed code is skipped.

Start the server with:
    LOGIN_REQUIRE_OTP=false PASSWORD_SETUP_REQUIRE_OTP=false python run.py
"""

import asyncio
import os
import sys

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, PASSWORD_B, Results,
    backdate_password, cleanup_all, close_db, create_test_user, db,
)


async def run() -> int:
    r = Results("No-SMTP fallback mode")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=60.0)

    try:
        # 1. Plain login works without any email being sent.
        print("\n-- Login without OTP --")
        user = await create_test_user(pool, "nosmtp1", password=PASSWORD_A)
        resp = await client.post("/api/auth/email/login",
                                 json={"email": user["email"], "password": PASSWORD_A})
        body = resp.json()
        r.check(resp.status_code == 200, f"login answered 200 (got {resp.status_code})", resp.text[:150])
        r.check(body.get("status") == "SUCCESS",
                f"login completes in one step (status {body.get('status')})")
        r.check(body.get("accessToken") is not None, "a session token is issued")

        headers = {"Authorization": f"Bearer {body['accessToken']}"}
        profile = await client.get("/api/auth/profile", headers=headers)
        r.check(profile.status_code == 200, "the token reaches the application")

        no_otp = await pool.fetchval(
            "SELECT COUNT(*) FROM auth_otps WHERE user_id = $1", user["user_id"])
        r.check(no_otp == 0, "no OTP challenge was created at all")

        # 2. Session tracking is unaffected.
        print("\n-- Session tracking still active --")
        session = await pool.fetchrow(
            "SELECT session_id, logout_at FROM user_sessions WHERE user_id = $1",
            user["user_id"])
        r.check(session is not None and session["logout_at"] is None,
                "a tracked session was opened")

        await client.post("/api/auth/logout", json={"refreshToken": body["refreshToken"]})
        closed = await pool.fetchval(
            "SELECT logout_reason FROM user_sessions WHERE session_id = $1", session["session_id"])
        r.check(closed == "USER_LOGOUT", f"logout is still recorded (got {closed})")

        # 3. The password policy is unchanged.
        print("\n-- Password policy still enforced --")
        login2 = await client.post("/api/auth/email/login",
                                   json={"email": user["email"], "password": PASSWORD_A})
        headers2 = {"Authorization": f"Bearer {login2.json()['accessToken']}"}

        weak = await client.post("/api/auth/email/password/change", headers=headers2, json={
            "currentPassword": PASSWORD_A, "newPassword": "short1!", "confirmPassword": "short1!",
        })
        r.check(weak.status_code == 400, "a sub-policy password is still rejected")

        same = await client.post("/api/auth/email/password/change", headers=headers2, json={
            "currentPassword": PASSWORD_A, "newPassword": PASSWORD_A, "confirmPassword": PASSWORD_A,
        })
        r.check(same.status_code == 400, "reusing the current password is still rejected")

        ok = await client.post("/api/auth/email/password/change", headers=headers2, json={
            "currentPassword": PASSWORD_A, "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(ok.status_code == 200 and ok.json().get("status") == "SUCCESS",
                "a valid change completes without an OTP step", ok.text[:150])

        history = await pool.fetchval(
            "SELECT password_history FROM users WHERE user_id = $1", user["user_id"])
        r.check(len(history) >= 1, "password history is still recorded")

        reuse = await client.post("/api/auth/email/login",
                                  json={"email": user["email"], "password": PASSWORD_A})
        r.check(reuse.status_code == 401, "the old password no longer works")

        # 4. First-login setup works without email.
        print("\n-- First-time setup without OTP --")
        newbie = await create_test_user(pool, "nosmtp2", password=PASSWORD_A,
                                        must_change=True, first_login=True)
        start = await client.post("/api/auth/email/login",
                                  json={"email": newbie["email"], "password": PASSWORD_A})
        sbody = start.json()
        r.check(sbody.get("status") == "PASSWORD_SETUP_REQUIRED",
                "first login still routes to password setup")
        r.check(sbody.get("requiresOtp") is False,
                "the response tells the UI that no OTP step is needed")

        done = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": sbody["challengeToken"],
            "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(done.status_code == 200 and done.json().get("accessToken"),
                "setup completes in one step and returns a session", done.text[:150])

        after = await pool.fetchrow(
            """SELECT is_first_login, must_change_password, password_expires_at
               FROM users WHERE user_id = $1""", newbie["user_id"])
        r.check(after["is_first_login"] is False and after["must_change_password"] is False,
                "the first-login flags are cleared")
        r.check(after["password_expires_at"] is not None, "the 30-day expiry is still stamped")

        # 5. Expiry and lockout are unaffected.
        print("\n-- Expiry and lockout unaffected --")
        await backdate_password(pool, newbie["user_id"], 31)
        expired = await client.post("/api/auth/email/login",
                                    json={"email": newbie["email"], "password": PASSWORD_B})
        r.check(expired.json().get("status") == "PASSWORD_EXPIRED",
                "an expired password still blocks login")

        victim = await create_test_user(pool, "nosmtp3", password=PASSWORD_A)
        locked = None
        for attempt in range(1, 6):
            resp = await client.post("/api/auth/email/login",
                                     json={"email": victim["email"], "password": "WrongPass9!"})
            if resp.status_code == 423:
                locked = attempt
                break
        r.check(locked == 5, f"lockout still triggers after 5 failures (got {locked})")

        # 6. Recovery genuinely needs mail, and fails safely without it.
        print("\n-- Forgot password still needs mail --")
        forgot = await client.post("/api/auth/email/forgot-password",
                                   json={"email": user["email"]})
        r.check(forgot.status_code == 200,
                "forgot-password still answers generically rather than erroring")
        r.check("challengeId" not in forgot.json(),
                "no challenge is handed out when the code could not be delivered")

        # 7. The audit trail is unchanged.
        print("\n-- Audit trail --")
        actions = {row["action_type"] for row in await pool.fetch(
            "SELECT DISTINCT action_type FROM system_logs WHERE target_user_id = ANY($1)",
            [user["user_id"], newbie["user_id"], victim["user_id"]])}
        for expected in ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT",
                         "PASSWORD_CHANGED", "PASSWORD_CREATED", "ACCOUNT_LOCKED"]:
            r.check(expected in actions, f"{expected} still recorded")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
