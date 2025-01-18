import asyncio
from utils.consumer import run_consumer
from utils.config import Config
import logging

logger = logging.getLogger(__name__)


async def my_indexer_callback(data):
    pass
    # Process the received data (which will be the unpickled object)
    # logger.info(f"Indexer received: {data}")
    # ... your indexing logic here ...


async def main():
    subjects = [
        "app.bsky.feed.like",
        "app.bsky.feed.post",
        "app.bsky.feed.repost",
    ]
    await run_consumer(subjects, my_indexer_callback, "replier")


if __name__ == "__main__":
    asyncio.run(main())
