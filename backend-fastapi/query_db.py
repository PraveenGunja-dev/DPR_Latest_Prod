import asyncio
import json
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    conn = await asyncpg.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=os.getenv("DB_PORT", 5432),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "Nikitha"),
        database=os.getenv("DB_NAME", "DPR")
    )
    rows = await conn.fetch("SELECT id, entry_date, previous_date, sheet_type, data_json FROM dpr_supervisor_entries WHERE sheet_type = 'manpower_details_2' ORDER BY entry_date DESC LIMIT 5")
    for row in rows:
        print(f"ID: {row['id']}, Date: {row['entry_date']}")
        data = row['data_json']
        if isinstance(data, str): data = json.loads(data)
        for r in data.get("rows", []):
            if r.get("activity") == "33KV Line":
                print(f"  Contractor: {r.get('contractor')}")
                print(f"  Agreed: {r.get('agreedValues')}")
                print(f"  Statuses: {r.get('_cellStatuses')}")
    await conn.close()

asyncio.run(main())
