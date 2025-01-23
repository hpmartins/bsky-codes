# Feline Area Rapid Transit
import uvicorn
from fastapi import FastAPI
from datetime import datetime, timedelta
from typing import Literal
from contextlib import asynccontextmanager

from utils.database import MongoDBManager
from utils.core import Config

from atproto import (
    models,
    AsyncDidInMemoryCache,
    AsyncIdResolver,
)

config = Config()

@asynccontextmanager
async def lifespan(app: FastAPI):
    cache = AsyncDidInMemoryCache()
    app.resolver = AsyncIdResolver(cache=cache)

    mongo_manager = MongoDBManager(uri=config.MONGO_URI)
    await mongo_manager.connect()
    app.db = mongo_manager.client.get_database(config.FART_DB)

    yield

    await mongo_manager.disconnect()

app = FastAPI(lifespan=lifespan)


@app.get("/")
async def root():
    return {}


@app.get("/interactions")
async def interactions(did: str = None, handle: str = None):
    if handle is not None:
        did = await app.resolver.handle.ensure_resolve(handle)

    if did is None:
        return {}

    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)

    data = await _get_interactions(did, start_date)

    return dict(data=data)


async def _get_interactions(did: str, start_date: datetime):
    return {
        "from": await _aggregate_interactions("from", did, start_date),
        "to": await _aggregate_interactions("to", did, start_date),
    }


async def _aggregate_interactions(
    direction: Literal["from", "to"], did: str, start_date: datetime
) -> list:
    if direction == "from":
        author_field = "author"
        subject_field = "subject"
    else:
        author_field = "subject"
        subject_field = "author"

    pipeline = [
        {
            "$match": {
                "$and": [
                    {
                        "date": {
                            "$gte": start_date,
                        }
                    },
                    {f"{author_field}": did},
                    {f"{author_field}": {"$ne": f"${subject_field}"}},
                ]
            }
        },
        {
            "$group": {
                "_id": {
                    f"{subject_field}": f"${subject_field}",
                    "collection": "$collection",
                },
                "count": {"$sum": 1},
                "total_characters": {
                    "$sum": {
                        "$cond": [
                            {
                                "$eq": [
                                    "$collection",
                                    models.ids.AppBskyFeedPost,
                                ]
                            },
                            "$characters",
                            0,
                        ]
                    }
                },
            }
        },
        {
            "$group": {
                "_id": f"$_id.{subject_field}",
                "interactions": {
                    "$push": {
                        "type": "$_id.collection",
                        "count": "$count",
                        "total_characters": "$total_characters",
                    }
                },
            }
        },
    ]

    res = []
    async for doc in app.db.interactions.aggregate(pipeline):
        res.append(doc)

    return _post_process_interactions(res)


def _post_process_interactions(data: list) -> list:
    processed_data = []
    for item in data:
        did = item["_id"]
        likes = 0
        reposts = 0
        posts = 0
        characters = 0
        for interaction in item["interactions"]:
            if interaction["type"] == models.ids.AppBskyFeedLike:
                likes += interaction["count"]
            elif interaction["type"] == models.ids.AppBskyFeedRepost:
                reposts += interaction["count"]
            elif interaction["type"] == models.ids.AppBskyFeedPost:
                posts += interaction["count"]
                characters += interaction["total_characters"]

        processed_data.append(
            {"_id": did, "l": likes, "r": reposts, "p": posts, "c": characters}
        )
    return processed_data


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=config.FART_PORT)
