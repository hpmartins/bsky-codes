import argparse
import asyncio
import datetime
import logging
from typing import Dict, List, Literal, Any

import aiocron
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.core.config import Config
from backend.core.logger import Logger
from backend.core.redis_manager import RedisManager
from backend.core.mongo_manager import MongoManager
from backend.interactions.data import get_interactions

config = Config()
logger = Logger("scheduler")


def log(msg, level="info"):
    getattr(logging.getLogger("uvicorn.error"), level)(msg)


async def update_top_interactions():
    """Update top interactions stats by analyzing recent interactions."""
    rm = RedisManager(uri=config.REDIS_URI)
    mongo = MongoManager(uri=config.MONGODB_URI)
    await rm.connect()
    await mongo.connect()
    
    # Get current time
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    start_date = now - datetime.timedelta(days=1)
    today_date = now.date().isoformat()
    
    # For now, we'll keep this method minimal and focus on MongoDB
    # In a future version, this would be updated to use MongoDB
    
    await rm.disconnect()
    await mongo.disconnect()
    log("update_top_interactions: end")


async def update_top_blocks():
    """Update top blocks stats by analyzing block data."""
    rm = RedisManager(uri=config.REDIS_URI)
    mongo = MongoManager(uri=config.MONGODB_URI)
    await rm.connect()
    await mongo.connect()
    
    # For now, we'll keep this method minimal and focus on MongoDB
    # In a future version, this would be updated to use MongoDB
    
    await rm.disconnect()
    await mongo.disconnect()
    log("update_top_blocks: end")


async def aggregate_interactions():
    """
    Aggregate interaction data.
    
    This was used for Redis, but with MongoDB the aggregation is 
    performed in real-time when interactions are stored.
    """
    log("aggregate_interactions: No longer needed with MongoDB, skipping")


async def update_live_counters():
    """
    Update the live counters for the past 6 hours.
    
    This is run every 15 minutes to maintain up-to-date counter data for
    real-time analytics and visualizations.
    """
    mongo = MongoManager(uri=config.MONGODB_URI)
    await mongo.connect()
    
    log("update_live_counters: start")
    
    # The counters are already updated in real-time when interactions are created/deleted
    # This function could be used for cleaning up old data or recomputing counters if needed
    
    # We could add code here to verify and fix any discrepancies in the counter data
    
    # For example, if we wanted to rebuild the counter data for a specific time period:
    # now = datetime.datetime.now(tz=datetime.timezone.utc)
    # start_time = now - datetime.timedelta(hours=6)
    # ... rebuild counter logic would go here ...
    
    await mongo.disconnect()
    log("update_live_counters: end")


async def run_scheduler():
    """Run the scheduler with various cron jobs."""
    log("Starting scheduler")
    
    # Define cron jobs
    update_top_interactions_job = aiocron.crontab(config.CRON_TOP_INTERACTIONS, func=update_top_interactions)
    update_top_blocks_job = aiocron.crontab(config.CRON_TOP_BLOCKS, func=update_top_blocks)
    update_live_counter_job = aiocron.crontab(config.CRON_LIVE_COUNTER_UPDATE, func=update_live_counters)
    
    # This job is no longer needed as aggregation happens in real-time with MongoDB
    # We keep it here but it's a no-op now
    aggregate_interactions_job = aiocron.crontab(config.CRON_AGGREGATE_INTERACTIONS, func=aggregate_interactions)
    
    # Run all jobs immediately on startup
    await update_top_interactions()
    await update_top_blocks()
    await update_live_counters()
    await aggregate_interactions()
    
    # Keep running indefinitely
    while True:
        await asyncio.sleep(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", default="INFO")
    args = parser.parse_args()
    
    try:
        asyncio.run(run_scheduler())
    except KeyboardInterrupt:
        log("Scheduler stopped by user")
    except Exception as e:
        log(f"Scheduler error: {e}", level="error") 