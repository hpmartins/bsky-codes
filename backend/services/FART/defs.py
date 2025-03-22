import json
import logging

from atproto import (
    AsyncClient,
    AsyncDidInMemoryCache,
    AsyncIdResolver,
)
from fastapi import FastAPI

from backend.core.config import Config
from backend.core.redis_manager import RedisManager

config = Config()
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


class FARTAPI(FastAPI):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ctx = FARTContext()


class FARTContext:
    resolver: AsyncIdResolver
    bsky: AsyncClient
    redis: RedisManager

    def __init__(self):
        self.resolver = AsyncIdResolver(cache=AsyncDidInMemoryCache())
        self.bsky = AsyncClient(base_url="https://public.api.bsky.app/")
        self.redis = RedisManager(uri=config.REDIS_URI)

    async def connect(self):
        try:
            await self.redis.connect()
            logger.info(f"Connected to Redis at {config.REDIS_URI}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise Exception

    async def disconnect(self):
        await self.redis.disconnect()

    async def cache_hexists(self, name: str, key: str) -> bool:
        """Check if a key exists in a hash."""
        value = await self.redis.hash_get(name, key)
        return value is not None

    async def cache_hget(self, name: str, key: str) -> dict | None:
        """Get a value from a hash."""
        return await self.redis.hash_get(name, key)

    async def cache_hset(self, name: str, key: str, value: dict, ttl: int | None = None):
        """Set a value in a hash."""
        await self.redis.hash_set(name, key, value)
        # Note: Redis doesn't support TTL on individual hash fields
        # This would require a more complex implementation with an expiry key

    async def cache_hdel(self, name: str, key: str):
        """Delete a field from a hash."""
        await self.redis.hash_delete(name, key)
