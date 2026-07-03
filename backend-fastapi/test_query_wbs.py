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
    
    rows = await conn.fetch("SELECT activity_id, name, wbs_name FROM solar_activities WHERE activity_id ilike '%9712-cc-1430%' OR activity_id ilike '%9712-cc-1180%'")
    for r in rows:
        print(f"{r['activity_id']} -> {r['wbs_name']}")
        
    await conn.close()

asyncio.run(main())
