import datetime
import logging
from typing import Literal

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.config import Config
from backend.defaults import INTERACTION_RECORDS
from backend.types import Interaction

config = Config()
logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.DEBUG)


async def get_interactions(
    db: AsyncIOMotorDatabase,
    did: str,
    start_date: datetime.datetime = None,
) -> dict[Literal["sent", "rcvd"], list[Interaction]]:
    end_date = datetime.datetime.now(tz=datetime.timezone.utc)
    if start_date is None:
        start_date = end_date - datetime.timedelta(days=7)

    async def _aggregate_interactions(direction: Literal["sent", "rcvd"]) -> list[Interaction]:
        author_field = "a" if direction == "sent" else "s"
        subject_field = "s" if direction == "sent" else "a"

        res = {}
        for record_type in INTERACTION_RECORDS:
            collection = "{}.{}".format(config.INTERACTIONS_COLLECTION, record_type.split(".")[-1])
            record_initial = record_type.split(".")[-1][0]

            agg_group = {
                "$group": {
                    "_id": f"${subject_field}",
                    record_initial: {"$sum": 1},
                }
            }
            if record_type == "app.bsky.feed.post":
                agg_group["$group"]["c"] = {"$sum": "$c"}

            pipeline = [
                {
                    "$match": {
                        author_field: did,
                        "t": {
                            "$gte": start_date,
                        },
                    }
                },
                agg_group,
                {"$sort": {record_initial: -1}},
                {"$limit": 100},
            ]

            logger.info(f"starting for {did}: {record_type}")
            async for doc in db.get_collection(collection).aggregate(pipeline):
                res[doc["_id"]] = {**res.get(doc["_id"], {}), record_initial: doc[record_initial]}
                if record_type == "app.bsky.feed.post":
                    res[doc["_id"]]["c"] = doc.get("c", 0)

        agg_res: list[Interaction] = []
        for _id, values in res.items():
            agg_res.append(
                Interaction(
                    _id=_id,
                    l=values.get("l", 0),
                    r=values.get("r", 0),
                    p=values.get("p", 0),
                    c=values.get("c", 0),
                    t=values.get("l", 0) + values.get("r", 0) + values.get("p", 0),
                )
            )
        agg_res.sort(key=lambda x: x["t"], reverse=True)
        return agg_res

    sent = await _aggregate_interactions("sent")
    rcvd = await _aggregate_interactions("rcvd")

    return dict(sent=sent, rcvd=rcvd)
