import datetime
import logging
from typing import Dict, List, Literal, Any

from backend.core.config import Config
from backend.core.redis_manager import RedisManager
from backend.core.types import Interaction

config = Config()
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


async def get_interactions(
    redis_manager: RedisManager,
    did: str,
    start_date: datetime.datetime = None,
) -> dict[Literal["sent", "rcvd"], list[Interaction]]:
    """Get interactions for a user from Redis."""
    end_date = datetime.datetime.now(tz=datetime.timezone.utc)
    if start_date is None:
        start_date = end_date - datetime.timedelta(days=7)

    # Get interactions using the Redis manager's unified approach
    # This offers better performance and reduced key count
    return await redis_manager.get_unified_interactions(
        did=did, 
        direction="both",
        start_date=start_date, 
        end_date=end_date,
        limit=100
    )
