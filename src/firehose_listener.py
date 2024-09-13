import os
from uvicorn.loops.asyncio import asyncio_setup
import asyncio
from dotenv import load_dotenv
import pickle

import time
from atproto import (
    firehose_models,
    AsyncFirehoseSubscribeReposClient,
    models,
)
from typing import Any

from utils.redis import REDIS
from utils.logger import logger

load_dotenv()

FIREHOSE_MAXLEN = int(os.getenv("FIREHOSE_MAXLEN"))


def measure_events_per_second(func: callable) -> callable:
    def wrapper(*args) -> Any:
        wrapper.calls += 1
        cur_time = time.time()

        if cur_time - wrapper.start_time >= 1:
            print(f"NETWORK LOAD: {wrapper.calls} events/second")
            wrapper.start_time = cur_time
            wrapper.calls = 0

        return func(*args)

    wrapper.calls = 0
    wrapper.start_time = time.time()

    return wrapper


async def main(loop) -> None:
    await REDIS.hdel("firehose_cursor", "firehose")
    cursor = await REDIS.hget("firehose_cursor", "firehose")
    if cursor is not None:
        cursor = int(cursor)

    params = None
    if cursor:
        params = models.ComAtprotoSyncSubscribeRepos.Params(cursor=cursor)

    client = AsyncFirehoseSubscribeReposClient(params)

    @measure_events_per_second
    async def on_message_handler(message: firehose_models.MessageFrame) -> None:
        if message.body.get("blocks", None) is None:
            return

        seq = message.body.get("seq", None)
        if isinstance(seq, int):
            await REDIS.publish("firehose", pickle.dumps(message))
            if seq % 500 == 0:
                client.update_params(models.ComAtprotoSyncSubscribeRepos.Params(cursor=seq))
                await REDIS.hset("firehose_cursor", "firehose", seq)

    await client.start(on_message_handler)


if __name__ == "__main__":
    logger.info("Starting firehose listener")
    asyncio_setup()
    loop = asyncio.get_event_loop()
    asyncio.run(main(loop))
