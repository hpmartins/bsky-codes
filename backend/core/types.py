from typing import Literal, TypedDict, Union


# Firehose
class CommitCreate(TypedDict):
    operation: Literal["create"]
    repo: str
    collection: str
    rkey: str
    record: dict


class CommitUpdate(TypedDict):
    operation: Literal["update"]
    repo: str
    collection: str
    rkey: str
    record: dict


class CommitDelete(TypedDict):
    operation: Literal["delete"]
    repo: str
    collection: str
    rkey: str


Commit = Union[CommitCreate, CommitUpdate, CommitDelete]


class EventAccount(TypedDict):
    kind: Literal["account"]
    account: dict


class EventIdentity(TypedDict):
    kind: Literal["identity"]
    identity: dict


class EventCommit(TypedDict):
    kind: Literal["commit"]
    commit: Commit


Event = Union[EventAccount, EventIdentity, EventCommit]


# interactions
class Interaction(TypedDict):
    _id: str
    l: int
    r: int
    p: int
    c: int
    t: int | float
