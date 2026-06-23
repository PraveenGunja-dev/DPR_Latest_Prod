import asyncio
from app.database import get_pool

async def main():
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT object_id, parent_object_id, name, code 
        FROM solar_wbs 
        LIMIT 10
    """)
    for r in rows:
        print(dict(r))

if __name__ == '__main__':
    asyncio.run(main())
