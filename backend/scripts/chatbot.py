import os
import asyncio
from atproto import AsyncClient

from dotenv import load_dotenv

load_dotenv()

BSKY_LOGIN = os.getenv('LUNA_DID')
BSKY_PWD = os.getenv('LUNA_PWD')

bsky_client = AsyncClient()

async def main():
    await bsky_client.login(login=BSKY_LOGIN, password=BSKY_PWD)
    chat_client = bsky_client.with_bsky_chat_proxy()
    dm = chat_client.chat.bsky.convo

    test = await dm.list_convos()
    print(test)


if __name__ == "__main__":
    asyncio.run(main())