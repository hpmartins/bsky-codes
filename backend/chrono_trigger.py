import aiohttp
from aiohttp import ClientSession
from datetime import datetime
import asyncio

from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger

from utils.core import Config
from utils.database import MongoDBManager

config = Config()
mongo_manager = MongoDBManager(uri=config.MONGO_URI)

RECORDS = [
    "app.bsky.feed.like",
    "app.bsky.feed.repost",
    "app.bsky.feed.post",
]

DYNAMIC_COLLECTION = "dynamic_data"


def log(text: str):
    """Logs the given text with a timestamp."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [bbb-stats] {text}")


async def update_top_interactions():
    await mongo_manager.connect()
    db = mongo_manager.client.get_database(config.FART_DB)

    async def fetch_data(session: ClientSession, record_type, name):
        log(f"update_top_interactions: start: {record_type}/{name}")
        url = f"{config.FART_URI}/top/{record_type}/{name}"
        try:
            async with session.get(url) as response:
                items = await response.json()
                if items:
                    await db[DYNAMIC_COLLECTION].insert_one(
                        {"type": "top", "record_type": record_type, "name": name, "items": items}
                    )
                    log(f"update_top_interactions: end: {record_type}/{name}")
        except aiohttp.ClientError as e:
            log(f"update_top_interactions: error: {record_type}/{name}: {e}")

    async with aiohttp.ClientSession() as session:
        tasks = []
        for record_type in RECORDS:
            for name in ["author", "subject"]:
                tasks.append(fetch_data(session, record_type, name))
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
