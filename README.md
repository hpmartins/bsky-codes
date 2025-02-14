# bsky-codes

Backend services and frontend for my bluesky stuff.

## stuff needed to run

- [nats](https://nats.io/) server
- mongodb server

## backend

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
- chrono_trigger
    - scheduled tasks
        - global interaction stats

## frontend

- made with SvelteKit

## TODO

- create tasker that does stuff live off the jetstream (replying, for example)