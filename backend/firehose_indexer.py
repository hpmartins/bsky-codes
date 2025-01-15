import os
import asyncio
from uvicorn.loops.asyncio import asyncio_setup
import uvicorn
from prometheus_client import Counter, make_asgi_app
import motor.motor_asyncio

from collections import defaultdict
from atproto import (
    AtUri,
)

import logging

from utils.firehose import process_firehose
from utils.defaults import (
    INTERESTED_RECORDS,
    INTERACTION_RECORDS,
)

from stuff.interactions import parse_interaction

from pymongo import InsertOne, DeleteOne

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEVEL = bool(int(os.getenv("DEVEL", 1)))
ENABLE_INDEXER = bool(int(os.getenv("ENABLE_INDEXER", 1)))

MONGODB_URI = os.getenv("MONGODB_URI")
db_client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)

if DEVEL:
    db = db_client["bsky_devel"]
else:
    db = db_client["bsky"]

counter = Counter("indexer", "indexer", ["action", "collection"])
app = make_asgi_app()


async def process_data(
    data: list[tuple[str, str, dict]],
    db: motor.motor_asyncio.AsyncIOMotorDatabase,
    counter: Counter,
):
    database_operations = defaultdict(list)

    for row in data:
        _, _, actions = row

        for action, action_data in actions.items():
            if not action_data:
                continue

            for action_item in action_data:
                uri_str = action_item.get("uri")
                if not uri_str:
                    logger.warning("Missing URI in action item")
                    continue
                uri = AtUri.from_str(uri_str)

                if action == "create":
                    record_type = INTERESTED_RECORDS.get(uri.collection)
                    if not record_type:
                        logger.warning(f"Unknown collection type: {uri.collection}")
                        continue

                    record = record_type.Record(**action_item["record"].model_dump())

                    if uri.collection in INTERACTION_RECORDS:
                        interaction = parse_interaction(uri, record)
                        if interaction:
                            database_operations["interactions"].append(
                                InsertOne(interaction)
                            )
                            counter.labels(action, uri.collection).inc()
                elif action == "delete":
                    database_operations["interactions"].append(
                        DeleteOne(
                            {
                                "metadata": {
                                    "author": uri.host,
                                    "collection": uri.collection,
                                    "rkey": uri.rkey,
                                }
                            }
                        )
                    )
                    counter.labels(action, uri.collection).inc()

    for collection, operations in database_operations.items():
        if operations and ENABLE_INDEXER:
            try:
                await db[collection].bulk_write(operations)
            except Exception as e:
                logger.error(f"Error on bulk_write to {collection}: {e}")

async def start_uvicorn():
    config = uvicorn.config.Config(app, host="0.0.0.0", port=6000)
    server = uvicorn.server.Server(config)
    await server.serve()


async def start_indexer(db: motor.motor_asyncio.AsyncIOMotorDatabase, counter: Counter):
    await process_firehose(
        "indexer",
        list(INTERACTION_RECORDS.keys()),
        lambda x: process_data(x, db, counter),
        count=1000,
    )


async def main():
    logger.info("Starting firehose indexer")
    asyncio_setup()
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_indexer(db, counter)),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio.run(main())
