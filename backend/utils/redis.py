import os
from dotenv import load_dotenv
import redis.asyncio as redis

load_dotenv()

REDIS = redis.from_url(os.getenv("REDIS_URI"), decode_responses=True)
REDIS_PICKLED = redis.from_url(os.getenv("REDIS_URI"), decode_responses=False)