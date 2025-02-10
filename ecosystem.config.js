module.exports = {
  apps: [
    {
      name: "enjoyer",
      script: "./backend/firehose_enjoyer.py",
      args: ["--log=DEBUG"],
      instances: "1",
      autorestart: true,
      interpreter: "./.venv/bin/python",
      time: true,
    },
    {
      name: "indexer",
      script: "./backend/indexer.py",
      args: ["--log=DEBUG"],
      instances: "1",
      autorestart: true,
      interpreter: "./.venv/bin/python",
      time: true,
    },
  ],
};
