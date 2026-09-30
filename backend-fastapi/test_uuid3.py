import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.database import get_pool

async def run():
    pool = await get_pool()
    await pool.execute('CREATE TABLE IF NOT EXISTS test_uuid3 (id UUID)')
    await pool.execute('DELETE FROM test_uuid3')
    
    import_id = '76ec3fb6-9565-4b0c-8926-c8eda7d59bd7'
    # Try inserting using pool.execute
    try:
        await pool.execute('INSERT INTO test_uuid3 (id) VALUES ()', import_id)
        print('INSERT as string succeeded')
    except Exception as e:
        print(f'INSERT as string failed: {e}')

    try:
        row = await pool.fetchrow('DELETE FROM test_uuid3 WHERE id =  RETURNING id', import_id)
        print(f'Deleted row using string: {row}')
    except Exception as e:
        print(f'DELETE using string failed: {e}')

asyncio.run(run())
