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
    ("UAT Super Admin", "uat.superadmin@adani.com", "Super Admin"),
]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--password", default="Uat@12345")
    parser.add_argument("--project-ids", nargs="*", type=int, default=[])
    parser.add_argument("--only", choices=["supervisor", "sitepm", "pmag", "superadmin"],
                        help="create just this one login instead of all three")
    parser.add_argument("--all-projects", action="store_true", help="assign every project in the projects table")
    args = parser.parse_args()

    users = [u for u in USERS if not args.only or u[2].lower().replace(" ", "") == args.only]

    conn = await asyncpg.connect(settings.dsn)
    hashed = hash_password(args.password)
    ids = {}

    for name, email, role in users:
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

    if args.all_projects:
        args.project_ids = [r["object_id"] for r in await conn.fetch("SELECT object_id FROM projects")]

    for pid in args.project_ids:
        # Supervisor and Site PM work from project_assignments; PMAG from pmag_project_assignments.
        for role in ("Supervisor", "Site PM"):
            if role in ids:
                await conn.execute(
                    "INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2) "
                    "ON CONFLICT (project_id, user_id) DO NOTHING", ids[role], pid)
        if "PMAG" in ids:
            await conn.execute(
                "INSERT INTO pmag_project_assignments (user_id, project_id) VALUES ($1, $2) "
                "ON CONFLICT (user_id, project_id) DO NOTHING", ids["PMAG"], pid)

    await conn.close()

    print(f"{'Role':<12} {'Email':<28} Password")
    for _, email, role in users:
        print(f"{role:<12} {email:<28} {args.password}")
    if args.project_ids:
        print(f"Assigned {len(args.project_ids)} project(s)")
    else:
        print("No projects assigned - rerun with --project-ids <id> ... or assign them from Super Admin.")


if __name__ == "__main__":
    asyncio.run(main())
