import aiohttp
from aiohttp import ClientSession
from datetime import datetime
import asyncio
from typing import Literal

from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger

from utils.core import Config
from utils.database import MongoDBManager


from atproto import (
    models,
)

config = Config()
mongo_manager = MongoDBManager(uri=config.MONGO_URI)

RECORDS = [
    # "app.bsky.feed.like",
    # "app.bsky.feed.repost",
    "app.bsky.feed.post",
]


def log(text: str):
    """Logs the given text with a timestamp."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [bbb-stats] {text}")


async def update_top_interactions():
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(config.FART_DB)

    async def _get_top_interactions(
        record_type: Literal["app.bsky.feed.like", "app.bsky.feed.repost", "app.bsky.feed.post"],
        name: Literal["author", "subject"],
    ):
        collection = f"{config.INTERACTIONS_COLLECTION}.{record_type}"

        agg_group = {
            "$group": {
                "_id": f"${name}",
                "count": {"$sum": 1},
            }
        }
        if record_type == models.ids.AppBskyFeedPost:
            agg_group["$group"]["characters"] = {"$sum": "$characters"}

        pipeline = [
            {"$match": {"deleted": {"$exists": False}}},
            agg_group,
            {"$sort": {"count": -1}},
            {"$limit": 25},
        ]

        res = []
        async for doc in db.get_collection(collection).aggregate(pipeline):
            res.append(doc)
        return res

    async def update_data(record_type, name: Literal["author", "subject"]):
        log(f"update_top_interactions: start: {record_type}/{name}")
        try:
            items = await _get_top_interactions(record_type, name)
            if items:
                await db[config.DYNAMIC_COLLECTION].insert_one(
                    {"type": "top", "record_type": record_type, "name": name, "items": items}
                )
                log(f"update_top_interactions: end: {record_type}/{name}")
        except Exception as e:
            log(f"update_top_interactions: error: {record_type}/{name}: {e}")

    tasks = []
    for record_type in RECORDS:
        for name in ["author", "subject"]:
            tasks.append(update_data(record_type, name))
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
