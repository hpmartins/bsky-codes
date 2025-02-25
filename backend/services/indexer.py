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

from backend.config import Config
from backend.database import MongoDBManager
from backend.defaults import INTERACTION_RECORDS
from backend.logger import Logger
from backend.stream import NATSManager
from backend.types import Commit, Event

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
    rkey: str,
    subject: str,
    others: dict = {},
):
    if author == subject:
        return None

    return {
        "_id": f"{author}/{rkey}",
        "a": author,
        "s": subject,
        "t": _get_date(created_at),
        **others,
    }


def _parse_create_interaction(author: str, rkey: str, record: UnknownRecordType):
    if models.is_record_type(record, models.ids.AppBskyFeedLike) or models.is_record_type(
        record, models.ids.AppBskyFeedRepost
    ):
        return _create_interaction(
            record.created_at,
            author,
            rkey,
            AtUri.from_str(record.subject.uri).host,
        )

    if models.is_record_type(record, models.ids.AppBskyFeedPost):
        if record.reply is not None and record.reply.parent is not None:
            return _create_interaction(
                record.created_at,
                author,
                rkey,
                AtUri.from_str(record.reply.parent.uri).host,
                dict(c=len(record.text)),
            )

        if record.embed is not None:
            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
                return _create_interaction(
                    record.created_at,
                    author,
                    rkey,
                    AtUri.from_str(record.embed.record.uri).host,
                    dict(c=len(record.text)),
                )

            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecordWithMedia):
                if models.is_record_type(record.embed.record, models.ids.AppBskyEmbedRecord):
                    return _create_interaction(
                        record.created_at,
                        author,
                        rkey,
                        AtUri.from_str(record.embed.record.record.uri).host,
                        dict(c=len(record.text)),
                    )


def _parse_interaction(commit: Commit) -> InsertOne | DeleteOne | None:
    if commit["operation"] == "create":
        record = models.get_or_create(commit["record"], strict=False)
        interaction = _parse_create_interaction(commit["repo"], commit["rkey"], record)
        if interaction:
            return InsertOne(interaction)
    elif commit["operation"] == "delete":
        return DeleteOne({"_id": "{}/{}".format(commit["repo"], commit["rkey"])})


def _parse_profile(commit: Commit) -> UpdateOne:
    if commit["operation"] == "create" or commit["operation"] == "update":
        record = models.get_or_create(commit["record"], strict=False)
        return UpdateOne(
            {"_id": commit["repo"]},
            {
                "$set": {
                    **record.model_dump(exclude=["avatar", "banner", "py_type"]),
                    "created_at": (
                        datetime.datetime.fromisoformat(record["created_at"]) if record["created_at"] else None
                    ),
                    "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                },
                "$setOnInsert": {
                    "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                },
            },
            upsert=True,
        )
    elif commit["operation"] == "delete":
        return UpdateOne(
            {"_id": commit["repo"]},
            {"$set": {"deleted": True}},
            upsert=True,
        )


def _parse_block(commit: Commit) -> InsertOne | DeleteOne | None:
    _id = "{}/{}/{}".format(commit["repo"], commit["collection"], commit["rkey"])
    if commit["operation"] == "create":
        record = models.get_or_create(commit["record"], strict=False)
        return InsertOne(
            {
                "_id": _id,
                "author": commit["repo"],
                "subject": record.subject,
                "created_at": datetime.datetime.fromisoformat(record.created_at),
            }
        )
    elif commit["operation"] == "delete":
        return DeleteOne({"_id": _id})


def update_and_inc(repo, target_uri, field):
    full_field = f"tally.self_{field}" if repo in target_uri else f"tally.{field}"
    return UpdateOne({"_id": target_uri}, {"$inc": {full_field: 1}})


def _parse_tally(commit: Commit) -> list[InsertOne | UpdateOne | DeleteOne]:
    ops = []

    operation = commit["operation"]
    repo = commit["repo"]
    collection = commit["collection"]
    rkey = commit["rkey"]
    uri = AtUri.from_str("at://{}/{}/{}".format(repo, collection, rkey))

    if operation == "delete" and collection == models.ids.AppBskyFeedPost:
        ops.append(DeleteOne({"_id": str(uri)}))

    if operation == "create":
        record = models.get_or_create(commit["record"], strict=False)
        if record is None:
            return []

        if collection == models.ids.AppBskyFeedPost:
            ops.append(
                InsertOne(
                    {
                        "_id": str(uri),
                        "author": repo,
                        "created_at": datetime.datetime.fromisoformat(record.created_at),
                        "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                        "langs": commit["record"].get("langs", None),
                        "reply": commit["record"].get("reply", None),
                    }
                )
            )

            if record.reply:
                if record.reply.parent:
                    ops.append(update_and_inc(repo, str(record.reply.parent.uri), "replies"))
                if record.reply.root:
                    ops.append(update_and_inc(repo, str(record.reply.root.uri), "root_replies"))

            if record.embed:
                target_uri = None
                if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
                    target_uri = record.embed.record.uri
                if models.is_record_type(
                    record.embed, models.ids.AppBskyEmbedRecordWithMedia
                ) and models.is_record_type(record.embed.record, models.ids.AppBskyEmbedRecord):
                    target_uri = record.embed.record.record.uri

                if target_uri:
                    ops.append(update_and_inc(repo, target_uri, "quotes"))

        if collection == models.ids.AppBskyFeedLike:
            ops.append(update_and_inc(repo, str(record.subject.uri), "likes"))

        if collection == models.ids.AppBskyFeedRepost:
            ops.append(update_and_inc(repo, str(record.subject.uri), "reposts"))

    return ops


async def main():
    _config = Config()
    nats_manager = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    mongo_manager = MongoDBManager(uri=_config.MONGO_URI)

    async def _process_data(data: str):
        event: Event = json.loads(data)
        db_ops = defaultdict(list)

        if not _config.INDEXER_ENABLE:
            return db_ops

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
            collection = commit["collection"]

            if collection == models.ids.AppBskyActorProfile:
                profile_op = _parse_profile(commit)
                if profile_op:
                    db_ops[collection].append(profile_op)

            if collection == models.ids.AppBskyGraphBlock:
                block_op = _parse_block(commit)
                if block_op:
                    db_ops[collection].append(block_op)

            if collection in INTERACTION_RECORDS:
                tally_ops = _parse_tally(commit)
                if len(tally_ops) > 0:
                    db_ops[models.ids.AppBskyFeedPost].extend(tally_ops)

                interaction_op = _parse_interaction(commit)
                if interaction_op:
                    coll_name = "{}.{}".format(_config.INTERACTIONS_COLLECTION, collection.split(".")[-1])
                    db_ops[coll_name].append(interaction_op)

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

    await db[models.ids.AppBskyFeedPost].create_indexes(
        [
            IndexModel("indexed_at", expireAfterSeconds=60 * 60 * 24 * 8),
        ]
    )

    logger.info("Connecting to NATS")
    await nats_manager.connect()

    logger.info("Starting service")

    async def bulk_write(col: str, ops: list):
        try:
            await db[col].bulk_write(ops, ordered=False)
        except BulkWriteError:
            logger.error(f"Error writing to {col}: duplicate keys")
        except Exception as e:
            logger.error(f"Error writing to {col}: {e}")

    async def process_messages(msgs: list[Msg]):
        if not msgs:
            return

        logger.debug("received messages")
        all_ops = defaultdict(list)
        for msg in msgs:
            try:
                db_ops = await _process_data(msg.data.decode())
            except Exception as e:
                db_ops = None
                logger.error(f"Error processing message: {e}; msg={msg.data.decode()}")
                continue

            if db_ops:
                for col, ops in db_ops.items():
                    all_ops[col].extend(ops)
        logger.debug("done processing messages")

        await asyncio.gather(*[bulk_write(col, ops) for col, ops in all_ops.items()])
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
                filter_subject=f"{_config.NATS_STREAM_SUBJECT_PREFIX}.>",
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
