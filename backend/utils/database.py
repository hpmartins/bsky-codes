from typing import TypedDict
from pymongo import MongoClient
from pymongo.collection import Collection
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URI = os.getenv('MONGODB_URI')

db = MongoClient(host=MONGODB_URI)

class SubscriptionState(TypedDict):
    service: str
    cursor: int

class bskydb:
    client = MongoClient(host=MONGODB_URI)
    substates: Collection[SubscriptionState] = client.bsky.substates
