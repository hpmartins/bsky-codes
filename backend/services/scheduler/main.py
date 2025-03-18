import asyncio
import datetime
from typing import Literal

from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger
from atproto import (
    AsyncClient,
)

from backend.core.config import Config
from backend.core.database import MongoDBManager

config = Config()
mongo_manager = MongoDBManager(uri=config.MONGO_URI)
bsky_client = AsyncClient(base_url="https://public.api.bsky.app/")


def log(text: str):
    """Logs the given text with a timestamp."""
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] [scheduler] {text}")


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

    async def _fetch(key: Literal["like", "repost", "post"], subkey: Literal["author", "subject"]):
        log(f"update_top_interactions: start: {key}/{subkey}")

        collection = "{}.{}".format(config.INTERACTIONS_COLLECTION, key)
        agg_group = {
            "$group": {
                "_id": f"${subkey[0]}",
                "count": {"$sum": 1},
            }
        }
        if key == "post":
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
            {"$limit": 100},
        ]

        items = []
        try:
            async for doc in db.get_collection(collection).aggregate(pipeline):
                items.append(doc)
            if items:
                log(f"update_top_interactions: end: {key}/{subkey}")
                return {"key": key, "subkey": subkey, "items": items}
        except Exception as e:
            log(f"update_top_interactions: error: {key}/{subkey}: {e}")

    tasks = []
    for key in ["like", "repost", "post"]:
        for subkey in ["author", "subject"]:
            tasks.append(_fetch(key, subkey))

    data = await asyncio.gather(*tasks)
    did_list = []
    for item in data:
        did_list.extend([x.get("_id") for x in item["items"]])
    did_list = list(set(did_list))

    profiles = await fetch_profiles(did_list)
    for item in data:
        item["items"] = [{**x, "profile": profiles.get(x["_id"], None)} for x in item["items"]]

    await db[config.DYNAMIC_COLLECTION].insert_one({"name": "top_interactions", "data": data})

    log("update_top_interactions: end")


async def update_top_blocks():
    db = mongo_manager.client.get_database(config.FART_DB)
    start_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1)

    async def update_data(key: Literal["author", "subject"]):
        log(f"update_top_blocks: start: block/{key}")
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
                    "_id": f"${key}",
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]

        items = []
        try:
            async for doc in db.get_collection("app.bsky.graph.block").aggregate(pipeline):
                items.append(doc)
            if items:
                log(f"update_top_blocks: end: block/{key}")
                return {"key": key, "items": items}
        except Exception as e:
            log(f"update_top_blocks: error: block/{key}: {e}")

    tasks = []
    for key in ["author", "subject"]:
        tasks.append(update_data(key))
    data = await asyncio.gather(*tasks)

    did_list = []
    for item in data:
        did_list.extend([x.get("_id") for x in item["items"]])
    did_list = list(set(did_list))
    profiles = await fetch_profiles(did_list)
    for item in data:
        item["items"] = [{**x, "profile": profiles.get(x["_id"], None)} for x in item["items"]]

    await db[config.DYNAMIC_COLLECTION].insert_one({"name": "top_blocks", "data": data})

    log("update_top_blocks: end")


async def main():
    """Main function to schedule and run the updates."""
    await mongo_manager.connect()

    async with AsyncScheduler() as scheduler:
        await scheduler.add_schedule(
            update_top_interactions, CronTrigger.from_crontab(config.CRON_TOP_INTERACTIONS)
        )
        await scheduler.add_schedule(
            update_top_blocks, CronTrigger.from_crontab(config.CRON_TOP_BLOCKS)
        )
        await scheduler.run_until_stopped()

    await mongo_manager.disconnect()


if __name__ == "__main__":
    asyncio.run(main()) 