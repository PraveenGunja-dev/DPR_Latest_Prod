"""Create (or reset) one Supervisor, one Site PM and one PMAG login for testing in UAT.

Run from backend-fastapi with the UAT database selected in .env:
    python create_uat_test_users.py
    python create_uat_test_users.py --project-ids 3105 3106     # also assign these projects (P6 object ids)
    python create_uat_test_users.py --password "MyPass@123"

Re-running resets the password and unlocks the accounts, so it is safe to repeat.
"""
import argparse
import asyncio

import asyncpg

from app.auth.password import hash_password
from app.config import settings

USERS = [
    ("UAT Supervisor", "uat.supervisor@adani.com", "Supervisor"),
    ("UAT Site PM", "uat.sitepm@adani.com", "Site PM"),
    ("UAT PMAG", "uat.pmag@adani.com", "PMAG"),
]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--password", default="Uat@12345")
    parser.add_argument("--project-ids", nargs="*", type=int, default=[])
    args = parser.parse_args()

    conn = await asyncpg.connect(settings.get_database_url())
    hashed = hash_password(args.password)
    ids = {}

    for name, email, role in USERS:
        ids[role] = await conn.fetchval("""
            INSERT INTO users (name, email, password, role, authentication_type, is_active, is_first_login,
                               must_change_password, account_status, password_changed_at, password_expires_at)
            VALUES ($1, $2, $3, $4, 'EMAIL', TRUE, FALSE, FALSE, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days')
            ON CONFLICT (email) DO UPDATE SET
                password = EXCLUDED.password,
                role = EXCLUDED.role,
                authentication_type = 'EMAIL',
                is_active = TRUE,
                is_first_login = FALSE,
                must_change_password = FALSE,
                account_status = 'ACTIVE',
                password_changed_at = EXCLUDED.password_changed_at,
                password_expires_at = EXCLUDED.password_expires_at
            RETURNING user_id
        """, name, email, hashed, role)

    for pid in args.project_ids:
        # Supervisor and Site PM work from project_assignments; PMAG from pmag_project_assignments.
        for role in ("Supervisor", "Site PM"):
            await conn.execute(
                "INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2) "
                "ON CONFLICT (project_id, user_id) DO NOTHING", ids[role], pid)
        await conn.execute(
            "INSERT INTO pmag_project_assignments (user_id, project_id) VALUES ($1, $2) "
            "ON CONFLICT (user_id, project_id) DO NOTHING", ids["PMAG"], pid)

    await conn.close()

    print(f"{'Role':<12} {'Email':<28} Password")
    for _, email, role in USERS:
        print(f"{role:<12} {email:<28} {args.password}")
    if args.project_ids:
        print(f"Assigned projects: {args.project_ids}")
    else:
        print("No projects assigned - rerun with --project-ids <id> ... or assign them from Super Admin.")


if __name__ == "__main__":
    asyncio.run(main())
