# tests/test_sso_unaffected.py
"""
Confirms the existing SSO implementation was not changed or broken.

The email password lifecycle must be invisible to SSO accounts: no expiry, no
history, no forced change, no OTP, and no application-managed password
controls. Their credentials and MFA stay with Entra ID.

Start the server first:
    ./venv/Scripts/python.exe run.py
"""

import asyncio
import inspect

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, Results, cleanup_all, close_db, create_test_user, db,
)

from app.auth.jwt_handler import create_access_token  # noqa: E402
from app.routers import sso as sso_router  # noqa: E402
from app.services import account_service as accounts  # noqa: E402

# The SSO surface as it existed before this work. Any change here would break
# the Azure AD redirect contract or the access-request workflow.
EXPECTED_SSO_ROUTES = {
    ("/api/sso/login", "GET"),
    ("/api/sso/callback", "GET"),
    ("/api/sso/azure-login", "POST"),
    ("/api/sso/request-access", "POST"),
    ("/api/sso/status/{user_id}", "GET"),
    ("/api/sso/access-requests", "GET"),
    ("/api/sso/access-requests/count", "GET"),
    ("/api/sso/access-requests/{request_id}", "PUT"),
}


async def run() -> int:
    r = Results("SSO unaffected")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    try:
        # ── 1. The SSO route table is unchanged ─────────────────
        print("\n-- SSO routes --")
        actual = {
            (route.path, method)
            for route in sso_router.router.routes
            for method in route.methods
            if method != "HEAD"
        }
        r.check(actual == EXPECTED_SSO_ROUTES,
                f"all {len(EXPECTED_SSO_ROUTES)} SSO routes present and unchanged",
                f"difference: {actual ^ EXPECTED_SSO_ROUTES}")

        # ── 2. Live SSO users in the real data are untouched ────
        print("\n-- Existing SSO accounts in the database --")
        stats = await pool.fetchrow("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE must_change_password) AS forced,
                   COUNT(*) FILTER (WHERE password_expires_at IS NOT NULL) AS with_expiry,
                   COUNT(*) FILTER (WHERE is_first_login) AS first_login,
                   COUNT(*) FILTER (WHERE password IS NOT NULL) AS with_password
            FROM users WHERE authentication_type = 'SSO'
        """)
        r.check(stats["total"] > 0, f"{stats['total']} SSO accounts classified")
        r.check(stats["forced"] == 0, "no SSO account is forced to change a DPR password")
        r.check(stats["with_expiry"] == 0, "no SSO account carries a DPR password expiry")
        r.check(stats["first_login"] == 0, "no SSO account is flagged for first-login setup")
        r.check(stats["with_password"] == 0, "no SSO account has a DPR password stored")

        misclassified = await pool.fetchval("""
            SELECT COUNT(*) FROM users
            WHERE (sso_provider IS NOT NULL AND authentication_type <> 'SSO')
               OR (sso_provider IS NULL AND authentication_type <> 'EMAIL')
        """)
        r.check(misclassified == 0, "every account's authentication_type matches how it signs in")

        # ── 3. The lifecycle logic exempts SSO ──────────────────
        print("\n-- Lifecycle logic --")
        sso_user = await create_test_user(pool, "sso1", auth_type="SSO", role="Site PM")
        row = await accounts.get_user_by_id(pool, sso_user["user_id"])

        r.check(accounts.auth_type_of(row) == "SSO", "classified as SSO")
        r.check(not accounts.is_email_user(row), "not treated as an email user")
        r.check(accounts.access_block_reason(row) is None,
                "never blocked by the password lifecycle")
        r.check(accounts.get_password_status(row)["state"] == "NOT_APPLICABLE",
                "password status reports NOT_APPLICABLE")
        r.check(accounts.compute_account_status(row) == "Active",
                "account status is Active, never 'Password Expired'")

        # Even with expiry columns forced on, an SSO row stays unblocked.
        await pool.execute(
            """UPDATE users SET must_change_password = TRUE, is_first_login = TRUE,
                                password_expires_at = CURRENT_TIMESTAMP - INTERVAL '10 days'
               WHERE user_id = $1""", sso_user["user_id"])
        await accounts.invalidate_access_state(sso_user["user_id"])
        poisoned = await accounts.get_user_by_id(pool, sso_user["user_id"])
        r.check(accounts.access_block_reason(poisoned) is None,
                "an SSO account stays unblocked even with expiry columns set")

        # ── 4. An SSO session is never gated ────────────────────
        print("\n-- SSO session --")
        token = create_access_token(sso_user["user_id"], sso_user["email"], "Site PM", auth_type="SSO")
        headers = {"Authorization": f"Bearer {token}"}
        profile = await client.get("/api/auth/profile", headers=headers)
        r.check(profile.status_code == 200,
                "an SSO token reaches the application despite the poisoned columns",
                f"got {profile.status_code} {profile.text[:120]}")
        r.check(profile.json()["user"]["AuthenticationType"] == "SSO",
                "profile reports the SSO authentication type")

        supervisors = await client.get("/api/auth/supervisors", headers=headers)
        r.check(supervisors.status_code == 200,
                "existing RBAC routes still answer an SSO session",
                f"got {supervisors.status_code}")

        # Reset the poisoned columns for the remaining checks.
        await pool.execute(
            """UPDATE users SET must_change_password = FALSE, is_first_login = FALSE,
                                password_expires_at = NULL WHERE user_id = $1""",
            sso_user["user_id"])
        await accounts.invalidate_access_state(sso_user["user_id"])

        # ── 5. Email-login endpoints refuse SSO accounts ────────
        print("\n-- Email endpoints refuse SSO accounts --")
        login = await client.post("/api/auth/email/login",
                                  json={"email": sso_user["email"], "password": PASSWORD_A})
        r.check(login.status_code == 400 and login.json()["detail"]["code"] == "SSO_ACCOUNT",
                "email login points an SSO user back at SSO", f"got {login.status_code}")

        forgot = await client.post("/api/auth/email/forgot-password",
                                   json={"email": sso_user["email"]})
        r.check(forgot.status_code == 200 and "challengeId" not in forgot.json(),
                "forgot-password issues no code for an SSO account, without revealing why")

        change = await client.post("/api/auth/email/password/change", headers=headers, json={
            "currentPassword": "x", "newPassword": "Kx7#mVpQz2", "confirmPassword": "Kx7#mVpQz2",
        })
        r.check(change.status_code == 400 and change.json()["detail"]["code"] == "SSO_ACCOUNT",
                "change-password refuses an SSO account", f"got {change.status_code}")

        recovery = await client.post("/api/auth/email/recovery-email", headers=headers,
                                     json={"recoveryEmail": "someone@gmail.test"})
        r.check(recovery.status_code == 400,
                "recovery email refuses an SSO account", f"got {recovery.status_code}")

        status = await client.get("/api/auth/email/password-status", headers=headers)
        r.check(status.status_code == 200 and status.json()["state"] == "NOT_APPLICABLE",
                "password-status reports NOT_APPLICABLE for SSO")

        # ── 6. Admin password controls refuse SSO accounts ──────
        print("\n-- Admin password controls refuse SSO accounts --")
        admin = await create_test_user(pool, "ssoadmin", password=PASSWORD_A, role="Super Admin")
        admin_token = create_access_token(admin["user_id"], admin["email"], "Super Admin",
                                          auth_type="EMAIL")
        aheaders = {"Authorization": f"Bearer {admin_token}"}
        sid = sso_user["user_id"]

        reset = await client.post(f"/api/super-admin/users/{sid}/reset-password",
                                  headers=aheaders, json={"newPassword": "Kx7#mVpQz2"})
        r.check(reset.status_code == 400 and reset.json()["detail"]["code"] == "SSO_ACCOUNT",
                "admin reset-password refuses an SSO account", f"got {reset.status_code}")

        force = await client.post(f"/api/super-admin/users/{sid}/force-password-change",
                                  headers=aheaders)
        r.check(force.status_code == 400 and force.json()["detail"]["code"] == "SSO_ACCOUNT",
                "admin force-password-change refuses an SSO account", f"got {force.status_code}")

        resend = await client.post(f"/api/super-admin/users/{sid}/resend-setup-notification",
                                   headers=aheaders)
        r.check(resend.status_code == 400,
                "admin setup notification refuses an SSO account", f"got {resend.status_code}")

        still_clean = await pool.fetchrow(
            "SELECT password, must_change_password, password_expires_at FROM users WHERE user_id = $1", sid)
        r.check(still_clean["password"] is None
                and still_clean["must_change_password"] is False
                and still_clean["password_expires_at"] is None,
                "the SSO row is untouched after every rejected admin action")

        # ── 7. The expiry job ignores SSO accounts ──────────────
        print("\n-- Expiry warning job --")
        source = inspect.getsource(
            __import__("app.jobs.password_expiry_notifier", fromlist=["notify_password_expiry"])
        )
        r.check("authentication_type = 'EMAIL'" in source,
                "the expiry warning job filters to EMAIL accounts in SQL")

        # ── 8. User Management reports SSO correctly ────────────
        print("\n-- User Management --")
        listing = await client.get("/api/super-admin/users",
                                   headers=aheaders, params={"authType": "SSO", "pageSize": 5})
        r.check(listing.status_code == 200, "user list filters by authentication type")
        items = listing.json()["items"]
        r.check(all(u["AuthenticationType"] == "SSO" for u in items),
                "the SSO filter returns only SSO accounts")
        r.check(all(u["MfaStatus"] == "Managed by SSO" for u in items),
                "SSO accounts report MFA as managed by SSO")
        r.check(all(u["PasswordStatusLabel"] == "Managed externally" for u in items),
                "SSO accounts report their password as managed externally")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
