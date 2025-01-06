import asyncio
from utils.firehose import process_firehose


async def process(ops):
    pass
    # print(list(ops.values()))
    # await asyncio.sleep(0.1)


async def start_server():
    await process_firehose("replier", process)


if __name__ == "__main__":
    asyncio.run(start_server())
