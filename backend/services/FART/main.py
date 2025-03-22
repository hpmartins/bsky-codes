# Feline Area Rapid Transit
import logging
from contextlib import asynccontextmanager
from typing import Literal

import uvicorn
from fastapi import Depends, HTTPException
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel

from backend.core.config import Config
from backend.core.types import Interaction
from backend.interactions.data import get_interactions

from . import aux
from .auth import get_api_key
from .defs import FARTAPI

config = Config()
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


@asynccontextmanager
async def lifespan(app: FARTAPI):
    await app.ctx.connect()
    yield
    await app.ctx.disconnect()


app = FARTAPI(lifespan=lifespan)


@app.get("/dd/{name}")
async def _fetch_dynamic_data(
    name: Literal["top_interactions", "top_blocks"], api_key: APIKeyHeader = Depends(get_api_key)
):
    """Fetch dynamic data from Redis."""
    # Try to get from cache first
    cached_data = await app.ctx.cache_hget("dynamic_data", name)
    if cached_data:
        return cached_data
        
    # Otherwise, get from Redis directly
    if name in ["top_interactions", "top_blocks"]:
        data = await app.ctx.redis.get(f"dynamic:{name}")
        if data:
            # Store in cache for faster retrieval
            await app.ctx.cache_hset("dynamic_data", name, data, ttl=600)
            return data
            
    # Return None if not found
    return None


@app.get("/collStats")
async def _get_collstats():
    """Get collection statistics."""
    # In the Redis implementation, we can get key patterns stats
    patterns = [
        "interaction:*",  # individual interactions
        "agg:*",          # aggregated interactions
        "hourly:*",       # hourly counters
        "user:*:sent:*",  # sent interactions
        "user:*:received:*" # received interactions
    ]
    
    stats = {}
    for pattern in patterns:
        # Count keys matching the pattern
        count = 0
        cursor = "0"
        while cursor != 0:
            cursor, keys = await app.ctx.redis._client.scan(cursor=cursor, match=pattern, count=1000)
            count += len(keys)
        stats[pattern] = count
        
    return stats


@app.get("/history/{history_type}/dates")
async def _get_history_dates(
    history_type: Literal["top_interactions", "top_blocks"], 
    api_key: APIKeyHeader = Depends(get_api_key)
):
    """Get available dates for a history type."""
    dates = await app.ctx.redis.get_history_dates(history_type)
    return {"dates": dates}


@app.get("/history/{history_type}/{date}")
async def _get_history_for_date(
    history_type: Literal["top_interactions", "top_blocks"],
    date: str,
    api_key: APIKeyHeader = Depends(get_api_key)
):
    """Get historical data for a specific date."""
    data = await app.ctx.redis.get_history_for_date(history_type, date)
    if not data:
        raise HTTPException(status_code=404, detail=f"No data found for {history_type} on {date}")
    return data


@app.get("/history/{history_type}")
async def _get_history_range(
    history_type: Literal["top_interactions", "top_blocks"],
    start_date: str = None,
    end_date: str = None,
    limit: int = 30,
    api_key: APIKeyHeader = Depends(get_api_key)
):
    """Get historical data for a range of dates."""
    data = await app.ctx.redis.get_history_range(
        history_type, start_date, end_date, limit
    )
    return {"history": data}


class InteractionsBody(BaseModel):
    handle: str


class InteractionsResponse(BaseModel):
    did: str
    handle: str
    interactions: dict[Literal["sent", "rcvd"], list[Interaction]]


@app.post("/interactions")
async def _interactions(body: InteractionsBody, api_key: APIKeyHeader = Depends(get_api_key)) -> InteractionsResponse:
    handle, did = await aux.get_did(app.ctx, body.handle)
    if did is None:
        logger.info(f"[interactions] attempt: {body.handle}")
        raise HTTPException(status_code=400, detail=f"user not found: {body.handle}")

    semaphore_check = await app.ctx.cache_hexists("interactions:semaphore", did)
    if semaphore_check:
        logger.info(f"[interactions] semaphore: {handle}@{did}")
        raise HTTPException(status_code=400, detail="check again later")

    cached_data = await app.ctx.cache_hget("interactions:data", did)
    if cached_data:
        logger.info(f"[interactions] cache: {handle}@{did}")
        return InteractionsResponse(did=did, handle=handle, interactions=cached_data)

    logger.info(f"[interactions] fetching: {handle}@{did}")

    await app.ctx.cache_hset("interactions:semaphore", did, {}, ttl=600)
    data = await get_interactions(app.ctx.redis, did)
    await app.ctx.cache_hset("interactions:data", did, data, ttl=600)
    await app.ctx.cache_hdel("interactions:semaphore", did)

    return InteractionsResponse(did=did, handle=handle, interactions=data)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=config.FART_PORT)
