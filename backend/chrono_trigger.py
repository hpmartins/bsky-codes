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


async def fetch_profiles(did_list: list[str]):
    profiles = {}
    for i in range(0, len(did_list), 25):
        actors = did_list[i : i + 25]
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


async def update_top_interactions():
    db = mongo_manager.client.get_database(config.FART_DB)
    start_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1)

    async def update_data(record_type: Literal["like", "repost", "post"], name: Literal["author", "subject"]):
        log(f"update_top_interactions: start: {record_type}/{name}")

        collection = "{}.{}".format(config.INTERACTIONS_COLLECTION, record_type)
        doc_name = name[0]

        agg_group = {
            "$group": {
                "_id": f"${doc_name}",
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

        data = []
        try:
            async for doc in db.get_collection(collection).aggregate(pipeline):
                data.append(doc)
            if data:
                log(f"update_top_interactions: end: {record_type}/{name}")
                return {"record_type": record_type, "name": name, "data": data}
        except Exception as e:
            log(f"update_top_interactions: error: {record_type}/{name}: {e}")

    tasks = []
    for record_type in ["like", "repost", "post"]:
        for name in ["author", "subject"]:
            tasks.append(update_data(record_type, name))

    data = await asyncio.gather(*tasks)
    did_list = []
    for item in data:
        did_list.extend([x.get("_id") for x in item["data"]])
    did_list = list(set(did_list))
    profiles = await fetch_profiles(did_list)
    for item in data:
        item["data"] = [{**x, "profile": profiles.get(x["_id"], None)} for x in item["data"]]

        await db[config.DYNAMIC_COLLECTION].insert_one(
            {"type": "top", "record_type": item["record_type"], "name": item["name"], "data": item["data"]}
        )

    log("update_top_interactions: end")


async def update_top_blocks():
    db = mongo_manager.client.get_database(config.FART_DB)
    start_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1)

    async def update_data(name: Literal["author", "subject"]):
        log(f"update_top_blocks: start: block/{name}")
        pipeline = [
            {
                "$match": {
                    "created_at": {
                        "$gte": start_date,
                    }
                }
            },
            {
                "$group": {
                    "_id": f"${name}",
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 25},
        ]

        data = []
        try:
            async for doc in db.get_collection("app.bsky.graph.block").aggregate(pipeline):
                data.append(doc)
            if data:
                log(f"update_top_blocks: end: block/{name}")
                return {"name": name, "data": data}
        except Exception as e:
            log(f"update_top_blocks: error: block/{name}: {e}")

    tasks = []
    for name in ["author", "subject"]:
        tasks.append(update_data(name))
    data = await asyncio.gather(*tasks)

    did_list = []
    for item in data:
        did_list.extend([x.get("_id") for x in item["data"]])
    did_list = list(set(did_list))
    profiles = await fetch_profiles(did_list)
    for item in data:
        item["data"] = [{**x, "profile": profiles.get(x["_id"], None)} for x in item["data"]]
        await db[config.DYNAMIC_COLLECTION].insert_one(
            {"type": "top", "record_type": "block", "name": item["name"], "data": item["data"]}
        )

    log("update_top_blocks: end")

async def main():
    """Main function to schedule and run the updates."""
    await mongo_manager.connect()

    async with AsyncScheduler() as scheduler:
        await scheduler.add_schedule(
            update_top_interactions, CronTrigger.from_crontab(config.CHRONO_TRIGGER_TOP_INTERACTIONS_INTERVAL)
        )
        await scheduler.add_schedule(
            update_top_blocks, CronTrigger.from_crontab(config.CHRONO_TRIGGER_TOP_INTERACTIONS_INTERVAL)
        )
        await scheduler.run_until_stopped()

    await mongo_manager.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
