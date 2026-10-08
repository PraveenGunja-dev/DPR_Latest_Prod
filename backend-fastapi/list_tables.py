import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from database import get_db

async def main():
    pool = await get_db()
    rows = await pool.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
    for r in rows:
        print(r['table_name'])
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
