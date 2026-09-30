import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect(user='postgres', password='Nikitha', database='DPR', host='127.0.0.1')
    rows = await conn.fetch('''
        SELECT dp.id, dp.progress_date, dp.sheet_type, sa.project_object_id
        FROM dpr_daily_progress dp
        JOIN solar_activities sa ON dp.activity_object_id = sa.object_id
        WHERE dp.pushed_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM dpr_supervisor_entries e 
              WHERE e.project_id = sa.project_object_id 
                AND e.sheet_type = dp.sheet_type 
                AND e.entry_date = dp.progress_date
                AND e.pushed_at IS NULL
          )
    ''')
    print(f'Ghost unpushed rows: {len(rows)}')
    await conn.close()

asyncio.run(run())
