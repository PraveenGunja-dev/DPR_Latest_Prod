import asyncio
from app.database import get_db

async def main():
    pool_gen = get_db()
    pool = await anext(pool_gen)
    res = await pool.fetch("SELECT * FROM solar_activities WHERE activity_id ilike '%9712-cc-1060%'")
    print('Length:', len(res))
    if len(res) > 0:
        print(dict(res[0]))
    
    # Let's also check if it exists in P6 API cache or activities table
    res2 = await pool.fetch("SELECT * FROM activities WHERE activity_id ilike '%9712-cc-1060%'")
    print('Length in activities table:', len(res2))
    
    await pool.pool.close()

asyncio.run(main())
