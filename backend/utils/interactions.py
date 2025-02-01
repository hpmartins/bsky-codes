import datetime

from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from atproto import (
    models,
    AtUri,
)

INTERACTION_RECORDS = {
    models.ids.AppBskyFeedLike: models.AppBskyFeedLike,
    models.ids.AppBskyFeedPost: models.AppBskyFeedPost,
    models.ids.AppBskyFeedRepost: models.AppBskyFeedRepost,
}
INTERACTION_COLLECTION = "interactions"


class Interaction(TypedDict):
    _id: str
    l: int
    r: int
    p: int
    c: int
    t: int


class InteractionsResponse(BaseModel):
    from_: list[Interaction] = Field(alias="from")
    to: list[Interaction]

    class Config:
        populate_by_name = True

def get_date(created_at: str | None = None):
    if created_at:
        dt = datetime.datetime.fromisoformat(created_at)
    else:
        dt = datetime.datetime.now(tz=datetime.timezone.utc)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)

def _create_interaction(
    created_at: str,
    author: str,
    collection: str,
    rkey: str,
    subject: str,
    others: dict = {},
):
    if author == subject:
        return None

    return {
        "_id": f"{author}/{collection}/{rkey}",
        "date": get_date(created_at),
        "author": author,
        "subject": subject,
        **others,
    }


def parse_interaction(uri: AtUri, record):
    if models.is_record_type(record, models.ids.AppBskyFeedLike) or models.is_record_type(
        record, models.ids.AppBskyFeedRepost
    ):
        return _create_interaction(
            record.created_at,
            uri.host,
            uri.collection,
            uri.rkey,
            AtUri.from_str(record.subject.uri).host,
        )

    if models.is_record_type(record, models.ids.AppBskyFeedPost):
        if record.reply is not None and record.reply.parent is not None:
            return _create_interaction(
                record.created_at,
                uri.host,
                uri.collection,
                uri.rkey,
                AtUri.from_str(record.reply.parent.uri).host,
                dict(characters=len(record.text)),
            )

        if record.embed is not None:
            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
                return _create_interaction(
                    record.created_at,
                    uri.host,
                    uri.collection,
                    uri.rkey,
                    AtUri.from_str(record.embed.record.uri).host,
                    dict(characters=len(record.text)),
                )

            if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecordWithMedia):
                if models.is_record_type(record.embed.record, models.ids.AppBskyEmbedRecord):
                    return _create_interaction(
                        record.created_at,
                        uri.host,
                        uri.collection,
                        uri.rkey,
                        AtUri.from_str(record.embed.record.record.uri).host,
                        dict(characters=len(record.text)),
                    )

    return None
