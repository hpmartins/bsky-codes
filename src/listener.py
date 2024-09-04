import sys
import signal
import threading
from utils import firehose
import socketio

if __name__ == '__main__':
    print(__package__)

def get_sio():
    sio = socketio.AsyncServer()
    stream_stop_event = threading.Event()
    stream_thread = threading.Thread(
        target=firehose.run,
        args=(
            "listener",
            sio,
            stream_stop_event,
        ),
    )
    stream_thread.start()

    def sigint_handler(*_):
        print("Stopping data stream...")
        stream_stop_event.set()
        sys.exit(0)

    signal.signal(signal.SIGINT, sigint_handler)

    return sio


app = socketio.ASGIApp(get_sio())
