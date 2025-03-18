# Backend Services

This directory contains all the backend services for the Bluesky analytics platform.

## Services Overview

### 1. Firehose Subscriber (`firehose_subscriber`)

The Firehose Subscriber service connects to the Bluesky firehose and processes the incoming data stream. It:
- Subscribes to the Bluesky firehose events
- Processes and filters relevant data
- Publishes events to NATS for consumption by other services
- Tracks metrics and monitors network load

**Run with:** `python -m backend.services.firehose_subscriber.main`

### 2. Indexer (`indexer`)

The Indexer service consumes events from NATS and stores them in MongoDB. It:
- Processes data from various Bluesky record types (posts, likes, reposts, etc.)
- Transforms and stores data in appropriate MongoDB collections
- Maintains indexes for quick data retrieval
- Handles batching and error recovery

**Run with:** `python -m backend.services.indexer.main`

### 3. Scheduler (`scheduler`)

The Scheduler service runs periodic tasks to generate analytics and insights. It:
- Runs on a cron schedule defined in configuration
- Aggregates interaction data to find trends
- Updates dynamic data collections for the API
- Fetches and caches profile information

**Run with:** `python -m backend.services.scheduler.main`

### 4. FART API (`FART`)

The Feline Area Rapid Transit (FART) API provides HTTP endpoints to access the analytics data. It:
- Exposes REST endpoints for frontend consumption
- Implements authentication and rate limiting
- Caches frequent requests
- Serves aggregated statistics and trends

**Run with:** `python -m backend.services.FART.main`

## Service Dependencies

```
Firehose Subscriber → NATS → Indexer → MongoDB ← Scheduler
                                           ↑
                                      FART API
```

## Configuration

All services share configuration from `backend.core.config`. Service-specific settings are:
- Prefixed with the service name (e.g., `FIREHOSE_*`, `INDEXER_*`, etc.)
- Defined in the central Config class
- Overridable via environment variables or .env file 