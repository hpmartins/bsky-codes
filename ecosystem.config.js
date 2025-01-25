module.exports = {
  apps: [
    {
      name: "enjoyer",
      script: "./backend/jetstream_enjoyer.py",
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
    // {
    //   name: "FART",
    //   script: "./backend/FART.py",
    //   watch: ["utils", "./backend/FART.py"],
    //   args: [],
    //   instances: "1",
    //   wait_ready: true,
    //   autorestart: true,
    //   restart_delay: 500,
    //   interpreter: "./.venv/bin/python",
    // },
  ],
};
