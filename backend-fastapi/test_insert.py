import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.database import get_pool

async def run():
    pool = await get_pool()
    await pool.execute('CREATE TABLE IF NOT EXISTS test_tbl (id int)')
    await pool.execute('INSERT INTO test_tbl VALUES (1)')
    rows = await pool.fetch('SELECT * FROM test_tbl')
    print(f'Rows in test_tbl: {len(rows)}')

asyncio.run(run())
