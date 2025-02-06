import aiohttp
from aiohttp import ClientSession
import datetime
import asyncio
from typing import Literal

from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger

from utils.core import Config
from utils.database import MongoDBManager
from utils.interactions import get_date

from atproto import (
    AsyncClient,
)

config = Config()
mongo_manager = MongoDBManager(uri=config.MONGO_URI)
bsky_client = AsyncClient(base_url="https://public.api.bsky.app/")

def log(text: str):
    """Logs the given text with a timestamp."""
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [bbb-stats] {text}")


async def update_top_interactions():
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(config.FART_DB)

    async def _get_top_interactions(name: Literal["author", "subject"]):
        agg_match_date = {
            "$match": {
                "_id.date": {
                    "$gte": get_date() - datetime.timedelta(days=1),
                    "$lte": get_date(),
                }
            }
        }

        agg_rank_by_collection_and_trim = [
            {
                "$setWindowFields": {
                    "partitionBy": "$collection",
                    "sortBy": {"items": -1},
                    "output": {"rank": {"$rank": {}}},
                }
            },
            {"$match": {"rank": {"$lte": 50}}},
        ]

        agg_group_by_collection_and_push = {
            "$group": {
                "_id": "$collection",
                "items": {
                    "$push": {
                        "_id": "$did",
                        "n": "$items",
                        "c": {"$cond": [{"$eq": ["$collection", "app.bsky.feed.post"]}, "$characters", "$$REMOVE"]},
                    }
                },
            }
        }

        if name == "author":
            pipeline = [
                agg_match_date,
                {
                    "$project": {
                        "_id": 0,
                        "did": "$_id.author",
                        "collection": "$_id.collection",
                        "items": {"$size": "$items"},
                        "characters": {
                            "$cond": [
                                {"$eq": ["$_id.collection", "app.bsky.feed.post"]},
                                {"$sum": "$items.characters"},
                                "$$REMOVE",
                            ]
                        },
                    }
                },
                {"$match": {"items": {"$gt": 100}}},
                *agg_rank_by_collection_and_trim,
                agg_group_by_collection_and_push,
            ]
        else:
            pipeline = [
                agg_match_date,
                {"$unwind": "$items"},
                {
                    "$group": {
                        "_id": {"did": "$items.subject", "collection": "$_id.collection"},
                        "items": {"$sum": 1},
                        "characters": {
                            "$sum": {
                                "$cond": [
                                    {"$eq": ["$_id.collection", "app.bsky.feed.post"]},
                                    "$items.characters",
                                    "$$REMOVE",
                                ]
                            }
                        },
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "did": "$_id.did",
                        "collection": "$_id.collection",
                        "items": "$items",
                        "characters": {
                            "$cond": [
                                {"$eq": ["$_id.collection", "app.bsky.feed.post"]},
                                {"$sum": "$characters"},
                                "$$REMOVE",
                            ]
                        },
                    }
                },
                *agg_rank_by_collection_and_trim,
                agg_group_by_collection_and_push,
            ]

        res = {}
        async for doc in db.get_collection(config.INTERACTIONS_COLLECTION).aggregate(pipeline):
            res[doc["_id"]] = doc["items"]

        return res
    
    async def fetch_profiles(did_list: list[str]):
        profiles = {}
        for i in range(0, len(did_list), 25):
            actors = did_list[i:i+25]
            try:
                data = await bsky_client.app.bsky.actor.get_profiles(params=dict(actors=actors))
                for profile in data.profiles:
                    profiles[profile.did] = {
                        "handle": profile.handle,
                        "display_name": profile.display_name,
                        "avatar": profile.avatar,
                    }
            except Exception as e:
                log(f"error: {e}")
                continue
        return profiles

    async def update_data(name: Literal["author", "subject"]):
        log(f"update_top_interactions: start: {name}")
        try:
            data = await _get_top_interactions(name)
            if data:
                did_list = []
                for items in data.values():
                    did_list.extend([item.get("_id") for item in items])
                did_list = list(set(did_list))

                profiles = await fetch_profiles(did_list)
                for collection, items in data.items():
                    data[collection] = [{**x, "profile": profiles.get(x["_id"], None)} for x in items]

                await db[config.DYNAMIC_COLLECTION].insert_one(
                    {"type": "top", "name": name, "data": data}
                )
        except Exception as e:
            log(f"update_top_interactions: error: {name}: {e}")

        log(f"update_top_interactions: end: {name}")

    tasks = []
    for name in ["author", "subject"]:
        tasks.append(update_data(name))
    await asyncio.gather(*tasks)

    await mongo_manager.disconnect()


async def main():
    """Main function to schedule and run the updates."""

    await update_top_interactions()
    # async with AsyncScheduler() as scheduler:
    #     await scheduler.add_schedule(
    #         update_top_interactions, CronTrigger.from_crontab(config.CHRONO_TRIGGER_TOP_INTERACTIONS_INTERVAL)
    #     )
    #     await scheduler.run_until_stopped()


if __name__ == "__main__":
    asyncio.run(main())
