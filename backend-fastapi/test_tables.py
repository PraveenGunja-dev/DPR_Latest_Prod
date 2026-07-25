import asyncio
import asyncpg
import json

async def run():
    try:
        conn = await asyncpg.connect(
            user="postgres",
            password="Prvn@3315",
            database="postgres",
            host="127.0.0.1",
            port=5431
        )
        rows = await conn.fetch("SELECT data_json, created_at FROM dpr_supervisor_entries WHERE sheet_type='manpower_details_2' ORDER BY created_at DESC LIMIT 1")
        if rows:
            print("Found entry with created_at:", rows[0][1])
            data = rows[0]['data_json']
            if isinstance(data, str):
                data = json.loads(data)
            print("Data preview:", json.dumps(data, indent=2))
        else:
            print("No data found in dpr_supervisor_entries")
                
        await conn.close()
    except Exception as e:
        print("Error:", e)

asyncio.run(run())
