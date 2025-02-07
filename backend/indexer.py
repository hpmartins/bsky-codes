import asyncio
import datetime
import signal
import json
import acsylla
from nats.aio.msg import Msg
from nats.js.api import ConsumerConfig, DeliverPolicy, AckPolicy
from nats.js.errors import NotFoundError
from collections import defaultdict
from atproto import (
    models,
)
import argparse

from utils.nats import NATSManager
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
    cass_manager = acsylla.create_cluster(["localhost"])

    async def _process_data(data: str):
        event: Event = json.loads(data)
        db_ops = []

        if not _config.INDEXER_ENABLE:
            return {}

        if event["kind"] == "commit":
            commit = event["commit"]
            operation = commit["operation"]
            repo = commit["repo"]
            collection = commit["collection"]
            rkey = commit["rkey"]

            if operation == "create" or operation == "update":
                record = models.get_or_create(commit["record"], strict=False)

                # if collection == models.ids.AppBskyActorProfile:
                #     db_ops[collection].append(
                #         UpdateOne(
                #             {"_id": repo},
                #             {
                #                 "$set": {
                #                     **record.model_dump(exclude=["avatar", "banner", "py_type"]),
                #                     "created_at": (
                #                         datetime.datetime.fromisoformat(record["created_at"])
                #                         if record["created_at"]
                #                         else None
                #                     ),
                #                     "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                #                 },
                #                 "$setOnInsert": {
                #                     "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                #                 },
                #             },
                #             upsert=True,
                #         )
                #     )

                if operation == "create" and collection in INTERACTION_RECORDS:
                    interaction = parse_interaction(repo, collection, rkey, record)
                    if interaction:
                        statement = acsylla.create_statement(
                            "INSERT INTO bsky.interactions_by_author_collection (author, subject, collection, rkey, date) VALUES (?, ?, ?, ?, ?);",
                            parameters=5,
                        )
                        statement.bind_dict(interaction)
                        db_ops.append(statement)

                        statement = acsylla.create_statement(
                            "INSERT INTO bsky.interactions_by_subject_collection (author, subject, collection, rkey, date) VALUES (?, ?, ?, ?, ?);",
                            parameters=5,
                        )
                        statement.bind_dict(interaction)
                        db_ops.append(statement)

            if operation == "delete":
                # if collection == models.ids.AppBskyActorProfile:
                #     db_ops[collection].append(
                #         UpdateOne(
                #             {"_id": repo},
                #             {"$set": {"deleted": True}},
                #             upsert=True,
                #         )
                #     )
                if collection in INTERACTION_RECORDS:
                    statement = acsylla.create_statement(
                        "DELETE FROM bsky.interactions_by_author_collection WHERE author=? AND collection=? AND rkey=?",
                        parameters=3
                    )
                    statement.bind_dict(dict(author=repo, collection=collection.split('.')[-1], rkey=rkey))
                    db_ops.append(statement)

        return db_ops

    logger.info("Connecting to Cassandra")
    db = await cass_manager.create_session()

    await db.query(
        """
        CREATE KEYSPACE IF NOT EXISTS bsky WITH REPLICATION = { 
            'class': 'SimpleStrategy', 'replication_factor': 1
        };
        """
    )
    await db.use_keyspace("bsky")

    await db.query(
        """
        CREATE TABLE IF NOT EXISTS interactions_by_author_collection (
            author TEXT,
            subject TEXT,
            collection TEXT,
            rkey TEXT,
            date TIMESTAMP,
            PRIMARY KEY ((author, collection), rkey, date)
        );
        """
    )

    await db.query(
        """
        CREATE TABLE IF NOT EXISTS interactions_by_subject_collection (
            author TEXT,
            subject TEXT,
            collection TEXT,
            rkey TEXT,
            date TIMESTAMP,
            PRIMARY KEY ((subject, collection), rkey, date)
        );
        """
    )

    logger.info("Connecting to NATS")
    await nats_manager.connect()

    logger.info("Starting service")

    async def process_messages(msgs: list[Msg]):
        if not msgs:
            return

        logger.debug("received messages")
        all_ops = []
        for msg in msgs:
            db_ops = await _process_data(msg.data.decode())
            all_ops.extend(db_ops)
        logger.debug("done processing messages")

        tasks = [db.execute(op) for op in all_ops]
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
        logger.info("Shutdown complete.")


if __name__ == "__main__":
    asyncio.run(main())
