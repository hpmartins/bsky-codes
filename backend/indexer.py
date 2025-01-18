import asyncio
import uvicorn
from prometheus_client import Counter, make_asgi_app
from datetime import datetime

from collections import defaultdict
from atproto import (
    models,
    AtUri,
)

from utils.nats import NATSManager
from utils.database import MongoDBManager
from utils.core import Config, INTERESTED_RECORDS, Logger

from utils.interactions import (
    INTERACTION_RECORDS,
    parse_interaction,
)

from pymongo import InsertOne, DeleteOne, UpdateOne

logger = Logger("indexer")
_config = Config()
_db = None

_counter = Counter("indexer", "indexer", ["action", "collection"])
app = make_asgi_app()


async def process_data(data):
    # database_operations = defaultdict(list)

    logger.info(data)

    # for row in data:
    #     _, _, actions = row

    #     for action, action_data in actions.items():
    #         if not action_data:
    #             continue

    #         for action_item in action_data:
    #             uri_str = action_item.get("uri")
    #             if not uri_str:
    #                 logger.warning("Missing URI in action item")
    #                 continue
    #             uri = AtUri.from_str(uri_str)

    #             if action == "create" or action == "update":
    #                 record_type = INTERESTED_RECORDS.get(uri.collection)
    #                 if not record_type:
    #                     logger.warning(f"Unknown collection type: {uri.collection}")
    #                     continue

    #                 record = record_type.Record(**action_item["record"].model_dump())

    #                 # Profiles
    #                 if uri.collection == models.ids.AppBskyActorProfile:
    #                     database_operations[uri.collection].append(
    #                         UpdateOne(
    #                             {"_id": uri.host},
    #                             {
    #                                 "$set": {
    #                                     **record.model_dump(),
    #                                     "updated_at": datetime.now(),
    #                                 }
    #                             },
    #                             upsert=True,
    #                         )
    #                     )
    #                     _counter.labels(action, uri.collection).inc()

    #                 # Interactions
    #                 if action == "create" and uri.collection in INTERACTION_RECORDS:
    #                     interaction = parse_interaction(uri, record)
    #                     if interaction:
    #                         database_operations["interactions"].append(
    #                             InsertOne(interaction)
    #                         )
    #                         _counter.labels(action, uri.collection).inc()
    #             elif action == "delete":
    #                 if uri.collection == models.ids.AppBskyActorProfile:
    #                     _counter.labels(action, uri.collection).inc()
    #                     database_operations[uri.collection].append(
    #                         UpdateOne(
    #                             {"_id": uri.host},
    #                             {
    #                                 "$set": {
    #                                     "deleted": True,
    #                                 }
    #                             },
    #                             upsert=True,
    #                         )
    #                     )

    #                 if uri.collection in INTERACTION_RECORDS:
    #                     _counter.labels(action, uri.collection).inc()
    #                     database_operations["interactions"].append(
    #                         DeleteOne(
    #                             {
    #                                 "metadata": {
    #                                     "author": uri.host,
    #                                     "collection": uri.collection,
    #                                     "rkey": uri.rkey,
    #                                 }
    #                             }
    #                         )
    #                     )

    # for collection, operations in database_operations.items():
    #     if operations and _config.FIREHOSE_INDEXER_ENABLE:
    #         try:
    #             await _db[collection].bulk_write(operations)
    #         except Exception as e:
    #             logger.error(f"Error on bulk_write to {collection}: {e}")


async def start_uvicorn():
    uvicorn_config = uvicorn.config.Config(app, host="0.0.0.0", port=_config.INDEXER_PORT)
    server = uvicorn.server.Server(uvicorn_config)
    await server.serve()


async def start_indexer():
    subjects = [
        f"{_config.NATS_STREAM}.{subject}"
        for subject in [
            models.ids.AppBskyFeedLike,
            models.ids.AppBskyFeedPost,
            models.ids.AppBskyFeedRepost,
            models.ids.AppBskyActorProfile,
        ]
    ]

    nm = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    await nm.connect()

    await nm.pull_subscribe(subjects, process_data, "test")


async def main():
    logger.info("Starting firehose indexer")
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_indexer()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio.run(main())
