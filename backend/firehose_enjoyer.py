import argparse
import asyncio
import signal
import time
from types import FrameType
from typing import Any

import nats
import nats.js.errors
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

from core.config import Config
from core.defaults import INTERESTED_RECORDS
from core.logger import Logger
from core.nats import NATSManager
from core.types import (
    Commit,
    EventAccount,
    EventCommit,
    EventIdentity,
)

app = make_asgi_app()
_config = Config()
nm = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
client = AsyncFirehoseSubscribeReposClient()

counters = dict(
    network=Counter("firehose_network", "data received"),
    events=Counter("firehose_events", "events"),
    post_langs=Counter("firehose_post_langs", "post languages", ["lang"]),
    account=Counter("firehose_account_counter", "account updates", ["active", "status"]),
    identity=Counter("firehose_identity_counter", "identity updates"),
    firehose=Counter("firehose", "firehose", ["operation", "collection"]),
)

parser = argparse.ArgumentParser()
parser.add_argument("--log", default="INFO")
args = parser.parse_args()
logger = Logger("indexer", level=args.log.upper())


async def signal_handler(_: int, __: FrameType) -> None:
    logger.info("Shutting down...")
    await client.stop()


def get_nats_subject(collection: str) -> str:
    return f"{_config.FIREHOSE_ENJOYER_SUBJECT_PREFIX}.{collection}"


async def subscribe_to_firehose(nm: NATSManager):
    kv = await nm.get_or_create_kv_store(_config.NATS_STREAM)

    async def get_cursor():
        try:
            cursor = await kv.get("cursor")
            cursor = int(cursor.value)
        except nats.js.errors.KeyNotFoundError:
            cursor = ""
        return cursor

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
            await nm.publish(
                get_nats_subject("account"), EventAccount(kind="account", account=parsed_message.model_dump())
            )
            counters["account"].labels(parsed_message.active, parsed_message.status).inc()

        if isinstance(parsed_message, models.ComAtprotoSyncSubscribeRepos.Identity):
            await nm.publish(
                get_nats_subject("identity"), EventIdentity(kind="identity", identity=parsed_message.model_dump())
            )
            counters["identity"].inc()

        if not isinstance(parsed_message, models.ComAtprotoSyncSubscribeRepos.Commit):
            return

        if parsed_message.seq % _config.FIREHOSE_ENJOYER_CHECKPOINT == 0:
            client.update_params(models.ComAtprotoSyncSubscribeRepos.Params(cursor=parsed_message.seq))
            logger.debug(f"saving new cursor: {parsed_message.seq}")
            await kv.put("cursor", str(parsed_message.seq).encode())

        if not parsed_message.blocks:
            return

        commits = _process_commit(parsed_message)
        for commit in commits:
            subject = get_nats_subject(commit["collection"])

            try:
                await nm.publish(subject, EventCommit(kind="commit", commit=commit))
            except Exception as e:
                print(f"Error: {e}")
                print(commit)
                continue

            counters["firehose"].labels(commit["operation"], commit["collection"]).inc()

            if commit["operation"] == "create" and commit["collection"] == models.ids.AppBskyFeedPost:
                langs = commit["record"].get("langs", None)
                if langs:
                    lang = langs[0][:2].lower() if len(langs) > 0 else "empty"
                else:
                    lang = "none"
                counters["post_langs"].labels(lang).inc()

    cursor = await get_cursor()
    logger.info(f"Starting at cursor: {cursor}")

    params = None
    if cursor:
        params = models.ComAtprotoSyncSubscribeRepos.Params(cursor=cursor)
    client.update_params(params)

    await client.start(on_message_handler)


def _process_commit(commit: models.ComAtprotoSyncSubscribeRepos.Commit) -> list[Commit]:
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

            # record = models.get_or_create(record_raw_data, strict=False)
            # record_type = INTERESTED_RECORDS.get(uri.collection)
            # if record_type and models.is_record_type(record, record_type):
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
    logger.info("Connecting to NATS and checking stuff")
    await nm.connect()
    await nm.create_stream(
        prefixes=[_config.FIREHOSE_ENJOYER_SUBJECT_PREFIX],
        max_age=_config.NATS_STREAM_MAX_AGE,
        max_size=_config.NATS_STREAM_MAX_SIZE,
    )

    logger.info("Starting firehose enjoyer")
    await subscribe_to_firehose(nm)


async def start_uvicorn() -> None:
    logger.info("Starting uvicorn")
    uvicorn_config = uvicorn.config.Config(app, host="0.0.0.0", port=_config.FIREHOSE_ENJOYER_PORT)
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
    await nm.disconnect()
    logger.info("Shutdown complete.")


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda _, __: asyncio.create_task(signal_handler(_, __)))
    signal.signal(signal.SIGTERM, lambda _, __: asyncio.create_task(signal_handler(_, __)))
    logger.info("INIT")
    asyncio.run(main())
