
import asyncio
import asyncpg
import sys

async def run():
    conn = await asyncpg.connect(user='postgres', password='Nikitha', database='DPR', host='127.0.0.1', port=5432)
    rows = await conn.fetch(sys.argv[1])
    for r in rows:
        print(dict(r))
    await conn.close()

asyncio.run(run())
