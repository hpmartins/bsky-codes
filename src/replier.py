import asyncio
import socketio

# asyncio
sio = socketio.AsyncClient()

@sio.event
async def connect():
    print("connected to server")


@sio.event
async def disconnect():
    print("disconnected from server")

@sio.event
async def firehose(t):
    if len(t) > 1:
        print(t.keys())

async def start_server():
    await sio.connect("http://localhost:6002")
    await sio.wait()


if __name__ == "__main__":
    asyncio.run(start_server())
