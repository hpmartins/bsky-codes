import asyncio
import nats
from nats.js.api import StreamConfig
from nats.aio.subscription import Subscription
from typing import List, Callable, Any

from utils.core import Logger

logger = Logger("nats")


class NATSManager:
    def __init__(self):
        self.nc = None
        self.js = None
        self.subscriptions: dict[str, Subscription] = {}
        self.stop_events: dict[str, asyncio.Event] = {}

    async def connect(self, uri: str, stream: str):
        """Connects to the NATS server and initializes JetStream."""
        self.uri = uri
        self.stream = stream
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
            for stop_event in self.stop_events.values():
                stop_event.set()

            await asyncio.sleep(1)

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
            subjects=[f"{prefix}.>" for prefix in prefixes],
            retention="limits",
            discard="old",
            max_age=60 * 60 * 24 * max_age,
            max_bytes=1024 * 1024 * 1024 * max_size,
            storage="file",
            compression="s2",
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
        self, subject: str, callback: Callable[[Any], None], service_name: str, batch_size: int = 100
    ):
        if self.js is None:
            raise nats.errors.NoServersError("Not connected to NATS server")

        durable_name = f"{service_name}-{subject.replace('.', '_')}"
        try:
            psub = await self.js.pull_subscribe(
                subject,
                durable=durable_name,
            )
            self.subscriptions[subject] = psub

            stop_event = asyncio.Event()
            self.stop_events[subject] = stop_event

            logger.info(f"Subscribed to JetStream subject: {subject} with durable name: {durable_name}")

            async def fetch_and_process(subject, psub, stop_event):
                while not stop_event.is_set():
                    try:
                        msgs = await asyncio.wait_for(psub.fetch(batch_size), timeout=1.0)
                        for msg in msgs:
                            try:
                                await callback(msg.data)
                                await msg.ack()
                            except Exception as e:
                                logger.error(f"Error in callback for subject {subject}: {e}")
                    except asyncio.TimeoutError:
                        continue
                    except Exception as e:
                        logger.error(f"Error fetching messages from subject {subject}: {e}")
                        if isinstance(e, nats.errors.ConnectionClosedError):
                            logger.info("Connection closed, stopping fetch_and_process loop.")
                            break

            asyncio.create_task(fetch_and_process(subject, psub, stop_event))

        except Exception as e:
            logger.error(f"Error subscribing to JetStream subject: {subject}: {e}")

    async def publish(self, subject: str, data: bytes):
        try:
            ack = await self.js.publish(subject, data)
            logger.debug(f"Published message to {subject} - Stream: {ack.stream}, Sequence: {ack.seq}")
        except Exception as e:
            logger.error(f"Error publishing to NATS subject {subject}: {e}")
