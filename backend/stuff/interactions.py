from datetime import datetime

from atproto import (
    models,
    AtUri,
)


def get_date(timestamp: str) -> datetime:
    dobj = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return datetime(dobj.year, dobj.month, dobj.day)


def _create_like_or_repost_interaction(uri: AtUri, record) -> dict:
    return {
        "date": get_date(record.created_at),
        "metadata": {
            "author": uri.host,
            "collection": uri.collection,
            "rkey": uri.rkey,
            "subject": AtUri.from_str(record.subject.uri).host,
        },
    }


def _create_reply_interaction(
    uri: AtUri, record: models.AppBskyFeedPost
) -> dict | None:
    if record.reply is not None and record.reply.parent is not None:
        return {
            "date": get_date(record.created_at),
            "metadata": {
                "author": uri.host,
                "collection": uri.collection,
                "rkey": uri.rkey,
                "subject": AtUri.from_str(record.reply.parent.uri).host,
                "characters": len(record.text),
            },
        }
    return None


def _create_embed_record_interaction(
    uri: AtUri, record: models.AppBskyFeedPost
) -> dict | None:
    if record.embed is not None:
        if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecord):
            return {
                "date": get_date(record.created_at),
                "metadata": {
                    "author": uri.host,
                    "collection": uri.collection,
                    "rkey": uri.rkey,
                    "subject": AtUri.from_str(record.embed.record.uri).host,
                    "characters": len(record.text),
                },
            }

        if models.is_record_type(record.embed, models.ids.AppBskyEmbedRecordWithMedia):
            if models.is_record_type(
                record.embed.record, models.ids.AppBskyEmbedRecord
            ):
                return {
                    "date": get_date(record.created_at),
                    "metadata": {
                        "author": uri.host,
                        "collection": uri.collection,
                        "rkey": uri.rkey,
                        "subject": AtUri.from_str(record.embed.record.record.uri).host,
                        "characters": len(record.text),
                    },
                }
    return None


def create_interaction(uri: AtUri, record) -> dict | None:
    if models.is_record_type(
        record, models.ids.AppBskyFeedLike
    ) or models.is_record_type(record, models.ids.AppBskyFeedRepost):
        return _create_like_or_repost_interaction(uri, record)

    if models.is_record_type(record, models.ids.AppBskyFeedPost):
        return _create_reply_interaction(
            uri, record
        ) or _create_embed_record_interaction(uri, record)

    return None
