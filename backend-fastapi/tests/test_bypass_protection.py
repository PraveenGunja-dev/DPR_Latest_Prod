# tests/test_bypass_protection.py
"""
Verifies that the password lifecycle cannot be bypassed through direct API
calls, forged tokens or a manipulated frontend.

Every assertion here calls the API directly with curl-equivalent requests -
exactly what an attacker skipping the UI would do.

Start the server first:
    ./venv/Scripts/python.exe run.py
"""

import asyncio

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, PASSWORD_B, Results,
    backdate_password, cleanup_all, close_db, create_test_user, db,
)

from app.auth.jwt_handler import (  # noqa: E402
    SCOPE_PASSWORD_CHALLENGE, create_access_token, create_challenge_token,
)
from app.auth.password import hash_password  # noqa: E402

# Representative business routes an attacker would target.
BUSINESS_ROUTES = [
    "/api/auth/profile",
    "/api/projects",
    "/api/super-admin/users",
    "/api/auth/supervisors",
]


async def known_otp(pool, user_id: int, purpose: str, code: str = "424242") -> tuple[str, str]:
    """
    Plant a known code on the live challenge the server just created.

    The server stores only a bcrypt hash, so a test cannot recover the emailed
    digits. `code` is a parameter so two accounts can be given *different*
    codes - otherwise a cross-user replay test would compare identical strings
    and prove nothing.
    """
    row = await pool.fetchrow(
        """SELECT challenge_id FROM auth_otps
           WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
           ORDER BY id DESC LIMIT 1""",
        user_id, purpose,
    )
    if not row:
        raise AssertionError(f"No live {purpose} challenge for user {user_id}")
    await pool.execute("UPDATE auth_otps SET otp_hash = $1 WHERE challenge_id = $2",
                       hash_password(code), row["challenge_id"])
    return row["challenge_id"], code


async def run() -> int:
    r = Results("Bypass protection")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    try:
        # ── 1. Challenge token cannot act as an access token ────
        print("\n-- Challenge token cannot reach the application --")
        newbie = await create_test_user(pool, "byp1", password=PASSWORD_A,
                                        must_change=True, first_login=True)
        nid = newbie["user_id"]

        resp = await client.post("/api/auth/email/login",
                                 json={"email": newbie["email"], "password": PASSWORD_A})
        challenge_token = resp.json()["challengeToken"]
        headers = {"Authorization": f"Bearer {challenge_token}"}

        for route in BUSINESS_ROUTES:
            got = await client.get(route, headers=headers)
            r.check(got.status_code in (401, 403),
                    f"challenge token refused by {route}", f"got {got.status_code}")

        # ── 2. A hand-forged challenge token is equally useless ─
        print("\n-- Forged scoped token --")
        forged = create_challenge_token(nid, newbie["email"], purpose="ANYTHING",
                                        scope=SCOPE_PASSWORD_CHALLENGE)
        got = await client.get("/api/auth/profile", headers={"Authorization": f"Bearer {forged}"})
        r.check(got.status_code in (401, 403),
                "a validly signed non-access token is still refused", f"got {got.status_code}")

        # ── 3. No session exists before the OTP is verified ─────
        print("\n-- No session before OTP verification --")
        active = await create_test_user(pool, "byp2", password=PASSWORD_A)
        aid = active["user_id"]
        login = await client.post("/api/auth/email/login",
                                  json={"email": active["email"], "password": PASSWORD_A})
        body = login.json()
        r.check("accessToken" not in body and "refreshToken" not in body,
                "login response carries no tokens before the OTP step")
        sessions = await pool.fetchval("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1", aid)
        r.check(sessions == 0, "no refresh token is persisted before the OTP step")

        # Skipping straight to a protected route with the challenge id is futile.
        got = await client.get("/api/auth/profile",
                               headers={"Authorization": f"Bearer {body['challengeId']}"})
        r.check(got.status_code in (401, 403), "the challenge id is not a bearer token")

        # ── 4. Setup endpoint requires a real challenge token ───
        print("\n-- Password setup requires a valid challenge --")
        no_token = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": "not-a-token", "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(no_token.status_code == 401, "garbage challenge token rejected")

        access_only = create_access_token(nid, newbie["email"], "Supervisor")
        wrong_scope = await client.post("/api/auth/email/password/setup", json={
            "challengeToken": access_only, "newPassword": PASSWORD_B, "confirmPassword": PASSWORD_B,
        })
        r.check(wrong_scope.status_code == 401,
                "an access token cannot be used as a setup challenge", f"got {wrong_scope.status_code}")

        # ── 5. An existing session dies when the password expires
        print("\n-- Live session is cut off by expiry --")
        victim = await create_test_user(pool, "byp3", password=PASSWORD_A)
        vid = victim["user_id"]

        login = await client.post("/api/auth/email/login",
                                  json={"email": victim["email"], "password": PASSWORD_A})
        cid, code = await known_otp(pool, vid, "LOGIN")
        session = (await client.post("/api/auth/email/login/verify",
                                     json={"challengeId": cid, "otp": code})).json()
        token = session["accessToken"]
        vheaders = {"Authorization": f"Bearer {token}"}

        ok = await client.get("/api/auth/profile", headers=vheaders)
        r.check(ok.status_code == 200, "the session works while the password is current")

        # Age the password out from under the live token.
        await backdate_password(pool, vid, 31)

        blocked = await client.get("/api/projects", headers=vheaders)
        r.check(blocked.status_code == 403,
                "the same token is refused once the password expires", f"got {blocked.status_code}")
        detail = blocked.json().get("detail", {})
        r.check(detail.get("code") == "PASSWORD_EXPIRED",
                f"the block carries a machine code ({detail.get('code')})")

        # The password screens stay reachable, or the user could never recover.
        allowed = await client.get("/api/auth/email/password-status", headers=vheaders)
        r.check(allowed.status_code == 200, "password-status stays reachable while blocked")

        # ── 6. Refresh cannot outlive the expiry ────────────────
        print("\n-- Refresh token cannot outlive an expiry --")
        refreshed = await client.post("/api/auth/refresh-token",
                                      json={"refreshToken": session["refreshToken"]})
        r.check(refreshed.status_code in (403, 423),
                "refreshing an expired account is refused", f"got {refreshed.status_code}")
        remaining = await pool.fetchval("SELECT COUNT(*) FROM refresh_tokens WHERE token = $1",
                                        session["refreshToken"])
        r.check(remaining == 0, "the refused refresh token is deleted")

        # ── 7. Forced change blocks the same way ────────────────
        print("\n-- Forced change blocks application access --")
        forced = await create_test_user(pool, "byp4", password=PASSWORD_A)
        fid = forced["user_id"]
        login = await client.post("/api/auth/email/login",
                                  json={"email": forced["email"], "password": PASSWORD_A})
        cid, code = await known_otp(pool, fid, "LOGIN")
        fsession = (await client.post("/api/auth/email/login/verify",
                                      json={"challengeId": cid, "otp": code})).json()
        fheaders = {"Authorization": f"Bearer {fsession['accessToken']}"}

        from app.services import account_service as accounts
        await accounts.mark_must_change_password(pool, fid)

        blocked = await client.get("/api/projects", headers=fheaders)
        r.check(blocked.status_code == 403
                and blocked.json()["detail"]["code"] == "PASSWORD_CHANGE_REQUIRED",
                "an admin-forced change blocks the live session immediately",
                f"got {blocked.status_code}")

        # ── 8. Deactivation takes effect on a live session ──────
        print("\n-- Deactivation cuts off a live session --")
        await pool.execute(
            "UPDATE users SET is_active = FALSE, account_status = 'INACTIVE' WHERE user_id = $1", fid)
        await accounts.invalidate_access_state(fid)
        blocked = await client.get("/api/projects", headers=fheaders)
        r.check(blocked.status_code in (401, 403),
                "a deactivated account cannot use its existing token", f"got {blocked.status_code}")

        # ── 9. Swagger's password grant honours the same gates ──
        print("\n-- Swagger password grant is gated too --")
        swagger = await client.post("/api/auth/swagger-login",
                                    data={"username": victim["email"], "password": PASSWORD_A})
        r.check(swagger.status_code == 403,
                "swagger-login refuses an expired account rather than issuing a token",
                f"got {swagger.status_code}")

        # ── 10. OTP challenge is bound to its owner ─────────────
        print("\n-- Challenge ownership --")
        one = await create_test_user(pool, "byp5", password=PASSWORD_A)
        two = await create_test_user(pool, "byp6", password=PASSWORD_A)

        await client.post("/api/auth/email/login", json={"email": one["email"], "password": PASSWORD_A})
        cid_one, code_one = await known_otp(pool, one["user_id"], "LOGIN", code="111222")

        await client.post("/api/auth/email/login", json={"email": two["email"], "password": PASSWORD_A})
        cid_two, code_two = await known_otp(pool, two["user_id"], "LOGIN", code="333444")

        crossed = await client.post("/api/auth/email/login/verify",
                                    json={"challengeId": cid_one, "otp": code_two})
        r.check(crossed.status_code == 400,
                "another user's code cannot satisfy this challenge", f"got {crossed.status_code}")

        session_one = await client.post("/api/auth/email/login/verify",
                                        json={"challengeId": cid_one, "otp": code_one})
        r.check(session_one.status_code == 200, "the correct pairing still works")
        issued_for = session_one.json()["user"]["Email"]
        r.check(issued_for == one["email"],
                f"the session belongs to the challenge owner ({issued_for})")

        # A change-password challenge belonging to someone else is refused.
        headers_one = {"Authorization": f"Bearer {session_one.json()['accessToken']}"}
        await client.post("/api/auth/email/login",
                          json={"email": two["email"], "password": PASSWORD_A})
        cid_two, code_two = await known_otp(pool, two["user_id"], "LOGIN", code="555666")
        stolen = await client.post("/api/auth/email/password/change/verify",
                                   headers=headers_one,
                                   json={"challengeId": cid_two, "otp": code_two})
        r.check(stolen.status_code in (400, 403),
                "a challenge from another account is refused", f"got {stolen.status_code}")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
