import asyncio
import asyncpg

async def main():
    pool = await asyncpg.create_pool('postgresql://postgres:Nikitha@127.0.0.1/DPR')
    rows = await pool.fetch("SELECT id, entry_date, status, updated_at, supervisor_id FROM dpr_supervisor_entries WHERE project_id = 3105 AND sheet_type = 'manpower_details_2' ORDER BY entry_date DESC")
    for r in rows:
        print(dict(r))
    await pool.close()

asyncio.run(main())
