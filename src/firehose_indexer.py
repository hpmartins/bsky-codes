import asyncio
from uvicorn.loops.asyncio import asyncio_setup

from collections import defaultdict
from atproto import (
    AtUri,
)

from utils.firehose import process_firehose
from utils.defaults import INTERESTED_RECORDS
from utils.logger import logger
from utils.database import db
from pymongo import DeleteOne, UpdateOne


async def process_data(data: list[tuple[str, str, dict]]):
    db_ops = defaultdict(lambda: [])
    for row in data:
        _, _, actions = row

        for action, action_data in actions.items():
            if len(action_data) == 0:
                continue

            for action_item in action_data:
                uri = AtUri.from_str(action_item.get("uri"))
                if action == "create" or action == "update":
                    record = INTERESTED_RECORDS[uri.collection].Record(
                        **action_item["record"].model_dump()
                    )
                    db_ops[uri.collection].append(
                        UpdateOne({"_id": str(uri)}, {"$set": record.model_dump()}, upsert=True)
                    )
                elif action == "delete":
                    db_ops[uri.collection].append(DeleteOne({"_id": str(uri)}))

    for collection, ops in db_ops.items():
        try:
            db.bsky[collection].bulk_write(ops)
        except Exception as e:
            logger.info("Error on bulk_write")
            logger.info(e)
            continue


async def start_indexer():
    await process_firehose("indexer", list(INTERESTED_RECORDS.keys()), process_data, count=20)


async def main(loop):
    await asyncio.wait(
        [
            asyncio.create_task(start_indexer()),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio_setup()
    loop = asyncio.get_event_loop()
    asyncio.run(main(loop))
