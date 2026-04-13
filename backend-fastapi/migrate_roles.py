import asyncio
import logging
import sys
import os

sys.path.append(os.getcwd())

from app.database import create_pool, close_pool

async def migrate_roles():
    pool = None
    try:
        pool = await create_pool()
        
        print("Starting role normalization with constraint update...")
        
        # 1. Drop old constraint
        try:
            await pool.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
            print("Dropped old role check constraint.")
        except Exception as e:
            print(f"Non-fatal error dropping constraint: {e}")

        # 2. Update roles
        # supervisor -> Supervisor
        res1 = await pool.execute("UPDATE users SET role = 'Supervisor' WHERE role = 'supervisor'")
        print(f"Migrated 'supervisor' to 'Supervisor': {res1}")
        
        # admin -> Super Admin
        res2 = await pool.execute("UPDATE users SET role = 'Super Admin' WHERE role IN ('admin', 'superadmin', 'SuperAdmin')")
        print(f"Migrated administrative roles to 'Super Admin': {res2}")

        # sitepm -> Site PM
        res3 = await pool.execute("UPDATE users SET role = 'Site PM' WHERE role IN ('sitepm', 'SitePM', 'site pm')")
        print(f"Migrated Site PM variations: {res3}")
        
        # 3. Add new constraint with strictly 4 primary roles + pending_approval
        allowed_roles = ["Supervisor", "Site PM", "PMAG", "Super Admin", "pending_approval"]
        roles_str = ", ".join([f"'{r}'" for r in allowed_roles])
        
        await pool.execute(f"ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ({roles_str}))")
        print("Added new role check constraint.")

        # 4. List final roles
        roles = await pool.fetch('SELECT DISTINCT role FROM users')
        print("\nFinal Roles in DB:")
        for r in roles:
            print(f"- {r['role']}")
            
        print("\nNormalization complete.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        if pool:
            await close_pool()

if __name__ == "__main__":
    asyncio.run(migrate_roles())
