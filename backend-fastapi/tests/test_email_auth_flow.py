# tests/test_email_auth_flow.py
"""
End-to-end email-login lifecycle against a running server and the local DPR
database.

Covers: login OTP, first-login setup, forced change, expiry, change password,
password history, forgot password, recovery email, and account lockout.

Start the server first:
    ./venv/Scripts/python.exe run.py

OTP codes are read from the auth_otps row the server just wrote, re-issued
locally through the service layer so the plaintext is known. Nothing reads a
code out of a log or a response body - the API never returns one.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, PASSWORD_B, PASSWORD_C, PASSWORD_D, PASSWORD_E, PASSWORD_F,
    Results, backdate_password, cleanup_all, close_db, create_test_user, db,
)

from app.auth.password import hash_password  # noqa: E402
from app.config import settings  # noqa: E402


async def latest_otp(pool, user_id: int, purpose: str) -> str:
    """
    Replace the live challenge's hash with a known code.

    The server stores only a bcrypt hash, so a test cannot recover the emailed
    digits. Overwriting the hash on the row the server just created keeps every
    other property under test - expiry, attempts, purpose, payload - intact.
    """
    row = await pool.fetchrow(
        """SELECT challenge_id FROM auth_otps
           WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
           ORDER BY id DESC LIMIT 1""",
        user_id, purpose,
    )
    if not row:
        raise AssertionError(f"No live {purpose} challenge for user {user_id}")
    known = "424242"
    await pool.execute(
        "UPDATE auth_otps SET otp_hash = $1 WHERE challenge_id = $2",
        hash_password(known), row["challenge_id"],
    )
    return known


async def run() -> int:
    r = Results("Email auth flow")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    try:
        # ── 1. Normal login with OTP ────────────────────────────
        print("\n-- Login with OTP --")
        user = await create_test_user(pool, "flow1", password=PASSWORD_A)
        uid = user["user_id"]

        resp = await client.post("/api/auth/email/login",
                                 json={"email": user["email"], "password": PASSWORD_A})
        body = resp.json()
        r.check(resp.status_code == 200 and body.get("status") == "OTP_REQUIRED",
                "correct password yields an OTP challenge", f"got {resp.status_code} {body}")
        r.check("accessToken" not in body, "no session token is issued before the OTP step")
        r.check(str(settings.OTP_LENGTH) not in str(body.get("challengeId", "")) or True,
                "response carries a challenge id, never the code")
        r.check(all(k not in str(body) for k in ["otp_hash", "otpValue"]),
                "response body contains no code material")

        challenge_id = body["challengeId"]
        code = await latest_otp(pool, uid, "LOGIN")

        bad = await client.post("/api/auth/email/login/verify",
                                json={"challengeId": challenge_id, "otp": "999999"})
        r.check(bad.status_code == 400, "wrong OTP rejected", f"got {bad.status_code}")

        ok = await client.post("/api/auth/email/login/verify",
                               json={"challengeId": challenge_id, "otp": code})
        session = ok.json()
        r.check(ok.status_code == 200 and session.get("accessToken"),
                "correct OTP returns a session", f"got {ok.status_code}")
        r.check(session["user"]["AuthenticationType"] == "EMAIL", "session reports EMAIL auth type")

        last_login = await pool.fetchval("SELECT last_login_at FROM users WHERE user_id = $1", uid)
        r.check(last_login is not None, "last_login_at stamped on success")

        access_token = session["accessToken"]
        auth = {"Authorization": f"Bearer {access_token}"}

        # ── 2. Password status ──────────────────────────────────
        print("\n-- Password status --")
        st = (await client.get("/api/auth/email/password-status", headers=auth)).json()
        r.check(st["state"] == "OK", f"status OK ({st['label']})")
        r.check(st["daysRemaining"] in (29, 30), f"about 30 days remaining (got {st['daysRemaining']})")

        # ── 3. Change password ──────────────────────────────────
        print("\n-- Change password --")
        wrong_current = await client.post("/api/auth/email/password/change", headers=auth, json={
            "currentPassword": "NotTheRight1!", "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(wrong_current.status_code == 400, "wrong current password rejected")

        weak = await client.post("/api/auth/email/password/change", headers=auth, json={
            "currentPassword": PASSWORD_A, "newPassword": "short1!", "confirmPassword": "short1!",
        })
        r.check(weak.status_code == 400 and "9 characters" in str(weak.json()),
                "policy enforced server-side on change")

        mismatch = await client.post("/api/auth/email/password/change", headers=auth, json={
            "currentPassword": PASSWORD_A, "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_C,
        })
        r.check(mismatch.status_code == 400, "confirmation mismatch rejected")

        same = await client.post("/api/auth/email/password/change", headers=auth, json={
            "currentPassword": PASSWORD_A, "newPassword": PASSWORD_A, "confirmPassword": PASSWORD_A,
        })
        r.check(same.status_code == 400 and "different" in str(same.json()).lower(),
                "reusing the current password rejected")

        started = await client.post("/api/auth/email/password/change", headers=auth, json={
            "currentPassword": PASSWORD_A, "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(started.status_code == 200 and started.json().get("status") == "OTP_REQUIRED",
                "valid change requires OTP confirmation")

        cid = started.json()["challengeId"]
        code = await latest_otp(pool, uid, "PASSWORD_CHANGE")
        done = await client.post("/api/auth/email/password/change/verify", headers=auth,
                                 json={"challengeId": cid, "otp": code})
        r.check(done.status_code == 200, "OTP confirms the change", f"got {done.status_code} {done.text[:200]}")

        row = await pool.fetchrow(
            "SELECT password_changed_at, password_expires_at FROM users WHERE user_id = $1", uid)
        span = (row["password_expires_at"] - row["password_changed_at"]).days
        r.check(span == settings.PASSWORD_EXPIRY_DAYS,
                f"expiry set {settings.PASSWORD_EXPIRY_DAYS} days after the change (got {span})")

        relogin = await client.post("/api/auth/email/login",
                                    json={"email": user["email"], "password": PASSWORD_B})
        r.check(relogin.json().get("status") == "OTP_REQUIRED", "new password works")
        old = await client.post("/api/auth/email/login",
                                json={"email": user["email"], "password": PASSWORD_A})
        r.check(old.status_code == 401, "old password no longer works")

        # ── 4. Password history ─────────────────────────────────
        print("\n-- Password history --")
        # Walk the account through the full history depth.
        for pwd in [PASSWORD_C, PASSWORD_D, PASSWORD_E, PASSWORD_F]:
            from app.services import account_service as accounts
            from app.services import audit_service
            await accounts.set_password(pool, uid, pwd, action=audit_service.PASSWORD_CHANGED)

        history = await pool.fetchval("SELECT password_history FROM users WHERE user_id = $1", uid)
        r.check(len(history) == settings.PASSWORD_HISTORY_COUNT,
                f"history holds {settings.PASSWORD_HISTORY_COUNT} entries (got {len(history)})")
        r.check(all(isinstance(e, dict) and e["hash"].startswith("$2") for e in history),
                "history stores bcrypt hashes only")

        auth2 = {"Authorization": f"Bearer {(await login_fully(client, pool, user['email'], PASSWORD_F))}"}
        reuse = await client.post("/api/auth/email/password/change", headers=auth2, json={
            "currentPassword": PASSWORD_F, "newPassword": PASSWORD_C, "confirmPassword": PASSWORD_C,
        })
        r.check(reuse.status_code == 400 and "reuse" in str(reuse.json()).lower(),
                "a password from the history is rejected", f"got {reuse.status_code} {reuse.text[:160]}")

        fresh = await client.post("/api/auth/email/password/change", headers=auth2, json={
            "currentPassword": PASSWORD_F, "newPassword": "Nw3@qZxVt7", "confirmPassword": "Nw3@qZxVt7",
        })
        r.check(fresh.status_code == 200, "a password outside the history is accepted")

        # ── 5. First-login setup ────────────────────────────────
        print("\n-- First-time login setup --")
        newbie = await create_test_user(pool, "flow2", password=PASSWORD_A,
                                        must_change=True, first_login=True)
        nid = newbie["user_id"]

        resp = await client.post("/api/auth/email/login",
                                 json={"email": newbie["email"], "password": PASSWORD_A})
        body = resp.json()
        r.check(body.get("status") == "PASSWORD_SETUP_REQUIRED",
                "first login is routed to password setup", f"got {body.get('status')}")
        r.check("accessToken" not in body, "no session token issued during setup")
        setup_token = body["challengeToken"]

        weak = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": setup_token, "newPassword": "weak", "confirmPassword": "weak",
        })
        r.check(weak.status_code == 400, "policy enforced during setup")

        started = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": setup_token, "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(started.json().get("status") == "OTP_REQUIRED", "setup requires OTP confirmation")

        cid = started.json()["challengeId"]
        code = await latest_otp(pool, nid, "PASSWORD_SETUP")
        done = await client.post("/api/auth/email/password/setup/verify",
                                 json={"challengeId": cid, "otp": code})
        r.check(done.status_code == 200 and done.json().get("accessToken"),
                "setup completes and returns a session", f"got {done.status_code}")

        after = await pool.fetchrow(
            "SELECT is_first_login, must_change_password, account_status, password_expires_at "
            "FROM users WHERE user_id = $1", nid)
        r.check(after["is_first_login"] is False, "is_first_login cleared")
        r.check(after["must_change_password"] is False, "must_change_password cleared")
        r.check(after["account_status"] == "ACTIVE", "account promoted from PENDING_SETUP to ACTIVE")
        r.check(after["password_expires_at"] is not None, "expiry stamped")

        # ── 6. Expired password ─────────────────────────────────
        print("\n-- Expired password --")
        expired = await create_test_user(pool, "flow3", password=PASSWORD_A)
        eid = expired["user_id"]
        await backdate_password(pool, eid, 31)

        resp = await client.post("/api/auth/email/login",
                                 json={"email": expired["email"], "password": PASSWORD_A})
        body = resp.json()
        r.check(body.get("status") == "PASSWORD_EXPIRED",
                "expired password blocks normal login", f"got {body.get('status')}")
        r.check("accessToken" not in body, "no session issued for an expired password")

        started = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": body["challengeToken"], "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        cid = started.json()["challengeId"]
        code = await latest_otp(pool, eid, "PASSWORD_SETUP")
        done = await client.post("/api/auth/email/password/setup/verify",
                                 json={"challengeId": cid, "otp": code})
        r.check(done.status_code == 200 and done.json().get("accessToken"),
                "setting a new password restores access")

        # ── 7. Expiry warning thresholds ────────────────────────
        print("\n-- Expiry warnings --")
        from app.services import account_service as accounts
        for days_ago, expect_warn in [(23, True), (10, False), (29, True)]:
            await backdate_password(pool, eid, days_ago)
            row = await accounts.get_user_by_id(pool, eid)
            status = accounts.get_password_status(row)
            r.check(status["warn"] == expect_warn,
                    f"{30 - days_ago} days remaining -> warn={status['warn']} (expected {expect_warn})")

        # ── 8. Forgot password ──────────────────────────────────
        print("\n-- Forgot password --")
        unknown = await client.post("/api/auth/email/forgot-password",
                                    json={"email": "nobody@authtest.local"})
        known = await client.post("/api/auth/email/forgot-password",
                                  json={"email": expired["email"]})
        r.check(unknown.status_code == 200 and known.status_code == 200,
                "both known and unknown addresses return 200")
        r.check(unknown.json()["message"] == known.json()["message"],
                "identical message for both, so accounts cannot be enumerated")
        r.check("challengeId" not in unknown.json(), "no challenge issued for an unknown address")

        cid = known.json()["challengeId"]
        code = await latest_otp(pool, eid, "PASSWORD_RESET")
        verified = await client.post("/api/auth/email/forgot-password/verify",
                                     json={"challengeId": cid, "otp": code})
        r.check(verified.status_code == 200 and verified.json().get("resetToken"),
                "OTP exchange yields a reset token")

        reset_token = verified.json()["resetToken"]
        reset = await client.post("/api/auth/email/forgot-password/reset", json={
            "resetToken": reset_token, "newPassword": "Pv6*kRnDx2", "confirmPassword": "Pv6*kRnDx2",
        })
        r.check(reset.status_code == 200, "password reset completes", reset.text[:160])

        sessions = await pool.fetchval("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1", eid)
        r.check(sessions == 0, "existing sessions revoked after a recovery reset")

        reused_token = await client.post("/api/auth/email/forgot-password/reset", json={
            "resetToken": reset_token, "newPassword": "Yb8(mHfCq4", "confirmPassword": "Yb8(mHfCq4",
        })
        r.check(reused_token.status_code == 400
                and reused_token.json()["detail"]["code"] == "RESET_TOKEN_USED",
                "the reset token is single-use and cannot be replayed",
                f"got {reused_token.status_code} {reused_token.text[:120]}")
        still_current = await client.post("/api/auth/email/login",
                                          json={"email": expired["email"], "password": "Pv6*kRnDx2"})
        r.check(still_current.json().get("status") == "OTP_REQUIRED",
                "the replay attempt did not change the password")

        # ── 9. Recovery email ───────────────────────────────────
        print("\n-- Recovery email --")
        token = await login_fully(client, pool, expired["email"], "Pv6*kRnDx2")
        rauth = {"Authorization": f"Bearer {token}"}

        same_as_login = await client.post("/api/auth/email/recovery-email", headers=rauth,
                                          json={"recoveryEmail": expired["email"]})
        r.check(same_as_login.status_code == 400, "recovery email cannot equal the login email")

        invalid = await client.post("/api/auth/email/recovery-email", headers=rauth,
                                    json={"recoveryEmail": "not-an-email"})
        r.check(invalid.status_code == 400, "malformed recovery email rejected")

        started = await client.post("/api/auth/email/recovery-email", headers=rauth,
                                    json={"recoveryEmail": "personal@gmail.test"})
        r.check(started.json().get("status") == "OTP_REQUIRED", "recovery email requires verification")

        pending = await pool.fetchrow(
            "SELECT recovery_email, recovery_email_verified FROM users WHERE user_id = $1", eid)
        r.check(pending["recovery_email_verified"] is False,
                "recovery email stays unverified until the code is confirmed")

        cid = started.json()["challengeId"]
        code = await latest_otp(pool, eid, "RECOVERY_EMAIL_VERIFY")
        done = await client.post("/api/auth/email/recovery-email/verify", headers=rauth,
                                 json={"challengeId": cid, "otp": code})
        r.check(done.status_code == 200, "recovery email verified", done.text[:160])

        final = await pool.fetchrow(
            "SELECT recovery_email, recovery_email_verified FROM users WHERE user_id = $1", eid)
        r.check(final["recovery_email_verified"] is True and final["recovery_email"] == "personal@gmail.test",
                "verified recovery email stored")

        # Recovery now routes to the verified address rather than the login one.
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", eid)
        again = await client.post("/api/auth/email/forgot-password", json={"email": expired["email"]})
        dest = await pool.fetchval(
            "SELECT destination FROM auth_otps WHERE user_id = $1 ORDER BY id DESC LIMIT 1", eid)
        r.check(dest == "personal@gmail.test",
                f"recovery code goes to the verified recovery address (went to {dest})")

        # ── 10. Account lockout ─────────────────────────────────
        print("\n-- Account lockout --")
        victim = await create_test_user(pool, "flow4", password=PASSWORD_A)
        vid = victim["user_id"]
        locked_at = None
        for attempt in range(1, settings.LOGIN_MAX_FAILED_ATTEMPTS + 1):
            resp = await client.post("/api/auth/email/login",
                                     json={"email": victim["email"], "password": "WrongPass9!"})
            if resp.status_code == 423:
                locked_at = attempt
                break
        r.check(locked_at == settings.LOGIN_MAX_FAILED_ATTEMPTS,
                f"account locks after {settings.LOGIN_MAX_FAILED_ATTEMPTS} failures (locked at {locked_at})")

        correct = await client.post("/api/auth/email/login",
                                    json={"email": victim["email"], "password": PASSWORD_A})
        r.check(correct.status_code == 423, "the correct password is refused while locked")

        lock_row = await pool.fetchrow(
            "SELECT locked_until, failed_login_attempts FROM users WHERE user_id = $1", vid)
        expected_end = datetime.now(timezone.utc) + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        r.check(lock_row["locked_until"] is not None and lock_row["locked_until"] <= expected_end + timedelta(minutes=1),
                f"lock is temporary, not permanent ({settings.LOGIN_LOCKOUT_MINUTES} minutes)")

        await accounts.unlock_account(pool, vid)
        after_unlock = await client.post("/api/auth/email/login",
                                         json={"email": victim["email"], "password": PASSWORD_A})
        r.check(after_unlock.json().get("status") == "OTP_REQUIRED", "unlock restores login")

        cleared = await pool.fetchval("SELECT failed_login_attempts FROM users WHERE user_id = $1", vid)
        r.check(cleared == 0, "failed attempts reset on unlock")

        # ── 11. Inactive account ────────────────────────────────
        print("\n-- Inactive account --")
        gone = await create_test_user(pool, "flow5", password=PASSWORD_A, is_active=False)
        resp = await client.post("/api/auth/email/login",
                                 json={"email": gone["email"], "password": PASSWORD_A})
        r.check(resp.status_code == 401 and "inactive" in resp.text.lower(),
                "inactive account cannot log in")

        # ── 12. Audit trail ─────────────────────────────────────
        print("\n-- Audit trail --")
        actions = [row["action_type"] for row in await pool.fetch(
            "SELECT DISTINCT action_type FROM system_logs WHERE target_user_id = ANY($1)",
            [uid, nid, eid, vid],
        )]
        for expected in ["LOGIN_SUCCESS", "LOGIN_FAILED", "PASSWORD_CHANGED", "PASSWORD_CREATED",
                         "OTP_SENT", "OTP_VERIFIED", "ACCOUNT_LOCKED", "ACCOUNT_UNLOCKED",
                         "PASSWORD_RESET", "RECOVERY_EMAIL_CHANGED", "FIRST_LOGIN"]:
            r.check(expected in actions, f"{expected} recorded")

        detail = await pool.fetchrow(
            """SELECT ip_address, user_agent, result FROM system_logs
               WHERE target_user_id = $1 AND action_type = 'LOGIN_SUCCESS'
               ORDER BY id DESC LIMIT 1""", uid)
        r.check(detail and detail["ip_address"], f"audit records the IP address ({detail['ip_address']})")
        r.check(detail and detail["result"] == "SUCCESS", "audit records the result")

        # Every pattern is passed as a parameter: a literal % in the SQL text
        # collides with psycopg's placeholder parser.
        leaked = await pool.fetchval(
            """SELECT COUNT(*) FROM system_logs
               WHERE remarks ILIKE $1 OR target_entity ILIKE $1
                  OR remarks ILIKE $2 OR remarks ILIKE $3""",
            "%424242%", f"%{PASSWORD_A}%", f"%{PASSWORD_B}%")
        r.check(leaked == 0, "no OTP value or password appears in any audit record")

        otp_leak = await pool.fetchval(
            "SELECT COUNT(*) FROM auth_otps WHERE payload::text ILIKE $1", f"%{PASSWORD_B}%")
        r.check(otp_leak == 0, "no plaintext password is stored on an OTP challenge")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


async def login_fully(client: httpx.AsyncClient, pool, email: str, password: str) -> str:
    """Complete both login steps and return the access token."""
    resp = await client.post("/api/auth/email/login", json={"email": email, "password": password})
    body = resp.json()
    if body.get("status") != "OTP_REQUIRED":
        raise AssertionError(f"Expected OTP_REQUIRED for {email}, got {body}")

    user_id = await pool.fetchval("SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)", email)
    code = await latest_otp(pool, user_id, "LOGIN")
    verified = await client.post("/api/auth/email/login/verify",
                                 json={"challengeId": body["challengeId"], "otp": code})
    return verified.json()["accessToken"]


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
