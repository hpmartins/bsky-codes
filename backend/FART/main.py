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
    name: Literal["top_blocks", "top_interactions"], api_key: APIKeyHeader = Depends(get_api_key)
):
    cached_data = await app.ctx.cache_hget("dynamic_data", name)
    if cached_data:
        return cached_data

    doc = await app.ctx.db.get_collection(config.DYNAMIC_COLLECTION).find_one(
        filter={
            "name": name,
        },
        sort={"_id": -1},
        limit=1,
    )

    if doc:
        doc["_id"] = doc["_id"].generation_time.isoformat()
        await app.ctx.cache_hset("dynamic_data", name, doc, ttl=600)
        return doc


@app.get("/collStats")
async def _get_collstats():
    collStats = {}
    for collection in [
        "app.bsky.actor.profile",
        "app.bsky.graph.block",
        "interactions.like",
        "interactions.post",
        "interactions.repost",
    ]:
        async for doc in app.ctx.db.get_collection(collection).aggregate([{"$collStats": {"count": {}}}]):
            collStats[collection] = doc["count"]

    return collStats


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
    data = await get_interactions(app.ctx.db, did)
    await app.ctx.cache_hset("interactions:data", did, data, ttl=600)
    await app.ctx.cache_hdel("interactions:semaphore", did)

    return InteractionsResponse(did=did, handle=handle, interactions=data)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=config.FART_PORT)
