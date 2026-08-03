import asyncio
import sys

# Add backend dir to sys.path
sys.path.append("d:\\DPR\\Digitalized_DPR_Prod\\backend-fastapi")

from app.database import PoolWrapper
from app.config import settings
import psycopg_pool

async def test():
    pool = psycopg_pool.AsyncConnectionPool(
        f"postgresql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}",
        open=True
    )
    wrapper = PoolWrapper(pool)
    try:
        row = await wrapper.fetchrow('SELECT COALESCE(p.name, p6."Name") as name FROM projects p LEFT JOIN p6_projects p6 ON p.object_id = p6."ObjectId" WHERE p.object_id = $1 OR p.id = $1 LIMIT 1', 3105)
        print(f"Row: {row}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await pool.close()

if __name__ == "__main__":
    asyncio.run(test())
