import motor.motor_asyncio
from typing import Optional
from pymongo.errors import ConnectionFailure

from .core import Logger


class MongoDBManager:
    def __init__(self, uri: str):
        self.uri = uri
        self.client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None
        self.logger = Logger("mongodb")

    async def connect(self):
        """Connects to the MongoDB server."""
        try:
            self.client = motor.motor_asyncio.AsyncIOMotorClient(self.uri, compressors="zstd")
            await self.client.admin.command("ping")
            self.logger.info(f"Connected to MongoDB at {self.uri}")
        except ConnectionFailure as e:
            self.logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    async def disconnect(self):
        """Disconnects from the MongoDB server."""
        if self.client:
            self.client.close()
            self.client = None
            self.logger.info("Disconnected from MongoDB")
