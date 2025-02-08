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
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [chrono-trigger] {text}")


async def update_top_interactions():
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(config.FART_DB)

    start_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1)

    async def _get_top_interactions(
        record_type: Literal["like", "repost", "post"],
        name: Literal["a", "s"],
    ):
        collection = "{}.{}".format(config.INTERACTIONS_COLLECTION, record_type)

        agg_group = {
            "$group": {
                "_id": f"${name}",
                "count": {"$sum": 1},
            }
        }
        if record_type == "post":
            agg_group["$group"]["c"] = {"$sum": "$c"}

        pipeline = [
            {
                "$match": {
                    "t": {
                        "$gte": start_date,
                    }
                }
            },
            agg_group,
            {"$sort": {"count": -1}},
            {"$limit": 25},
        ]

        res = []
        async for doc in db.get_collection(collection).aggregate(pipeline):
            res.append(doc)
        return res

    async def update_data(record_type, name: Literal["a", "s"]):
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
    for record_type in ["like", "repost", "post"]:
        for name in ["a", "s"]:
            tasks.append(update_data(record_type, name))
    await asyncio.gather(*tasks)

    await mongo_manager.disconnect()


async def main():
    """Main function to schedule and run the updates."""
    
    async with AsyncScheduler() as scheduler:
        await scheduler.add_schedule(
            update_top_interactions, CronTrigger.from_crontab(config.CHRONO_TRIGGER_TOP_INTERACTIONS_INTERVAL)
        )
        await scheduler.run_until_stopped()


if __name__ == "__main__":
    asyncio.run(main())
