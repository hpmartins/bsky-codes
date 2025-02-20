
import os

from dotenv import load_dotenv


class Config:
    # dev
    DEVEL: bool = True
    # nats
    NATS_URI: str = "nats://nats:4222"
    NATS_STREAM: str = "bsky"
    NATS_STREAM_MAX_AGE: int = 7  # days
    NATS_STREAM_MAX_SIZE: int = 5  # GB
    # redis
    REDIS_URI: str = "redis://redis:6379"
    # mongo
    MONGO_URI: str = "mongodb://mongodb:27017"
    # FART
    FART_PORT: int = 8000
    FART_DB: str = "bsky"
    FART_URI: str = "http://localhost:8000"
    FART_KEY: str = ""  # if empty there is no auth
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