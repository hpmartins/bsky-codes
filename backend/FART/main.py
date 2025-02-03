# Feline Area Rapid Transit
import aiohttp
import asyncio
from io import BytesIO
import uvicorn
from fastapi import FastAPI, responses, HTTPException
import datetime
from typing import Literal
from contextlib import asynccontextmanager
import motor.motor_asyncio
from pymongo import ReturnDocument
from pymongo.errors import ConnectionFailure
import logging
from collections import defaultdict
import math

from PIL import Image, ImageDraw, ImageFont

from backend.utils.core import Config
from backend.utils.interactions import (
    Interaction,
    INTERACTION_COLLECTION,
)

from atproto import (
    models,
    AsyncDidInMemoryCache,
    AsyncIdResolver,
    AsyncClient,
    exceptions,
)


config = Config()
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


class EnhancedFastAPI(FastAPI):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        cache = AsyncDidInMemoryCache()
        self.resolver = AsyncIdResolver(cache=cache)
        self.bsky_client = AsyncClient(base_url="https://public.api.bsky.app/")
        self.mongo_client = motor.motor_asyncio.AsyncIOMotorClient(config.MONGO_URI, compressors="zstd")
        self.db = self.mongo_client.get_database(config.FART_DB)


@asynccontextmanager
async def lifespan(app: EnhancedFastAPI):
    try:
        await app.mongo_client.admin.command("ping")
        logger.info(f"Connected to MongoDB at {config.FART_DB}")
    except ConnectionFailure as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise

    yield

    app.mongo_client.close()


app = EnhancedFastAPI(lifespan=lifespan)


@app.get("/")
async def root():
    return {}


def hex_is_light(color):
    """
    Determines if a given hex color is considered "light" based on its brightness.

    Args:
        color: The hex color string (e.g., "#RRGGBB").

    Returns:
        True if the color is light, False otherwise.
    """
    hex_color = color.replace("#", "")
    c_r = int(hex_color[0:2], 16)
    c_g = int(hex_color[2:4], 16)
    c_b = int(hex_color[4:6], 16)
    brightness = (c_r * 299 + c_g * 587 + c_b * 114) / 1000
    return brightness > 155


def fib(n):
    golden_ratio = (1 + math.sqrt(5)) / 2
    val = (golden_ratio**n - (1 - golden_ratio) ** n) / math.sqrt(5)
    return int(round(val))


async def fetch_image(session: aiohttp.ClientSession, profile: dict[str, str]) -> tuple:
    try:
        async with session.get(profile["avatar"]) as response:
            data = await response.read()
            image = Image.open(BytesIO(data))
            return image
    except Exception:
        width = 60
        height = 60
        line_color = "black"
        image = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(image)
        draw.line((0, 0, width - 1, height - 1), fill=line_color, width=1)
        draw.line((width - 1, 0, 0, height - 1), fill=line_color, width=1)
        return image


async def _fetch_profile_pictures(main_profile, profiles):
    async with aiohttp.ClientSession() as session:
        main_profile_picture = await fetch_image(session, main_profile)
        tasks = [fetch_image(session, x) for x in profiles]
        all_profile_pictures = await asyncio.gather(*tasks)
    return main_profile_picture, all_profile_pictures


def _create_circles_image(main_profile_picture, all_profile_pictures, start_date: datetime.datetime):
    _CIRCLES_OPTIONS = {
        "orbits": 2,
        "include_sent": True,
        "include_rcvd": False,
        "remove_bots": True,
        "remove_blocked": True,
        "add_watermark": True,
        "add_date": True,
        "bg_color": "#1D428A",
        "add_border": True,
        "border_color": "#FFC72C",
    }

    # Radial distances for each number of orbits
    _CIRCLES_DISTANCES = {
        1: [0, 35 / 100, 0, 0],
        2: [0, 23 / 100, 38 / 100, 0],
        3: [0, 20 / 100, 32 / 100, 42 / 100],
    }

    # Radiuses for every orbit for each number of orbits
    _CIRCLES_RADIUSES = {
        1: [19 / 100, 9 / 100, 0, 0],
        2: [13 / 100, 7 / 100, 6 / 100, 0],
        3: [11 / 100, 6 / 100, 5 / 100, 4 / 100],
    }

    image_size = 1800
    border_radius = 12

    n_orbits = _CIRCLES_OPTIONS["orbits"]
    start_index = 0
    _CIRCLES_ORBITS_DEF = []
    for i in range(n_orbits):
        count = fib(i + 6)
        end_index = start_index + count
        _CIRCLES_ORBITS_DEF.append(
            {
                "count": count,
                "distance": _CIRCLES_DISTANCES[n_orbits][i + 1],
                "radius": _CIRCLES_RADIUSES[n_orbits][i + 1],
                "pictures": all_profile_pictures[start_index:end_index],
            }
        )
        start_index = end_index

    # Creating image
    cv = Image.new("RGBA", (image_size, image_size))
    context = ImageDraw.Draw(cv)

    text_color = "#000000" if hex_is_light(_CIRCLES_OPTIONS["bg_color"]) else "#CCCCCC"

    # Background color
    context.rounded_rectangle(
        [(0, 0), (image_size, image_size)], radius=border_radius, fill=_CIRCLES_OPTIONS["bg_color"]
    )

    # Rounded border
    if _CIRCLES_OPTIONS["add_border"]:
        context.rounded_rectangle(
            [(0, 0), (image_size, image_size)],
            radius=border_radius,
            outline=_CIRCLES_OPTIONS["border_color"],
            width=image_size // 60,
        )

    font_size = image_size // 30
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)

    # Date on top left corner
    if _CIRCLES_OPTIONS["add_date"]:
        now = datetime.datetime.now()
        text_full = f"{start_date.strftime('%Y-%m-%d')} - {now.strftime('%Y-%m-%d')}"
        context.text((image_size / 35, image_size / 45), text_full, font=font, fill=text_color, anchor="la")

    # Site watermark on top right corner
    if _CIRCLES_OPTIONS["add_watermark"]:
        context.text(
            (image_size - image_size / 35, image_size / 45),
            "wolfgang.raios.xyz",
            font=font,
            fill=text_color,
            anchor="ra",
        )

    def add_picture_to_image(img: Image.Image, cfg: dict):
        width, height = img.size
        if width != height:
            size = min(width, height)
            left = (width - size) / 2
            top = (height - size) / 2
            right = (width + size) / 2
            bottom = (height + size) / 2
            img = img.crop((left, top, right, bottom))
        img = img.resize((int(cfg["r"] * 2), int(cfg["r"] * 2)), Image.Resampling.LANCZOS)

        # Create a circular mask
        mask = Image.new("L", (int(cfg["r"] * 2), int(cfg["r"] * 2)), 0)
        draw_mask = ImageDraw.Draw(mask)
        draw_mask.ellipse((0, 0, cfg["r"] * 2, cfg["r"] * 2), fill=255)

        # Apply the mask to the image

        img.putalpha(mask)

        # Paste the image onto the canvas
        cv.paste(img, (int(cfg["x"] - cfg["r"]), int(cfg["y"] - cfg["r"])), img)

    # Main picture
    if _CIRCLES_OPTIONS["add_watermark"] and _CIRCLES_OPTIONS["add_date"]:
        vertical_displace = 0.04
    else:
        vertical_displace = 0.0

    add_picture_to_image(
        main_profile_picture,
        dict(
            x=image_size / 2,
            y=(1 + vertical_displace) * image_size / 2,
            r=image_size * _CIRCLES_RADIUSES[n_orbits][0],
        ),
    )

    # Pictures
    for orbit_index, orbit in enumerate(_CIRCLES_ORBITS_DEF):
        orbit_pictures = orbit["pictures"]
        angle_step = 360 / orbit["count"]
        for i in range(orbit["count"]):
            if i >= len(orbit_pictures):
                break

            t = (i * angle_step + orbit_index * 30) * (math.pi / 180)  # in radians
            add_picture_to_image(
                orbit_pictures[i],
                dict(
                    x=math.cos(t) * image_size * orbit["distance"] + image_size / 2,
                    y=math.sin(t) * image_size * orbit["distance"] + (1 + vertical_displace) * image_size / 2,
                    r=image_size * orbit["radius"],
                ),
            )

    return cv.resize((image_size // 3, image_size // 3), Image.Resampling.LANCZOS)


async def _get_profile(did: str) -> models.AppBskyActorDefs.ProfileViewDetailed:
    actor_profile = await app.db[models.ids.AppBskyActorProfile].find_one({"_id": did})
    saved_profile = await app.db["profiles"].find_one({"did": did})

    have_to_update = False

    if actor_profile is None:
        actor_profile = {
            "_id": did,
            "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
            "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
        }
        await app.db[models.ids.AppBskyActorProfile].insert_one(actor_profile)
        have_to_update = True

    if saved_profile is None or actor_profile["updated_at"] > saved_profile["updated_at"]:
        have_to_update = True

    if have_to_update:
        try:
            new_profile = await app.bsky_client.app.bsky.actor.get_profile(params=dict(actor=did))
        except Exception:
            logger.info(f"error getting profile: {did}")
            return

        logger.info(f"updating profile: {did}")
        saved_profile = await app.db["profiles"].find_one_and_update(
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


async def _get_did(actor: str) -> tuple[str | None, str | None]:
    try:
        if actor.startswith("did:"):
            doc = await app.resolver.did.ensure_resolve(actor)
            handle = doc.also_known_as[0].replace("at://", "")
            return handle, actor
        else:
            actor = actor.replace("@", "")
            did = await app.resolver.handle.ensure_resolve(actor)
            return actor, did
    except exceptions.DidNotFoundError:
        return None, None


def _generate_image_interactions(
    interactions: dict[str, list[Interaction]],
    topk: int = 50,
) -> list[Interaction]:
    combined_interactions = defaultdict(lambda: {"l": 0, "r": 0, "p": 0, "c": 0, "t": 0})

    for data in interactions.values():
        for tmp in data:
            combined_interactions[tmp["_id"]]["l"] += tmp["l"]
            combined_interactions[tmp["_id"]]["r"] += tmp["r"]
            combined_interactions[tmp["_id"]]["p"] += tmp["p"]
            combined_interactions[tmp["_id"]]["c"] += tmp["c"]
            combined_interactions[tmp["_id"]]["t"] += tmp["t"]

    combined_interactions = [Interaction(_id=key, **value) for key, value in combined_interactions.items()]
    combined_interactions.sort(key=lambda x: x["t"], reverse=True)
    return combined_interactions[:topk]


async def _get_interactions(
    did: str, source: Literal["from", "to", "both"], start_date: datetime.datetime = None
) -> dict[str, list[Interaction]]:
    end_date = datetime.datetime.now(tz=datetime.timezone.utc)
    if start_date is None:
        start_date = end_date - datetime.timedelta(days=7)

    async def _aggregate_interactions(direction: Literal["from", "to"]) -> list[Interaction]:
        author_field = "author" if direction == "from" else "subject"
        subject_field = "subject" if direction == "from" else "author"
        pipeline = [
            {
                "$match": {
                    author_field: did,
                    "date": {
                        "$gte": start_date,
                    },
                    "deleted": {"$exists": False},
                }
            },
            {
                "$group": {
                    "_id": f"${subject_field}",
                    "t": {"$sum": 1},
                    "l": {"$sum": {"$cond": [{"$eq": ["$collection", models.ids.AppBskyFeedLike]}, 1, 0]}},
                    "r": {"$sum": {"$cond": [{"$eq": ["$collection", models.ids.AppBskyFeedRepost]}, 1, 0]}},
                    "p": {"$sum": {"$cond": [{"$eq": ["$collection", models.ids.AppBskyFeedPost]}, 1, 0]}},
                    "c": {"$sum": {"$cond": [{"$eq": ["$collection", models.ids.AppBskyFeedPost]}, "$characters", 0]}},
                }
            },
            {"$sort": {"t": -1}},
            {"$limit": 100},
        ]

        res = []
        async for doc in app.db.get_collection(INTERACTION_COLLECTION).aggregate(pipeline):
            res.append(Interaction(**doc))
        return res

    if source == "both":
        return {
            "from": await _aggregate_interactions("from"),
            "to": await _aggregate_interactions("to"),
        }
    else:
        return {source: await _aggregate_interactions(source)}


def _post_process_interactions(data: list) -> list:
    processed_data = []
    for item in data:
        likes = 0
        reposts = 0
        posts = 0
        characters = 0
        total = 0
        for interaction in item["interactions"]:
            if interaction["type"] == models.ids.AppBskyFeedLike:
                likes += interaction["count"]
                total += interaction["count"]
            elif interaction["type"] == models.ids.AppBskyFeedRepost:
                reposts += interaction["count"]
                total += 2 * interaction["count"]
            elif interaction["type"] == models.ids.AppBskyFeedPost:
                posts += interaction["count"]
                total += 2 * interaction["count"]
                characters += interaction["total_characters"]

        processed_data.append({"_id": item["_id"], "l": likes, "r": reposts, "p": posts, "c": characters, "t": total})

    processed_data.sort(key=lambda x: x["t"], reverse=True)
    return processed_data


@app.get("/circles")
async def _circles(actor: str, source: Literal["from", "to", "both"] = "from"):
    handle, did = await _get_did(actor)
    if did is None:
        raise HTTPException(status_code=404, detail=f"user not found: {actor}")

    logger.info(f"[circles] getting interactions: {handle}@{did}")
    try:
        start_date = datetime.datetime.now() - datetime.timedelta(days=7)
        interactions = await _get_interactions(did, source, start_date)
        image_interactions = _generate_image_interactions(interactions)
    except Exception:
        raise HTTPException(status_code=500, detail=f"error generating interactions {handle}@{did}")

    logger.info(f"[circles] generating image: {handle}@{did}")

    # Getting stuff for the image
    main_profile = await _get_profile(did)
    if main_profile is None:
        raise

    profiles = []
    for person in image_interactions:
        profile = await _get_profile(person["_id"])
        profiles.append(
            {
                "did": profile.did,
                "handle": profile.handle,
                "avatar": profile.avatar,
            }
        )

    if len(profiles) <= 1:
        return

    main_profile_picture, all_profile_pictures = await _fetch_profile_pictures(main_profile, profiles)
    output_image = _create_circles_image(main_profile_picture, all_profile_pictures, start_date)
    # except:
    # raise HTTPException(status_code=500, detail="error generating circles")
    if output_image is None:
        raise HTTPException(status_code=500, detail=f"error generating circles {handle}@{did}")

    stream = BytesIO()
    output_image.save(stream, format="png")
    stream.seek(0)  # important here!
    return responses.StreamingResponse(stream, media_type="image/png")


@app.get("/top/interactions/{name}")
async def _get_top_interactions(name: Literal["author", "subject"]):
    pipeline = [
        {
            "$match": {
                "deleted": {"$exists": False},
            }
        },
        {
            "$group": {
                "_id": {
                    "did": f"${name}",
                    "collection": "$collection",
                },
                "count": {"$sum": 1},
                "characters": {
                    "$sum": {"$cond": [{"$eq": ["$collection", models.ids.AppBskyFeedPost]}, "$characters", 0]}
                },
            }
        },
        {
            "$setWindowFields": {
                "partitionBy": "$_id.collection",
                "sortBy": {"count": -1},
                "output": {"rank": {"$rank": {}}},
            }
        },
        {"$match": {"rank": {"$lte": 50}}},
        {
            "$group": {
                "_id": "$_id.collection",
                "list": {
                    "$push": {
                        "did": "$_id.did",
                        "count": "$count",
                        "characters": {
                            "$cond": [{"$eq": ["$_id.collection", models.ids.AppBskyFeedPost]}, "$characters", "$$REMOVE"]
                        },
                    }
                },
            }
        },
    ]

    res = []
    async for doc in app.db.get_collection(INTERACTION_COLLECTION).aggregate(pipeline):
        res.append(Interaction(**doc))
    return dict(data=res)


@app.get("/interactions")
async def _interactions(actor: str, source: Literal["from", "to", "both"] = "from") -> dict[str, list[Interaction]]:
    handle, did = await _get_did(actor)
    if did is None:
        raise HTTPException(status_code=404, detail=f"user not found: {actor}")
    logger.info(f"[interactions] getting interactions: {handle}@{did}")
    return await _get_interactions(did, source)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=config.FART_PORT)
