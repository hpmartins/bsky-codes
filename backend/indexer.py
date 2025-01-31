import asyncio
import datetime
import signal
from pymongo import IndexModel
from nats.aio.msg import Msg
from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy
from nats.js.errors import NotFoundError
from collections import defaultdict
from atproto import (
    models,
    AtUri,
)
import argparse

from utils.nats import NATSManager
from utils.database import MongoDBManager
from utils.core import Config, INTERESTED_RECORDS, Logger, JetstreamStuff

from utils.interactions import (
    get_date,
    INTERACTION_RECORDS,
    INTERACTION_COLLECTION,
    parse_interaction,
)

from pymongo import InsertOne, DeleteOne, UpdateOne

parser = argparse.ArgumentParser()
parser.add_argument("--log", default="INFO")
args = parser.parse_args()
logger = Logger("indexer", level=args.log.upper())

is_shutdown = False


def signal_handler(signum, frame):
    global is_shutdown
    is_shutdown = True
    logger.info("SHUTDOWN")


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

TEMPORARY_INDEXED_RECORDS = [
    models.ids.AppBskyGraphBlock,
]


async def main():
    _config = Config()
    nats_manager = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    mongo_manager = MongoDBManager(uri=_config.MONGO_URI)

    async def _process_data(data: bytes):
        event = JetstreamStuff.Event.model_validate_json(data)
        db_ops = defaultdict(list)

        if not _config.INDEXER_ENABLE:
            return {}

        if event.commit:
            uri = AtUri.from_str(
                "at://{}/{}/{}".format(event.did, event.commit.collection, event.commit.rkey)
            )

            if isinstance(event.commit, JetstreamStuff.CommitCreate) or isinstance(
                event.commit, JetstreamStuff.CommitUpdate
            ):
                record_type = INTERESTED_RECORDS.get(event.commit.collection)
                if not record_type:
                    logger.warning(f"Unknown collection type: {event.commit.collection}")
                    return {}

                record = record_type.Record.model_validate(event.commit.record)

                if event.commit.collection == models.ids.AppBskyActorProfile:
                    db_ops[event.commit.collection].append(
                        UpdateOne(
                            {"_id": event.did},
                            {
                                "$set": {
                                    **record.model_dump(exclude=["avatar", "banner", "py_type"]),
                                    "created_at": (
                                        datetime.datetime.fromisoformat(record["created_at"])
                                        if record["created_at"]
                                        else None
                                    ),
                                    "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                                },
                                "$setOnInsert": {
                                    "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                                },
                            },
                            upsert=True,
                        )
                    )

                if isinstance(event.commit, JetstreamStuff.CommitCreate):
                    if event.commit.collection in TEMPORARY_INDEXED_RECORDS:
                        db_ops[event.commit.collection].append(
                            InsertOne(
                                {
                                    "author": event.did,
                                    "rkey": event.commit.rkey,
                                    "subject": record["subject"],
                                    "created_at": (
                                        datetime.datetime.fromisoformat(record["created_at"])
                                        if record["created_at"]
                                        else None
                                    ),
                                    "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                                }
                            )
                        )

                    if event.commit.collection in INTERACTION_RECORDS:
                        interaction = parse_interaction(uri, record)
                        if interaction:
                            doc_filter, doc_update = interaction
                            db_ops[INTERACTION_COLLECTION].append(
                                UpdateOne(doc_filter, doc_update, upsert=True)
                            )

            if isinstance(event.commit, JetstreamStuff.CommitDelete):
                if event.commit.collection == models.ids.AppBskyActorProfile:
                    db_ops[event.commit.collection].append(
                        UpdateOne(
                            {"_id": event.did},
                            {
                                "$set": {
                                    "deleted": True,
                                }
                            },
                            upsert=True,
                        )
                    )

                if event.commit.collection in TEMPORARY_INDEXED_RECORDS:
                    db_ops[event.commit.collection].append(
                        DeleteOne(
                            {
                                "author": event.did,
                                "rkey": event.commit.rkey,
                            }
                        )
                    )

                if event.commit.collection in INTERACTION_RECORDS:
                    db_ops[INTERACTION_COLLECTION].append(
                        UpdateOne(
                            {
                                "_id": {
                                    "date": get_date(),
                                    "author": event.did,
                                    "collection": event.commit.collection,
                                }
                            },
                            {"$pull": {"items": {"_id": event.commit.rkey}}},
                        )
                    )

        return db_ops

    logger.info("Connecting to Mongo")
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(_config.INDEXER_DB)
    for collection in TEMPORARY_INDEXED_RECORDS:
        await db[collection].create_indexes(
            [
                IndexModel("author"),
                IndexModel("subject"),
                IndexModel("created_at"),
                IndexModel(["author", "rkey"]),
            ]
        )

    logger.info("Connecting to NATS")
    await nats_manager.connect()

    logger.info("Starting service")

    async def process_messages(msgs: list[Msg]):
        if not msgs:
            return

        logger.debug("received messages")
        all_ops = defaultdict(list)
        for msg in msgs:
            db_ops = await _process_data(msg.data)
            for col, ops in db_ops.items():
                all_ops[col].extend(ops)
            await msg.ack()
        logger.debug("done processing messages")
        for col, ops in all_ops.items():
            await db[col].bulk_write(ops, ordered=False)
        logger.debug("done writing in db")

    try:
        await nats_manager.js.consumer_info(_config.NATS_STREAM, _config.INDEXER_CONSUMER)
    except NotFoundError:
        await nats_manager.js.add_consumer(
            stream=_config.NATS_STREAM,
            config=ConsumerConfig(
                name=_config.INDEXER_CONSUMER,
                durable_name=_config.INDEXER_CONSUMER,
                filter_subject=f"{_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX}.>",
                deliver_policy=DeliverPolicy.ALL,
                ack_policy=AckPolicy.EXPLICIT,
                ack_wait=60,
                max_ack_pending=-1,
            ),
        )

    await nats_manager.pull_subscribe(
        stream=_config.NATS_STREAM,
        consumer=_config.INDEXER_CONSUMER,
        callback=process_messages,
        batch_size=_config.INDEXER_BATCH_SIZE,
    )

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
