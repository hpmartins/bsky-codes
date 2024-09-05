module.exports = {
  "apps": [{
    "name": "broadcaster",
    "script": "./src/broadcaster.py",
    "args": [],
    "instances": "1",
    "wait_ready": true,
    "autorestart": false,
    "max_restarts": 5,
    "interpreter": "/home/bsky/.cache/pypoetry/virtualenvs/bsky-codes-won75v8b-py3.11/bin/python",
  },
  {
    "name": "replier",
    "script": "./src/replier.py",
    "args": [],
    "instances": "1",
    "wait_ready": true,
    "autorestart": false,
    "max_restarts": 5,
    "interpreter": "/home/bsky/.cache/pypoetry/virtualenvs/bsky-codes-won75v8b-py3.11/bin/python",
  }]
}