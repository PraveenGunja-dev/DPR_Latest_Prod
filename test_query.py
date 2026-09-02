import asyncio
import asyncpg
import json

async def main():
    conn = await asyncpg.connect(user='postgres', password='Prvn@3315', database='DPR', host='127.0.0.1')
    rows = await conn.fetch('''
        SELECT id, supervisor_id, project_id, status, entry_date, updated_at, data_json 
        FROM dpr_supervisor_entries 
        WHERE sheet_type = 'manpower_details_2' 
        ORDER BY updated_at DESC LIMIT 10
    ''')
    for row in rows:
        data = json.loads(row["data_json"]) if isinstance(row["data_json"], str) else row["data_json"]
        if not data or not data.get("rows"): continue
        # Check if any row has contractor or agreedValues
        has_data = any(bool(r.get("contractor")) or bool(r.get("agreedValues")) for r in data["rows"])
        if has_data:
            print(f"ID: {row['id']} | Proj: {row['project_id']} | Sup: {row['supervisor_id']} | Date: {row['entry_date']} | Updated: {row['updated_at']} | HAS DATA!")
            print(json.dumps(data["rows"][0], indent=2))
        else:
            print(f"ID: {row['id']} | Proj: {row['project_id']} | Sup: {row['supervisor_id']} | Date: {row['entry_date']} | Updated: {row['updated_at']} | EMPTY")
    await conn.close()

asyncio.run(main())
