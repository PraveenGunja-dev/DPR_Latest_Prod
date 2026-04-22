# app/services/cache_service.py
"""
In-memory TTL cache service with LRU eviction.
Supports per-key TTL and pattern-based invalidation.
Optimized for single-VM deployments without Redis.
"""

import logging
import time
from typing import Any, Optional

logger = logging.getLogger("adani-flow.cache")

# Cache storage: key -> (value, expire_at)
_cache: dict[str, tuple[Any, float]] = {}

# Max cache entries to prevent memory bloat
MAX_CACHE_SIZE = 2000


def _evict_expired():
    """Remove expired entries."""
    now = time.time()
    expired = [k for k, (_, exp) in _cache.items() if exp <= now]
    for k in expired:
        del _cache[k]


def _evict_lru():
    """If cache exceeds max size, remove oldest entries (FIFO approximation)."""
    if len(_cache) > MAX_CACHE_SIZE:
        # Remove oldest 20% of entries
        remove_count = int(MAX_CACHE_SIZE * 0.2)
        keys_to_remove = list(_cache.keys())[:remove_count]
        for k in keys_to_remove:
            del _cache[k]
        logger.debug(f"Cache LRU eviction: removed {remove_count} entries")


class CacheService:
    """In-memory cache with per-key TTL and LRU eviction."""

    @staticmethod
    async def get(key: str) -> Optional[Any]:
        """Get a value from cache. Returns None if not found or expired."""
        entry = _cache.get(key)
        if entry is None:
            return None
        
        value, expire_at = entry
        if time.time() >= expire_at:
            # Expired — clean up
            del _cache[key]
            return None
        
        logger.debug(f"Cache HIT: {key}")
        return value

    @staticmethod
    async def set(key: str, value: Any, ttl: int = 300) -> bool:
        """Set a value in cache with per-key TTL in seconds."""
        _evict_expired()
        _evict_lru()
        _cache[key] = (value, time.time() + ttl)
        return True

    @staticmethod
    async def delete(key: str) -> bool:
        """Delete a specific key from cache."""
        _cache.pop(key, None)
        return True

    @staticmethod
    async def delete_pattern(pattern: str) -> int:
        """Delete all keys matching a prefix pattern. Returns count deleted."""
        keys = [k for k in _cache if k.startswith(pattern)]
        for k in keys:
            del _cache[k]
        if keys:
            logger.debug(f"Cache pattern delete '{pattern}': {len(keys)} keys removed")
        return len(keys)

    @staticmethod
    async def flush_all() -> bool:
        """Clear all cache entries."""
        _cache.clear()
        logger.debug("Cache flushed")
        return True

    @staticmethod
    def stats() -> dict:
        """Return cache statistics."""
        _evict_expired()
        return {
            "entries": len(_cache),
            "max_size": MAX_CACHE_SIZE,
        }


cache = CacheService()
