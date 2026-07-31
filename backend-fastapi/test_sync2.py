import asyncio
import os
import sys

# Add the parent directory to sys.path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import create_pool
from sync_all_p6_data import sync_data

async def run():
    pool = await create_pool()
    rows = await pool.fetch('SELECT "ObjectId" FROM p6_projects LIMIT 1')
    if not rows:
        print("No projects with ObjectId found.")
        await pool.close()
        return
        
    p6_id = rows[0]['ObjectId']
    print(f'Syncing {p6_id}')
    try:
        await sync_data(p6_id, False, pool)
        print("Sync completed successfully.")
    except Exception as e:
        print(f"Error during sync: {e}")
    finally:
        await pool.close()

asyncio.run(run())
