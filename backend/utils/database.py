import os
from dotenv import load_dotenv
import motor.motor_asyncio

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_CLIENT = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
