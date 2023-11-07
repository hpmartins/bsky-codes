var cron = require('node-cron');
import 'module-alias/register';
import express from 'express';
import Bottleneck from 'bottleneck';
import { connectDb } from '@common/db';
import { DidResolver } from '@atproto/identity';
import { maybeInt } from '@common';
import { syncOneProfile, syncWaitingProfiles } from './tasks/sync';

export type AppContext = {
  app: express.Express;
  didres: DidResolver;
  limiter: Bottleneck;
  log: (text: string) => void;
};

function scheduleTasks(ctx: AppContext) {
  cron.schedule('*/2 * * * *', async () => {
    await syncWaitingProfiles(ctx);
  });
}

async function run() {
  await connectDb();

  const app = express();
  const didres = new DidResolver({});
  const limiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: (5 * 60000) / 5000
  });
  const log = (text: string) => {
    console.log(`[${new Date().toLocaleTimeString()}] [tasker] ${text}`);
  };

  limiter.on('failed', async (error, jobInfo) => {
    ctx.log(error);
    ctx.log('Retrying in 10s...');
    return 10000;
  });
  limiter.on('retry', (error, jobInfo) => ctx.log('Retrying now'));

  const ctx: AppContext = {
    app,
    didres,
    limiter,
    log,
  };

  scheduleTasks(ctx);

  app.get('/update/:did', async (req, res) => {
    const doc = await didres.resolveAtprotoData(req.params.did);
    if (!doc) return res.send('could not find did');
    try {
      await syncOneProfile(ctx, doc);
    } catch (e) {
      return res.send(e);
    }
    return res.send('done!');
  });

  const port = maybeInt(process.env.TASKER_PORT) ?? 6001;
  app.listen(port, () => {
    ctx.log(`listening @ :${port}`);
  });
}

run();
