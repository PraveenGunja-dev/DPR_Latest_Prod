import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.database import get_pool

async def run():
    pool = await get_pool()
    await pool.execute('CREATE TABLE IF NOT EXISTS test_uuid4 (id UUID)')
    await pool.execute('DELETE FROM test_uuid4')
    
    import_id = '76ec3fb6-9565-4b0c-8926-c8eda7d59bd7'
    # Insert as string
    try:
        await pool.execute('INSERT INTO test_uuid4 (id) VALUES ($1)', import_id)
        print('INSERT as string succeeded')
    except Exception as e:
        print(f'INSERT as string failed: {e}')

    # Try select as string
    try:
        row = await pool.fetchrow('SELECT * FROM test_uuid4 WHERE id = $1', import_id)
        print(f'Select using string: {row}')
    except Exception as e:
        print(f'SELECT using string failed: {e}')

    # Try DELETE as string
    try:
        row = await pool.fetchrow('DELETE FROM test_uuid4 WHERE id = $1 RETURNING *', import_id)
        print(f'Deleted row using string: {row}')
    except Exception as e:
        print(f'DELETE using string failed: {e}')

asyncio.run(run())
