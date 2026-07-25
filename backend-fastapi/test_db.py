import asyncio
import os
from dotenv import load_dotenv

load_dotenv('.env')

from app.database import PoolWrapper
from app.routers.dpr_supervisor import get_entries_for_pm_review
import asyncpg

async def main():
    conn = await asyncpg.connect(
        user=os.getenv('DB_USER'), 
        password=os.getenv('DB_PASSWORD'), 
        database=os.getenv('DB_NAME'), 
        host=os.getenv('DB_HOST'),
        port=os.getenv('DB_PORT')
    )
    
    class FakePool(PoolWrapper):
        def __init__(self, conn):
            self.conn = conn
        async def fetch(self, q, *args):
            return await self.conn.fetch(q, *args)
        async def fetchrow(self, q, *args):
            return await self.conn.fetchrow(q, *args)
        async def fetchval(self, q, *args):
            return await self.conn.fetchval(q, *args)

    pool = FakePool(conn)
    
    current_user = {"userId": 56, "role": "Site PM"}
    try:
        entries = await get_entries_for_pm_review(projectId="3105", limit=100, offset=0, pool=pool, current_user=current_user)
        print("Returned entries length:", len(entries))
        if entries:
            print("First entry ID:", entries[0]["id"])
    except Exception as e:
        print("Error:", e)

    await conn.close()

asyncio.run(main())
