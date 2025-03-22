from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="allow"
    )

    # dev
    DEVEL: bool = True
    # redis
    REDIS_URI: str = "redis://redis:6379"
    REDIS_STREAM_PREFIX: str = "firehose"
    REDIS_STREAM_MAXLEN_DEFAULT: int = 100000
    REDIS_STREAM_MAXLEN_POST: int = 100000
    REDIS_STREAM_MAXLEN_LIKE: int = 300000
    REDIS_STREAM_MAXLEN_REPOST: int = 100000
    REDIS_STREAM_MAXLEN_PROFILE: int = 5000
    REDIS_STREAM_MAXLEN_BLOCK: int = 5000
    REDIS_STREAM_MAXLEN_ACCOUNT: int = 5000
    REDIS_STREAM_MAXLEN_IDENTITY: int = 5000
    REDIS_INTERACTION_TTL: int = 1800  # 30 minutes in seconds (changed from 8 hours)
    # mongodb
    MONGODB_URI: str = "mongodb://mongodb:27017"
    MONGODB_DB: str = "bsky"
    # FART
    FART_PORT: int = 8000
    FART_KEY: str = "secret"  # if empty there is no auth
    # enjoyer
    FIREHOSE_PORT: int = 8001
    FIREHOSE_CHECKPOINT: int = 1000
    # indexer
    INDEXER_ENABLE: bool = True
    INDEXER_CONSUMER_GROUP: str = "indexer"
    INDEXER_BATCH_SIZE: int = 1000
    # live counter update interval (15 minutes)
    LIVE_COUNTER_UPDATE_INTERVAL: int = 15 * 60  # in seconds
    # misc
    BSKY_COLLECTION_PREFIX: str = "bsky"
    INTERACTIONS_COLLECTION: str = "interactions"
    DYNAMIC_COLLECTION: str = "dynamic_data"
    CRON_TOP_INTERACTIONS: str = "0 */3 * * *"
    CRON_TOP_BLOCKS: str = "0 */3 * * *"
    CRON_AGGREGATE_INTERACTIONS: str = "0 * * * *"  # Hourly aggregation
    # 6-hour counter update (every 15 minutes)
    CRON_LIVE_COUNTER_UPDATE: str = "*/15 * * * *"
    # Temporary interaction retention (30 minutes)
    TEMP_INTERACTION_TTL: int = 30 * 60  # in seconds
