from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="allow"
    )

    # dev
    DEVEL: bool = True
    # nats
    NATS_URI: str = "nats://nats:4222"
    NATS_STREAM: str = "bsky"
    NATS_STREAM_SUBJECT_PREFIX: str = "firehose"
    NATS_STREAM_MAX_AGE: int = 7  # days
    NATS_STREAM_MAX_SIZE: int = 5  # GB
    NATS_CONSUMER: str = "indexer"
    # redis
    REDIS_URI: str = "redis://redis:6379"
    # mongo
    MONGO_URI: str = "mongodb://mongo:27017"
    # FART
    FART_PORT: int = 8000
    FART_DB: str = "bsky"
    FART_KEY: str = "secret"  # if empty there is no auth
    # enjoyer
    FIREHOSE_PORT: int = 8001
    FIREHOSE_CHECKPOINT: int = 1000
    # indexer
    INDEXER_ENABLE: bool = False
    INDEXER_BATCH_SIZE: int = 1000
    INDEXER_DB: str = "bsky"
    # misc
    INTERACTIONS_COLLECTION: str = "interactions"
    DYNAMIC_COLLECTION: str = "dynamic_data"
    CRON_TOP_INTERACTIONS: str = "0 */3 * * *"
    CRON_TOP_BLOCKS: str = "0 */3 * * *"
