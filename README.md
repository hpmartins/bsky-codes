# bsky-codes

Backend services and frontend for my bluesky stuff.

## TODO

- create tasker that does stuff live off the jetstream (replying, for example)

## services

### stuff needed to run

- [nats](https://nats.io/) server
- mongodb server

### backend

- firehose_enjoyer
    - subscribes to bsky firehose
    - filters incoming data
    - publishes on nats-js
- indexer
    - consumes all subjects from nats-js
    - inserts/updates/deletes records on mongodb
- FART (Feline Area Rapid Transit)
    - API to do stuff
        - fetch interactions and create circles
        - fetch dynamic data
        - caches data using nats-kv
- chrono_trigger
    - scheduled tasks
        - global interaction stats

### frontend

- made with SvelteKit

## interactions

Interactions are likes, reposts, quotes and replies from an user (_author_) to a different user (_subject_). They are stored in collections named `interactions.like`, `interactions.repost`, `interactions.post` and have the following schema:

```jsonc
{
  "_id": "did:plc:u7vvvlww74nstj6vnunr3u6x/3lhu4uknfnk27",
  "a": "did:plc:u7vvvlww74nstj6vnunr3u6x", // author
  "s": "did:plc:yi2mvxisoytsymujrlpyxk22", // subject
  "t": {
    "$date": "2025-02-10T21:00:00.000Z"
  }, // timestamp
  "c": 42 // number of characters in the post
}
```

where `_id` is in the form `did/rkey`. The `t` timestamp only includes up to the hour. The `like` and `repost` collections have the same schema (minus the characters). The indexes are `_id` (unique), `(author, timestamp)` and `(subject, timestamp)`. There is also a TTL index on the timestamp in order to delete records older than a threshold.
