import asyncio
import sys

from app.database import get_pool
from fastapi import FastAPI
from contextlib import asynccontextmanager

async def test():
    class MockPool:
        pass
    
    # We can just import get_pool but we need the lifespan to run or we can instantiate the pool directly.
    import psycopg_pool
    from app.config import settings
    
    pool = psycopg_pool.AsyncConnectionPool(
        f"postgresql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}",
        open=True
    )
    
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute('SELECT COALESCE(p.name, p6."Name") as name FROM projects p LEFT JOIN p6_projects p6 ON p.object_id = p6."ObjectId" WHERE p.object_id = %s OR p.id = %s LIMIT 1', (3105, 3105))
                row = await cur.fetchone()
                print(row)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await pool.close()

if __name__ == "__main__":
    asyncio.run(test())
