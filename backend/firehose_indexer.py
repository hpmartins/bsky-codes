import os
import asyncio
from uvicorn.loops.asyncio import asyncio_setup
import uvicorn
from prometheus_client import Counter, make_asgi_app
import motor.motor_asyncio
from datetime import datetime

from collections import defaultdict
from atproto import (
    models,
    AtUri,
)

import logging

from utils.firehose import process_firehose
from utils.defaults import (
    INTERESTED_RECORDS,
)
from utils.database import DB_CLIENT

from stuff.interactions import (
    INTERACTION_RECORDS,
    parse_interaction,
)

from pymongo import InsertOne, DeleteOne, UpdateOne

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEVEL = bool(int(os.getenv("DEVEL", 1)))
ENABLE_INDEXER = bool(int(os.getenv("ENABLE_INDEXER", 1)))

if DEVEL:
    DB = DB_CLIENT["bsky_devel"]
else:
    DB = DB_CLIENT["bsky"]

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

                if action == "create" or action == "update":
                    record_type = INTERESTED_RECORDS.get(uri.collection)
                    if not record_type:
                        logger.warning(f"Unknown collection type: {uri.collection}")
                        continue

                    record = record_type.Record(**action_item["record"].model_dump())

                    # Profiles
                    if uri.collection == models.ids.AppBskyActorProfile:
                        database_operations[uri.collection].append(
                            UpdateOne(
                                {"_id": uri.host},
                                {
                                    "$set": {
                                        **record.model_dump(),
                                        "updated_at": datetime.now(),
                                    }
                                },
                                upsert=True,
                            )
                        )
                        counter.labels(action, uri.collection).inc()

                    # Interactions
                    if action == "create" and uri.collection in INTERACTION_RECORDS:
                        interaction = parse_interaction(uri, record)
                        if interaction:
                            database_operations["interactions"].append(
                                InsertOne(interaction)
                            )
                            counter.labels(action, uri.collection).inc()
                elif action == "delete":
                    if uri.collection == models.ids.AppBskyActorProfile:
                        counter.labels(action, uri.collection).inc()
                        database_operations[uri.collection].append(
                            UpdateOne(
                                {"_id": uri.host},
                                {
                                    "$set": {
                                        "deleted": True,
                                    }
                                },
                                upsert=True,
                            )
                        )

                    if uri.collection in INTERACTION_RECORDS:
                        counter.labels(action, uri.collection).inc()
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

    for collection, operations in database_operations.items():
        if operations and ENABLE_INDEXER:
            logger.info(f"{len(operations)} operations")
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
        [
            models.ids.AppBskyFeedLike,
            models.ids.AppBskyFeedRepost,
            models.ids.AppBskyFeedPost,
            models.ids.AppBskyActorProfile,
        ],
        lambda x: process_data(x, db, counter),
        count=500,
    )


async def main():
    logger.info("Starting firehose indexer")
    asyncio_setup()
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_indexer(DB, counter)),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio.run(main())
