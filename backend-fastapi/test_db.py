import asyncio
from app.database import get_pool

async def main():
    pool = await get_pool()
    try:
        rows = await pool.fetch('SELECT id, object_id, name FROM projects')
        print('PROJECTS:', [(r['id'], r['object_id'], r['name']) for r in rows])
    except Exception as e:
        print('Error projects:', e)
        
    try:
        rows2 = await pool.fetch('SELECT "Id", "ObjectId", "Name" FROM p6_projects')
        print('P6_PROJECTS:', [(r['Id'], r['ObjectId'], r['Name']) for r in rows2])
    except Exception as e:
        print('Error p6_projects:', e)

asyncio.run(main())
