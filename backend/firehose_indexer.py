from dotenv import load_dotenv
import asyncio
from uvicorn.loops.asyncio import asyncio_setup
import uvicorn
from prometheus_client import Counter, make_asgi_app

from collections import defaultdict
from atproto import (
    models,
    AtUri,
)

import logging

from utils.firehose import process_firehose
from utils.defaults import INTERESTED_RECORDS
from utils.database import db
from pymongo import DeleteOne, UpdateOne

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

counter = Counter("post_langs", "post languages", ["lang"])
app = make_asgi_app()


async def process_data(data: list[tuple[str, str, dict]]):
    db_ops = defaultdict(lambda: [])
    for row in data:
        _, _, actions = row

        for action, action_data in actions.items():
            if len(action_data) == 0:
                continue

            for action_item in action_data:
                uri = AtUri.from_str(action_item.get("uri"))

                if action == "create":
                    record = INTERESTED_RECORDS[uri.collection].Record(
                        **action_item["record"].model_dump()
                    )

                    # db_ops[uri.collection].append(
                    #     UpdateOne({"_id": str(uri)}, {"$set": record.model_dump()}, upsert=True)
                    # )

                    if models.is_record_type(record, models.ids.AppBskyFeedPost):
                        if isinstance(record.langs, list):
                            if len(record.langs) > 0:
                                counter.labels(record.langs[0][:2]).inc()
                        else:
                            counter.labels('unknown').inc()
                elif action == "delete":
                    pass
                    # db_ops[uri.collection].append(DeleteOne({"_id": str(uri)}))

    for collection, ops in db_ops.items():
        try:
            db.bsky[collection].bulk_write(ops)
        except Exception as e:
            logger.info("Error on bulk_write")
            logger.info(e)
            continue


async def start_uvicorn():
    config = uvicorn.config.Config(app, host="0.0.0.0", port=6000)
    server = uvicorn.server.Server(config)
    await server.serve()


async def start_indexer():
    await process_firehose("indexer", list(INTERESTED_RECORDS.keys()), process_data, count=20)


async def main(loop):
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(start_indexer()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    logger.info("Starting firehose indexer")
    asyncio_setup()
    loop = asyncio.get_event_loop()
    asyncio.run(main(loop))
