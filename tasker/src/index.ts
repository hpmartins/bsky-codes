var cron = require('node-cron');
import { connectDb } from "@common/db";

cron.schedule("*/2 * * * *", async () => {
    console.log('run task')
});

async function run() {
    await connectDb();
    console.log(
        `[tasker] started`,
      )
}

run()
