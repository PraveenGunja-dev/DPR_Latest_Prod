# tests/test_activity_tracking.py
"""
Session and presence tracking: who is online, who signed in when, who signed
out when, and who did what.

Start the server first (with the dev outbox, since login needs an OTP):
    SMTP_DEV_OUTBOX_ENABLE=true SMTP_DEV_OUTBOX=tests/outbox python run.py
"""

import asyncio
import os
import sys

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, Results, cleanup_all, close_db, create_test_user, db,
)

from app.auth.jwt_handler import create_access_token  # noqa: E402
from app.auth.password import hash_password  # noqa: E402
from app.services import session_service  # noqa: E402


async def login(client, pool, email, password=PASSWORD_A):
    """Complete both login steps and return the full session payload."""
    resp = await client.post("/api/auth/email/login", json={"email": email, "password": password})
    body = resp.json()
    if body.get("status") != "OTP_REQUIRED":
        raise AssertionError(f"Expected OTP_REQUIRED for {email}, got {body}")

    user_id = await pool.fetchval("SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)", email)
    row = await pool.fetchrow(
        """SELECT challenge_id FROM auth_otps
           WHERE user_id = $1 AND purpose = 'LOGIN' AND consumed_at IS NULL
           ORDER BY id DESC LIMIT 1""", user_id)
    await pool.execute("UPDATE auth_otps SET otp_hash = $1 WHERE challenge_id = $2",
                       hash_password("424242"), row["challenge_id"])
    verified = await client.post("/api/auth/email/login/verify",
                                 json={"challengeId": body["challengeId"], "otp": "424242"})
    return verified.json()


async def run() -> int:
    r = Results("Activity tracking")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=60.0)

    try:
        admin = await create_test_user(pool, "actadmin", password=PASSWORD_A, role="Super Admin")
        admin_headers = {"Authorization": f"Bearer {create_access_token(admin['user_id'], admin['email'], 'Super Admin', auth_type='EMAIL')}"}

        alice = await create_test_user(pool, "alice", password=PASSWORD_A, role="Supervisor")
        bob = await create_test_user(pool, "bob", password=PASSWORD_A, role="Site PM")
        sso_user = await create_test_user(pool, "ssouser", auth_type="SSO", role="PMAG")

        # ── 1. A login opens a tracked session ──────────────────
        print("\n-- Session opens on login --")
        alice_session = await login(client, pool, alice["email"])
        r.check(alice_session.get("accessToken") is not None, "alice signed in")

        row = await pool.fetchrow(
            """SELECT session_id, login_at, last_seen_at, logout_at, ip_address, user_agent, auth_type
               FROM user_sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1""",
            alice["user_id"])
        r.check(row is not None, "a session row was created")
        r.check(row["logout_at"] is None, "the session is open")
        r.check(row["ip_address"] is not None, f"the session records the IP ({row['ip_address']})")
        r.check(row["auth_type"] == "EMAIL", "the session records the authentication type")

        # refresh_tokens is keyed by the token itself, with no id column.
        token_has_sid = await pool.fetchval(
            "SELECT session_id FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
            alice["user_id"])
        r.check(token_has_sid == row["session_id"], "the refresh token is linked to the session")

        # ── 2. Online list ──────────────────────────────────────
        print("\n-- Online now --")
        online = await client.get("/api/super-admin/activity/online", headers=admin_headers)
        r.check(online.status_code == 200, "online endpoint answers")
        listed = {u["Email"]: u for u in online.json()["users"]}
        r.check(alice["email"] in listed, "alice appears as online")
        r.check(listed[alice["email"]]["Sessions"] == 1, "one session counted for alice")
        r.check(listed[alice["email"]]["Role"] == "Supervisor", "the online row carries the role")
        r.check(bob["email"] not in listed, "bob, who never signed in, is not listed")

        # ── 3. A second user, and a second device ───────────────
        print("\n-- Multiple users and devices --")
        bob_session = await login(client, pool, bob["email"])
        await login(client, pool, bob["email"])  # a second browser

        online = await client.get("/api/super-admin/activity/online", headers=admin_headers)
        listed = {u["Email"]: u for u in online.json()["users"]}
        r.check(len(listed) >= 2, f"both users online ({len(listed)})")
        r.check(listed[bob["email"]]["Sessions"] == 2,
                f"bob's two devices are counted as 2 sessions (got {listed[bob['email']]['Sessions']})")

        # ── 4. Activity keeps a session alive ───────────────────
        print("\n-- Presence tracking --")
        before = await pool.fetchval(
            "SELECT last_seen_at FROM user_sessions WHERE session_id = $1", row["session_id"])
        # The touch is throttled, so clear the throttle to prove the write works.
        from app.services.cache_service import cache
        await cache.delete(f"session_touch:{row['session_id']}")
        await pool.execute(
            "UPDATE user_sessions SET last_seen_at = last_seen_at - INTERVAL '2 minutes' WHERE session_id = $1",
            row["session_id"])
        await client.get("/api/auth/profile",
                         headers={"Authorization": f"Bearer {alice_session['accessToken']}"})
        after = await pool.fetchval(
            "SELECT last_seen_at FROM user_sessions WHERE session_id = $1", row["session_id"])
        r.check(after > before - __import__("datetime").timedelta(minutes=2),
                "an authenticated request refreshes last_seen_at")

        # ── 5. Logout closes the session ────────────────────────
        print("\n-- Logout --")
        await client.post("/api/auth/logout", json={"refreshToken": alice_session["refreshToken"]})

        closed = await pool.fetchrow(
            "SELECT logout_at, logout_reason FROM user_sessions WHERE session_id = $1",
            row["session_id"])
        r.check(closed["logout_at"] is not None, "logout stamps the sign-out time")
        r.check(closed["logout_reason"] == "USER_LOGOUT",
                f"the reason is recorded as USER_LOGOUT (got {closed['logout_reason']})")

        online = await client.get("/api/super-admin/activity/online", headers=admin_headers)
        listed = {u["Email"] for u in online.json()["users"]}
        r.check(alice["email"] not in listed, "alice no longer shows as online")

        logged = await pool.fetchval(
            """SELECT COUNT(*) FROM system_logs
               WHERE target_user_id = $1 AND action_type = 'LOGOUT'""", alice["user_id"])
        r.check(logged >= 1, "the logout is written to the audit trail")

        # ── 6. Login history ────────────────────────────────────
        print("\n-- Login history --")
        history = await client.get("/api/super-admin/activity/sessions",
                                   headers=admin_headers, params={"days": 1, "limit": 50})
        r.check(history.status_code == 200, "session history endpoint answers")
        items = history.json()["items"]
        alice_rows = [s for s in items if s["Email"] == alice["email"]]
        r.check(len(alice_rows) >= 1, "alice's session appears in the history")

        s = alice_rows[0]
        for field in ["LoginAt", "LogoutAt", "DurationSeconds", "IpAddress", "Device",
                      "AuthenticationType", "LogoutReason", "IsOnline"]:
            r.check(field in s, f"history row carries {field}")
        r.check(s["IsOnline"] is False, "alice's row is marked as ended")
        r.check(s["DurationSeconds"] >= 0, f"a duration is computed ({s['DurationSeconds']}s)")

        open_only = await client.get("/api/super-admin/activity/sessions",
                                     headers=admin_headers, params={"onlyOpen": True, "days": 1})
        r.check(all(x["IsOnline"] for x in open_only.json()["items"]),
                "the open-sessions filter returns only live sessions")

        # ── 7. SSO logins are tracked too ───────────────────────
        print("\n-- SSO sessions --")
        sid = await session_service.start_session(pool, sso_user, None, "SSO")
        r.check(sid is not None, "an SSO session can be opened")
        sso_row = await pool.fetchrow(
            "SELECT auth_type, logout_at FROM user_sessions WHERE session_id = $1", sid)
        r.check(sso_row["auth_type"] == "SSO", "the SSO session is labelled SSO")

        online = await client.get("/api/super-admin/activity/online", headers=admin_headers)
        sso_listed = [u for u in online.json()["users"] if u["Email"] == sso_user["email"]]
        r.check(len(sso_listed) == 1, "the SSO user appears in the online list")
        r.check(sso_listed[0]["AuthenticationType"] == "SSO",
                "the online row shows SSO as the authentication type")

        # ── 8. Password change closes every session ─────────────
        print("\n-- Revocation closes sessions --")
        open_before = await pool.fetchval(
            "SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND logout_at IS NULL",
            bob["user_id"])
        r.check(open_before == 2, f"bob has 2 open sessions before the change (got {open_before})")

        from app.services import account_service as accounts
        from app.services import audit_service
        await accounts.set_password(pool, bob["user_id"], "Zq4#tKmWv8",
                                    action=audit_service.PASSWORD_CHANGED)

        open_after = await pool.fetchval(
            "SELECT COUNT(*) FROM user_sessions WHERE user_id = $1 AND logout_at IS NULL",
            bob["user_id"])
        r.check(open_after == 0, f"a password change closes every session (got {open_after})")
        reason = await pool.fetchval(
            """SELECT logout_reason FROM user_sessions
               WHERE user_id = $1 ORDER BY id DESC LIMIT 1""", bob["user_id"])
        r.check(reason == "REVOKED", f"the sessions are marked REVOKED (got {reason})")

        # ── 9. Admin can terminate a live session ───────────────
        print("\n-- Admin session termination --")
        carol = await create_test_user(pool, "carol", password=PASSWORD_A)
        carol_session = await login(client, pool, carol["email"])
        carol_sid = await pool.fetchval(
            "SELECT session_id FROM user_sessions WHERE user_id = $1 AND logout_at IS NULL",
            carol["user_id"])

        term = await client.post(f"/api/super-admin/activity/sessions/{carol_sid}/terminate",
                                 headers=admin_headers)
        r.check(term.status_code == 200, "terminate succeeds", term.text[:120])
        after_term = await pool.fetchrow(
            "SELECT logout_at, logout_reason FROM user_sessions WHERE session_id = $1", carol_sid)
        r.check(after_term["logout_at"] is not None and after_term["logout_reason"] == "ADMIN_TERMINATED",
                "the session is closed and attributed to the administrator")
        tokens_left = await pool.fetchval(
            "SELECT COUNT(*) FROM refresh_tokens WHERE session_id = $1", carol_sid)
        r.check(tokens_left == 0, "the refresh token is deleted, so the session cannot be revived")

        audited = await pool.fetchval(
            """SELECT COUNT(*) FROM system_logs
               WHERE target_user_id = $1 AND action_type = 'SESSION_TERMINATED'""",
            carol["user_id"])
        r.check(audited >= 1, "the termination is audited")

        again = await client.post(f"/api/super-admin/activity/sessions/{carol_sid}/terminate",
                                  headers=admin_headers)
        r.check(again.status_code == 404, "terminating an already-closed session is a 404")

        # ── 10. Idle sweep ──────────────────────────────────────
        print("\n-- Idle sweep --")
        stale = await session_service.start_session(pool, alice, None, "EMAIL")
        await pool.execute(
            "UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP - INTERVAL '30 days' WHERE session_id = $1",
            stale)
        from app.jobs.session_sweeper import sweep_sessions
        result = await sweep_sessions()
        swept = await pool.fetchrow(
            "SELECT logout_at, logout_reason FROM user_sessions WHERE session_id = $1", stale)
        r.check(swept["logout_at"] is not None and swept["logout_reason"] == "IDLE_TIMEOUT",
                f"an abandoned session is closed as IDLE_TIMEOUT (swept {result['idleClosed']})")

        # ── 11. Audit log endpoint ──────────────────────────────
        print("\n-- Audit log --")
        audit = await client.get("/api/super-admin/activity/audit",
                                 headers=admin_headers, params={"days": 1, "limit": 200})
        r.check(audit.status_code == 200, "audit endpoint answers")
        actions = {e["action"] for e in audit.json()["items"]}
        for expected in ["LOGIN_SUCCESS", "LOGOUT", "SESSION_TERMINATED", "PASSWORD_CHANGED"]:
            r.check(expected in actions, f"{expected} appears in the audit log")

        sample = audit.json()["items"][0]
        for field in ["action", "timestamp", "performedBy", "result", "ipAddress", "device"]:
            r.check(field in sample, f"audit row carries {field}")

        filtered = await client.get("/api/super-admin/activity/audit", headers=admin_headers,
                                    params={"days": 1, "action": "LOGIN_SUCCESS", "limit": 50})
        r.check(all(e["action"] == "LOGIN_SUCCESS" for e in filtered.json()["items"]),
                "the action filter works")

        by_result = await client.get("/api/super-admin/activity/audit", headers=admin_headers,
                                     params={"days": 1, "result": "FAILURE", "limit": 50})
        r.check(all(e["result"] == "FAILURE" for e in by_result.json()["items"]),
                "the result filter works")

        searched = await client.get("/api/super-admin/activity/audit", headers=admin_headers,
                                    params={"days": 1, "q": "carol", "limit": 50})
        r.check(searched.status_code == 200 and len(searched.json()["items"]) >= 1,
                "free-text search works")

        # ── 12. Summary tiles ───────────────────────────────────
        print("\n-- Summary --")
        summary = await client.get("/api/super-admin/activity/summary", headers=admin_headers)
        r.check(summary.status_code == 200, "summary endpoint answers")
        data = summary.json()
        for field in ["onlineNow", "loginsLast24h", "distinctUsersLast24h",
                      "distinctUsersLast7d", "failedLoginsLast24h", "neverLoggedIn"]:
            r.check(field in data, f"summary carries {field}")
        r.check(data["loginsLast24h"] >= 4, f"logins counted ({data['loginsLast24h']})")

        # ── 13. Only Super Admins may look ──────────────────────
        print("\n-- Authorisation --")
        plain = create_access_token(alice["user_id"], alice["email"], "Supervisor", auth_type="EMAIL")
        pheaders = {"Authorization": f"Bearer {plain}"}
        for path in ["/api/super-admin/activity/online", "/api/super-admin/activity/sessions",
                     "/api/super-admin/activity/audit", "/api/super-admin/activity/summary"]:
            resp = await client.get(path, headers=pheaders)
            r.check(resp.status_code == 403, f"non-admin refused by {path}", f"got {resp.status_code}")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
