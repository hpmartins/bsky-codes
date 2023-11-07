# bsky-codes

common - db, schema, shared functions

frontend - sveltekit based served at :6000

tasker - runs scheduled tasks and serves locally at :6001

listener - process the firehose and broadcasts it at :6002

indexer - reads listener and indexes stuff

syncer - backfills

replier - reads listener and does actions on bsky
