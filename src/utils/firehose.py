from dotenv import load_dotenv
import pickle

from utils.redis import REDIS_PICKLED as REDIS

load_dotenv()


async def process_firehose(
    service: str, collections: list[str], callback: callable, count: int = 50
):

    cursors = {}
    for collection in collections:
        cursors[collection] = await REDIS.hget("firehose_cursor", f"{service}:{collection}")

        if cursors[collection] is None:
            cursors[collection] = str(0)

    while True:
        streams = {f"firehose:{collection}": cursor for collection, cursor in cursors.items()}
        items = await REDIS.xread(streams, count=count, block=500)
        for item in items:
            item_collection = item[0].decode().split(":")[1]
            item_data = [
                (x.decode(), item_collection, pickle.loads(y[b"data"])) for x, y in item[1]
            ]
            cursors[item_collection] = item_data[-1][0]

            await callback(item_data)

        for c_name, c_val in cursors.items():
            await REDIS.hset("firehose_cursor", f"{service}:{c_name}", c_val)

        # return
