from typing import Optional

import motor.motor_asyncio
from pymongo.errors import ConnectionFailure


class MongoDBManager:
    def __init__(self, uri: str):
        self.uri = uri
        self.client: Optional[motor.motor_asyncio.AsyncIOMotorClient] = None

    async def connect(self):
        """Connects to the MongoDB server."""
        try:
            self.client = motor.motor_asyncio.AsyncIOMotorClient(self.uri, compressors="zstd")
            await self.client.admin.command("ping")
            print(f"Connected to MongoDB at {self.uri}")
        except ConnectionFailure as e:
            print(f"Failed to connect to MongoDB: {e}")
            raise

    async def disconnect(self):
        """Disconnects from the MongoDB server."""
        if self.client:
            self.client.close()
            self.client = None
            print("Disconnected from MongoDB")
