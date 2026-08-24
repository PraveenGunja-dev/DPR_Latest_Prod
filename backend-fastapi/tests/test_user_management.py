# tests/test_user_management.py
"""
Super Admin User Management: the paginated listing, its filters and sorting,
and every administrator security action.

Start the server first:
    ./venv/Scripts/python.exe run.py
"""

import asyncio

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, PASSWORD_B, Results,
    backdate_password, cleanup_all, close_db, create_test_user, db,
)

from app.auth.jwt_handler import create_access_token  # noqa: E402
from app.services import account_service as accounts  # noqa: E402


async def run() -> int:
    r = Results("User management")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    try:
        admin = await create_test_user(pool, "umadmin", password=PASSWORD_A, role="Super Admin")
        headers = {"Authorization": f"Bearer {create_access_token(admin['user_id'], admin['email'], 'Super Admin', auth_type='EMAIL')}"}

        # A spread of states to exercise the status column and the filters.
        normal = await create_test_user(pool, "umnormal", password=PASSWORD_A, role="Supervisor")
        pending = await create_test_user(pool, "umpending", password=PASSWORD_A,
                                         role="Site PM", must_change=True, first_login=True)
        expired = await create_test_user(pool, "umexpired", password=PASSWORD_A, role="PMAG")
        await backdate_password(pool, expired["user_id"], 35)
        inactive = await create_test_user(pool, "uminactive", password=PASSWORD_A, is_active=False)
        sso = await create_test_user(pool, "umsso", auth_type="SSO", role="Supervisor")

        # ── 1. Listing shape and columns ────────────────────────
        print("\n-- Listing --")
        resp = await client.get("/api/super-admin/users", headers=headers,
                                params={"q": "authtest", "pageSize": 50})
        r.check(resp.status_code == 200, "listing returns 200", resp.text[:150])
        body = resp.json()
        r.check(all(k in body for k in ["items", "total", "page", "pageSize", "totalPages"]),
                "response is paginated")

        by_email = {u["Email"]: u for u in body["items"]}
        r.check(len(by_email) >= 6, f"all test accounts listed ({len(by_email)})")

        required = [
            "Name", "Email", "AuthenticationType", "Role", "AccountStatus", "RecoveryEmail",
            "MfaStatus", "PasswordStatusLabel", "PasswordExpiresAt", "LastLoginAt", "CreatedAt",
        ]
        sample = by_email[normal["email"]]
        for column in required:
            r.check(column in sample, f"column {column} present")
        r.check("password" not in str(sample).lower() or "PasswordStatusLabel" in sample,
                "no password hash is exposed in the listing")
        r.check("password_history" not in sample and "Password" not in [k for k in sample if k == "Password"],
                "no password history is exposed in the listing")

        # ── 2. Computed statuses ────────────────────────────────
        print("\n-- Account statuses --")
        r.check(by_email[normal["email"]]["AccountStatus"] == "Active", "healthy account reads Active")
        r.check(by_email[pending["email"]]["AccountStatus"] == "Pending Setup",
                f"first-login account reads Pending Setup (got {by_email[pending['email']]['AccountStatus']})")
        r.check(by_email[expired["email"]]["AccountStatus"] == "Password Expired",
                f"expired account reads Password Expired (got {by_email[expired['email']]['AccountStatus']})")
        r.check(by_email[inactive["email"]]["AccountStatus"] == "Inactive",
                "deactivated account reads Inactive")

        # Lock one account and confirm the derived status follows.
        for _ in range(5):
            await client.post("/api/auth/email/login",
                              json={"email": normal["email"], "password": "Wrong9!Pass"})
        again = await client.get("/api/super-admin/users", headers=headers,
                                 params={"q": "umnormal", "pageSize": 5})
        locked_row = again.json()["items"][0]
        r.check(locked_row["AccountStatus"] == "Temporarily Locked",
                f"locked account reads Temporarily Locked (got {locked_row['AccountStatus']})")
        r.check(locked_row["IsLocked"] is True and locked_row["FailedLoginAttempts"] == 5,
                "lock details reported")

        # ── 3. Auth type reporting ──────────────────────────────
        print("\n-- Authentication type --")
        r.check(by_email[sso["email"]]["AuthenticationType"] == "SSO", "SSO account labelled SSO")
        r.check(by_email[normal["email"]]["AuthenticationType"] == "EMAIL", "email account labelled EMAIL")
        r.check(by_email[normal["email"]]["MfaStatus"] == "OTP Enabled",
                "email accounts report OTP Enabled")

        # ── 4. Filters ──────────────────────────────────────────
        print("\n-- Filters --")
        by_role = await client.get("/api/super-admin/users", headers=headers,
                                   params={"q": "authtest", "role": "PMAG", "pageSize": 50})
        r.check(all(u["Role"] == "PMAG" for u in by_role.json()["items"]), "role filter applied")

        by_auth = await client.get("/api/super-admin/users", headers=headers,
                                   params={"q": "authtest", "authType": "EMAIL", "pageSize": 50})
        r.check(all(u["AuthenticationType"] == "EMAIL" for u in by_auth.json()["items"]),
                "auth-type filter applied")

        by_status = await client.get("/api/super-admin/users", headers=headers,
                                     params={"q": "authtest", "status": "Password Expired", "pageSize": 50})
        returned = by_status.json()["items"]
        r.check(len(returned) >= 1 and all(u["AccountStatus"] == "Password Expired" for u in returned),
                f"derived status filter applied ({len(returned)} rows)")

        search = await client.get("/api/super-admin/users", headers=headers,
                                  params={"q": "umexpired", "pageSize": 50})
        r.check(len(search.json()["items"]) == 1, "search narrows to a single match")

        # ── 5. Sorting and paging ───────────────────────────────
        print("\n-- Sorting and paging --")
        asc = await client.get("/api/super-admin/users", headers=headers,
                               params={"q": "authtest", "sort": "name", "order": "asc", "pageSize": 50})
        desc = await client.get("/api/super-admin/users", headers=headers,
                                params={"q": "authtest", "sort": "name", "order": "desc", "pageSize": 50})
        asc_names = [u["Name"] for u in asc.json()["items"]]
        desc_names = [u["Name"] for u in desc.json()["items"]]
        r.check(asc_names == sorted(asc_names), "ascending sort applied")
        r.check(desc_names == list(reversed(asc_names)), "descending sort reverses the order")

        page1 = await client.get("/api/super-admin/users", headers=headers,
                                 params={"q": "authtest", "page": 1, "pageSize": 2})
        page2 = await client.get("/api/super-admin/users", headers=headers,
                                 params={"q": "authtest", "page": 2, "pageSize": 2})
        p1, p2 = page1.json(), page2.json()
        r.check(len(p1["items"]) == 2 and p1["page"] == 1, "page one holds pageSize rows")
        r.check({u["Email"] for u in p1["items"]}.isdisjoint({u["Email"] for u in p2["items"]}),
                "pages do not overlap")
        r.check(p1["total"] == p2["total"] and p1["total"] > 2, f"total is the full count ({p1['total']})")

        # ── 6. Admin actions ────────────────────────────────────
        print("\n-- Admin actions --")
        target = normal["user_id"]

        unlock = await client.post(f"/api/super-admin/users/{target}/unlock", headers=headers)
        r.check(unlock.status_code == 200, "unlock succeeds")
        state = await pool.fetchrow(
            "SELECT locked_until, failed_login_attempts FROM users WHERE user_id = $1", target)
        r.check(state["locked_until"] is None and state["failed_login_attempts"] == 0,
                "unlock clears the lock and the counter")

        force = await client.post(f"/api/super-admin/users/{target}/force-password-change", headers=headers)
        r.check(force.status_code == 200, "force password change succeeds")
        r.check(await pool.fetchval("SELECT must_change_password FROM users WHERE user_id = $1", target) is True,
                "must_change_password set")
        r.check(await pool.fetchval("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1", target) == 0,
                "sessions revoked by a forced change")

        weak_reset = await client.post(f"/api/super-admin/users/{target}/reset-password",
                                       headers=headers, json={"newPassword": "short1!"})
        r.check(weak_reset.status_code == 400, "admin reset enforces the password policy")

        reset = await client.post(f"/api/super-admin/users/{target}/reset-password",
                                  headers=headers, json={"newPassword": PASSWORD_B})
        r.check(reset.status_code == 200, "admin reset succeeds", reset.text[:150])
        r.check("password" not in reset.json() and PASSWORD_B not in reset.text,
                "the reset response never echoes the password back")
        r.check(await pool.fetchval("SELECT must_change_password FROM users WHERE user_id = $1", target) is True,
                "a reset still requires the user to choose their own password")

        history = await pool.fetchval("SELECT password_history FROM users WHERE user_id = $1", target)
        r.check(len(history) >= 1 and all(e["hash"].startswith("$2") for e in history),
                "the replaced password is pushed into the history as a hash")

        # ── 7. Security events ──────────────────────────────────
        print("\n-- Security events --")
        events = await client.get(f"/api/super-admin/users/{target}/security-events", headers=headers)
        r.check(events.status_code == 200, "security events endpoint answers")
        payload = events.json()
        actions = {e["action"] for e in payload["events"]}
        for expected in ["LOGIN_FAILED", "ACCOUNT_LOCKED", "ACCOUNT_UNLOCKED",
                         "FORCE_PASSWORD_CHANGE", "PASSWORD_RESET"]:
            r.check(expected in actions, f"{expected} appears in the timeline")

        sample_event = payload["events"][0]
        for field in ["action", "timestamp", "ipAddress", "device", "result", "performedBy"]:
            r.check(field in sample_event, f"event carries {field}")

        r.check(PASSWORD_B not in events.text and PASSWORD_A not in events.text,
                "no password appears anywhere in the security timeline")

        # ── 8. Create user applies the lifecycle ────────────────
        print("\n-- Create user --")
        created = await client.post("/api/super-admin/users", headers=headers, json={
            "name": "Created User", "email": "umcreated@authtest.local",
            "password": PASSWORD_B, "role": "Supervisor",
        })
        r.check(created.status_code == 201, "user created", created.text[:150])
        r.check(created.json().get("requiresFirstLoginSetup") is True,
                "the response flags that first-login setup is required")

        new_row = await pool.fetchrow(
            """SELECT authentication_type, is_first_login, must_change_password, account_status
               FROM users WHERE email = 'umcreated@authtest.local'""")
        r.check(new_row["authentication_type"] == "EMAIL", "new user is an EMAIL account")
        r.check(new_row["is_first_login"] is True, "is_first_login set")
        r.check(new_row["must_change_password"] is True, "must_change_password set")
        r.check(new_row["account_status"] == "PENDING_SETUP", "status is PENDING_SETUP")

        weak_create = await client.post("/api/super-admin/users", headers=headers, json={
            "name": "Weak User", "email": "umweak@authtest.local",
            "password": "abc123", "role": "Supervisor",
        })
        r.check(weak_create.status_code == 400, "create rejects a password below policy")

        # ── 9. Deactivation keeps status in step ────────────────
        print("\n-- Activate / deactivate --")
        deact = await client.put(f"/api/super-admin/users/{target}", headers=headers,
                                 json={"isActive": False})
        r.check(deact.status_code == 200, "deactivate succeeds")
        row = await pool.fetchrow("SELECT is_active, account_status FROM users WHERE user_id = $1", target)
        r.check(row["is_active"] is False and row["account_status"] == "INACTIVE",
                "account_status follows the is_active flag")

        react = await client.put(f"/api/super-admin/users/{target}", headers=headers,
                                 json={"isActive": True})
        r.check(react.status_code == 200, "reactivate succeeds")
        row = await pool.fetchrow("SELECT is_active, account_status FROM users WHERE user_id = $1", target)
        r.check(row["is_active"] is True and row["account_status"] == "ACTIVE",
                "reactivation restores ACTIVE")

        # ── 10. Role change is audited ──────────────────────────
        print("\n-- Role change --")
        role_change = await client.put(f"/api/super-admin/users/{target}", headers=headers,
                                       json={"role": "Site PM"})
        r.check(role_change.status_code == 200, "role change succeeds")
        logged = await pool.fetchval(
            """SELECT COUNT(*) FROM system_logs
               WHERE target_user_id = $1 AND action_type = 'ROLE_CHANGED'""", target)
        r.check(logged >= 1, "role change recorded in the audit trail")

        # ── 11. Non-admins cannot reach any of it ───────────────
        print("\n-- Authorisation --")
        plain = create_access_token(normal["user_id"], normal["email"], "Site PM", auth_type="EMAIL")
        pheaders = {"Authorization": f"Bearer {plain}"}
        for path, method in [
            ("/api/super-admin/users", "GET"),
            (f"/api/super-admin/users/{target}/force-password-change", "POST"),
            (f"/api/super-admin/users/{target}/unlock", "POST"),
            (f"/api/super-admin/users/{target}/security-events", "GET"),
        ]:
            resp = await (client.get(path, headers=pheaders) if method == "GET"
                          else client.post(path, headers=pheaders))
            r.check(resp.status_code == 403, f"non-admin refused by {method} {path}",
                    f"got {resp.status_code}")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
