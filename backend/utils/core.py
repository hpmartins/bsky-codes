import logging
import os
import sys
from dotenv import load_dotenv
from atproto import models
from pydantic import BaseModel, Field
from typing import Literal, Union, Annotated, Optional, NotRequired, TypedDict
import datetime

from atproto_client.models.unknown_type import UnknownRecordType

INTERESTED_RECORDS = {
    models.ids.AppBskyFeedLike: models.AppBskyFeedLike,
    models.ids.AppBskyFeedPost: models.AppBskyFeedPost,
    models.ids.AppBskyFeedRepost: models.AppBskyFeedRepost,
    models.ids.AppBskyActorProfile: models.AppBskyActorProfile,
    models.ids.AppBskyGraphBlock: models.AppBskyGraphBlock,
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


class CommitCreate(TypedDict):
    operation: Literal["create"]
    repo: str
    collection: str
    rkey: str
    record: dict


class CommitUpdate(TypedDict):
    operation: Literal["update"]
    repo: str
    collection: str
    rkey: str
    record: dict


class CommitDelete(TypedDict):
    operation: Literal["delete"]
    repo: str
    collection: str
    rkey: str


Commit = Union[CommitCreate, CommitUpdate, CommitDelete]


class EventAccount(TypedDict):
    kind: Literal["account"]
    account: models.ComAtprotoSyncSubscribeRepos.Account


class EventIdentity(TypedDict):
    kind: Literal["identity"]
    identity: models.ComAtprotoSyncSubscribeRepos.Identity


class EventCommit(TypedDict):
    kind: Literal["commit"]
    commit: Commit


Event = Union[EventAccount, EventIdentity, EventCommit]


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
    # FART
    FART_PORT: int = 8000
    FART_DB: str = "bsky"
    FART_URI: str = "http://localhost:8000"
    # jetstream_enjoyer
    FIREHOSE_ENJOYER_PORT: int = 8888
    FIREHOSE_ENJOYER_CHECKPOINT: int = 1000
    FIREHOSE_ENJOYER_SUBJECT_PREFIX: str = "firehose"
    # indexer
    INDEXER_ENABLE: bool = False
    INDEXER_DELETE: bool = False
    INDEXER_CONSUMER: str = "indexer"
    INDEXER_BATCH_SIZE: int = 1000
    INDEXER_DB: str = "bsky"
    # chrono trigger and misc
    INTERACTIONS_COLLECTION: str = "interactions"
    DYNAMIC_COLLECTION: str = "dynamic_data"
    CHRONO_TRIGGER_TOP_INTERACTIONS_INTERVAL: str = ""

    def __init__(self):
        load_dotenv()

        for field in self.__annotations__:
            if field in os.environ:
                env_value = os.getenv(field)
                field_type = self.__annotations__[field]
                if field_type is bool:
                    setattr(self, field, env_value.lower() not in ("0", "false", "f", ""))
                elif field_type is int:
                    setattr(self, field, int(env_value))
                else:
                    setattr(self, field, env_value)

    def __str__(self):
        return "\n".join(f"{k}: {v}" for k, v in self.__dict__.items())


# functions
def get_date_from_jetstream_cursor(cursor: int):
    return datetime.datetime.fromtimestamp(cursor / 1000000, tz=datetime.timezone.utc)


def check_jetstream_cursor(cursor: int):
    cursor_date = get_date_from_jetstream_cursor(cursor)
    now_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(minutes=5)
    return cursor_date < now_date
