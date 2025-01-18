import asyncio
import signal
import time
from typing import Any, List
import nats
from prometheus_client import Counter, make_asgi_app
import uvicorn
from urllib.parse import urlencode
import websockets
import json

from atproto import (
    models,
)

from utils.core import (
    Logger,
    Config,
    INTERESTED_RECORDS,
    JetstreamCommit,
    JetstreamAccount,
    JetstreamIdentity,
)

from utils.nats import NATSManager

app = make_asgi_app()
_config = Config()
firehose_network_counter = Counter("firehose_network", "firehose network")
firehose_calls_counter = Counter("firehose_events", "firehose calls")
firehose_lang_counter = Counter("post_langs", "post languages", ["lang"])
firehose_counter = Counter("firehose", "firehose", ["action", "collection"])
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


def get_nats_subject(collection: str) -> str:
    return f"{_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX}.{collection}"


async def subscribe_to_jetstream(collections: List[str], nm: NATSManager):
    kv = await nm.get_or_create_kv_store(_config.NATS_STREAM)

    try:
        cursor = await kv.get("cursor")
        cursor = int(cursor.value) - 5 * 1000000  # go back 5s
    except nats.js.errors.KeyNotFoundError:
        cursor = None

    logger.info(f"Starting at cursor: {cursor}")
    params = urlencode(
        dict(
            wantedCollections=collections,
        ),
        doseq=True,
    )
    uri_with_params = f"{_config.JETSTREAM_URI}?{params}"

    async def _parse_commit(did: str, commit: JetstreamCommit):
        payload = {
            "operation": commit.operation,
            "uri": "at://{}/{}/{}".format(did, commit.collection, commit.rkey),
        }
        if commit.operation == "create" or commit.operation == "update":
            payload["record"] = commit.record

        await nm.publish(get_nats_subject(commit.collection), json.dumps(payload).encode())

        firehose_counter.labels(commit.operation, commit.collection).inc()
        if commit.operation == "create" and commit.collection == models.ids.AppBskyFeedPost:
            if "langs" in commit.record:
                langs = commit.record["langs"]
                lang = langs[0][:2].lower() if isinstance(langs, list) and len(langs) > 0 else "empty"
            else:
                lang = "none"

            firehose_lang_counter.labels(lang).inc()

    def measure_events_per_second(func: callable) -> callable:
        def wrapper(*args) -> Any:
            wrapper.calls += 1
            wrapper.bytes_received += len(args[0])
            cur_time = time.time()
            
            if cur_time - wrapper.start_time >= 1:
                firehose_network_counter.inc(wrapper.bytes_received)
                firehose_calls_counter.inc(wrapper.calls)
                logger.info(f"NETWORK LOAD: {wrapper.calls} events/s; {wrapper.bytes_received/1024:1f} kb/s")
                wrapper.start_time = cur_time
                wrapper.calls = 0
                wrapper.bytes_received = 0

            return func(*args)

        wrapper.calls = 0
        wrapper.bytes_received = 0
        wrapper.start_time = time.time()

        return wrapper
    
    @measure_events_per_second
    async def on_message_handler(message: str, idx: int) -> None:
        try:
            event = json.loads(message)
        except (ValueError, KeyError):
            logger.error(f"error reading json: {message}")
            return
        
        did = event["did"]
        time_us = event["time_us"]
        kind = event["kind"]
        
        if idx % _config.JETSTREAM_ENJOYER_CHECKPOINT == 0:
            logger.info(f"saving new cursor: {time_us}")
            await kv.put("cursor", str(time_us).encode())
            
        if kind == "account":
            pass

        if kind == "identity":
            pass

        if kind == "commit":
            try:
                await _parse_commit(did, JetstreamCommit(**event["commit"]))
            except Exception as e:
                logger.error(f"error parsing commit: {event}")
                logger.error(e)
                return

    async for websocket in websockets.connect(uri_with_params):
        print(f"Connected to {uri_with_params}")
        try:
            idx = 0
            async for message in websocket:
                idx = idx + 1
                await on_message_handler(message, idx)
        except websockets.exceptions.ConnectionClosed:
            continue


async def start_service():
    logger.info("Connecting to NATS and checking stuff")

    nm = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)
    await nm.connect()
    await nm.create_stream(
        prefixes=[_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX],
        max_age=_config.NATS_STREAM_MAX_AGE,
        max_size=_config.NATS_STREAM_MAX_SIZE,
    )

    logger.info("Starting jetstream enjoyer")
    await subscribe_to_jetstream(list(INTERESTED_RECORDS.keys()), nm)

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
    uvicorn_config = uvicorn.config.Config(app, host="0.0.0.0", port=_config.JETSTREAM_ENJOYER_PORT)
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
