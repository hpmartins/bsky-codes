# bsky-codes

Backend services and frontend for my bluesky stuff.

## TODO

- create tasker that does stuff live off the Redis streams (replying, for example)

## services

### stuff needed to run

- [redis](https://redis.io/) server with RedisJSON and RedisTimeSeries modules

### backend

- firehose
    - subscribes to bsky firehose
    - filters incoming data
    - publishes on redis streams
- indexer
    - consumes all streams from redis
    - stores interactions with TTL and aggregates older ones
- scheduler
    - runs scheduled tasks
        - global interaction stats
        - aggregation of older interactions
- FART (Feline Area Rapid Transit)
    - API to do stuff
        - fetch interactions and create circles
        - fetch dynamic data
        - caches data using redis

### frontend

- made with SvelteKit

## interactions

Interactions are likes, reposts, posts, quotes and replies from an user (_author_) to a different user (_subject_). 

### Individual Interactions (stored for 48 hours)

```
interaction:<uri> -> {
  "uri": "at://...",
  "a": "author_did", 
  "s": "subject_did", 
  "type": "like|repost|post|reply|quote",
  "t": "2023-01-01T12:00:00Z",  # ISO timestamp
  "h": "2023-01-01T12:00:00Z",  # Hour-level ISO timestamp
  "pr": "post_rkey",
  "c": 123  # character count for posts
}
```

### Hourly Aggregated Interactions

```
hourly:<hour>:<type>:<author>:<subject> -> count
```

### User Interaction Indices

```
user:<did>:sent:<type> -> sorted set of (subject_did, timestamp)
user:<did>:received:<type> -> sorted set of (author_did, timestamp)
```

### Long-term Aggregated Storage

```
agg:<hour>:<type> -> hash of "<author>:<subject>" -> count
```

The system automatically aggregates interactions older than 48 hours and maintains both real-time tracking ability and long-term storage efficiency.

## Running the Application

### Setup

1. Make sure you have [Redis](https://redis.io/) with RedisJSON and RedisTimeSeries modules installed, or use the provided Docker setup
2. Configure your environment variables in `.env`
3. Install the Python dependencies: `pip install -r requirements.txt`
4. Install PM2 if not already installed: `npm install -g pm2`

### Starting Services

#### Start Redis Services

```bash
docker-compose up -d
```

This will start:
- Redis with the necessary modules
- RedisInsight for monitoring (available at http://localhost:5540)

#### Start Python Services with PM2

```bash
pm2 start pm2.yml
```

This will start:
- Firehose Subscriber - Captures data from the Bluesky firehose
- Indexer - Processes and stores interaction data
- Scheduler - Runs periodic tasks for aggregation and statistics
- FART API - Serves interaction data via HTTP API
- Frontend - Serves the web interface

### Managing Services

```bash
# Monitor all services
pm2 monit

# Check logs
pm2 logs

# Restart a specific service
pm2 restart firehose_subscriber

# Stop all services
pm2 stop all

# Stop Redis services
docker-compose down
```
