import asyncio
import signal
import time
from typing import Any, List
import nats
from prometheus_client import Counter, make_asgi_app
import uvicorn
from urllib.parse import urlencode
import websockets

from atproto import (
    models,
)

from utils.core import (
    Logger,
    Config,
    INTERESTED_RECORDS,
    get_date_from_jetstream_cursor,
    JetstreamStuff,
)

from utils.nats import NATSManager

app = make_asgi_app()
_config = Config()

counters = dict(
    network=Counter("firehose_network", "data received"),
    events=Counter("firehose_events", "events"),
    post_langs=Counter("firehose_post_langs", "post languages", ["lang"]),
    account=Counter("firehose_account_counter", "account updates", ["active"]),
    identity=Counter("firehose_identity_counter", "identity updates"),
    firehose=Counter("firehose", "firehose", ["action", "collection"]),
)

logger = Logger("enjoyer")
nm = NATSManager(uri=_config.NATS_URI, stream=_config.NATS_STREAM)

cchar_mapping = dict.fromkeys(range(32))

# Signal handling
is_shutdown = False


def signal_handler(signum, frame):
    global is_shutdown
    logger.info("SHUTDOWN")
    is_shutdown = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def get_nats_subject(collection: str) -> str:
    return f"{_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX}.{collection}"


async def subscribe_to_jetstream(collections: List[str]):
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
            wrapper.bytes_received += len(args[0])
            cur_time = time.time()

            if cur_time - wrapper.start_time >= 1:
                counters["network"].inc(wrapper.bytes_received)
                counters["events"].inc(wrapper.calls)
                logger.debug(
                    f"NETWORK LOAD: {wrapper.calls}/s; {wrapper.bytes_received / 1024:.1f} kb/s; {60 * 60 * wrapper.bytes_received / 1024 / 1024 / 1024:.1f} GB/h"
                )
                wrapper.start_time = cur_time
                wrapper.calls = 0
                wrapper.bytes_received = 0

            return func(*args)

        wrapper.calls = 0
        wrapper.bytes_received = 0
        wrapper.start_time = time.time()

        return wrapper

    @measure_events_per_second
    async def on_message_handler(message: bytes, idx: int) -> None:
        try:
            event = JetstreamStuff.Event.model_validate_json(str(message).translate(cchar_mapping), strict=False)
        except (ValueError, KeyError):
            logger.error(f"error reading json: {message}")
            return

        if idx % _config.JETSTREAM_ENJOYER_CHECKPOINT == 0:
            timestamp = get_date_from_jetstream_cursor(event.time_us)
            logger.debug(f"saving new cursor: {event.time_us} {timestamp}")
            await kv.put("cursor", str(event.time_us).encode())

        try:
            if event.kind == "account":
                await nm.publish(get_nats_subject("account"), event.model_dump_json().encode())
                counters["account"].labels(event.account.active).inc()
            elif event.kind == "identity":
                await nm.publish(get_nats_subject("identity"), event.model_dump_json().encode())
                counters["identity"].inc()
            elif event.kind == "commit":
                await nm.publish(get_nats_subject(event.commit.collection), event.model_dump_json().encode())
                counters["firehose"].labels(event.commit.operation, event.commit.collection).inc()
                if event.commit.operation == "create" and models.is_record_type(
                    event.commit.record, models.ids.AppBskyFeedPost
                ):
                    langs = event.commit.record.langs
                    if isinstance(langs, list):
                        lang = langs[0][:2].lower() if len(langs) > 0 else "empty"
                    else:
                        lang = "none"
                    counters["post_langs"].labels(lang).inc()
        except Exception as e:
            logger.error(f"error parsing {event.kind}: {event}")
            logger.error(e)
            return

    while not is_shutdown:
        try:
            cursor = await get_cursor()

            logger.info(f"Starting at cursor: {cursor}")
            params = urlencode(
                dict(
                    wantedCollections=collections,
                    compress=True,
                    cursor=cursor,
                ),
                doseq=True,
            )
            uri_with_params = f"{_config.JETSTREAM_URI}?{params}"

            async with websockets.connect(uri_with_params) as websocket:
                logger.info(f"Connected to {uri_with_params}")
                idx = 0
                async for message in websocket:
                    idx = idx + 1
                    await on_message_handler(message, idx)
                    if is_shutdown:
                        await websocket.close()
                        break
                if is_shutdown:
                    break

        except websockets.exceptions.ConnectionClosed as e:
            logger.error(f"Connection closed: {e}")
            logger.info("Reconnecting...")
            continue
        except Exception as e:
            logger.error(f"An error occurred: {e}")
            logger.info("Reconnecting...")
            continue


async def start_service():
    logger.info("Connecting to NATS and checking stuff")
    await nm.connect()
    await nm.create_stream(
        prefixes=[_config.JETSTREAM_ENJOYER_SUBJECT_PREFIX],
        max_age=_config.NATS_STREAM_MAX_AGE,
        max_size=_config.NATS_STREAM_MAX_SIZE,
    )
    logger.info("Starting service")
    await subscribe_to_jetstream(list(INTERESTED_RECORDS.keys()))
    logger.info("Shutting down...")
    await nm.disconnect()
    logger.info("Shutdown complete.")


async def start_uvicorn() -> None:
    logger.info("Starting uvicorn")
    uvicorn_config = uvicorn.config.Config(app, port=8001)
    server = uvicorn.server.Server(uvicorn_config)
    await server.serve()


async def main() -> None:
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_service()),
        ],
        return_when=asyncio.ALL_COMPLETED,
    )


if __name__ == "__main__":
    logger.info("INIT")
    asyncio.run(main())
