import argparse
import asyncio
import json
import signal
import time
from types import FrameType
from typing import Any

import uvicorn
from atproto import (
    CAR,
    AsyncFirehoseSubscribeReposClient,
    AtUri,
    firehose_models,
    models,
    parse_subscribe_repos_message,
)
from prometheus_client import Counter, make_asgi_app

from backend.core.config import Config
from backend.core.defaults import INTERESTED_RECORDS
from backend.core.logger import Logger
from backend.core.redis_manager import RedisManager
from backend.core.serialization import serialize_data
from backend.core.types import Commit

app = make_asgi_app()
_config = Config()
rm = RedisManager(uri=_config.REDIS_URI)
client = AsyncFirehoseSubscribeReposClient()

counters = dict(
    network=Counter("network", "data received"),
    events=Counter("events", "events"),
    post_langs=Counter("post_langs", "post languages", ["lang"]),
    account=Counter("account", "account updates", ["active", "status"]),
    identity=Counter("identity", "identity updates"),
    firehose=Counter("firehose", "firehose", ["operation", "collection"]),
)

parser = argparse.ArgumentParser()
parser.add_argument("--log", default="INFO")
args = parser.parse_args()
logger = Logger("firehose_subscriber", level=args.log.upper())


async def signal_handler(_: int, __: FrameType) -> None:
    logger.info("Shutting down...")
    await client.stop()


STREAM_LENGTHS = {
    "firehose:account": _config.REDIS_STREAM_MAXLEN_ACCOUNT,
    "firehose:identity": _config.REDIS_STREAM_MAXLEN_IDENTITY,
    f"firehose:{models.ids.AppBskyFeedPost}": _config.REDIS_STREAM_MAXLEN_POST,
    f"firehose:{models.ids.AppBskyFeedLike}": _config.REDIS_STREAM_MAXLEN_LIKE,
    f"firehose:{models.ids.AppBskyFeedRepost}": _config.REDIS_STREAM_MAXLEN_REPOST,
    f"firehose:{models.ids.AppBskyActorProfile}": _config.REDIS_STREAM_MAXLEN_PROFILE,
    f"firehose:{models.ids.AppBskyGraphBlock}": _config.REDIS_STREAM_MAXLEN_BLOCK,
}


async def subscribe_to_firehose(rm: RedisManager):
    try:
        cursor_value = await rm.get("firehose:cursor")
        cursor = int(cursor_value) if cursor_value else ""
    except Exception:
        cursor = ""

    def measure_events_per_second(func: callable) -> callable:
        def wrapper(*args) -> Any:
            wrapper.calls += 1
            cur_time = time.time()

            if cur_time - wrapper.start_time >= 1:
                counters["events"].inc(wrapper.calls)
                logger.debug(f"NETWORK LOAD: {wrapper.calls}/s")
                wrapper.start_time = cur_time
                wrapper.calls = 0

            return func(*args)

        wrapper.calls = 0
        wrapper.start_time = time.time()

        return wrapper

    @measure_events_per_second
    async def on_message_handler(message: firehose_models.MessageFrame) -> None:
        parsed_message = parse_subscribe_repos_message(message)

        if isinstance(parsed_message, models.ComAtprotoSyncSubscribeRepos.Account):
            await rm.publish_to_stream(
                "firehose:account",
                {"data": json.dumps(parsed_message.model_dump())},
                maxlen=_config.REDIS_STREAM_MAXLEN_ACCOUNT,
            )
            counters["account"].labels(parsed_message.active, parsed_message.status).inc()

        if isinstance(parsed_message, models.ComAtprotoSyncSubscribeRepos.Identity):
            await rm.publish_to_stream(
                "firehose:identity",
                {"data": json.dumps(parsed_message.model_dump())},
                maxlen=_config.REDIS_STREAM_MAXLEN_IDENTITY,
            )
            counters["identity"].inc()

        if not isinstance(parsed_message, models.ComAtprotoSyncSubscribeRepos.Commit):
            return

        if parsed_message.seq % _config.FIREHOSE_CHECKPOINT == 0:
            client.update_params(models.ComAtprotoSyncSubscribeRepos.Params(cursor=parsed_message.seq))
            logger.debug(f"saving new cursor: {parsed_message.seq}")
            await rm.set_key("firehose:cursor", str(parsed_message.seq))

        if not parsed_message.blocks:
            return

        commits = _process_ops(parsed_message)
        for commit in commits:
            stream = "firehose:{}".format(commit["collection"])
            maxlen = STREAM_LENGTHS.get(stream, _config.REDIS_STREAM_MAXLEN_DEFAULT)
            try:
                serialized_commit = serialize_data(commit)
                await rm.publish_to_stream(stream, {"data": json.dumps(serialized_commit)}, maxlen=maxlen)
            except Exception as e:
                logger.error(f"Error publishing to stream: {e}")
                logger.debug(f"Problematic commit: {commit}")
                continue

            counters["firehose"].labels(commit["operation"], commit["collection"]).inc()

            if commit["operation"] == "create" and commit["collection"] == models.ids.AppBskyFeedPost:
                langs = commit["record"].get("langs", None)
                if langs:
                    lang = langs[0][:2].lower() if len(langs) > 0 else "empty"
                else:
                    lang = "none"
                counters["post_langs"].labels(lang).inc()

    logger.info(f"Starting at cursor: {cursor}")

    params = None
    if cursor:
        params = models.ComAtprotoSyncSubscribeRepos.Params(cursor=cursor)
    client.update_params(params)

    await client.start(on_message_handler)


def _process_ops(commit: models.ComAtprotoSyncSubscribeRepos.Commit) -> list[Commit]:
    ops = []
    car = CAR.from_bytes(commit.blocks)
    for op in commit.ops:
        uri = AtUri.from_str(f"at://{commit.repo}/{op.path}")

        if uri.collection not in INTERESTED_RECORDS:
            continue

        if op.action in ["create", "update"]:
            if not op.cid:
                continue

            record_raw_data = car.blocks.get(op.cid)
            if not record_raw_data:
                continue

            ops.append(
                {
                    "operation": op.action,
                    "repo": uri.host,
                    "collection": uri.collection,
                    "rkey": uri.rkey,
                    "record": record_raw_data,
                }
            )

        if op.action == "delete":
            ops.append(
                {
                    "operation": op.action,
                    "repo": uri.host,
                    "collection": uri.collection,
                    "rkey": uri.rkey,
                }
            )

    return ops


async def start_service():
    logger.info("Connecting to Redis and checking stuff")
    await rm.connect()

    logger.info("Starting firehose subscriber")
    await subscribe_to_firehose(rm)


async def start_uvicorn() -> None:
    logger.info("Starting uvicorn")
    uvicorn_config = uvicorn.config.Config(app, host="0.0.0.0", port=_config.FIREHOSE_PORT)
    server = uvicorn.server.Server(uvicorn_config)
    await server.serve()


async def main() -> None:
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_service()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )
    await rm.disconnect()
    logger.info("Shutdown complete.")


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda _, __: asyncio.create_task(signal_handler(_, __)))
    signal.signal(signal.SIGTERM, lambda _, __: asyncio.create_task(signal_handler(_, __)))
    logger.info("INIT")
    asyncio.run(main())
