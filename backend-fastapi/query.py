import asyncio
import asyncpg
import json

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Nikitha@localhost:5432/DPR')
    query = '''
        SELECT id, description, block, planned_start, planned_finish, extra_data 
        FROM dpr_custom_activities 
        WHERE sheet_type = 'wind_stone_column' 
        ORDER BY id DESC LIMIT 5;
    '''
    rows = await conn.fetch(query)
    
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"Desc: {row['description']}")
        print(f"Block: {row['block']}")
        print(f"Start: {row['planned_start']}")
        print(f"Finish: {row['planned_finish']}")
        print("-" * 30)
        
    await conn.close()

asyncio.run(main())
