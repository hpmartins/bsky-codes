import datetime
import logging

from atproto import exceptions, models
from pymongo import ReturnDocument

from .defs import FARTContext

logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


async def get_db_profile(ctx: FARTContext, did: str) -> models.AppBskyActorDefs.ProfileViewDetailed:
    actor_profile = await ctx.db[models.ids.AppBskyActorProfile].find_one({"_id": did})
    saved_profile = await ctx.db["profiles"].find_one({"did": did})

    have_to_update = False

    if actor_profile is None:
        actor_profile = {
            "_id": did,
            "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
            "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
        }
        await ctx.db[models.ids.AppBskyActorProfile].insert_one(actor_profile)
        have_to_update = True

    if saved_profile is None or actor_profile["updated_at"] > saved_profile["updated_at"]:
        have_to_update = True

    if have_to_update:
        try:
            new_profile = await ctx.bsky.app.bsky.actor.get_profile(params=dict(actor=did))
        except Exception:
            logger.info(f"error getting profile: {did}")
            return

        logger.info(f"updating profile: {did}")
        saved_profile = await ctx.db["profiles"].find_one_and_update(
            {"did": new_profile.did},
            {
                "$set": {
                    **new_profile.model_dump(),
                    "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    return models.AppBskyActorDefs.ProfileViewDetailed(
        **{key: val for key, val in saved_profile.items() if key != "_id"}
    )


async def get_did(ctx: FARTContext, actor: str) -> tuple[str | None, str | None]:
    if not actor:
        return None, None

    try:
        if actor.startswith("did:"):
            doc = await ctx.resolver.did.ensure_resolve(actor)
            handle = doc.also_known_as[0].replace("at://", "")
            return handle, actor
        else:
            actor = actor.replace("@", "")
            did = await ctx.resolver.handle.ensure_resolve(actor)
            return actor, did
    except exceptions.DidNotFoundError:
        return None, None
