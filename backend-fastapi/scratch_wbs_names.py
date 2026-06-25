import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath("."))
from app.database import get_pool

async def main():
    pool = await get_pool()
    rows = await pool.fetch("""
        SELECT parent.name as parent_name, child.name as child_name
        FROM solar_wbs parent
        JOIN solar_wbs child ON child.parent_object_id = parent.object_id
        WHERE UPPER(parent.name) LIKE '%%ELECTRICAL%%' OR UPPER(parent.name) LIKE '%%ELECTRIC%%'
    """)
    for r in sorted(rows, key=lambda x: str(x["child_name"])):
        print(f"{r['child_name']}")

if __name__ == "__main__":
    asyncio.run(main())
