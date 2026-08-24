# tests/conftest.py
"""
Shared helpers for the email-auth test scripts.

These run against a locally started server and the local DPR database. They
only ever create and delete accounts under @authtest.local, so no real user is
touched. Every helper that needs an OTP obtains it from otp_service.issue_otp's
return value - the plaintext is never read from a log or from the database,
because it is not stored there.

Run a script directly:

    cd backend-fastapi
    ./venv/Scripts/python.exe tests/test_password_policy.py
"""

import asyncio
import os
import sys

# Make `app` importable when a script is run directly from tests/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

TEST_DOMAIN = "authtest.local"
BASE_URL = os.getenv("TEST_BASE_URL", "http://127.0.0.1:3316")

# Policy-compliant passwords used across the suite.
PASSWORD_A = "Kx7#mVpQz2"
PASSWORD_B = "Rt4$wNbLy8"
PASSWORD_C = "Hj9!zTcMk3"
PASSWORD_D = "Qw2%vFdRn6"
PASSWORD_E = "Zp5^xGhBt1"
PASSWORD_F = "Lm8&yJkWs4"


class Results:
    """Minimal pass/fail tracker so each script can report and set an exit code."""

    def __init__(self, title: str):
        self.title = title
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def check(self, condition: bool, description: str, detail: str = "") -> bool:
        if condition:
            self.passed += 1
            print(f"  PASS  {description}")
        else:
            self.failed += 1
            self.failures.append(f"{description} {detail}".strip())
            print(f"  FAIL  {description} {detail}".rstrip())
        return bool(condition)

    def report(self) -> int:
        total = self.passed + self.failed
        print(f"\n{self.title}: {self.passed}/{total} passed")
        for failure in self.failures:
            print(f"   - {failure}")
        return 1 if self.failed else 0


async def db():
    """Open the application pool and return the wrapper the routers use."""
    from app.database import create_pool, get_pool

    await create_pool()
    return await get_pool()


async def close_db():
    from app.database import close_pool

    await close_pool()


async def create_test_user(
    pool,
    slug: str,
    *,
    password: str = PASSWORD_A,
    role: str = "Supervisor",
    auth_type: str = "EMAIL",
    must_change: bool = False,
    first_login: bool = False,
    is_active: bool = True,
) -> dict:
    """Create (or replace) a disposable account and return its row."""
    from app.auth.password import hash_password

    email = f"{slug}@{TEST_DOMAIN}"
    await delete_test_user(pool, email)

    row = await pool.fetchrow(
        """INSERT INTO users (name, email, password, role, is_active, authentication_type,
                              is_first_login, must_change_password, account_status,
                              password_changed_at, password_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   CURRENT_TIMESTAMP,
                   CURRENT_TIMESTAMP + INTERVAL '30 days')
           RETURNING user_id, name, email, role""",
        f"Test {slug}", email,
        hash_password(password) if auth_type == "EMAIL" else None,
        role, is_active, auth_type, first_login, must_change,
        "PENDING_SETUP" if first_login else ("ACTIVE" if is_active else "INACTIVE"),
    )
    if auth_type == "SSO":
        await pool.execute(
            "UPDATE users SET sso_provider = 'azure_ad', azure_oid = $1, password_expires_at = NULL WHERE user_id = $2",
            f"oid-{slug}", row["user_id"],
        )
    return dict(row)


async def delete_test_user(pool, email: str) -> None:
    await pool.execute("DELETE FROM users WHERE LOWER(email) = LOWER($1)", email)


async def cleanup_all(pool) -> int:
    """Remove every account this suite could have created."""
    rows = await pool.fetch(
        "DELETE FROM users WHERE email LIKE $1 RETURNING user_id", f"%@{TEST_DOMAIN}"
    )
    return len(rows)


async def backdate_password(pool, user_id: int, days_ago: int) -> None:
    """Age a password so expiry and warning thresholds can be exercised."""
    await pool.execute(
        """UPDATE users
           SET password_changed_at = CURRENT_TIMESTAMP - ($1 || ' days')::interval,
               password_expires_at = CURRENT_TIMESTAMP - ($1 || ' days')::interval
                                     + ($2 || ' days')::interval
           WHERE user_id = $3""",
        str(days_ago), str(30), user_id,
    )
    from app.services.account_service import invalidate_access_state

    await invalidate_access_state(user_id)
