import logging
import os
import sys
from dotenv import load_dotenv
from atproto import models
from pydantic import BaseModel, Field
from typing import Literal, Union, Annotated, Optional
from datetime import datetime

from atproto_client.models.unknown_type import UnknownRecordType

INTERESTED_RECORDS = {
    models.ids.AppBskyFeedLike: models.AppBskyFeedLike,
    models.ids.AppBskyFeedPost: models.AppBskyFeedPost,
    models.ids.AppBskyFeedRepost: models.AppBskyFeedRepost,
    models.ids.AppBskyActorProfile: models.AppBskyActorProfile,
}


# logging
class Logger:
    def __init__(self, name: str, level: int = logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(level)

        # Create handlers if they don't exist
        if not self.logger.hasHandlers():
            out_stream_handler = logging.StreamHandler(sys.stdout)
            out_stream_handler.setLevel(logging.DEBUG)
            out_stream_handler.addFilter(lambda record: record.levelno <= logging.INFO)
            err_stream_handler = logging.StreamHandler(sys.stderr)
            err_stream_handler.setLevel(logging.WARNING)

            # Add handlers to the logger
            self.logger.addHandler(out_stream_handler)
            self.logger.addHandler(err_stream_handler)

    def debug(self, msg, *args, **kwargs):
        self.logger.debug(msg, *args, **kwargs)

    def info(self, msg, *args, **kwargs):
        self.logger.info(msg, *args, **kwargs)

    def warning(self, msg, *args, **kwargs):
        self.logger.warning(msg, *args, **kwargs)

    def error(self, msg, *args, **kwargs):
        self.logger.error(msg, *args, **kwargs)

    def critical(self, msg, *args, **kwargs):
        self.logger.critical(msg, *args, **kwargs)


# types
class JetstreamStuff:
    class Event(BaseModel):
        did: str
        time_us: int
        kind: Literal["account", "identity", "commit"]
        account: Optional[models.ComAtprotoSyncSubscribeRepos.Account] = None
        identity: Optional[models.ComAtprotoSyncSubscribeRepos.Identity] = None
        commit: Optional[Annotated["JetstreamStuff.CommitTypes", Field(discriminator="operation")]] = None

    CommitTypes = Union[
        "JetstreamStuff.CommitCreate",
        "JetstreamStuff.CommitDelete",
        "JetstreamStuff.CommitUpdate",
    ]

    class CommitCreate(BaseModel):
        rev: str
        collection: str
        rkey: str
        operation: Literal["create"] = "create"
        record: "UnknownRecordType"
        cid: str

    class CommitDelete(BaseModel):
        rev: str
        collection: str
        rkey: str
        operation: Literal["delete"] = "delete"

    class CommitUpdate(BaseModel):
        rev: str
        collection: str
        rkey: str
        operation: Literal["update"] = "update"
        record: "UnknownRecordType"
        cid: str


# config
class Config:
    # dev
    DEVEL: bool = True
    # nats
    NATS_URI: str = "nats://nats:4222"
    NATS_STREAM: str = "bsky"
    NATS_STREAM_MAX_AGE: int = 7  # days
    NATS_STREAM_MAX_SIZE: int = 5  # GB
    # mongo
    MONGO_URI: str = "mongodb://mongodb:27017"
    # jetstream_enjoyer
    JETSTREAM_URI: str = "ws://localhost:6008/subscribe"
    JETSTREAM_ENJOYER_PORT: int = 6001
    JETSTREAM_ENJOYER_CHECKPOINT: int = 1000
    JETSTREAM_ENJOYER_SUBJECT_PREFIX: str = "firehose"
    # indexer
    INDEXER_PORT: int = 6002
    INDEXER_ENABLE: bool = False
    INDEXER_BATCH_SIZE: int = 1000
    INDEXER_DB: str = "bsky"

    def __init__(self):
        load_dotenv()

        for field in self.__annotations__:
            if field in os.environ:
                env_value = os.getenv(field)
                field_type = self.__annotations__[field]
                if field_type == bool:
                    setattr(self, field, env_value.lower() not in ("0", "false", "f", ""))
                elif field_type == int:
                    setattr(self, field, int(env_value))
                else:
                    setattr(self, field, env_value)

    def __str__(self):
        return "\n".join(f"{k}: {v}" for k, v in self.__dict__.items())


# functions
def get_date_from_jetstream_cursor(cursor: int):
    return datetime.fromtimestamp(cursor / 1000000)
