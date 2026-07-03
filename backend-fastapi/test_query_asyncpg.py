import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(
        user='postgres',
        password='Nikitha',
        database='DPR',
        host='localhost',
        port=5432
    )
    
    ids = ['9712-cc-1430', '9712-cc-1440', '9712-cc-1490', '9712-cc-1500', '9712-cc-1510', '9712-cc-1600']
    
    for aid in ids:
        rows = await conn.fetch(f"SELECT activity_id, name FROM solar_activities WHERE activity_id ilike '%{aid}%'")
        for r in rows:
            print(f"{r['activity_id']} -> {r['name']}")
        
    await conn.close()

asyncio.run(main())
