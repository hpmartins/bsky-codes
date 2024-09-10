from dotenv import load_dotenv
import pickle

from atproto import (
    firehose_models,
)

from utils.redis import REDIS_PICKLED as REDIS

load_dotenv()

async def fetch_firehose_messages(
    cursor: str | None, count: int
) -> list[tuple[str, firehose_models.MessageFrame]]:

    raw_data = await REDIS.xread({"firehose": cursor}, count=count, block=500)
    return [(i, pickle.loads(x[b"data"])) for i, x in raw_data[0][1]]

