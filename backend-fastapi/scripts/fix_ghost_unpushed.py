import asyncio
import asyncpg
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import _build_conninfo

async def run():
    print("Connecting to database...")
    conn = await asyncpg.connect(user='postgres', password='Nikitha', database='DPR', host='127.0.0.1')
    try:
        # Find and update all ghost unpushed rows (rows that have pushed_at IS NULL but no matching unpushed entry)
        print("Fixing ghost unpushed rows...")
        res = await conn.execute('''
            UPDATE dpr_daily_progress dp
            SET pushed_at = NOW()
            FROM solar_activities sa
            WHERE dp.activity_object_id = sa.object_id
              AND dp.pushed_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dpr_supervisor_entries e 
                  WHERE e.project_id = sa.project_object_id 
                    AND e.sheet_type = dp.sheet_type 
                    AND e.entry_date = dp.progress_date
                    AND e.pushed_at IS NULL
              )
        ''')
        print(f"Update result (p6): {res}")
        
        # Do the same for custom DPR activities just in case
        res_dpr = await conn.execute('''
            UPDATE dpr_daily_progress dp
            SET pushed_at = NOW()
            FROM dpr_custom_activities ca
            WHERE dp.activity_object_id = ca.id
              AND dp.activity_source = 'dpr'
              AND dp.pushed_at IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dpr_supervisor_entries e 
                  WHERE e.project_id = ca.project_id 
                    AND e.sheet_type = dp.sheet_type 
                    AND e.entry_date = dp.progress_date
                    AND e.pushed_at IS NULL
              )
        ''')
        print(f"Update result (dpr): {res_dpr}")
        
    except Exception as e:
        print(f'Error: {e}')
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(run())
