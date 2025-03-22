import asyncio
import datetime
import json
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import redis.asyncio as redis
from redis.asyncio import Redis
from redis.exceptions import RedisError

from backend.core.config import Config
from backend.core.logger import Logger

config = Config()
logger = Logger("redis_manager")


def get_firehose_entry(key: str) -> str:
    return f"{config.REDIS_STREAM_PREFIX}:{key}"


def get_bsky_entry(key: str) -> str:
    return f"{config.BSKY_COLLECTION_PREFIX}:{key}"


class RedisManager:
    """Manages Redis connections and operations for the application."""

    def __init__(self, uri: str = None):
        self._uri = uri or config.REDIS_URI
        self._client: Optional[Redis] = None

    async def connect(self) -> None:
        """Connect to Redis."""
        try:
            self._client = redis.from_url(
                self._uri,
                decode_responses=True,
                socket_timeout=10.0,
                socket_connect_timeout=10.0,
            )
            await self._client.ping()
            logger.info("Connected to Redis")
        except RedisError as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._client:
            await self._client.close()
            logger.info("Disconnected from Redis")

    async def publish_to_stream(self, stream: str, data: Dict[str, Any], maxlen: int = 100000) -> str:
        """Publish data to a Redis stream."""
        if not self._client:
            await self.connect()

        try:
            message_id = await self._client.xadd(stream, data, maxlen=maxlen)
            return message_id
        except RedisError as e:
            logger.error(f"Failed to publish to stream {stream}: {e}")
            raise

    async def create_consumer_group(self, stream: str, group: str) -> bool:
        """Create a consumer group for a stream."""
        if not self._client:
            await self.connect()

        try:
            # Create stream if it doesn't exist
            await self._client.xgroup_create(stream, group, id="0-0", mkstream=True)
            logger.info(f"Created consumer group {group} for stream {stream}")
            return True
        except RedisError as e:
            if "BUSYGROUP" in str(e):
                # Group already exists
                logger.info(f"Consumer group {group} already exists for stream {stream}")
                return True
            logger.error(f"Failed to create consumer group {group} for stream {stream}: {e}")
            return False

    async def read_stream(
        self,
        stream: str,
        group: str,
        consumer: str,
        count: int = 10,
        block: int = 2000,
        last_id: str = ">",
    ) -> List[Dict[str, Any]]:
        """Read messages from a stream using a consumer group."""
        if not self._client:
            await self.connect()

        try:
            messages = await self._client.xreadgroup(group, consumer, {stream: last_id}, count=count, block=block)

            if not messages:
                return []

            results = []
            for _, message_list in messages:
                for message_id, message in message_list:
                    results.append({"id": message_id, "data": message})

            return results
        except RedisError as e:
            logger.error(f"Failed to read from stream {stream}: {e}")
            return []

    async def ack_message(self, stream: str, group: str, message_id: str) -> bool:
        """Acknowledge processing of a message."""
        if not self._client:
            await self.connect()

        try:
            await self._client.xack(stream, group, message_id)
            return True
        except RedisError as e:
            logger.error(f"Failed to ack message {message_id} in stream {stream}: {e}")
            return False

    async def set_key(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set a key with optional TTL."""
        if not self._client:
            await self.connect()

        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)

            if ttl:
                await self._client.setex(key, ttl, value)
            else:
                await self._client.set(key, value)
            return True
        except RedisError as e:
            logger.error(f"Failed to set key {key}: {e}")
            return False

    async def get(self, key: str) -> Any:
        """Get a value for a key."""
        if not self._client:
            await self.connect()

        try:
            value = await self._client.get(key)

            if value is None:
                return None

            try:
                # Try to deserialize JSON
                return json.loads(value)
            except (TypeError, json.JSONDecodeError):
                return value
        except RedisError as e:
            logger.error(f"Failed to get key {key}: {e}")
            return None

    async def delete(self, key: str) -> bool:
        """Delete a key."""
        if not self._client:
            await self.connect()

        try:
            await self._client.delete(key)
            return True
        except RedisError as e:
            logger.error(f"Failed to delete key {key}: {e}")
            return False

    async def hash_set(self, key: str, field: str, value: Any) -> bool:
        """Set a field in a hash."""
        if not self._client:
            await self.connect()

        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)

            await self._client.hset(key, field, value)
            return True
        except RedisError as e:
            logger.error(f"Failed to set hash field {key}:{field}: {e}")
            return False

    async def hash_get(self, key: str, field: str) -> Any:
        """Get a field from a hash."""
        if not self._client:
            await self.connect()

        try:
            value = await self._client.hget(key, field)

            if value is None:
                return None

            try:
                # Try to deserialize JSON
                return json.loads(value)
            except (TypeError, json.JSONDecodeError):
                return value
        except RedisError as e:
            logger.error(f"Failed to get hash field {key}:{field}: {e}")
            return None

    async def hash_get_all(self, key: str) -> Dict[str, Any]:
        """Get all fields from a hash."""
        if not self._client:
            await self.connect()

        try:
            result = await self._client.hgetall(key)

            if not result:
                return {}

            # Try to deserialize JSON values
            for field, value in result.items():
                try:
                    result[field] = json.loads(value)
                except (TypeError, json.JSONDecodeError):
                    pass

            return result
        except RedisError as e:
            logger.error(f"Failed to get all hash fields for {key}: {e}")
            return {}

    async def hash_delete(self, key: str, field: str) -> bool:
        """Delete a field from a hash."""
        if not self._client:
            await self.connect()

        try:
            await self._client.hdel(key, field)
            return True
        except RedisError as e:
            logger.error(f"Failed to delete hash field {key}:{field}: {e}")
            return False

    async def sorted_set_add(self, key: str, member: str, score: float) -> bool:
        """Add a member to a sorted set."""
        if not self._client:
            await self.connect()

        try:
            await self._client.zadd(key, {member: score})
            return True
        except RedisError as e:
            logger.error(f"Failed to add to sorted set {key}: {e}")
            return False

    async def sorted_set_get(self, key: str, start: int = 0, end: int = -1, with_scores: bool = False) -> List:
        """Get members from a sorted set."""
        if not self._client:
            await self.connect()

        try:
            if with_scores:
                results = await self._client.zrange(key, start, end, withscores=True)
                return [(member, score) for member, score in results]
            else:
                return await self._client.zrange(key, start, end)
        except RedisError as e:
            logger.error(f"Failed to get sorted set {key}: {e}")
            return []

    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment a counter."""
        if not self._client:
            await self.connect()

        try:
            return await self._client.incrby(key, amount)
        except RedisError as e:
            logger.error(f"Failed to increment {key}: {e}")
            return 0

    async def hash_increment(self, key: str, field: str, amount: int = 1) -> int:
        """Increment a field in a hash."""
        if not self._client:
            await self.connect()

        try:
            return await self._client.hincrby(key, field, amount)
        except RedisError as e:
            logger.error(f"Failed to increment hash field {key}:{field}: {e}")
            return 0
