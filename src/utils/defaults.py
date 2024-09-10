import os
from dotenv import load_dotenv

from atproto import models

load_dotenv()

INTERESTED_RECORDS = {
    models.ids.AppBskyFeedLike: models.AppBskyFeedLike,
    models.ids.AppBskyFeedPost: models.AppBskyFeedPost,
    models.ids.AppBskyFeedRepost: models.AppBskyFeedRepost,
    models.ids.AppBskyGraphFollow: models.AppBskyGraphFollow,
    models.ids.AppBskyGraphBlock: models.AppBskyGraphBlock,
    models.ids.AppBskyActorProfile: models.AppBskyActorProfile,
}

FIREHOSE_MAXLEN = int(os.getenv("FIREHOSE_MAXLEN"))
