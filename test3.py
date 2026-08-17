import asyncio
import asyncpg
import json

async def main():
    pool = await asyncpg.create_pool('postgresql://postgres:Nikitha@127.0.0.1/DPR')
    r = await pool.fetchrow("SELECT data_json FROM dpr_supervisor_entries WHERE id = 1500")
    if r:
        data = r['data_json']
        if isinstance(data, str):
            data = json.loads(data)
        for row in data.get("rows", []):
            print(f"Activity: {row.get('activity')}, Contractor: {row.get('contractor')}, isDeleted: {row.get('isDeleted')}")
    await pool.close()

asyncio.run(main())
