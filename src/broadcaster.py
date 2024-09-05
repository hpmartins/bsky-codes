import socketio
from uvicorn.loops.asyncio import asyncio_setup
import asyncio
import uvicorn

from utils import firehose

sio = socketio.AsyncServer(async_mode="asgi")
app = socketio.ASGIApp(sio, sio)


async def start_uvicorn():
    config = uvicorn.config.Config(app, host="0.0.0.0", port=6002)
    server = uvicorn.server.Server(config)
    await server.serve()


async def main(loop):
    await asyncio.wait(
        [
            asyncio.create_task(start_uvicorn()),
            asyncio.create_task(firehose.run("firehose", sio)),
        ],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    asyncio_setup()
    loop = asyncio.get_event_loop()
    asyncio.run(main(loop))
