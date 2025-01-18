import asyncio
import pickle
import signal
import time
from typing import Any
import nats
from prometheus_client import Counter, make_asgi_app
import uvicorn

from collections import defaultdict

from atproto import (
    CAR,
    AtUri,
    firehose_models,
    AsyncFirehoseSubscribeReposClient,
    models,
    parse_subscribe_repos_message,
)

from utils.core import (
    Logger,
    Config,
    INTERESTED_RECORDS,
)

from utils.nats import NATSManager

app = make_asgi_app()
_config = Config()
firehose_counter = Counter("firehose", "firehose", ["action", "collection"])
firehose_lang_counter = Counter("post_langs", "post languages", ["lang"])
logger = Logger("enjoyer")

RECONNECT_DELAY = 5

# Signal handling
is_shutdown = False


def signal_handler(signum, frame):
    global is_shutdown
    is_shutdown = True
    logger.info("SHUTDOWN")


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def measure_events_per_second(func: callable) -> callable:
    def wrapper(*args) -> Any:
        wrapper.calls += 1
        cur_time = time.time()

        if cur_time - wrapper.start_time >= 1:
            logger.info(f"NETWORK LOAD: {wrapper.calls} events/second")
            wrapper.start_time = cur_time
            wrapper.calls = 0

        return func(*args)

    wrapper.calls = 0
    wrapper.start_time = time.time()

    return wrapper


def get_nats_subject(collection: str) -> str:
    return f"{_config.FIREHOSE_ENJOYER_SUBJECT_PREFIX}.{collection}"


async def subscribe_to_firehose(nm: NATSManager):
    kv = await nm.get_or_create_kv_store(_config.NATS_STREAM)
    
    try:
        cursor = await kv.get("cursor")
        cursor = int(cursor.value)
    except nats.js.errors.KeyNotFoundError:
        cursor = None

    logger.info(f"Starting at cursor: {cursor}")

    params = None
    if cursor:
        params = models.ComAtprotoSyncSubscribeRepos.Params(cursor=cursor)

    client = AsyncFirehoseSubscribeReposClient(params)

    @measure_events_per_second
    async def on_message_handler(message: firehose_models.MessageFrame) -> None:
        commit = parse_subscribe_repos_message(message)
        if not isinstance(commit, models.ComAtprotoSyncSubscribeRepos.Commit):
            return

        if commit.seq % _config.FIREHOSE_ENJOYER_CHECKPOINT == 0:
            client.update_params(models.ComAtprotoSyncSubscribeRepos.Params(cursor=commit.seq))
            logger.debug(f"saving new cursor: {commit.seq}")
            await kv.put("cursor", str(commit.seq).encode())

        if not commit.blocks:
            return

        ops = _get_ops_by_type(commit)

        for collection, data in ops.items():
            subject = get_nats_subject(collection)

            for action, documents in data.items():
                if len(documents) == 0:
                    continue

                for document in documents:
                    await nm.publish(subject, pickle.dumps({"action": action, **document}))

                    firehose_counter.labels(action, collection).inc()

                    if action == "create" and collection == models.ids.AppBskyFeedPost:
                        langs = document["record"].langs
                        lang = langs[0][:2].lower() if isinstance(langs, list) and len(langs) > 0 else "unknown"
                        firehose_lang_counter.labels(lang).inc()

    await client.start(on_message_handler)


def _get_ops_by_type(commit: models.ComAtprotoSyncSubscribeRepos.Commit) -> defaultdict:
    operation_by_type = defaultdict(lambda: {"create": [], "delete": [], "update": []})

    car = CAR.from_bytes(commit.blocks)
    for op in commit.ops:
        uri = AtUri.from_str(f"at://{commit.repo}/{op.path}")

        if uri.collection not in INTERESTED_RECORDS:
            continue

        if op.action in ["create", "update"]:
            if not op.cid:
                continue

            create_info = {"uri": str(uri), "cid": str(op.cid), "author": commit.repo}

            record_raw_data = car.blocks.get(op.cid)
            if not record_raw_data:
                continue

            record = models.get_or_create(record_raw_data, strict=False)
            record_type = INTERESTED_RECORDS.get(uri.collection)

            if record_type and models.is_record_type(record, record_type):
                operation_by_type[uri.collection][op.action].append({"record": record, **create_info})

        if op.action == "delete":
            operation_by_type[uri.collection]["delete"].append({"uri": str(uri)})

    return operation_by_type


async def start_service():
    logger.info("Connecting to NATS and checking stuff")

    nm = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    await nm.connect()
    await nm.create_stream(
        prefixes=[_config.FIREHOSE_ENJOYER_SUBJECT_PREFIX],
        max_age=_config.NATS_STREAM_MAX_AGE,
        max_size=_config.NATS_STREAM_MAX_SIZE,
    )
    

    logger.info("Starting firehose enjoyer")
    await subscribe_to_firehose(nm)

    try:
        while not is_shutdown:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Shutting down indexer...")
    finally:
        await nm.disconnect()
        logger.info("Indexer shutdown complete.")


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


if __name__ == "__main__":
    logger.info("INIT")
    asyncio.run(main())
