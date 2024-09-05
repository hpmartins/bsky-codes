from collections import defaultdict

from atproto import (
    AtUri,
    CAR,
    firehose_models,
    FirehoseSubscribeReposClient,
    AsyncFirehoseSubscribeReposClient,
    models,
    parse_subscribe_repos_message,
    exceptions,
)
from atproto.exceptions import FirehoseError

from .database import bskydb, SubscriptionState
from .logger import logger

_INTERESTED_RECORDS = {
    models.AppBskyFeedLike: models.ids.AppBskyFeedLike,
    models.AppBskyFeedPost: models.ids.AppBskyFeedPost,
    models.AppBskyGraphFollow: models.ids.AppBskyGraphFollow,
}


def _get_ops_by_type(commit: models.ComAtprotoSyncSubscribeRepos.Commit) -> defaultdict:
    operation_by_type = defaultdict(lambda: {"create": [], "delete": []})

    car = CAR.from_bytes(commit.blocks)
    for op in commit.ops:
        uri = AtUri.from_str(f"at://{commit.repo}/{op.path}")
        if op.action == "update":
            continue

        if op.action == "create":
            if not op.cid:
                continue
            create_info = {"uri": str(uri), "cid": str(op.cid), "author": commit.repo}
            record_raw_data = car.blocks.get(op.cid)
            if not record_raw_data:
                continue
            record = models.get_or_create(record_raw_data, strict=False)
            for record_type, record_nsid in _INTERESTED_RECORDS.items():
                if uri.collection == record_nsid and models.is_record_type(record, record_type):
                    if record is None:
                        record_data = None
                    else:
                        try:
                            record_data = record.model_dump()
                        except Exception as e:
                            return
                        
                    operation_by_type[record_nsid][op.action].append(
                        {
                            "record": record_data,
                            **create_info,
                        }
                    )
                    break

        if op.action == "delete":
            operation_by_type[uri.collection]["delete"].append({"uri": str(uri)})

    return operation_by_type


async def run(name, sio, stream_stop_event=None):
    while stream_stop_event is None or not stream_stop_event.is_set():
        try:
            await _run(name, sio, stream_stop_event)
        except FirehoseError as e:
            # here we can handle different errors to reconnect to firehose
            raise e


async def _run(name, sio, stream_stop_event=None):
    state = bskydb.substates.find_one(dict(service=name))

    params = None
    if state:
        params = models.ComAtprotoSyncSubscribeRepos.Params(cursor=state["cursor"])

    client = AsyncFirehoseSubscribeReposClient(params)

    if not state:
        bskydb.substates.insert_one(SubscriptionState(service=name, cursor=0))

    async def on_message_handler(message: firehose_models.MessageFrame) -> None:
        # stop on next message if requested
        if stream_stop_event and stream_stop_event.is_set():
            client.stop()
            return

        try:
            commit = parse_subscribe_repos_message(message)
        except exceptions.ModelError:
            return

        if not isinstance(commit, models.ComAtprotoSyncSubscribeRepos.Commit):
            return

        # update stored state every ~20 events
        if commit.seq % 100 == 0:
            # logger.info(f"Updated cursor for {name} to {commit.seq}")
            client.update_params(models.ComAtprotoSyncSubscribeRepos.Params(cursor=commit.seq))
            bskydb.substates.update_one({"service": name}, {"$set": {"cursor": commit.seq}})

        if not commit.blocks:
            return

        await sio.emit("firehose", _get_ops_by_type(commit))

    await client.start(on_message_handler)
