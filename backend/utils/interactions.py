import datetime

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
        "date": datetime.datetime.fromisoformat(created_at),
        "author": author,
        "collection": collection,
        "rkey": rkey,
        "subject": subject,
        **others,
        "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
    }


def parse_interaction(uri: AtUri, record) -> dict | None:
    if models.is_record_type(
        record, models.ids.AppBskyFeedLike
    ) or models.is_record_type(record, models.ids.AppBskyFeedRepost):
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

            if models.is_record_type(
                record.embed, models.ids.AppBskyEmbedRecordWithMedia
            ):
                if models.is_record_type(
                    record.embed.record, models.ids.AppBskyEmbedRecord
                ):
                    return _create_interaction(
                        record.created_at,
                        uri.host,
                        uri.collection,
                        uri.rkey,
                        AtUri.from_str(record.embed.record.record.uri).host,
                        dict(characters=len(record.text)),
                    )

    return None
