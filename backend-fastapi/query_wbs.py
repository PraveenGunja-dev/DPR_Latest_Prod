import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Nikitha@localhost/DPR')
    rows = await conn.fetch('SELECT DISTINCT "wbsName" FROM p6_activities WHERE project_type=\'wind\' LIMIT 50')
    print("WBS Names:")
    for r in rows:
        print(r[0])
        
    await conn.close()

asyncio.run(main())
