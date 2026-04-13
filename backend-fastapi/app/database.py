# app/database.py
"""
PostgreSQL connection pool management using psycopg3 (async).
Replaces the `pg.Pool` from the Express backend.

IMPORTANT: All routers use asyncpg-style $1, $2, $3... placeholders.
This module automatically converts them to psycopg's %s format.
"""

import logging
import re
from typing import Optional, Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import settings

logger = logging.getLogger("adani-flow.database")

# Global connection pool
_pool: Optional[AsyncConnectionPool] = None


def _process_query(query: str, args: tuple) -> tuple[str, Any]:
    """
    Process asyncpg-style $1, $2 placeholders.
    Converts them to %s and reorders/duplicates args accordingly.
    """
    if not args:
        return query, None
        
    # Find all $n placeholders
    indices = [int(i) for i in re.findall(r'\$(\d+)', query)]
    if not indices:
        return query, args
        
    # Convert query to %s placeholders
    new_query = re.sub(r'\$(\d+)', '%s', query)
    
    # Map arguments to their positional placeholders
    try:
        new_args = [args[i - 1] for i in indices]
        return new_query, new_args
    except IndexError:
        logger.error(f"Placeholder index out of range. Query: {query}, Args: {args}")
        raise


class PoolWrapper:
    """
    A wrapper around psycopg3 AsyncConnectionPool that provides a simpler interface
    matching the asyncpg-style API used throughout our routers.
    Automatically converts $1, $2 placeholders to %s for psycopg3 compatibility.
    """

    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        """Execute query and return all rows as list of dicts."""
        q, a = _process_query(query, args)
        async with self._pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(q, a)
                rows = await cur.fetchall()
                return list(rows) if rows is not None else []

    async def fetchrow(self, query: str, *args: Any) -> Optional[dict[str, Any]]:
        """Execute query and return first row as dict, or None."""
        q, a = _process_query(query, args)
        async with self._pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(q, a)
                row = await cur.fetchone()
                return row

    async def fetchval(self, query: str, *args: Any) -> Any:
        "Execute query and return first column of first row."
        q, a = _process_query(query, args)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(q, a)
                row = await cur.fetchone()
                return row[0] if row else None

    async def execute(self, query: str, *args: Any) -> str:
        """Execute a query (INSERT/UPDATE/DELETE) and return status."""
        q, a = _process_query(query, args)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(q, a)
                status = cur.statusmessage
                return str(status) if status else ""

    async def close(self):
        """Close the pool."""
        await self._pool.close()


def _build_conninfo() -> str:
    """Build a psycopg3 connection string."""
    if settings.DATABASE_URL:
        url = settings.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    # Build from individual env vars
    host = settings.effective_db_host
    port = settings.effective_db_port
    dbname = settings.effective_db_name
    user = settings.effective_db_user
    password = settings.effective_db_password

    parts = [
        f"host={host}",
        f"port={port}",
        f"dbname={dbname}",
        f"user={user}",
    ]
    if password:
        parts.append(f"password={password}")

    # SSL for non-local
    if not settings.is_local_db:
        parts.append("sslmode=require")

    return " ".join(parts)


async def get_pool() -> PoolWrapper:
    """Get the database connection pool (creates it if not initialized)."""
    global _pool
    if _pool is None:
        await create_pool()
    return PoolWrapper(_pool)


async def create_pool() -> PoolWrapper:
    """Create the psycopg3 async connection pool."""
    global _pool

    conninfo = _build_conninfo()
    logger.info(f"Connecting to database: {settings.effective_db_host}:{settings.effective_db_port}/{settings.effective_db_name}")

    try:
        _pool = AsyncConnectionPool(
            conninfo=conninfo,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            open=False,
            kwargs={"autocommit": True},
        )

        # Open the pool and wait (with an explicit timeout to prevent hanging)
        await _pool.open()
        try:
            await _pool.wait(timeout=60.0) # More generous timeout
        except Exception as te:
            logger.warning(f"Database pool wait timed out but continuing: {te}")

        # Test the connection
        wrapper = PoolWrapper(_pool)
        result = await wrapper.fetchval("SELECT NOW()")
        logger.info(f"Database connected successfully at: {result}")

        return wrapper

    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


async def get_db() -> PoolWrapper:
    """FastAPI dependency to get the DB pool."""
    return await get_pool()
