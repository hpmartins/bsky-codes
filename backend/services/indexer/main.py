import argparse
import asyncio
import datetime
import json
import signal
from collections import defaultdict

from atproto import AtUri, models
from atproto_client.models.unknown_type import UnknownRecordType
from nats.aio.msg import Msg
from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy
from nats.js.errors import NotFoundError
from pymongo import DeleteOne, IndexModel, InsertOne, UpdateOne
from pymongo.errors import BulkWriteError

from backend.core.config import Config
from backend.core.database import MongoDBManager
from backend.core.defaults import INTERACTION_RECORDS
from backend.core.logger import Logger
from backend.core.stream import NATSManager
from backend.core.types import Commit, Event

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


def _get_date(created_at: str | None = None):
    if created_at:
        dt = datetime.datetime.fromisoformat(created_at)
    else:
        dt = datetime.datetime.now(tz=datetime.timezone.utc)
    return dt.replace(minute=0, second=0, microsecond=0)


def _create_interaction(
    created_at: str,
    author: str,
    subject: str,
    post_author: str,
    rkey: str = "",
    post_rkey: str = "",
    langs: list | None = None,
) -> dict:
    ts = datetime.datetime.fromisoformat(created_at)
    date = _get_date(created_at)
    return {
        "t": ts,
        "d": date,
        "a": author,
        "s": subject,
        "pa": post_author,
        "r": rkey,
        "pr": post_rkey,
        "l": langs or [],
        "c": 1,
    }


class FirehoseConsumer:
    def __init__(self, subject: str):
        self._config = Config()
        self._subject = subject
        self._nm = NATSManager(uri=self._config.NATS_URI, stream=self._config.NATS_STREAM)
        self._mongo = MongoDBManager(uri=self._config.MONGO_URI)
        self._collections = {
            "post": {
                "coll": "",
                "items": defaultdict(list),
            },
            "repost": {
                "coll": "",
                "items": defaultdict(list),
            },
            "like": {
                "coll": "",
                "items": defaultdict(list),
            },
            "follow": {
                "coll": "app.bsky.graph.follow",
                "items": defaultdict(list),
            },
            "block": {
                "coll": "app.bsky.graph.block",
                "items": defaultdict(list),
            },
        }

    async def connect(self):
        logger.info("Connecting to NATS and Mongo")
        await self._nm.connect()
        await self._mongo.connect()
        self._db = self._mongo.client.get_database(self._config.FART_DB)

        for op in self._collections:
            self._collections[op]["coll"] = f"{self._config.INTERACTIONS_COLLECTION}.{op}"

        try:
            await self._nm.jetstream.consumer_info(self._config.NATS_STREAM, self._config.NATS_CONSUMER)
        except NotFoundError:
            await self._nm.jetstream.add_consumer(
                self._config.NATS_STREAM,
                ConsumerConfig(
                    name=self._config.NATS_CONSUMER,
                    durable_name=self._config.NATS_CONSUMER,
                    ack_policy=AckPolicy.EXPLICIT,
                    deliver_policy=DeliverPolicy.ALL,
                    filter_subject=self._subject,
                    ack_wait=10 * 60 * 1000_1000_000,  # 10 minutes in nanoseconds
                ),
            )

        logger.info(f"Starting to consume {self._subject}")

    async def disconnect(self):
        await self._nm.disconnect()
        await self._mongo.disconnect()

    async def consume(self):
        try:
            psub = await self._nm.jetstream.pull_subscribe(
                self._subject, durable=self._config.NATS_CONSUMER, stream=self._config.NATS_STREAM
            )
            msgs = await psub.fetch(10)
            for msg in msgs:
                await self._handle_message(msg)
            return len(msgs)
        except Exception as e:
            logger.error(f"Error consuming message: {e}")
            return 0

    async def _flush_ops(self) -> None:
        c_indexes = {}

        for op, col in self._collections.items():
            collection_name = col["coll"]
            bulk_ops = []
            collection = self._db[collection_name]

            if collection_name not in c_indexes:
                collection.create_indexes(
                    [
                        IndexModel([("t", 1)]),
                        IndexModel([("d", 1)]),
                        IndexModel([("a", 1)]),
                        IndexModel([("s", 1)]),
                        IndexModel([("pa", 1)]),
                    ]
                )
                c_indexes[collection_name] = True

            for created_at, items in col["items"].items():
                for it in items:
                    record = await self._get_op(op, it, created_at)
                    if not record:
                        continue

                    if op in INTERACTION_RECORDS:
                        bulk_ops.append(InsertOne(record))
                    else:
                        filter_query = {
                            "author": record["author"],
                            "subject": record["subject"],
                        }
                        if record["rkey"]:
                            filter_query["rkey"] = record["rkey"]

                        if it.get("operation") in ["create", "update"]:
                            bulk_ops.append(
                                UpdateOne(
                                    filter_query,
                                    {"$set": record},
                                    upsert=True,
                                )
                            )
                        if it.get("operation") == "delete":
                            bulk_ops.append(DeleteOne(filter_query))

            try:
                if bulk_ops:
                    await collection.bulk_write(bulk_ops)
            except BulkWriteError as e:
                logger.error(f"Error in bulk_write: {e.details}")
            except Exception as e:
                logger.error(f"Error in bulk_write: {e}")

            col["items"] = defaultdict(list)

    async def _get_op(self, _op: str, item: dict, created_at: str) -> dict | None:
        operation = item.get("operation")
        repo = item.get("repo")
        record = item.get("record", {})
        collection = item.get("collection")
        rkey = item.get("rkey")

        if _op == "post" and collection == models.ids.AppBskyFeedPost:
            return _create_interaction(
                created_at=created_at,
                author=repo,
                subject=repo,
                post_author=repo,
                rkey=rkey,
                post_rkey=rkey,
                langs=record.get("langs"),
            )

        if _op == "repost" and collection == models.ids.AppBskyFeedRepost:
            subject_uri = record.get("subject", {}).get("uri", None)
            if not subject_uri:
                return None

            try:
                subject = AtUri.from_str(subject_uri)
                post_author = subject.host
                post_rkey = subject.rkey
            except Exception:
                subject = record.get("subject", {}).get("uri", "")
                post_author = ""
                post_rkey = ""

            return _create_interaction(
                created_at=created_at,
                author=repo,
                subject=post_author,
                post_author=post_author,
                rkey=rkey,
                post_rkey=post_rkey,
            )

        if _op == "like" and collection == models.ids.AppBskyFeedLike:
            subject_uri = record.get("subject", None)
            if not subject_uri:
                return None

            try:
                subject = AtUri.from_str(subject_uri)
                post_author = subject.host
                post_rkey = subject.rkey
            except Exception:
                subject = record.get("subject", "")
                post_author = ""
                post_rkey = ""

            return _create_interaction(
                created_at=created_at,
                author=repo,
                subject=post_author,
                post_author=post_author,
                rkey=rkey,
                post_rkey=post_rkey,
            )

        if _op == "follow" and collection == models.ids.AppBskyGraphFollow:
            subject_did = record.get("subject", None)

            if not subject_did:
                return None

            return {
                "operation": operation,
                "created_at": datetime.datetime.fromisoformat(created_at),
                "author": repo,
                "subject": subject_did,
                "rkey": rkey,
            }

        if _op == "block" and collection == models.ids.AppBskyGraphBlock:
            subject_did = record.get("subject", None)
            if not subject_did:
                return None

            return {
                "operation": operation,
                "created_at": datetime.datetime.fromisoformat(created_at),
                "author": repo,
                "subject": subject_did,
                "rkey": rkey,
            }

        return None

    async def _handle_message(self, msg: Msg) -> None:
        try:
            event = json.loads(msg.data)
            if event.get("kind") != "commit":
                await msg.ack()
                return

            commit: Commit = event.get("commit")
            operation = commit.get("operation")
            record = commit.get("record")
            repo = commit.get("repo")
            collection = commit.get("collection")
            rkey = commit.get("rkey")

            message = Event(
                repo=repo,
                collection=collection,
                rkey=rkey,
                operation=operation,
                record=record,
            )

            created_at = record.get("createdAt", datetime.datetime.now(tz=datetime.timezone.utc).isoformat())

            if collection == models.ids.AppBskyFeedPost:
                logger.debug(f"New post: {repo} rt: {rkey}")
                self._collections["post"]["items"][created_at].append(message.dict())
            elif collection == models.ids.AppBskyFeedRepost:
                logger.debug(f"New repost: {repo} rt: {rkey}")
                self._collections["repost"]["items"][created_at].append(message.dict())
            elif collection == models.ids.AppBskyFeedLike:
                logger.debug(f"New like: {repo} rt: {rkey}")
                self._collections["like"]["items"][created_at].append(message.dict())
            elif collection == models.ids.AppBskyGraphFollow:
                logger.debug(f"New follow: {repo} rt: {rkey}")
                self._collections["follow"]["items"][created_at].append(message.dict())
            elif collection == models.ids.AppBskyGraphBlock:
                logger.debug(f"New block: {repo} rt: {rkey}")
                self._collections["block"]["items"][created_at].append(message.dict())

            await msg.ack()
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await msg.nak()


async def main():
    """Main entry point of the application."""
    _config = Config()
    consumer = FirehoseConsumer(_config.NATS_STREAM_SUBJECT_PREFIX + ".commit")
    await consumer.connect()

    try:
        while not is_shutdown:
            processed = await consumer.consume()
            if processed:
                logger.debug(f"Processed {processed} messages")
                await consumer._flush_ops()
            else:
                await asyncio.sleep(1)

    except KeyboardInterrupt:
        pass
    finally:
        await consumer.disconnect()


if __name__ == "__main__":
    asyncio.run(main()) 