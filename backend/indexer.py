import asyncio
import datetime
import signal
import json
from pymongo import IndexModel
from nats.aio.msg import Msg
from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy
from nats.js.errors import NotFoundError
from collections import defaultdict
from atproto import models
import argparse

from utils.nats import NATSManager
from utils.database import MongoDBManager
from utils.core import (
    Config,
    Logger,
    Event,
)

from utils.interactions import (
    INTERACTION_RECORDS,
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


async def main():
    _config = Config()
    nats_manager = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    mongo_manager = MongoDBManager(uri=_config.MONGO_URI)

    async def _process_data(data: str):
        event: Event = json.loads(data)
        db_ops = defaultdict(list)

        if not _config.INDEXER_ENABLE:
            return {}

        if event["kind"] == "account":
            account = models.ComAtprotoSyncSubscribeRepos.Account.model_validate(event["account"], strict=False)
            db_ops[models.ids.AppBskyActorProfile].append(
                UpdateOne(
                    {"_id": account.did},
                    {
                        "$set": {
                            "active": account.active,
                            "status": account.status,
                            "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                        },
                        "$setOnInsert": {
                            "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                        },
                    },
                    upsert=True,
                )
            )

        if event["kind"] == "identity":
            identity = models.ComAtprotoSyncSubscribeRepos.Identity.model_validate(event["identity"], strict=False)
            db_ops[models.ids.AppBskyActorProfile].append(
                UpdateOne(
                    {"_id": identity.did},
                    {
                        "$set": {
                            "handle": identity.handle,
                            "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                        },
                        "$setOnInsert": {
                            "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                        },
                    },
                    upsert=True,
                )
            )

        if event["kind"] == "commit":
            commit = event["commit"]
            operation = commit["operation"]
            repo = commit["repo"]
            collection = commit["collection"]
            rkey = commit["rkey"]

            if operation == "create" or operation == "update":
                record = models.get_or_create(commit["record"], strict=False)

                if collection == models.ids.AppBskyActorProfile:
                    db_ops[collection].append(
                        UpdateOne(
                            {"_id": repo},
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

                if collection == models.ids.AppBskyGraphBlock:
                    db_ops[collection].append(
                        InsertOne(
                            {
                                "_id": f"{repo}/{collection}/{rkey}",
                                "author": repo,
                                "subject": record.subject,
                                "created_at": datetime.datetime.fromisoformat(record.created_at),
                            }
                        )
                    )

                if operation == "create" and collection in INTERACTION_RECORDS:
                    interaction = parse_interaction(repo, rkey, record)
                    if interaction:
                        doc_collection = "{}.{}".format(_config.INTERACTIONS_COLLECTION, collection.split(".")[-1])
                        db_ops[doc_collection].append(InsertOne(interaction))

            if operation == "delete":
                if collection == models.ids.AppBskyActorProfile:
                    db_ops[collection].append(
                        UpdateOne(
                            {"_id": repo},
                            {"$set": {"deleted": True}},
                            upsert=True,
                        )
                    )

                if collection == models.ids.AppBskyGraphBlock:
                    db_ops[collection].append(DeleteOne({"_id": f"{repo}/{collection}/{rkey}"}))

                if collection in INTERACTION_RECORDS:
                    doc_collection = "{}.{}".format(_config.INTERACTIONS_COLLECTION, collection.split(".")[-1])
                    db_ops[doc_collection].append(DeleteOne({"_id": f"{repo}/{rkey}"}))

        return db_ops

    logger.info("Connecting to Mongo")
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(_config.INDEXER_DB)

    for record_type in INTERACTION_RECORDS:
        doc_collection = "{}.{}".format(_config.INTERACTIONS_COLLECTION, record_type.split(".")[-1])
        await db[doc_collection].create_indexes(
            [
                IndexModel(["a", "t"]),
                IndexModel(["s", "t"]),
                IndexModel("t", expireAfterSeconds=60 * 60 * 24 * 15),
            ]
        )

    await db[models.ids.AppBskyGraphBlock].create_indexes(
        [
            IndexModel(["author", "created_at"]),
            IndexModel(["subject", "created_at"]),
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
            db_ops = await _process_data(msg.data.decode())
            for col, ops in db_ops.items():
                all_ops[col].extend(ops)
        logger.debug("done processing messages")

        tasks = []
        for col, ops in all_ops.items():
            tasks.append(db[col].bulk_write(ops, ordered=False))
        await asyncio.gather(*tasks)
        logger.debug("done writing in db")
        await msg.ack()

    try:
        await nats_manager.js.consumer_info(_config.NATS_STREAM, _config.INDEXER_CONSUMER)
    except NotFoundError:
        await nats_manager.js.add_consumer(
            stream=_config.NATS_STREAM,
            config=ConsumerConfig(
                name=_config.INDEXER_CONSUMER,
                durable_name=_config.INDEXER_CONSUMER,
                filter_subject=f"{_config.FIREHOSE_ENJOYER_SUBJECT_PREFIX}.>",
                deliver_policy=DeliverPolicy.ALL,
                ack_policy=AckPolicy.ALL,
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
