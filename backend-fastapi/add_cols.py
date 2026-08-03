import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import create_pool

async def run():
    pool = await create_pool()
    try:
        await pool.execute('ALTER TABLE p6_projects ADD COLUMN IF NOT EXISTS "SummaryBaselineStartDate" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "SummaryBaselineFinishDate" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "ScheduledFinishDate" TIMESTAMPTZ')
        print('Columns added successfully to p6_projects')
    except Exception as e:
        print(f"Error adding columns: {e}")
    finally:
        await pool.close()

asyncio.run(run())
