import os
from dotenv import load_dotenv
import asyncio
from uvicorn.loops.asyncio import asyncio_setup
import uvicorn
from prometheus_client import Counter, make_asgi_app
from datetime import datetime
import motor.motor_asyncio

from collections import defaultdict
from atproto import (
    models,
    AtUri,
)

import logging

from utils.firehose import process_firehose
from utils.defaults import (
    INTERESTED_RECORDS,
    INTERACTION_RECORDS,
)
from pymongo import InsertOne, DeleteOne

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

MONGODB_URI = os.getenv('MONGODB_URI')
db = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URI)

counter = Counter("post_langs", "post languages", ["lang"])
app = make_asgi_app()

def get_date(timestamp: str):
    dobj = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    return datetime(dobj.year, dobj.month, dobj.day)

def create_interaction(uri, record):
    if models.is_record_type(record, models.ids.AppBskyFeedLike) \
    or models.is_record_type(record, models.ids.AppBskyFeedRepost):
        return dict(
            date = get_date(record.created_at),
            metadata = dict(
                author = uri.host,
                collection = uri.collection,
                rkey = uri.rkey,
                subject = AtUri.from_str(record.subject.uri).host
            )
        )
    
    if models.is_record_type(record, models.ids.AppBskyFeedPost):
        if record.reply is not None and record.reply.parent is not None:
            return dict(
                date = get_date(record.created_at),
                metadata = dict(
                    author = uri.host,
                    collection = uri.collection,
                    rkey = uri.rkey,
                    subject = AtUri.from_str(record.reply.parent.uri).host,
                    characters = len(record.text),
                )
            )
            
        if record.embed is not None:
            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
                return dict(
                    date = get_date(record.created_at),
                    metadata = dict(
                        author = uri.host,
                        collection = uri.collection,
                        rkey = uri.rkey,
                        subject = AtUri.from_str(record.embed.record.uri).host,
                        characters = len(record.text),
                    )
                )
            
            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecordWithMedia):
                if models.is_record_type(record.embed.record, models.ids.AppBskyEmbedRecord):
                    return dict(
                        date = get_date(record.created_at),
                        metadata = dict(
                            author = uri.host,
                            collection = uri.collection,
                            rkey = uri.rkey,
                            subject = AtUri.from_str(record.embed.record.record.uri).host,
                            characters = len(record.text),
                        )
                    )

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
                    
                    if uri.collection in INTERACTION_RECORDS.keys():
                        interaction = create_interaction(uri, record)
                        if interaction is not None:
                            db_ops["interactions"].append(InsertOne(interaction))

                    # Prometheus: post languages
                    if models.is_record_type(record, models.ids.AppBskyFeedPost):
                        if isinstance(record.langs, list):
                            if len(record.langs) > 0:
                                counter.labels(record.langs[0][:2]).inc()
                        else:
                            counter.labels("unknown").inc()
                elif action == "delete":
                    db_ops["interactions"].append(DeleteOne(dict(
                            metadata = dict(
                                author = uri.host,
                                collection = uri.collection,
                                rkey = uri.rkey,
                            )
                        )))

    for collection, ops in db_ops.items():
        if ops:
            try:
                await db.bsky[collection].bulk_write(ops)
                logger.info(f"Wrote {len(ops)} operations to {collection}")
            except Exception as e:
                logger.info("Error on bulk_write")
                logger.info(e)
                continue             


async def start_uvicorn():
    config = uvicorn.config.Config(app, host="0.0.0.0", port=6000)
    server = uvicorn.server.Server(config)
    await server.serve()


async def start_indexer():
    await process_firehose("indexer", list(INTERESTED_RECORDS.keys()), process_data, count=200)


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
