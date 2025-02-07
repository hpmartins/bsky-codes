import asyncio
from cassandra.cluster import Cluster, Session

class CassandraManager:
    def __init__(self, contact_points, keyspace):
        self.contact_points = contact_points
        self.keyspace = keyspace
        self.cluster = None
        self.session = None
        self.prepared_statements = {}

    async def connect(self):
        try:
            self.cluster = Cluster(contact_points=self.contact_points)
            self.session = await asyncio.to_thread(self.cluster.connect_async)
            self.session.set_keyspace(self.keyspace)
            print("Connected to Cassandra.")
        except Exception as e:
            print(f"Error connecting: {e}")
            await self.close()
            raise

    async def close(self):
        if self.session:
            try:
                await asyncio.to_thread(self.session.close_async)
            except Exception as e:
                print(f"Error closing session: {e}")
        if self.cluster:
            try:
                await asyncio.to_thread(self.cluster.shutdown_async)
            except Exception as e:
                print(f"Error shutting down cluster: {e}")

        self.session = None
        self.cluster = None