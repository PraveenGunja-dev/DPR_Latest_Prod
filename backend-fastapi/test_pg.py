import asyncio
import asyncpg
import json
import os

async def run():
    try:
        conn = await asyncpg.connect(
            user="postgres",
            password="Prvn@3315",
            database="postgres",
            host="127.0.0.1",
            port=5431
        )
        rows = await conn.fetch("SELECT data_json, submission_date FROM dpr_submitted WHERE sheet_type='manpower_details_2' ORDER BY created_at DESC LIMIT 1")
        if not rows:
            rows = await conn.fetch("SELECT data_json, created_at FROM dpr_drafts WHERE sheet_type='manpower_details_2' ORDER BY created_at DESC LIMIT 1")
        
        if rows:
            print("Found entry with date:", rows[0][1])
            data = rows[0]['data_json']
            if isinstance(data, str):
                data = json.loads(data)
            print("Data preview:", json.dumps(data)[:1500])
        else:
            print("No data found")
        await conn.close()
    except Exception as e:
        print("Error:", e)

asyncio.run(run())
