module.exports = {
  apps: [
    {
      name: "enjoyer",
      script: "./backend/firehose_enjoyer.py",
      args: [],
      instances: "1",
      autorestart: true,
      interpreter: "./.venv/bin/python",
      time: true,
    },
    {
      name: "indexer",
      script: "./backend/indexer.py",
      args: [],
      instances: "1",
      autorestart: true,
      interpreter: "./.venv/bin/python",
      time: true,
    },
  ],
};
