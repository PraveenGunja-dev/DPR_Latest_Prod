import asyncio
import sys
import json
from dotenv import load_dotenv
load_dotenv('backend-fastapi/.env')
sys.path.append('backend-fastapi')
from app.database import get_pool

async def main():
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT "Name", "ActualUnits", "CumulativeUnits", "Completed" 
        FROM p6_activities 
        WHERE "ProjectId" = (SELECT "Id" FROM p6_projects WHERE "Name" LIKE '%333MW%' LIMIT 1)
    """)
    for r in rows:
        n = str(r.get('Name')).lower()
        if 'capp' in n or 'piling' in n or 'robot' in n:
            print(r.get('Name'), r.get('ActualUnits'), r.get('CumulativeUnits'), r.get('Completed'))

asyncio.run(main())
