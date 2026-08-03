import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import create_pool

async def run():
    pool = await create_pool()
    try:
        await pool.execute('''
            ALTER TABLE projects 
            ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS finish_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS baseline_start TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS baseline_finish TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS scheduled_finish TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS summary_planned_labor_units NUMERIC,
            ADD COLUMN IF NOT EXISTS summary_actual_labor_units NUMERIC
        ''')
        print('Columns added successfully to projects')
    except Exception as e:
        print(f"Error adding columns: {e}")
    finally:
        await pool.close()

asyncio.run(run())
