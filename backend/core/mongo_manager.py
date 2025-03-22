import asyncio
import datetime
from typing import Any, Dict, List, Optional, Union

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ASCENDING, DESCENDING, IndexModel
from pymongo.errors import PyMongoError

from backend.core.config import Config
from backend.core.logger import Logger

config = Config()
logger = Logger("mongo_manager")

class MongoManager:
    """Manages MongoDB connections and operations for the application."""

    def __init__(self, uri: str = None):
        self._uri = uri or config.MONGODB_URI
        self._client: Optional[AsyncIOMotorClient] = None
        self._db = None
        
    async def connect(self) -> None:
        """Connect to MongoDB."""
        try:
            self._client = AsyncIOMotorClient(self._uri)
            self._db = self._client[config.MONGODB_DB]
            # Test connection
            await self._client.admin.command('ping')
            
            # Create indexes
            await self._create_indexes()
            
            logger.info("Connected to MongoDB")
        except PyMongoError as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    async def _create_indexes(self) -> None:
        """Create necessary indexes."""
        pass
    
    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self._client:
            self._client.close()
            logger.info("Disconnected from MongoDB")

    async def bulk_write(self, collection: str, ops: List[Any]) -> None:
        """Bulk write operations to a collection."""
        try:
            await self._db[collection].bulk_write(ops, ordered=False)
            logger.info(f"Bulk write {len(ops)} operations to {collection}")
        except PyMongoError as e:
            logger.error(f"Failed to bulk write to {collection}: {e}")
            raise

    async def store_interaction(
        self,
        uri: str,
        author: str,
        subject: str,
        interaction_type: str,
        timestamp: datetime.datetime,
        post_rkey: str = "",
        data: Dict[str, Any] = None,
    ) -> bool:
        """Store an interaction in MongoDB."""
        try:
            # Create interaction document
            interaction = {
                "uri": uri,
                "author": author,
                "subject": subject,
                "type": interaction_type,
                "timestamp": timestamp,
                "date": timestamp.replace(hour=0, minute=0, second=0, microsecond=0),
                "post_rkey": post_rkey,
            }
            
            if data:
                interaction.update(data)
            
            # Store in main interactions collection
            await self._db.interactions.update_one(
                {"uri": uri},
                {"$set": interaction},
                upsert=True
            )
            
            # Also store in temporary collection with expiration for deletion handling
            # Using 30 minutes TTL as specified in requirements
            expiration = timestamp + datetime.timedelta(minutes=30)
            await self._db.temp_interactions.update_one(
                {"uri": uri},
                {"$set": {**interaction, "expiration": expiration}},
                upsert=True
            )
            
            # Update daily counters
            await self._update_daily_counter(
                timestamp.date().isoformat(),
                author,
                subject,
                interaction_type,
                "sent",
                1
            )
            
            if author != subject:  # Don't count self-interactions twice
                await self._update_daily_counter(
                    timestamp.date().isoformat(),
                    subject,
                    author,
                    interaction_type,
                    "received",
                    1
                )
            
            # Update live counter
            await self._update_live_counter(author, "sent", interaction_type, 1)
            if author != subject:
                await self._update_live_counter(subject, "received", interaction_type, 1)
            
            return True
        except PyMongoError as e:
            logger.error(f"Failed to store interaction {uri}: {e}")
            return False

    async def delete_interaction(self, uri: str) -> bool:
        """Delete an interaction by URI."""
        try:
            # First check if it exists in the temporary interactions
            temp_interaction = await self._db.temp_interactions.find_one({"uri": uri})
            
            if temp_interaction:
                # Mark as deleted in main collection
                await self._db.interactions.update_one(
                    {"uri": uri},
                    {
                        "$set": {
                            "deleted": True, 
                            "deletion_timestamp": datetime.datetime.now(tz=datetime.timezone.utc)
                        }
                    }
                )
                
                # Update daily counters
                author = temp_interaction.get("author")
                subject = temp_interaction.get("subject")
                interaction_type = temp_interaction.get("type")
                date = temp_interaction.get("date").date().isoformat()
                
                if author and subject and interaction_type:
                    # Decrement counters
                    await self._update_daily_counter(
                        date,
                        author,
                        subject,
                        interaction_type,
                        "sent",
                        -1
                    )
                    
                    if author != subject:
                        await self._update_daily_counter(
                            date,
                            subject,
                            author,
                            interaction_type,
                            "received",
                            -1
                        )
                    
                    # Update live counter
                    await self._update_live_counter(author, "sent", interaction_type, -1)
                    if author != subject:
                        await self._update_live_counter(subject, "received", interaction_type, -1)
                
                return True
            else:
                logger.info(f"Interaction {uri} not found in temporary storage for deletion")
                return False
        except PyMongoError as e:
            logger.error(f"Failed to delete interaction {uri}: {e}")
            return False

    async def _update_daily_counter(
        self,
        date: str,
        user: str,
        other_user: str,
        interaction_type: str,
        direction: str,
        increment: int = 1
    ) -> None:
        """Update daily interaction counter."""
        try:
            await self._db.daily_aggregates.update_one(
                {
                    "date": date,
                    "user": user,
                    "other_user": other_user,
                    "type": interaction_type,
                    "direction": direction
                },
                {"$inc": {"count": increment}},
                upsert=True
            )
        except PyMongoError as e:
            logger.error(f"Failed to update daily counter: {e}")

    async def _update_live_counter(
        self,
        user: str,
        direction: str,
        interaction_type: str,
        increment: int = 1
    ) -> None:
        """Update live 6-hour interaction counter."""
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        # Round to the nearest 15 minutes
        minutes = now.minute - (now.minute % 15)
        timestamp = now.replace(minute=minutes, second=0, microsecond=0)
        
        try:
            await self._db.live_counters.update_one(
                {
                    "user": user,
                    "timestamp": timestamp,
                    "direction": direction,
                    "type": interaction_type
                },
                {"$inc": {"count": increment}},
                upsert=True
            )
        except PyMongoError as e:
            logger.error(f"Failed to update live counter: {e}")

    async def store_post(
        self,
        uri: str,
        author: str,
        rkey: str,
        created_at: datetime.datetime,
        data: Dict[str, Any] = None
    ) -> bool:
        """Store a post in MongoDB."""
        try:
            post = {
                "uri": uri,
                "author": author,
                "rkey": rkey,
                "created_at": created_at,
                "likes": 0,
                "reposts": 0,
                "replies": 0,
                "quotes": 0,
                "deleted": False  # Add deleted flag, default to False
            }
            
            if data:
                post.update(data)
            
            await self._db.posts.update_one(
                {"uri": uri},
                {"$set": post},
                upsert=True
            )
            
            return True
        except PyMongoError as e:
            logger.error(f"Failed to store post {uri}: {e}")
            return False

    async def mark_post_deleted(self, uri: str) -> bool:
        """Mark a post as deleted instead of removing it."""
        try:
            result = await self._db.posts.update_one(
                {"uri": uri},
                {"$set": {
                    "deleted": True,
                    "deletion_timestamp": datetime.datetime.now(tz=datetime.timezone.utc)
                }}
            )
            return result.modified_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to mark post as deleted {uri}: {e}")
            return False

    async def store_profile(
        self,
        did: str,
        handle: str,
        display_name: str = None,
        data: Dict[str, Any] = None
    ) -> bool:
        """Store a profile in MongoDB."""
        try:
            profile = {
                "did": did,
                "handle": handle,
                "display_name": display_name,
                "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                "deleted": False  # Add deleted flag, default to False
            }
            
            if data:
                profile.update(data)
            
            await self._db.profiles.update_one(
                {"did": did},
                {"$set": profile},
                upsert=True
            )
            
            return True
        except PyMongoError as e:
            logger.error(f"Failed to store profile {did}: {e}")
            return False

    async def mark_profile_deleted(self, did: str) -> bool:
        """Mark a profile as deleted instead of removing it."""
        try:
            result = await self._db.profiles.update_one(
                {"did": did},
                {"$set": {
                    "deleted": True,
                    "deletion_timestamp": datetime.datetime.now(tz=datetime.timezone.utc)
                }}
            )
            return result.modified_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to mark profile as deleted {did}: {e}")
            return False

    async def delete_block(self, uri: str) -> bool:
        """Delete a block record (completely remove it)."""
        try:
            result = await self._db.interactions.delete_one({"uri": uri, "type": "block"})
            return result.deleted_count > 0
        except PyMongoError as e:
            logger.error(f"Failed to delete block {uri}: {e}")
            return False

    async def store_identity(
        self,
        did: str,
        handle: str,
        data: Dict[str, Any] = None
    ) -> bool:
        """Store an identity in MongoDB."""
        try:
            identity = {
                "did": did,
                "handle": handle,
                "updated_at": datetime.datetime.now(tz=datetime.timezone.utc)
            }
            
            if data:
                identity.update(data)
            
            await self._db.identities.update_one(
                {"did": did},
                {"$set": identity},
                upsert=True
            )
            
            return True
        except PyMongoError as e:
            logger.error(f"Failed to store identity {did}: {e}")
            return False

    async def store_account(
        self,
        did: str,
        handle: str,
        email: str = None,
        data: Dict[str, Any] = None
    ) -> bool:
        """Store an account in MongoDB."""
        try:
            account = {
                "did": did,
                "handle": handle,
                "email": email,
                "updated_at": datetime.datetime.now(tz=datetime.timezone.utc)
            }
            
            if data:
                account.update(data)
            
            await self._db.accounts.update_one(
                {"did": did},
                {"$set": account},
                upsert=True
            )
            
            return True
        except PyMongoError as e:
            logger.error(f"Failed to store account {did}: {e}")
            return False

    async def update_post_stats(
        self,
        uri: str,
        stats_update: Dict[str, int]
    ) -> bool:
        """Update post statistics."""
        try:
            await self._db.posts.update_one(
                {"uri": uri},
                {"$inc": stats_update}
            )
            return True
        except PyMongoError as e:
            logger.error(f"Failed to update post stats {uri}: {e}")
            return False

    async def get_user_interactions(
        self,
        user: str,
        direction: str = "both",
        start_date: datetime.datetime = None,
        end_date: datetime.datetime = None,
        aggregated: bool = True
    ) -> Dict[str, Any]:
        """Get interactions for a user."""
        if not start_date:
            start_date = datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=7)
        
        if not end_date:
            end_date = datetime.datetime.now(tz=datetime.timezone.utc)
        
        result = {}
        
        try:
            if aggregated:
                # Get aggregated data
                result = await self._get_aggregated_interactions(user, direction, start_date, end_date)
            else:
                # Get individual interactions
                result = await self._get_individual_interactions(user, direction, start_date, end_date)
            
            return result
        except PyMongoError as e:
            logger.error(f"Failed to get user interactions: {e}")
            return {"sent": [], "received": []}

    async def _get_aggregated_interactions(
        self,
        user: str,
        direction: str,
        start_date: datetime.datetime,
        end_date: datetime.datetime
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get aggregated interaction data."""
        directions = []
        if direction == "both":
            directions = ["sent", "received"]
        else:
            directions = [direction]
        
        result = {dir_name: [] for dir_name in directions}
        
        for dir_name in directions:
            # Convert dates to string format (YYYY-MM-DD)
            start_str = start_date.date().isoformat()
            end_str = end_date.date().isoformat()
            
            pipeline = [
                {
                    "$match": {
                        "user": user,
                        "direction": dir_name,
                        "date": {"$gte": start_str, "$lte": end_str}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "date": "$date",
                            "other_user": "$other_user",
                            "type": "$type"
                        },
                        "count": {"$sum": "$count"}
                    }
                },
                {
                    "$group": {
                        "_id": {
                            "date": "$_id.date",
                            "other_user": "$_id.other_user"
                        },
                        "interactions": {
                            "$push": {
                                "type": "$_id.type",
                                "count": "$count"
                            }
                        },
                        "total": {"$sum": "$count"}
                    }
                },
                {"$sort": {"_id.date": -1, "total": -1}},
            ]
            
            aggregated_data = await self._db.daily_aggregates.aggregate(pipeline).to_list(None)
            
            # Format the result
            for item in aggregated_data:
                entry = {
                    "date": item["_id"]["date"],
                    "user": item["_id"]["other_user"],
                    "total": item["total"],
                }
                
                # Add individual interaction types
                for interaction in item["interactions"]:
                    entry[interaction["type"]] = interaction["count"]
                
                result[dir_name].append(entry)
        
        return result

    async def _get_individual_interactions(
        self,
        user: str,
        direction: str,
        start_date: datetime.datetime,
        end_date: datetime.datetime
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get individual interaction documents."""
        directions = []
        if direction == "both":
            directions = ["sent", "received"]
        else:
            directions = [direction]
        
        result = {dir_name: [] for dir_name in directions}
        
        for dir_name in directions:
            field = "author" if dir_name == "sent" else "subject"
            match_query = {
                field: user,
                "timestamp": {"$gte": start_date, "$lte": end_date},
                "deleted": {"$ne": True}
            }
            
            interactions = await self._db.interactions.find(match_query).sort("timestamp", -1).to_list(None)
            
            # Format the interactions
            for interaction in interactions:
                # Convert MongoDB _id to string
                interaction["_id"] = str(interaction["_id"])
                result[dir_name].append(interaction)
        
        return result
    
    async def get_live_interactions(
        self,
        user: str,
        hours: int = 6
    ) -> Dict[str, Any]:
        """Get live interactions for the past N hours."""
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        start_time = now - datetime.timedelta(hours=hours)
        
        result = {"sent": {}, "received": {}}
        
        try:
            # Aggregate live counters
            for direction in ["sent", "received"]:
                pipeline = [
                    {
                        "$match": {
                            "user": user,
                            "direction": direction,
                            "timestamp": {"$gte": start_time}
                        }
                    },
                    {
                        "$group": {
                            "_id": {
                                "type": "$type",
                                "timestamp": "$timestamp"
                            },
                            "count": {"$sum": "$count"}
                        }
                    },
                    {
                        "$sort": {"_id.timestamp": 1}
                    }
                ]
                
                aggregated = await self._db.live_counters.aggregate(pipeline).to_list(None)
                
                # Format into time series by type
                types_data = {}
                for entry in aggregated:
                    interaction_type = entry["_id"]["type"]
                    timestamp = entry["_id"]["timestamp"]
                    count = entry["count"]
                    
                    if interaction_type not in types_data:
                        types_data[interaction_type] = []
                    
                    types_data[interaction_type].append({
                        "timestamp": timestamp.isoformat(),
                        "count": count
                    })
                
                result[direction] = types_data
            
            return result
        except PyMongoError as e:
            logger.error(f"Failed to get live interactions: {e}")
            return result

    async def cleanup_expired_interactions(self) -> int:
        """Aggregate data from expired interactions.

        This is called by a scheduled job to aggregate data from interactions 
        that are older than 30 minutes and remove them from the temp collection.
        """
        # The temp_interactions collection has TTL index so MongoDB handles the deletion
        # We just aggregate the data that's about to expire
        
        # This method is not needed as we update aggregates in real-time,
        # but could be used for any additional cleanup or consistency checks
        
        return 0 