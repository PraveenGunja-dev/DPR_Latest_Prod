import asyncio
import sys
import json
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
        if 'capp' in str(r.get('Name')).lower() or 'piling' in str(r.get('Name')).lower() or 'mms' in str(r.get('Name')).lower():
            print(r.get('Name'), r.get('ActualUnits'), r.get('CumulativeUnits'), r.get('Completed'))

asyncio.run(main())
