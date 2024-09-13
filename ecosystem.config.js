module.exports = {
  "apps": [{
    "name": "firehose_listener",
    "script": "./src/firehose_listener.py",
    "args": [],
    "instances": "1",
    "wait_ready": true,
    "autorestart": false,
    "max_restarts": 5,
    "interpreter": "./.venv/bin/python",
  },
  {
    "name": "firehose_filter",
    "script": "./src/firehose_filter.py",
    "args": [],
    "instances": "1",
    "wait_ready": true,
    "autorestart": false,
    "max_restarts": 5,
    "interpreter": "./.venv/bin/python",
  },
  {
    "name": "firehose_indexer",
    "script": "./src/firehose_indexer.py",
    "args": [],
    "instances": "1",
    "wait_ready": true,
    "autorestart": false,
    "max_restarts": 5,
    "interpreter": "./.venv/bin/python",
  }]
}