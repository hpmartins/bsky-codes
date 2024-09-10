import os
import asyncio
from utils.redis import REDIS_PICKLED as REDIS
from dotenv import load_dotenv
import redis.asyncio as redis
import pickle
from prometheus_client import Counter, make_asgi_app

from uvicorn.loops.asyncio import asyncio_setup
import uvicorn

from collections import defaultdict
from atproto import (
    AtUri,
    CAR,
    models,
    firehose_models,
    parse_subscribe_repos_message,
)
from typing import Any

from utils.logger import logger

load_dotenv()

_INTERESTED_RECORDS = {
    models.ids.AppBskyFeedLike: models.AppBskyFeedLike,
    models.ids.AppBskyFeedPost: models.AppBskyFeedPost,
    models.ids.AppBskyFeedRepost: models.AppBskyFeedRepost,
    models.ids.AppBskyGraphFollow: models.AppBskyGraphFollow,
    models.ids.AppBskyGraphBlock: models.AppBskyGraphBlock,
}

FIREHOSE_MAXLEN = int(os.getenv("FIREHOSE_MAXLEN"))

counter = Counter("firehose", "firehose", ["action", "collection"])


def _get_ops_by_type(commit: models.ComAtprotoSyncSubscribeRepos.Commit) -> defaultdict:
    operation_by_type = defaultdict(lambda: {"created": [], "deleted": []})

    car = CAR.from_bytes(commit.blocks)
    for op in commit.ops:
        if op.action == "update":
            # not supported yet
            continue

        uri = AtUri.from_str(f"at://{commit.repo}/{op.path}")

        if op.action == "create":
            if not op.cid:
                continue

            create_info = {"uri": str(uri), "cid": str(op.cid), "author": commit.repo}

            record_raw_data = car.blocks.get(op.cid)
            if not record_raw_data:
                continue

            if uri.collection in _INTERESTED_RECORDS:
                record = models.get_or_create(record_raw_data, strict=False)
                if models.is_record_type(record, uri.collection):
                    operation_by_type[uri.collection]["created"].append(
                        {"record": record, **create_info}
                    )

        if op.action == "delete":
            operation_by_type[uri.collection]["deleted"].append({"uri": str(uri)})

    return operation_by_type


async def process_data(message: firehose_models.MessageFrame):
    commit = parse_subscribe_repos_message(message)

    if not isinstance(commit, models.ComAtprotoSyncSubscribeRepos.Commit):
        return

    if not commit.blocks:
        return

    ops = _get_ops_by_type(commit)
    for collection, data in ops.items():
        try:
            await REDIS.xadd(
                f"firehose:{collection}",
                {"data": pickle.dumps(data)},
                id=commit.seq,
                maxlen=FIREHOSE_MAXLEN,
            )
        except Exception as e:
            logger.info(e)
            logger.info(data)
            continue

        for action, items in data.items():
            for _ in items:
                counter.labels(action, collection).inc()

        # if collection == models.ids.AppBskyFeedPost and len(data["created"]) > 0:
            
async def reader(channel: redis.client.PubSub):
    while True:
        message = await channel.get_message(ignore_subscribe_messages=True)
        if message is not None:
            data = pickle.loads(message["data"])
            await process_data(data)


async def start_reader():
    async with REDIS.pubsub() as pubsub:
        await pubsub.subscribe("firehose")
        await asyncio.create_task(reader(pubsub))


app = make_asgi_app()


async def start_uvicorn():
    config = uvicorn.config.Config(app, host="0.0.0.0", port=6002)
    server = uvicorn.server.Server(config)
    await server.serve()


async def main(loop):
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_reader()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio_setup()
    loop = asyncio.get_event_loop()
    asyncio.run(main(loop))
