import asyncio
import datetime
import signal
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import OperationFailure
from typing import Optional

from collections import defaultdict
from atproto import (
    models,
    AtUri,
)

from utils.nats import NATSManager
from utils.database import MongoDBManager
from utils.core import Config, INTERESTED_RECORDS, Logger, JetstreamStuff

from utils.interactions import (
    INTERACTION_RECORDS,
    INTERACTION_COLLECTION,
    parse_interaction,
)

from pymongo import InsertOne, DeleteOne, UpdateOne

logger = Logger("indexer")

# Signal handling
is_shutdown = False


def signal_handler(signum, frame):
    global is_shutdown
    is_shutdown = True
    logger.info("SHUTDOWN")


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


async def main():
    _config = Config()
    nats_manager = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    mongo_manager = MongoDBManager(uri=_config.MONGO_URI)

    subjects = [
        f"{_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX}.{subject}"
        for subject in [
            models.ids.AppBskyFeedLike,
            models.ids.AppBskyFeedPost,
            models.ids.AppBskyFeedRepost,
            models.ids.AppBskyActorProfile,
        ]
    ]

    async def process_data(data: bytes):
        event = JetstreamStuff.Event.model_validate_json(data)

        if not _config.INDEXER_ENABLE:
            return

        if event.commit:
            uri = AtUri.from_str("at://{}/{}/{}".format(event.did, event.commit.collection, event.commit.rkey))

            if isinstance(event.commit, JetstreamStuff.CommitCreate) or isinstance(
                event.commit, JetstreamStuff.CommitUpdate
            ):
                record_type = INTERESTED_RECORDS.get(event.commit.collection)
                if not record_type:
                    logger.warning(f"Unknown collection type: {event.commit.collection}")
                    return

                record = record_type.Record.model_validate(event.commit.record)

                if models.is_record_type(record, models.ids.AppBskyActorProfile):
                    await db[event.commit.collection].update_one(
                        {"_id": event.did},
                        {
                            "$set": {
                                **record.model_dump(),
                                "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                            },
                            "$setOnInsert": {
                                "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                            },
                        },
                        upsert=True,
                    )

                if (
                    isinstance(event.commit, JetstreamStuff.CommitCreate)
                    and event.commit.collection in INTERACTION_RECORDS.keys()
                ):
                    interaction = parse_interaction(uri, record)
                    if interaction:
                        await db[INTERACTION_COLLECTION].insert_one(interaction)

            if isinstance(event.commit, JetstreamStuff.CommitDelete):
                if event.commit.collection == models.ids.AppBskyActorProfile:
                    await db[event.commit.collection].update_one(
                        {"_id": event.did},
                        {
                            "$set": {
                                "deleted": True,
                            }
                        },
                        upsert=True,
                    )

                if event.commit.collection in INTERACTION_RECORDS.keys():
                    await db[INTERACTION_COLLECTION].delete_one(
                        {
                            "author": event.did,
                            "collection": event.commit.collection,
                            "rkey": event.commit.rkey,
                        }
                    )

    logger.info("Connecting to Mongo")
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(_config.INDEXER_DB)

    try:
        await db.validate_collection(INTERACTION_COLLECTION)
    except OperationFailure:
        await db.create_collection(INTERACTION_COLLECTION)
    finally:
        if "TTL" not in (await db[INTERACTION_COLLECTION].index_information()).keys():
            await db[INTERACTION_COLLECTION].create_index(
                "indexed_at", name="TTL", expireAfterSeconds=60 * 60 * 24 * 14
            )

    logger.info("Connecting to NATS")
    await nats_manager.connect()

    logger.info("Starting service")
    for subject in subjects:
        asyncio.create_task(nats_manager.pull_subscribe(subject, process_data, "test"))

    logger.info("Finished")
    try:
        while not is_shutdown:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down...")
    finally:
        await nats_manager.disconnect()
        await mongo_manager.disconnect()
        logger.info("Shutdown complete.")


if __name__ == "__main__":
    asyncio.run(main())
