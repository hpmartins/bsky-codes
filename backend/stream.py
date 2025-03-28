import asyncio
import json
from typing import Any, Callable, List

import nats
import nats.errors
import nats.js.errors
import nats.js.kv
from nats.aio.subscription import Subscription
from nats.js.api import StreamConfig


class BytesJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            try:
                return obj.decode("utf-8")  # Attempt UTF-8 decoding first
            except UnicodeDecodeError:
                try:
                    return obj.decode("latin-1")  # Fallback to latin-1 if UTF-8 fails
                except Exception:
                    return obj.hex()  # Finally return hex if all else fails
        return json.JSONEncoder.default(self, obj)


class NATSManager:
    def __init__(self, uri: str, stream: str | None = None):
        self.uri = uri
        self.stream = stream
        self.nc = None
        self.js = None
        self.subscriptions: dict[str, Subscription] = {}
        self.stop_events: dict[str, asyncio.Event] = {}

    async def connect(self):
        try:
            self.nc = await nats.connect(self.uri)
            self.js = self.nc.jetstream()
            print(f"Connected to NATS at {self.uri}")
        except Exception as e:
            print(f"Error connecting to NATS: {e}")
            raise

    async def disconnect(self):
        if self.nc and self.nc.is_connected:
            for stop_event in self.stop_events.values():
                stop_event.set()

            await asyncio.sleep(1)

            for consumer, sub in self.subscriptions.items():
                try:
                    await sub.unsubscribe()
                    print(f"Unsubscribed from JetStream subject: {consumer}")
                except Exception as e:
                    print(f"Error unsubscribing from JetStream subject {consumer}: {e}")
            await self.nc.close()
            print("NATS connection closed.")

    async def create_stream(self, prefixes: List[str], max_age: int, max_size: int):
        if not self.stream:
            print("create_stream: null stream name")
            return

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
            print(f"Stream {self.stream} updated successfully.")
        except Exception:
            try:
                await self.js.add_stream(config=config)
                print(f"Stream {self.stream} added successfully.")
            except Exception as e:
                print(f"Error creating or updating stream {self.stream}: {e}")
                raise

    async def get_or_create_kv_store(self, bucket_name: str, ttl: float | None = None) -> nats.js.kv.KeyValue:
        try:
            kv = await self.js.key_value(bucket_name)
            print(f"Using existing key-value store: {bucket_name}")
            return kv
        except nats.js.errors.NotFoundError:
            print(f"Key-value store not found. Creating {bucket_name}...")
            try:
                kv = await self.js.create_key_value(bucket=bucket_name, ttl=ttl)
                print(f"Key-value store created successfully: {bucket_name}")
                return kv
            except Exception as e:
                print(f"Error creating key-value store {bucket_name}: {e}")
                raise

    async def pull_subscribe(self, stream: str, consumer: str, callback: Callable[[Any], None], batch_size: int = 100):
        if self.js is None:
            raise nats.errors.NoServersError("Not connected to NATS server")

        try:
            psub = await self.js.pull_subscribe_bind(consumer=consumer, stream=stream)
            self.subscriptions[consumer] = psub

            stop_event = asyncio.Event()
            self.stop_events[consumer] = stop_event

            print(f"Subscribed to JetStream with durable name: {consumer}")

            async def fetch_and_process(psub, stop_event):
                while not stop_event.is_set():
                    msgs = None

                    try:
                        msgs = await psub.fetch(batch_size, timeout=1.0, heartbeat=0.2)
                    except nats.js.errors.FetchTimeoutError as e:
                        print(e)
                        continue
                    except asyncio.TimeoutError as e:
                        print(e)
                        continue
                    except nats.errors.ConnectionClosedError as e:
                        print(e)
                        break
                    except Exception as e:
                        print(f"Error fetching messages: {e}")

                    if not msgs:
                        continue

                    await callback(msgs)

            asyncio.create_task(fetch_and_process(psub, stop_event))

        except Exception as e:
            print(f"Error subscribing to JetStream: {e}")

    async def publish(self, subject: str, data: str):
        try:
            await self.js.publish(subject, json.dumps(data, cls=BytesJSONEncoder).encode())
            # print(f"Published message to {subject} - Stream: {ack.stream}, Sequence: {ack.seq}")
        except Exception as e:
            print(f"Error publishing to NATS subject {subject}: {e}")
