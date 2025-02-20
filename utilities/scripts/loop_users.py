import os
import asyncio
import datetime
from atproto import AsyncClient, AsyncIdResolver, exceptions, models

from aiolimiter import AsyncLimiter
from asynciolimiter import Limiter
import motor.motor_asyncio
from dotenv import load_dotenv

from pymongo import UpdateOne

load_dotenv()

repo_rate_limiter = AsyncLimiter(100, 1)
plc_rate_limiter = Limiter(250)

client = AsyncClient(base_url="https://bsky.network")
resolver = AsyncIdResolver()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("INDEXER_DB")

mongo = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, compressors="zstd")
db = mongo.get_database(MONGO_DB)


async def get_handle(repo: models.ComAtprotoSyncListRepos.Repo):
    doc_update = {}
    try:
        did_doc = await resolver.did.ensure_resolve(repo.did)
        doc_update["handle"] = did_doc.also_known_as[0].replace("at://", "")
    except Exception as e:
        print(e, repo.did)
        raise e
    return {"_id": repo.did}, doc_update


async def main():
    doc = await db["repos"].find_one({"_id": "cursor"})
    if doc:
        cursor = str(doc["cursor"])
    else:
        cursor = None

    end_of_list = False
    while not end_of_list:
        async with repo_rate_limiter:
            try:
                print(f"cursor={cursor}")
                response = await client.com.atproto.sync.list_repos(dict(cursor=cursor, limit=1000))
                if len(response.repos) == 0:
                    end_of_list = True

                db_ops = []

                print(f"rcvd:{len(response.repos)}")
                db_ops = [
                    UpdateOne(
                        {"_id": repo.did},
                        {
                            "$setOnInsert": {
                                "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                            },
                        },
                        upsert=True,
                    )
                    for repo in response.repos
                ]
                # tasks = (get_handle(repo) for repo in response.repos)
                # update_data = await asyncio.gather(*map(plc_rate_limiter.wrap, tasks))

                # plc_error_count = sum([0 if "handle" in doc else 1 for _, doc in update_data])
                # print(f"fetched; plc_error_count={plc_error_count}")

                # db_ops = [
                #     UpdateOne(
                #         update_filter,
                #         {
                #             "$set": {
                #                 **update_doc,
                #                 "updated_at": datetime.datetime.now(tz=datetime.timezone.utc),
                #             },
                #             "$setOnInsert": {
                #                 "indexed_at": datetime.datetime.now(tz=datetime.timezone.utc),
                #             },
                #         },
                #         upsert=True,
                #     )
                #     for update_filter, update_doc in update_data
                # ]

                await db["repos"].update_one({"_id": "cursor"}, {"$set": {"cursor": cursor}}, upsert=True)
                await db["repos"].bulk_write(db_ops, ordered=False)
                print("wrote")

                cursor = response.cursor

            except exceptions.RequestException:
                print(f"last cursor = {cursor}")
                end_of_list = True
    return


if __name__ == "__main__":
    asyncio.run(main())
