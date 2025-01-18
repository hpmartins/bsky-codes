import time
import asyncio
import pickle
import nats
from nats.js.api import StreamConfig
from typing import List, Callable, Any, Dict

from utils.core import Logger

logger = Logger("nats")


class NATSManager:
    def __init__(self, uri: str, stream: str):
        self.uri = uri
        self.stream = stream
        self.nc = None  # NATS connection
        self.js = None  # JetStream context
        self.subscriptions = {}  # Store subscriptions

    async def connect(self):
        """Connects to the NATS server and initializes JetStream."""
        try:
            self.nc = await nats.connect(self.uri)
            self.js = self.nc.jetstream()
            logger.info(f"Connected to NATS at {self.uri}")
        except Exception as e:
            logger.error(f"Error connecting to NATS: {e}")
            raise

    async def disconnect(self):
        """Disconnects from the NATS server and cleans up subscriptions."""
        if self.nc and self.nc.is_connected:
            for subject, sub in self.subscriptions.items():
                try:
                    await sub.unsubscribe()
                    logger.info(f"Unsubscribed from JetStream subject: {subject}")
                except Exception as e:
                    logger.error(f"Error unsubscribing from JetStream subject {subject}: {e}")
            await self.nc.close()
            logger.info("NATS connection closed.")

    async def create_stream(self, prefixes: List[str], max_age: int, max_size: int):
        config = StreamConfig(
            name=self.stream,
            subjects=[f'{prefix}.>' for prefix in prefixes],
            retention="limits",
            discard="old",
            max_age=60 * 60 * 24 * max_age,
            max_bytes=1024 * 1024 * 1024 * max_size,
            storage="file",
        )
        try:
            await self.js.update_stream(config=config)
            logger.info(f"Stream {self.stream} updated successfully.")
        except Exception as e:
            try:
                await self.js.add_stream(config=config)
                logger.info(f"Stream {self.stream} added successfully.")
            except Exception as e:
                logger.error(f"Error creating or updating stream {self.stream}: {e}")
                raise

    async def get_or_create_kv_store(self, bucket_name: str) -> nats.js.kv.KeyValue:
        try:
            kv = await self.js.key_value(bucket_name)
            logger.info(f"Using existing key-value store: {bucket_name}")
            return kv
        except nats.js.errors.NotFoundError:
            logger.info(f"Key-value store not found. Creating {bucket_name}...")
            try:
                kv = await self.js.create_key_value(bucket=bucket_name)
                logger.info(f"Key-value store created successfully: {bucket_name}")
                return kv
            except Exception as e:
                logger.error(f"Error creating key-value store {bucket_name}: {e}")
                raise

    async def pull_subscribe(
        self, subjects: dict[str, str], callback: Callable[[Any], None], service_name: str, batch_size: int = 100
    ):
        if self.js is None:
            raise nats.errors.NoServersError("Not connected to NATS server")

        async def cb(msg):
            try:
                data = pickle.loads(msg.data)
                await callback(data)
                await msg.ack()
            except Exception as e:
                logger.error(f"Error in callback for subject {subject}: {e}")

        for subject, in subjects:
            durable_name = f"{service_name}-{subject.replace('.', '_')}"

            try:
                psub = await self.js.pull_subscribe(
                    subject,
                    durable=durable_name,
                )
                self.subscriptions[subject] = psub
                logger.info(f"Subscribed to JetStream subject: {subject} with durable name: {durable_name}")

                async def fetch_and_process(subject, psub):
                    while True:
                        try:
                            msgs = await psub.fetch(batch_size)
                            for msg in msgs:
                                await cb(msg)
                        except nats.errors.TimeoutError:
                            continue
                        except Exception as e:
                            logger.error(f"Error fetching messages from subject {subject}: {e}")
                            await asyncio.sleep(5)

                asyncio.create_task(fetch_and_process(subject, psub))

            except Exception as e:
                logger.error(f"Error subscribing to JetStream subject {subject}: {e}")

    async def publish(self, subject: str, data: bytes):
        try:
            ack = await self.js.publish(subject, data)
            logger.debug(f"Published message to {subject} - Stream: {ack.stream}, Sequence: {ack.seq}")
        except Exception as e:
            logger.error(f"Error publishing to NATS subject {subject}: {e}")
