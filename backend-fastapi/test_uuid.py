import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.database import get_pool

async def run():
    pool = await get_pool()
    await pool.execute('CREATE TABLE IF NOT EXISTS test_uuid (id UUID)')
    await pool.execute('INSERT INTO test_uuid VALUES ()', '76ec3fb6-9565-4b0c-8926-c8eda7d59bd7')
    try:
        row = await pool.fetchrow('DELETE FROM test_uuid WHERE id =  RETURNING *', '76ec3fb6-9565-4b0c-8926-c8eda7d59bd7')
        print(f'Deleted row: {row}')
    except Exception as e:
        print(f'Error: {type(e)} {e}')

asyncio.run(run())
