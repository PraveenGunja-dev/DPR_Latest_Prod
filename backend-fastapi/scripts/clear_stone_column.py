import asyncio
import sys
import os

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import get_pool

async def clear_stone_column():
    print("Connecting to DB...")
    pool = await get_pool()
    print("Deleting 'wind_stone_column' custom activities...")
    deleted = await pool.execute("DELETE FROM dpr_custom_activities WHERE sheet_type = 'wind_stone_column'")
    print(f"Result: {deleted}")
    print("Done!")

if __name__ == "__main__":
    asyncio.run(clear_stone_column())
