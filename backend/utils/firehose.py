import pickle
import asyncio
import redis
import logging

from typing import Callable, List, Tuple

from utils.redis import REDIS_PICKLED as REDIS

REDIS_BLOCK_TIMEOUT_MS = 500  # Timeout for blocking on Redis stream
INITIAL_CURSOR = "0"  # Initial cursor value for new streams

logger = logging.getLogger(__name__)


async def _get_cursors(service: str, collections: List[str]) -> dict:
    cursors = {}
    for collection in collections:
        cursor_key = f"firehose_cursor:{service}:{collection}"
        cursor = await REDIS.hget("firehose_cursor", cursor_key)

        if cursor is None:
            logger.info(
                f"No cursor found for {cursor_key}. Initializing to {INITIAL_CURSOR}"
            )
            cursor = INITIAL_CURSOR
        else:
            cursor = cursor.decode()  # Decode the cursor value
        cursors[collection] = cursor
    return cursors


async def _process_stream_items(
    items: List[Tuple[bytes, List[Tuple[bytes, dict]]]]
) -> Tuple[str, List[Tuple[str, str, dict]]]:
    decoded_collection = items[0].decode()
    collection_name = decoded_collection.split(":")[1]
    processed_data = []
    for item_id, item_data in items[1]:
        try:
            unpickled_data = pickle.loads(item_data[b"data"])
            processed_data.append((item_id.decode(), collection_name, unpickled_data))
        except pickle.UnpicklingError as e:
            logger.error(f"Error unpickling data from {decoded_collection}: {e}")
        except Exception as e:
            logger.error(f"Error processing item from {decoded_collection}: {e}")

    return collection_name, processed_data


async def _update_cursors(service: str, cursors: dict):
    for collection_name, cursor_value in cursors.items():
        cursor_key = f"firehose_cursor:{service}:{collection_name}"
        await REDIS.hset("firehose_cursor", cursor_key, cursor_value)
        logger.debug(f"Updated cursor for {cursor_key} to {cursor_value}")


async def process_firehose(
    service: str,
    collections: List[str],
    callback: Callable[[List[Tuple[str, str, dict]]], None],
    count: int = 50,
):
    try:
        cursors = await _get_cursors(service, collections)

        while True:
            streams = {
                f"firehose:{collection}": cursors[collection]
                for collection in collections
            }
            try:
                items_list = await REDIS.xread(
                    streams, count=count, block=REDIS_BLOCK_TIMEOUT_MS
                )
                if not items_list:
                    continue

                for items in items_list:
                    collection_name, processed_data = await _process_stream_items(items)

                    if processed_data:
                        await callback(processed_data)
                        cursors[collection_name] = processed_data[-1][0]
                        await _update_cursors(service, cursors)

            except redis.exceptions.ConnectionError as e:
                logger.error(f"Redis connection error: {e}")
                await asyncio.sleep(5)
            except Exception as e:
                logger.error(f"Error processing firehose: {e}")

    except Exception as e:
        logger.error(f"An error occurred in process_firehose setup: {e}")
