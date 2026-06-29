import asyncio
import asyncpg
from dotenv import load_dotenv
import os

load_dotenv()

async def main():
    db_url = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    print("Connecting to:", db_url)
    pool = await asyncpg.create_pool(db_url)
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM solar_activities WHERE activity_id='ACL1-CC-1000' LIMIT 1")
        if row:
            for k, v in dict(row).items():
                print(f"{k}: {v}")
        else:
            print("Not found in solar_activities")
            
        row2 = await conn.fetchrow("SELECT * FROM activities WHERE activity_id='ACL1-CC-1000' LIMIT 1")
        if row2:
            print("\nFound in activities table:")
            for k, v in dict(row2).items():
                print(f"{k}: {v}")

asyncio.run(main())
