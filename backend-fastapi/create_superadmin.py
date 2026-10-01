import asyncio
import asyncpg
from app.auth.password import hash_password

async def main():
    conn = await asyncpg.connect(
        user="postgres",
        password="Nikitha",
        database="DPR",
        host="127.0.0.1",
        port=5432
    )

    email = "super@adani.com"
    hashed_pwd = hash_password("admin123")
    role = "Super Admin"
    name = "Super Admin"

    await conn.execute("""
        INSERT INTO users (name, email, password, role, authentication_type, is_active, is_first_login, must_change_password, account_status, password_changed_at, password_expires_at)
        VALUES ($2, $1, $4, $3, 'EMAIL', TRUE, FALSE, FALSE, 'ACTIVE', NOW(), NOW() + INTERVAL '30 days')
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
    """, email, name, role, hashed_pwd)

    print(f"User {email} created/updated successfully.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
