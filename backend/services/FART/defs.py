import json
import logging

import motor.motor_asyncio
import redis.asyncio as redis
from atproto import (
    AsyncClient,
    AsyncDidInMemoryCache,
    AsyncIdResolver,
)
from fastapi import FastAPI
from pymongo.errors import ConnectionFailure

from backend.config import Config

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
    mongo: motor.motor_asyncio.AsyncIOMotorClient
    db: motor.motor_asyncio.AsyncIOMotorDatabase
    cache: "redis.Redis"

    def __init__(self):
        self.resolver = AsyncIdResolver(cache=AsyncDidInMemoryCache())
        self.bsky = AsyncClient(base_url="https://public.api.bsky.app/")
        self.mongo = motor.motor_asyncio.AsyncIOMotorClient(config.MONGO_URI, compressors="zstd")
        self.db = self.mongo.get_database(config.FART_DB)
        self.cache = redis.from_url(config.REDIS_URI, decode_responses=True)

    async def connect(self):
        try:
            await self.mongo.admin.command("ping")
            logger.info(f"Connected to MongoDB at {config.MONGO_URI} and db {config.FART_DB}")
        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise ConnectionFailure

        try:
            await self.cache.ping()
            logger.info(f"Connected to Redis at {config.REDIS_URI}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise Exception

    async def disconnect(self):
        self.mongo.close()
        await self.cache.aclose()

    async def cache_hexists(self, name: str, key: str) -> bool:
        return await self.cache.hexists(name, key)

    async def cache_hget(self, name: str, key: str) -> dict | None:
        data = await self.cache.hget(name, key)
        if data:
            return json.loads(data)

    async def cache_hset(self, name: str, key: str, value: dict, ttl: int | None = None):
        await self.cache.hset(name, key, json.dumps(value))
        if ttl:
            await self.cache.hexpire(name, ttl, key)

    async def cache_hdel(self, name: str, key: str):
        await self.cache.hdel(name, key)
