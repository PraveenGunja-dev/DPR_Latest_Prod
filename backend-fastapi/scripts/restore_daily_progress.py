import asyncio
import asyncpg
import sys
from pathlib import Path

async def run():
    print("Connecting to database...")
    conn = await asyncpg.connect(user='postgres', password='Nikitha', database='DPR', host='127.0.0.1')
    try:
        # Check how many rows are in the backup
        val = await conn.fetchval('SELECT count(*) FROM dpr_daily_progress_purge_backup')
        print(f'Backup count: {val}')
        
        # Restore rows from the backup table back into dpr_daily_progress
        # We use ON CONFLICT DO NOTHING to avoid overwriting any new data
        print("Restoring rows...")
        res = await conn.execute('''
            INSERT INTO dpr_daily_progress (
                activity_object_id, progress_date, today_value, cumulative_value, 
                sheet_type, activity_source, created_at, pushed_at
            )
            SELECT 
                activity_object_id, progress_date, today_value, cumulative_value, 
                sheet_type, activity_source, created_at, pushed_at
            FROM dpr_daily_progress_purge_backup
            ON CONFLICT (activity_object_id, activity_source, progress_date, sheet_type) 
            DO NOTHING
        ''')
        print(f"Restore result: {res}")
        
    except Exception as e:
        print(f'Error: {e}')
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(run())
