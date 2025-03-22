import argparse
import asyncio
import datetime
import json
import signal
from typing import Dict, Any, List

from atproto import AtUri, models
from atproto_client.models.unknown_type import UnknownRecordType

from backend.core.config import Config
from backend.core.logger import Logger
from backend.core.redis_manager import (
    RedisManager,
    get_firehose_entry,
)

from backend.core.mongo_manager import MongoManager
from backend.core.serialization import deserialize_data, extract_record_from_raw
from backend.core.defaults import INTERESTED_RECORDS
from backend.core.types import Commit
from collections import defaultdict
from pymongo import UpdateOne, DeleteOne, InsertOne

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


def uri_to_key(uri: AtUri) -> str:
    return str(uri).replace("at://", "").replace("/", ":")


def key_to_uri(key: str) -> AtUri:
    return AtUri.from_str("at://{}".format(key.replace(":", "/")))


class IndexerConsumer:
    def __init__(self):
        self._config = Config()
        self._rm = RedisManager(uri=self._config.REDIS_URI)
        self._mongo = MongoManager(uri=self._config.MONGODB_URI)

        # Define collections and their corresponding stream names
        self._keys = ["account", "identity", *list(INTERESTED_RECORDS.keys())]
        self._streams = [get_firehose_entry(key) for key in self._keys]

    async def connect(self):
        logger.info("Connecting to Redis and MongoDB")
        await self._rm.connect()
        await self._mongo.connect()

        self._mongo._db["interactions"].create_index([("author", 1), ("subject", 1), ("date", 1)])

        # Create consumer groups for each collection
        for stream in self._streams:
            # Create consumer group
            await self._rm.create_consumer_group(stream, self._config.INDEXER_CONSUMER_GROUP)

    async def disconnect(self):
        await self._rm.disconnect()
        await self._mongo.disconnect()

    async def start(self):
        logger.info("Starting indexer")
        # try:
        while not is_shutdown:
            # Process each collection
            all_db_ops = defaultdict(list)

            for key, stream in zip(self._keys, self._streams):
                # Read messages from stream
                messages = await self._rm.read_stream(
                    stream,
                    self._config.INDEXER_CONSUMER_GROUP,
                    "indexer",
                    count=self._config.INDEXER_BATCH_SIZE,
                )
                logger.info(f"Read {len(messages)} messages from {stream}")

                if not messages:
                    continue

                for message in messages:
                    message_id = message["id"]
                    message_data = message["data"]

                    # try:
                    data = json.loads(message_data["data"])
                    if key == "account":
                        account = models.ComAtprotoSyncSubscribeRepos.Account.model_validate(data, strict=False)
                        account_op = self._handle_account(account)
                        if account_op:
                            all_db_ops["account"].append(account_op)
                    elif key == "identity":
                        identity = models.ComAtprotoSyncSubscribeRepos.Identity.model_validate(data, strict=False)
                        identity_op = self._handle_identity(identity)
                        if identity_op:
                            all_db_ops["identity"].append(identity_op)
                    else:
                        commit_data = deserialize_data(data)
                        commit_ops = await self._handle_commit(commit_data)
                        for col, ops in commit_ops.items():
                            all_db_ops[col].extend(ops)
                    # except Exception as e:
                    #     logger.error(f"Error processing message {message_id}: {e}")

                    await self._rm.ack_message(stream, self._config.INDEXER_CONSUMER_GROUP, message_id)

            if all_db_ops:
                await asyncio.gather(*[self._mongo.bulk_write(col, ops) for col, ops in all_db_ops.items()])

            # Sleep a bit to avoid consuming too many resources
            await asyncio.sleep(0.1)
        # except Exception as e:
        #     logger.error(f"Error in consumer: {e}")

    def _handle_account(self, account: models.ComAtprotoSyncSubscribeRepos.Account) -> None:
        pass

    def _handle_identity(self, identity: models.ComAtprotoSyncSubscribeRepos.Identity) -> None:
        pass

    def get_record(self, commit: Commit) -> UnknownRecordType | None:
        record_raw = commit.get("record", {})
        record_dict = extract_record_from_raw(record_raw)
        record = models.get_or_create(record_dict, strict=False)
        if record is None:
            logger.error(f"Failed to create record from {record_raw}")
        return record

    def parse_profile(self, uri: AtUri, commit: Commit) -> UpdateOne | None:
        if commit["operation"] in ["create", "update"]:
            record = self.get_record(commit)
            if record is None:
                return None

            timestamp = datetime.datetime.now(tz=datetime.timezone.utc)
            return UpdateOne(
                {"_id": str(uri)},
                {
                    "$set": {
                        **record.model_dump(exclude=["avatar", "banner", "py_type"]),
                        "created_at": (
                            datetime.datetime.fromisoformat(record["created_at"]) if record["created_at"] else None
                        ),
                        "updated_at": timestamp,
                    },
                    "$setOnInsert": {
                        "indexed_at": timestamp,
                    },
                },
                upsert=True,
            )
        elif commit["operation"] == "delete":
            return UpdateOne(
                {"_id": str(uri)},
                {"$set": {"deleted_at": timestamp}},
            )
        return

    def parse_block(self, uri: AtUri, commit: Commit) -> InsertOne | DeleteOne | None:
        if commit["operation"] == "create":
            record = self.get_record(commit)
            if record is None:
                return
            timestamp = datetime.datetime.now(tz=datetime.timezone.utc)
            return InsertOne(
                {
                    "_id": str(uri),
                    "author": uri.host,
                    "subject": str(record.subject),
                    "created_at": (datetime.datetime.fromisoformat(record.created_at) if record.created_at else None),
                    "timestamp": timestamp,
                }
            )
        elif commit["operation"] == "delete":
            return DeleteOne({"_id": str(uri)})
        return None

    async def _handle_commit(self, commit: Commit) -> Dict[str, List[Any]]:
        """Handle a commit from the firehose."""

        operation = commit.get("operation")
        author = commit.get("repo")
        collection = commit.get("collection")
        rkey = commit.get("rkey")
        uri = AtUri.from_str(f"at://{author}/{collection}/{rkey}")

        db_ops = defaultdict(list)

        if collection == models.ids.AppBskyActorProfile:
            op = self.parse_profile(uri, commit)
            if op:
                db_ops[collection].append(op)

        if collection == models.ids.AppBskyGraphBlock:
            op = self.parse_block(uri, commit)
            if op:
                db_ops[collection].append(op)

        timestamp = datetime.datetime.now(tz=datetime.timezone.utc)
        date = timestamp.date().isoformat()

        if collection == models.ids.AppBskyFeedPost:
            if operation == "update":
                pass
            elif operation == "create":
                record = self.get_record(commit)
                if record is None:
                    return db_ops

                # Check for reply parent and root
                parent_uri = None
                root_uri = None
                if record.reply:
                    try:
                        parent_uri = AtUri.from_str(record.reply.parent.uri)
                        root_uri = AtUri.from_str(record.reply.root.uri)
                    except Exception as e:
                        logger.error(f"Error parsing reply URI: {e}")

                # Check for quote
                quote_uri = None
                n_images = 0
                has_video = False
                if record.embed:
                    if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
                        quote_uri = AtUri.from_str(record.embed.record.uri)
                    elif models.is_record_type(record.embed, models.ids.AppBskyEmbedImages):
                        n_images = len(record.embed.images)
                    elif models.is_record_type(record.embed, models.ids.AppBskyEmbedVideo):
                        has_video = True
                    elif models.is_record_type(record.embed, models.ids.AppBskyEmbedRecordWithMedia):
                        quote_uri = AtUri.from_str(record.embed.record.record.uri)
                        if models.is_record_type(record.embed.media, models.ids.AppBskyEmbedImages):
                            n_images = len(record.embed.media.images)
                        elif models.is_record_type(record.embed.media, models.ids.AppBskyEmbedVideo):
                            has_video = True

                post_data = {
                    "author": author,
                    "chars": len(record.text),
                    "langs": record.langs,
                    "reply_parent": str(parent_uri),
                    "reply_root": str(root_uri),
                    "quote_of": str(quote_uri),
                    "likes": 0,
                    "replies": 0,
                    "quotes": 0,
                    "reposts": 0,
                    "root_replies": 0,
                    "n_images": n_images,
                    "has_video": has_video,
                    "created_at": (datetime.datetime.fromisoformat(record.created_at) if record.created_at else None),
                    "timestamp": timestamp,
                }

                db_ops[collection].append(
                    InsertOne(
                        {
                            "_id": str(uri),
                            **post_data,
                        }
                    )
                )

                if parent_uri:
                    db_ops[collection].append(UpdateOne({"_id": str(parent_uri)}, {"$inc": {"replies": 1}}))
                    if parent_uri.host != uri.host:
                        db_ops["interactions"].append(
                            UpdateOne(
                                {"author": uri.host, "subject": parent_uri.host, "date": date},
                                {"$inc": {"replies": 1, "chars": len(record.text)}},
                                upsert=True,
                            )
                        )

                if root_uri:
                    db_ops[collection].append(UpdateOne({"_id": str(root_uri)}, {"$inc": {"root_replies": 1}}))
                    if root_uri.host != uri.host:
                        db_ops["interactions"].append(
                            UpdateOne(
                                {"author": uri.host, "subject": root_uri.host, "date": date},
                                {"$inc": {"root_replies": 1}},
                                upsert=True,
                            )
                        )

                if quote_uri:
                    db_ops[collection].append(UpdateOne({"_id": str(quote_uri)}, {"$inc": {"quotes": 1}}))
                    if quote_uri.host != uri.host:
                        db_ops["interactions"].append(
                            UpdateOne(
                                {"author": uri.host, "subject": quote_uri.host, "date": date},
                                {"$inc": {"quotes": 1, "chars": len(record.text)}},
                                upsert=True,
                            )
                        )

            elif operation == "delete":
                db_ops[collection].append(UpdateOne({"_id": str(uri)}, {"$set": {"deleted_at": timestamp}}))

                post_data = await self._mongo._db[collection].find_one({"_id": str(uri)})
                if post_data is None:
                    return db_ops

                if post_data.get("reply_parent"):
                    db_ops[collection].append(
                        UpdateOne({"_id": str(post_data["reply_parent"])}, {"$inc": {"replies": -1}})
                    )
                    reply_parent_uri = AtUri.from_str(post_data["reply_parent"])
                    db_ops["interactions"].append(
                        UpdateOne(
                            {"author": uri.host, "subject": reply_parent_uri.host, "date": date},
                            {"$inc": {"replies": -1, "chars": -post_data["chars"]}},
                        )
                    )
                if post_data.get("reply_root"):
                    db_ops[collection].append(
                        UpdateOne({"_id": str(post_data["reply_root"])}, {"$inc": {"root_replies": -1}})
                    )
                if post_data.get("quote_of"):
                    db_ops[collection].append(UpdateOne({"_id": str(post_data["quote_of"])}, {"$inc": {"quotes": -1}}))
                    quote_of_uri = AtUri.from_str(post_data["quote_of"])
                    db_ops["interactions"].append(
                        UpdateOne(
                            {"author": uri.host, "subject": quote_of_uri.host, "date": date},
                            {"$inc": {"quotes": -1, "chars": -post_data["chars"]}},
                        )
                    )

        if collection == models.ids.AppBskyFeedLike:
            if operation == "create":
                record = self.get_record(commit)
                if record is None:
                    return db_ops

                subject_uri = AtUri.from_str(record.subject.uri)

                # Add like reference to redis
                await self._rm.set_key(uri_to_key(uri), {"subject": str(subject_uri)})

                # Update post stats
                db_ops[models.ids.AppBskyFeedPost].append(UpdateOne({"_id": str(subject_uri)}, {"$inc": {"likes": 1}}))

                # add like interaction
                db_ops["interactions"].append(
                    UpdateOne(
                        {"author": uri.host, "subject": subject_uri.host, "date": date},
                        {"$inc": {"likes": 1}},
                        upsert=True,
                    )
                )
            elif operation == "delete":
                like_ref = await self._rm.get(uri_to_key(uri))
                if like_ref:
                    db_ops[models.ids.AppBskyFeedPost].append(
                        UpdateOne({"_id": str(like_ref["subject"])}, {"$inc": {"likes": -1}})
                    )
                    like_ref_uri = AtUri.from_str(like_ref["subject"])
                    db_ops["interactions"].append(
                        UpdateOne(
                            {"author": uri.host, "subject": like_ref_uri.host, "date": date},
                            {"$inc": {"likes": -1}},
                        )
                    )

        if collection == models.ids.AppBskyFeedRepost:
            if operation == "create":
                record = self.get_record(commit)
                if record is None:
                    return db_ops

                subject_uri = AtUri.from_str(record.subject.uri)

                # add reference to redis
                await self._rm.set_key(uri_to_key(uri), {"subject": str(subject_uri)})

                db_ops[models.ids.AppBskyFeedPost].append(
                    UpdateOne({"_id": str(subject_uri)}, {"$inc": {"reposts": 1}})
                )

                # add repost interaction
                db_ops["interactions"].append(
                    UpdateOne(
                        {"author": uri.host, "subject": subject_uri.host, "date": date},
                        {"$inc": {"reposts": 1}},
                        upsert=True,
                    )
                )
            elif operation == "delete":
                repost_ref = await self._rm.get(uri_to_key(uri))
                if repost_ref:
                    db_ops[models.ids.AppBskyFeedPost].append(
                        UpdateOne({"_id": str(repost_ref["subject"])}, {"$inc": {"reposts": -1}})
                    )
                    repost_ref_uri = AtUri.from_str(repost_ref["subject"])
                    db_ops["interactions"].append(
                        UpdateOne(
                            {"author": uri.host, "subject": repost_ref_uri.host, "date": date},
                            {"$inc": {"reposts": -1}},
                        )
                    )

        return db_ops


async def main():
    consumer = IndexerConsumer()
    await consumer.connect()
    await consumer.start()
    await consumer.disconnect()

    # try:
    #     await consumer.connect()
    #     await consumer.start()
    # except KeyboardInterrupt:
    #     pass
    # except Exception as e:
    #     logger.error(f"Unexpected error: {e}")
    # finally:
    #     await consumer.disconnect()

    logger.info("Indexer stopped")


if __name__ == "__main__":
    logger.info("INIT")
    asyncio.run(main())
